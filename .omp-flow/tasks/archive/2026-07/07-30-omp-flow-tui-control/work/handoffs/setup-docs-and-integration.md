---
type: "Implementation Handoff"
title: "Reversible Flow Status setup, documentation, and installed integration"
---

# Reversible Flow Status setup, documentation, and installed integration

Status: **DONE_WITH_CONCERNS**

This implements the bounded
[setup, documentation, and integration work](../setup-docs-and-integration.md) using the accepted
[shared snapshot review](../../review/shared-snapshot-and-inspect-2.md),
[Oh My Pi review](../../review/oh-my-pi-native-status-2.md), and
[Claude/ccstatusline final review](../../review/claude-ccstatusline-3.md).

## Delivered

- Registered `flow-status-observe.py` as a canonical Claude managed resource. The settings template
  no longer references an observer that `init`/`update` omit.
- Added read-only `omp-flow flow-status doctor`. It reports selected Harnesses, managed-resource
  integrity, Claude status ownership, exact ccstatusline capability/revision, Codex Skill-only
  status, Oh My Pi runtime gating, and bounded full/ASCII previews.
- The doctor never executes the command string from `.claude/settings.json`. It probes only an
  explicit `--ccstatusline-bin` using an argument array, no shell, a 3-second timeout, and bounded
  output. Foreign renderers and capability/revision mismatch report conflict/unsupported without
  mutation.
- Added `omp-flow flow-status remove [--dry-run]`. It deletes only exact, hash-matching universal
  and Codex Flow Status Skills plus the Claude observer. It subtracts only observer hook entries
  from an exact managed Claude settings file. A modified settings file preserves both settings and
  observer so removal cannot create a dangling reference. Repeat removal is idempotent and
  `init --force` is the explicit reversal.
- Preserved current Codex `config.toml`, arbitrary installed ccstatusline code/configuration,
  unrelated Claude hooks/settings, OMP settings, Bundles, cache, and the live deployed Python
  runtime.
- Verified the already accepted package registration includes the exact
  `integrations/ccstatusline` build manifest, reviewed patch, and build program.
- Added a real packed-artifact fixture that installs into a UTF-8/CJK Windows path, runs the
  installed CLI with hard process deadlines, checks exact package content, observes and inspects a
  CJK snapshot, detects temporary-file residue, renders the installed OMP compact surface, enforces
  no injected branding, and exercises dry-run/removal/repeat removal.
- Added `.github/workflows/flow-status-windows.yml`, which runs the complete source suite and
  installed-artifact fixture on `windows-latest` under a job timeout.
- Updated README and the durable Harness-native Flow Status Wiki at
  `.omp-flow/wiki/architecture/harness-flow-statusline.md` with the
  visible Powerline effect, exact setup/inspect/remove commands, capability gates, coexistence,
  fallback, removal, package contents, and Codex persistent-footer limitation.

## Changed files

- `src/cli/flow-status-setup.ts`
- `src/cli/index.ts`
- `src/cli/init.ts`
- `tests/flow-status-setup.test.ts`
- `tests/flow-status-installed.mjs`
- `tests/omp-flow.test.ts`
- `.github/workflows/flow-status-windows.yml`
- `README.md`
- `.omp-flow/wiki/architecture/harness-flow-statusline.md`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/setup-docs-and-integration.md`

Accepted component-owned `package.json`, `integrations/ccstatusline/**`, shared runtime/Skill,
Claude observer/settings, and OMP adapter changes were consumed and verified, not silently
redesigned here.

## Verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS: Flow Status Python contracts, Claude observer contracts, OMP adapter
  contracts, setup/removal contracts, and **264 focused checks**.
- `node tests/flow-status-installed.mjs` — PASS on the current real Windows host: packed artifact
  installed into a UTF-8/CJK path, observed/inspected/rendered, and removed under deadlines.
- `npm pack --dry-run --json` — PASS: **100 package entries**; includes the compiled CLI/OMP
  adapters, all canonical Flow Status resources, and all three tracked ccstatusline integration
  files; excludes clone cache and runtime state.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

## Decisions and caveats

- No broad installer or status control plane was added. The reviewed compatible ccstatusline build
  is shipped as an explicit acquisition/build boundary. Installation and native widget placement
  remain explicit until a trustworthy existing CLI seam can own them.
- The build program intentionally uses the reviewed offline Bun dependency boundary. It does not
  hot-patch an arbitrary installation or use ccstatusline Custom Command.
- Project removal does not uninstall ccstatusline or the package-level Oh My Pi extension, and
  cannot unregister a running native command/status contribution mid-session. Those remain native
  package/configuration lifecycle steps followed by a Harness restart, as documented.
- The Windows workflow definition was verified locally through the same commands and packed
  fixture on Windows; the GitHub-hosted run itself begins only after the change is pushed.

Actor ID: `executor-flowstatus-integration`

Dispatch receipt: `fcc8b7778b0a4903bcb9714a098818db`

Predecessor review receipt: `00a759acd7ea45a099c7149c30e25023`
