# Run State Machine

## Modes

- `casual`
- `discussion`
- `analysis_only`
- `execution_intent`
- `handoff_intent`
- `verify_intent`

## Steps

- `collect`
- `confirm_elements`
- `plan`
- `approval`
- `execute`
- `handoff_prepare`
- `verify`
- `done`
- `blocked`
- `cancelled`
- `failed`

## Completion gate

Completion is allowed only when:

- user confirmation exists
- result verification passes
- handoff verification passes
