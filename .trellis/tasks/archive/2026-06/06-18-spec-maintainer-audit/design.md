# Design: Spec Maintainer Audit

## Scope

This task repairs Trellis-owned specs and configuration only:

- `.trellis/config.yaml`
- `.trellis/spec/**`
- current task planning/research artifacts

It does not change runtime code unless the audit finds a spec drift that cannot
be corrected by documentation/configuration alone.

## Source Of Truth

Use these current artifacts as executable truth:

- `pnpm-workspace.yaml` for pnpm workspace package discovery.
- `packages/cli/package.json` for the CLI package name, scripts, and
  dependency on core.
- `packages/core/package.json` for the core SDK public export surface.
- `docs-site/package.json` for docs-site ownership and validation commands.
- `packages/cli/src/templates/trellis/scripts/common/packages_context.py` for
  how Trellis reads `.trellis/config.yaml` and emits package/layer context.
- Existing specs such as `.trellis/spec/cli/backend/directory-structure.md`
  and `.trellis/spec/cli/backend/trellis-core-sdk.md` for the current
  documented core/CLI boundary.

## Package Map Strategy

The current spec tree uses stable Trellis package keys:

| Spec key | Current path | Ownership |
| --- | --- | --- |
| `cli` | `packages/cli` | User-facing CLI, templates, migrations, release scripts |
| `core` | `packages/core` | Reusable SDK/domain primitives |
| `docs-site` | `docs-site` | Mintlify documentation site |

The config should expose these keys rather than npm package names because
existing specs already live under `.trellis/spec/cli` and `.trellis/spec/docs-site`.
The npm names remain documented inside the repo index and package-specific
specs.

`default_package` should be `cli`: most Trellis tasks change CLI/runtime
behavior, and `script-conventions.md` documents `cli` as the default example.

## Spec Shape

Add `.trellis/spec/tech/repo/index.md` because the maintainer skill expects it
and because the current repo has cross-package contracts that do not belong
inside one package's backend spec.

Add a minimal `.trellis/spec/core/backend/index.md` only if the package scanner
requires every configured package to have at least one layer. Keep detailed core
rules in the existing `.trellis/spec/cli/backend/trellis-core-sdk.md` unless
the audit proves future package-scoped loading misses critical core rules.

## Compatibility

Changing `.trellis/config.yaml` to monorepo mode affects future task creation:
new tasks without `--package` bind to `default_package`. Existing tasks keep
their frozen `task.json.package` values. This is consistent with
`.trellis/spec/cli/backend/script-conventions.md`.

The active task was created before this config repair, so it can remain
`"package": null`; the work itself is already in progress through the current
session pointer.

## Validation

Validation focuses on spec/config consistency:

- Run the maintainer drift scanner.
- Run package context output and confirm packages/layers appear.
- Run package-map checker only if present in `.trellis/scripts/`.
- Run `git diff --check` for changed config/spec files.
- Run targeted `rg` checks for stale package-map and historical architecture
  claims touched by the task.
