# Spec Drift Scan

## Commands Run

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
python3 "${CODEX_HOME:-$HOME/.codex}/skills/trellis-spec-maintainer/scripts/scan_spec_drift.py"
uv run python ./.trellis/scripts/check_package_map.py
sc worktree status --json
fd -t f 'package\.json$|pnpm-workspace\.yaml$|config\.yaml$' . packages apps docs-site .trellis -E node_modules -E .git -E dist
rg -n "packages/api/src/routers|packages/api|apps/web|/onboard|primary_channel_id|daemon|runtime-manager|runner|packages/core|@mindfoldhq/trellis-core|@mindfoldhq/trellis|docs-site|workflow-state|current task|single-repo" .trellis/spec .trellis/config.yaml
```

## Confirmed Facts

- `pnpm-workspace.yaml` declares `packages/*`.
- `packages/cli/package.json` is `@mindfoldhq/trellis` version `0.6.3`.
- `packages/core/package.json` is `@mindfoldhq/trellis-core` version `0.6.3`.
- `docs-site/package.json` is `trellis-docs`, private, outside the pnpm
  workspace declaration.
- `.trellis/config.yaml` has no active `packages:` map; it only has commented
  examples.
- `get_context.py --mode packages` currently reports:

```text
Single-repo project (no packages configured)

Spec layers: cli, docs-site
```

- GitNexus shows package context is driven by
  `packages/cli/src/templates/trellis/scripts/common/packages_context.py`.
  `get_context_packages_text()` reads `get_packages_info()`, which reads
  `common/config.py:get_packages()` and scans `.trellis/spec/<package>/<layer>`.
- Existing specs already document the TypeScript monorepo:
  `.trellis/spec/cli/backend/directory-structure.md` says the repo publishes
  `@mindfoldhq/trellis` and `@mindfoldhq/trellis-core`.
- Existing specs already document the core/CLI boundary in
  `.trellis/spec/cli/backend/trellis-core-sdk.md`.

## Drift Scanner Findings

The maintainer drift scanner reported:

```text
ERROR: .trellis/config.yaml has no packages map
ERROR: workspace package path missing from config: packages/cli
ERROR: workspace package path missing from config: packages/core
```

It also reported missing-path candidates:

```text
.trellis/spec/cli/backend/commands-channel.md: `.trellis/agents/x.md`
.trellis/spec/cli/backend/commands-workflow.md: `.trellis/workflow.md.new`
.trellis/spec/cli/backend/platform-integration.md: `.trellis/tasks/04-17-subagent-hook-reliability-audit/research/platform-hook-audit.md`
.trellis/spec/cli/backend/platform-integration.md: `.trellis/tasks/04-17-workflow-enforcement-v2/prd.md`
.trellis/spec/cli/backend/quality-guidelines.md: `.trellis/scripts/create_bootstrap.py`
.trellis/spec/cli/backend/script-conventions.md: `.trellis/worktrees`
.trellis/spec/cli/backend/script-conventions.md: `.trellis/.cache`
```

These are candidates, not confirmed active-truth errors. They need targeted
inspection before any wording change.

## Confirmed Spec-File Problems Beyond Config

### Missing / unreachable specs

- `.trellis/spec/tech/repo/index.md` is referenced by the maintainer workflow
  but does not exist.
- `.trellis/spec/core/` does not exist even though `packages/core` is a real
  workspace package. Existing detailed core rules live in
  `.trellis/spec/cli/backend/trellis-core-sdk.md`, so package-scoped context
  would otherwise show `core` without configured specs after the package map is
  repaired.
- `.trellis/spec/guides/cross-platform-thinking-guide.md` exists, but
  `.trellis/spec/guides/index.md` does not list it in "Available Guides" or the
  quick-reference trigger list. Future sessions can miss cross-platform checks.

### Stale active paths

- `.trellis/spec/cli/backend/platform-integration.md` says the full sub-agent
  reliability audit "lives at"
  `.trellis/tasks/04-17-subagent-hook-reliability-audit/research/platform-hook-audit.md`.
  The file currently lives under
  `.trellis/tasks/archive/2026-04/04-17-subagent-hook-reliability-audit/research/platform-hook-audit.md`.
- The same file cites
  `.trellis/tasks/04-17-workflow-enforcement-v2/prd.md`; the current path is
  `.trellis/tasks/archive/2026-04/04-17-workflow-enforcement-v2/prd.md`.

### Stale removed-file wording

- `.trellis/spec/cli/backend/quality-guidelines.md` still lists
  `.trellis/scripts/create_bootstrap.py` as an orphan Python CLI "shipped as
  template but dead." The file no longer exists in `.trellis/scripts`; release
  manifest `0.5.0-beta.9` records the hash-verified delete. The case study is
  useful, but its wording needs to say the file was one of the historical drift
  modes and is now removed.

### Ambiguous channel ownership wording

- `.trellis/spec/cli/backend/commands-channel.md` documents core-owned worker
  lifecycle / inbox / delivery contracts, but the active CLI still has
  `packages/cli/src/commands/channel/store/*` modules. Code comments show these
  are current CLI-local wrappers used by supervisor / spawn / kill while the
  migration to core APIs continues. The spec should state that boundary
  directly so future work neither deletes the wrappers prematurely nor treats
  them as the canonical reusable store.

## Scanner Candidates Classified As Not Errors

- `.trellis/spec/cli/backend/commands-workflow.md` mentions
  `.trellis/workflow.md.new` as an output file written by
  `trellis workflow --create-new`; it is not expected to exist beforehand.
- `.trellis/spec/cli/backend/commands-channel.md` mentions
  `.trellis/agents/x.md` as a security test fixture path, not as an existing
  repository file.
- `.trellis/spec/cli/backend/script-conventions.md` mentions
  `.trellis/worktrees` and `.trellis/.cache` as excluded generated/user-data
  paths; absence in the current checkout is acceptable.

## Tooling Gap

`uv run python ./.trellis/scripts/check_package_map.py` failed because
`.trellis/scripts/check_package_map.py` does not exist in this repository.
The maintainer workflow says to run it when provided; here the validation
result should record absence rather than fabricate an equivalent script.

Follow-up check with `fd -t f 'check_package_map\.py$' .trellis/scripts
packages/cli/src/templates/trellis/scripts` also found no checker.

## Final Validation Results

After repairs:

```text
python3 "${CODEX_HOME:-$HOME/.codex}/skills/trellis-spec-maintainer/scripts/scan_spec_drift.py"

## Package map
OK

## Missing path candidates
OK
```

Package context output now reports:

```text
## PACKAGES

### cli (default)
Path: packages/cli
Spec layers: backend, unit-test
  - .trellis/spec/cli/backend/index.md
  - .trellis/spec/cli/unit-test/index.md

### core
Path: packages/core
Spec layers: backend
  - .trellis/spec/core/backend/index.md

### docs-site [submodule]
Path: docs-site
Spec layers: docs
  - .trellis/spec/docs-site/docs/index.md

### Shared Guides (always included)
Path: .trellis/spec/guides/index.md
```

`git diff --check -- .trellis/config.yaml .trellis/spec` passed.

Archive references were verified:

- `.trellis/tasks/archive/2026-04/04-17-subagent-hook-reliability-audit/research/platform-hook-audit.md`
- `.trellis/tasks/archive/2026-04/04-17-workflow-enforcement-v2/prd.md`

GitNexus `detect_changes(scope="all")` reported no changed symbols, no affected
processes, and low risk, which matches the docs/config-only change set.

## Spec-Update Judgment

Phase 3.3 did not require an additional spec beyond the files repaired in this
task. The reusable lessons were captured directly in long-lived specs:

- repo/package routing in `.trellis/spec/tech/repo/index.md`;
- core package visibility in `.trellis/spec/core/backend/index.md`;
- cross-platform guide discoverability in `.trellis/spec/guides/index.md`;
- core-vs-CLI channel ownership in
  `.trellis/spec/cli/backend/commands-channel.md`;
- task schema audit surfaces in
  `.trellis/spec/cli/backend/quality-guidelines.md`;
- archived historical references in
  `.trellis/spec/cli/backend/platform-integration.md`;
- generated / optional path wording in workflow and script specs.

## Initial Design Decision

Use Trellis package keys `cli`, `core`, and `docs-site` in `.trellis/config.yaml`.
This preserves existing spec paths (`.trellis/spec/cli` and
`.trellis/spec/docs-site`) and gives `packages/core` an explicit package key
without renaming npm packages into spec directory names.
