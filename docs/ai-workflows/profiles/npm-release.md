# Ralph Profile: npm Release

Use this profile when a Ralph story prepares, verifies, publishes, or regresses
an npm package release.

## Release Rules

- New npm packages start at `0.0.0` in `package.json`; changesets bump to `0.0.1` on first release.
- Tags always use the full npm package name plus version:
  `<full-npm-package-name>@<version>`.
- Every publishable package must have a package-level `CHANGELOG.md`.
- Changesets are required for package behavior changes.
- Local verification is the primary gate; GitHub CI/CD is only the fallback.
- If registry, `npx`/`dlx`, GitHub Release, or native asset behavior cannot be
  fully verified before publishing, use `alpha` or `beta` first.

## Role Mapping

- `product`: defines target package, release intent, version class, prerelease
  vs stable criteria, and acceptance matrix.
- `developer`: changes code, package metadata, README, changelog, changeset, or
  publish scripts.
- `ops`: checks release workflow, changesets, tag rules, Trusted Publisher,
  native asset release, and GitHub Release configuration.
- `tester`: runs local CI-equivalent checks, `npm pack --dry-run`, tarball
  install, and package-specific fixtures.
- `contributor`: verifies README, instructions, changelog, and examples match
  the implemented release behavior.
- `beta`: runs real-user smoke checks such as `npx`, `pnpm dlx`, registry
  install, GitHub Release asset checks, and post-release regression.

## Package Profiles

`@agent-ils/logger`:

- Verify Node wrapper and native collector together.
- Smoke `--version`, `serve`, and `/api/health`.
- After publish, verify `npx @agent-ils/logger@<version>` and release assets.

`@agent-ils/quality-gate`:

- Install the tarball into a temporary user project.
- Verify `npx agentils-precommit-gate`, config lookup, fallback behavior, and
  schema errors.

`@agent-ils/workflow-sdk`:

- Verify core, React, and Vue exports.
- Build the React and Vue examples.
- Install the tarball into a temporary consumer project.
