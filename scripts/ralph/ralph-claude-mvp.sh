#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ORCH_PROMPT="$SCRIPT_DIR/prompts/orchestrator.md"
RUNS_DIR="$SCRIPT_DIR/runs"
MAX_ITERATIONS="${1:-10}"

CLAUDE_MODEL="${RALPH_CLAUDE_MODEL:-sonnet}"
CLAUDE_MAX_TURNS="${RALPH_CLAUDE_MAX_TURNS:-12}"
CLAUDE_PERMISSION_MODE="${RALPH_CLAUDE_PERMISSION_MODE:-auto}"

LOCK_FILE="$SCRIPT_DIR/.ralph-claude-mvp.lock"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cleanup() {
  rm -f "$LOCK_FILE"
}

trap cleanup EXIT

require_cmd claude
require_cmd jq
require_cmd git

if [ -f "$LOCK_FILE" ]; then
  echo "Another Ralph Claude MVP run appears active: $LOCK_FILE" >&2
  exit 1
fi

echo "$$" > "$LOCK_FILE"

mkdir -p "$SCRIPT_DIR/handoff" "$SCRIPT_DIR/prompts" "$RUNS_DIR"
touch "$PROGRESS_FILE"
touch "$SCRIPT_DIR/handoff/product.md" "$SCRIPT_DIR/handoff/developer.md" "$SCRIPT_DIR/handoff/ops.md" "$SCRIPT_DIR/handoff/tester.md" "$SCRIPT_DIR/handoff/contributor.md" "$SCRIPT_DIR/handoff/beta.md"

if [ ! -f "$PRD_FILE" ]; then
  echo "Missing $PRD_FILE" >&2
  exit 1
fi

if [ ! -f "$ORCH_PROMPT" ]; then
  echo "Missing $ORCH_PROMPT" >&2
  exit 1
fi

cd "$REPO_ROOT"

normalize_prd() {
  local tmp
  tmp="$(mktemp)"
  jq '
    .userStories |= map(
      . + {
        stage: (.stage // "product"),
        passes: (.passes // false),
        blocked: (.blocked // false),
        handoff: (.handoff // {"product": false, "developer": false, "ops": false, "tester": false, "contributor": false, "beta": false}),
        acceptanceCriteria: (.acceptanceCriteria // []),
        requiredStages: (.requiredStages // ["developer", "ops", "tester", "contributor", "beta"])
      }
    )
  ' "$PRD_FILE" > "$tmp"
  mv "$tmp" "$PRD_FILE"
}

all_done() {
  jq -e 'all(.userStories[]; .passes == true)' "$PRD_FILE" >/dev/null
}

next_story_json() {
  jq -c '
    .userStories
    | map(select(.passes == false and (.blocked // false) == false and ((.stage // "product") != "done")))
    | sort_by(.priority)
    | .[0] // empty
  ' "$PRD_FILE"
}

# try_skip_stage — Bash-level safety net to skip ops/contributor when unnecessary.
# Returns 0 (skip) if the stage can be auto-passed, 1 (run) otherwise.
# The product subagent's requiredStages is the primary routing mechanism;
# this is a secondary heuristic for cases where requiredStages includes the
# stage but the actual diff shows no relevant changes.
try_skip_stage() {
  local stage="$1"
  local story_id="$2"
  local changed_files

  changed_files="$(git diff --name-only 2>/dev/null || true)"

  case "$stage" in
    ops)
      # Skip if no CI-related files changed and no CI keywords in developer handoff
      if [ -z "$(echo "$changed_files" | grep -E '(\.github/workflows/|\.goreleaser|\.changeset/|package\.json$)')" ]; then
        if [ -f "$SCRIPT_DIR/handoff/developer.md" ]; then
          if ! grep -qiE '(publish|release|binary|platform|ci|workflow|goreleaser|changeset|npm)' "$SCRIPT_DIR/handoff/developer.md" 2>/dev/null; then
            return 0
          fi
        else
          return 0
        fi
      fi
      return 1
      ;;
    contributor)
      # Skip if no doc-related files changed and no doc keywords in predecessor handoff
      if [ -z "$(echo "$changed_files" | grep -E '(README|CHANGELOG|docs/|\.instructions\.md|CLAUDE\.md|SKILL\.md)')" ]; then
        # Check the predecessor's handoff (could be tester.md or ops.md depending on requiredStages)
        local pred_handoff
        pred_handoff="$(find_pred_handoff "$story_id" "contributor")"
        if [ -n "$pred_handoff" ] && [ -f "$SCRIPT_DIR/handoff/$pred_handoff" ]; then
          if ! grep -qiE '(doc|help|usage|readme|changelog|instruction|tutorial)' "$SCRIPT_DIR/handoff/$pred_handoff" 2>/dev/null; then
            return 0
          fi
        else
          return 0
        fi
      fi
      return 1
      ;;
    *)
      # Never skip product, developer, tester, or beta
      return 1
      ;;
  esac
}

# find_pred_handoff — find the predecessor stage's handoff filename for a given stage.
# Reads requiredStages from prd.json to determine which stage comes before the target.
find_pred_handoff() {
  local story_id="$1"
  local target_stage="$2"
  local stages

  stages="$(jq -r --arg id "$story_id" --arg target "$target_stage" '
    .userStories[] | select(.id == $id) | .requiredStages // ["developer","ops","tester","contributor","beta"]
  ' "$PRD_FILE" 2>/dev/null)"

  if [ -z "$stages" ]; then
    echo ""
    return
  fi

  local prev=""
  while IFS= read -r s; do
    s="$(echo "$s" | tr -d ' ",'})"
    if [ "$s" = "$target_stage" ]; then
      echo "${prev}.md"
      return
    fi
    prev="$s"
  done <<< "$stages"
  echo ""
}

# write_skip_handoff — write a minimal handoff when a stage is skipped.
write_skip_handoff() {
  local stage="$1"
  local story_id="$2"
  local story_desc

  story_desc="$(jq -r --arg id "$story_id" '.userStories[] | select(.id == $id) | .description // ""' "$PRD_FILE" 2>/dev/null)"

  local handoff_file="$SCRIPT_DIR/handoff/${stage}.md"
  cat > "$handoff_file" <<EOF
# ${stage^} Handoff — SKIPPED

## Story
- id: ${story_id}

## Reason
No relevant changes detected. Auto-skipped by runner heuristic.

## Notes for Next
- ${story_desc:0:120}
EOF
}

# advance_stage_after_skip — update prd.json to advance past a skipped stage.
advance_stage_after_skip() {
  local stage="$1"
  local story_id="$2"
  local next_stage

  next_stage="$(jq -r --arg id "$story_id" --arg current "$stage" '
    .userStories[] | select(.id == $id) |
    (.requiredStages // ["developer","ops","tester","contributor","beta"]) as $stages |
    ($stages | index($current)) as $idx |
    if $idx != null and ($idx + 1) < ($stages | length) then
      $stages[$idx + 1]
    else
      "done"
    end
  ' "$PRD_FILE" 2>/dev/null)"

  local tmp
  tmp="$(mktemp)"
  jq --arg id "$story_id" --arg current "$stage" --arg next "$next_stage" '
    .userStories |= map(
      if .id == $id then
        .handoff[$current] = true |
        .stage = $next
      else
        .
      end
    )
  ' "$PRD_FILE" > "$tmp"
  mv "$tmp" "$PRD_FILE"
}

run_iteration() {
  local iteration="$1"
  local story_json="$2"
  local story_id story_title stage run_file task_prompt

  story_id="$(echo "$story_json" | jq -r '.id')"
  story_title="$(echo "$story_json" | jq -r '.title')"
  stage="$(echo "$story_json" | jq -r '.stage // "product"')"
  run_file="$RUNS_DIR/iteration-$(printf '%03d' "$iteration")-$story_id-$stage.json"

  case "$stage" in
    product|developer|ops|tester|contributor|beta)
      ;;
    *)
      echo "Unsupported stage '$stage' for story $story_id" >&2
      exit 1
      ;;
  esac

  task_prompt="$(cat <<PROMPT
Run exactly one Ralph Claude MVP iteration.

Selected story:
$story_json

Selected stage: $stage

Required delegation:
- product -> ralph-product
- developer -> ralph-developer
- ops -> ralph-ops
- tester -> ralph-tester
- contributor -> ralph-contributor
- beta -> ralph-beta

You must delegate the substantive work to the matching project subagent.
Do not do the role work in the main session.
After delegation, report the result and ensure the relevant files were updated.
PROMPT
)"

  echo "============================================================"
  echo "Iteration: $iteration"
  echo "Story: $story_id - $story_title"
  echo "Stage: $stage"
  echo "Log: $run_file"
  echo "============================================================"

  # Skip ops/contributor if heuristic determines no relevant changes
  case "$stage" in
    ops|contributor)
      if try_skip_stage "$stage" "$story_id"; then
        echo "  -> SKIPPED (no relevant changes detected by heuristic)"
        write_skip_handoff "$stage" "$story_id"
        advance_stage_after_skip "$stage" "$story_id"
        return 0
      fi
      ;;
  esac

  claude \
    -p "$task_prompt" \
    --model "$CLAUDE_MODEL" \
    --max-turns "$CLAUDE_MAX_TURNS" \
    --permission-mode "$CLAUDE_PERMISSION_MODE" \
    --append-system-prompt-file "$ORCH_PROMPT" \
    --output-format json \
    | tee "$run_file"
}

normalize_prd

for iteration in $(seq 1 "$MAX_ITERATIONS"); do
  normalize_prd

  if all_done; then
    echo "<promise>COMPLETE</promise>"
    exit 0
  fi

  story_json="$(next_story_json)"

  if [ -z "$story_json" ]; then
    echo "No runnable story found. Remaining stories may be blocked."
    exit 1
  fi

  run_iteration "$iteration" "$story_json"
done

echo "Reached max iterations without completing all stories."
exit 1
