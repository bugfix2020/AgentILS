---
name: npm-package-publish-checklist
description: 'Use when: preparing, reviewing, publishing, or fixing an npm package, scoped package, CLI package, .npmrc, .npmignore, publishConfig, package.json files, README, npm pack, npm publish, pnpm publish, or release metadata.'
---

# npm Package Publish Checklist

Use this skill before publishing or reviewing any npm package in this workspace.

## Sources To Trust

- npm package README docs: package pages render the package-root `README.md`; include installation, configuration, usage, and other helpful user information.
- npm scoped public package docs: scoped public packages should publish with `npm publish --access public` or equivalent package metadata.
- npm packlist behavior: package contents are controlled by `package.json.files`, `.npmignore` / `.gitignore`, and npm always-included files such as `package.json` and README files. Prefer a small `files` whitelist and verify with `npm pack --dry-run`.

## Required Package Checks

For the target package root, inspect and configure:

- `package.json` has the intended `name`, `version`, `description`, `type`, `main`, `module`, `types`, `bin`, `exports`, `files`, `engines`, `dependencies`, and scripts.
- Scoped public packages include `publishConfig.access = "public"`.
- Packages intended for npm include `publishConfig.registry = "https://registry.npmjs.org/"`.
- Package-level `.npmrc` sets:

```ini
registry=https://registry.npmjs.org/
access=public
```

- Package-level `.npmignore` excludes source and build-only files that should not be packed, even when `files` is present:

```gitignore
src/
tsconfig.json
tsup.config.ts
*.tsbuildinfo
node_modules/
dist/**/*.map
```

Adjust the ignore list for packages that intentionally publish source, templates, or source maps.

## README Checks

The package-root README should let a user understand the package without reading source code:

- What the package is.
- What problem it solves.
- How to install or run it with common package managers.
- Copy-paste usage examples.
- CLI/API options if applicable.
- Agent/LLM behavior notes if the package is meant for agents.
- What the package does not do, if scope boundaries matter.

Use the existing package README style in this repo when possible. For Chinese package docs, compare against `packages/quality-gate/README.zh-CN.md`.

## Verification Commands

Run from the repository root unless the package requires otherwise:

```sh
pnpm --filter <package-name> typecheck
pnpm --filter <package-name> build
```

Run from the package root:

```sh
npm pack --dry-run
```

Check the tarball output for:

- Correct package name and version.
- `README.md` included.
- `package.json` included.
- Expected `dist` files included.
- Source files, tsconfig, tsup config, tsbuildinfo, node_modules, and unwanted maps excluded.

For CLI packages, also run the built CLI:

```sh
node <package-root>/dist/<entry>.js --version
node <package-root>/dist/<entry>.js --help
```

The CLI version should come from `package.json`, not a duplicated hard-coded constant.

## Common Mistakes

- Removing `private: true` but forgetting `publishConfig.access = "public"` for a scoped public package.
- Adding `.npmrc` but forgetting `.npmignore` or `files`.
- Trusting `.gitignore` without checking `npm pack --dry-run`.
- Publishing source maps unintentionally.
- Hard-coding a CLI version instead of reading package metadata.
- Updating README after publishing; npm package README updates only when publishing a new package version.
