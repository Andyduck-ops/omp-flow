---
type: "Implementation Handoff"
title: "Final Flow Status integration review repair"
---

# Final Flow Status integration review repair

Status: **DONE**

This repairs every finding in the
[final integration review](../../review/setup-docs-and-integration.md) while preserving the
approved [integration work](../setup-docs-and-integration.md) and linked
[original handoff](setup-docs-and-integration.md).

## Review findings repaired

### Explicit reversible setup contract

`omp-flow flow-status setup|update` now requires every material choice explicitly:

- `--scope project|user`;
- exact compatible binary and package metadata paths;
- exact ccstatusline config and Claude settings paths;
- selected line and `start|end` position; and
- `--yes` before any mutation (`--dry-run` previews; omission is confirmation-required).

The CLI verifies package name/version
`@omp-flow/ccstatusline@2.2.27-flowstatus.1`, capability `flowStatusWidgetV1: true`, and pinned
revision `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`. It adds exactly one canonical native
`flow-status` widget, preserves existing lines/themes/widgets, is idempotent, and can move only
that exact unmodified widget during update. Duplicate, modified, foreign-owner, wrong-package,
wrong-revision, unsupported, missing confirmation, and project-path-escape cases fail before
mutation.

An ignored v1 ownership record binds scope, both explicit settings paths, exact supported command,
widget identity/value, line/position, and whether setup created the Claude status line. Removal
requires the same explicit scope/paths and `--yes`; it removes only the exact owned widget and
status command plus hash-matching project resources. Modified ownership, widget, settings, or
command fails closed. Project and user scopes have independent, explicit ownership locations.

### Atomic settings and ownership

`src/cli/atomic-file.ts` implements same-directory exclusive temporary files, file `fsync`, atomic
rename, best-effort directory sync, cleanup, and reverse-order atomic rollback across a multi-file
commit. Setup commits ccstatusline config, Claude settings, template hashes, and ownership as one
recoverable set. Removal commits widget/settings subtraction, managed-file deletion, ownership
deletion, and template hashes through the same boundary. The ordinary template-hash writer now
also uses the atomic primitive.

Source tests inject failures after the first and second rename and prove the last complete config,
Claude settings, ownership, and hash documents survive with no temporary residue. The installed
Windows fixture imports the packed implementation, injects a post-rename failure in a CJK path,
and independently proves rollback/no residue before continuing with successful setup.

### Exact owner parsing

The prior case-insensitive substring heuristic is gone. Owner detection tokenizes a closed
documented command shape, rejects unclosed quotes/extra arguments, and recognizes the configured
self-managed JavaScript/binary shape only when it exactly equals the command derived from the
explicit binary and config paths. `foreign-renderer --label ccstatusline` is now a tested conflict.
Configured command strings are still never executed.

### Installed cross-surface parity

The Windows workflow now installs Bun, builds the real pinned/reviewed compatible ccstatusline
tarball, installs it beside the packed omp-flow artifact, and runs both. The installed fixture:

- performs confirmation-required, confirmed setup, repeat setup, exact removal, and repeat removal;
- publishes the same task membership/current task/assignment/progress/attention facts into
  correctly host-bound Claude and Oh My Pi snapshots;
- executes the installed ccstatusline widget for full, compact, minimal, degraded, explicit ASCII,
  unknown-width, and semantic-empty cases;
- executes installed Oh My Pi compact formatting and compares task/progress facts;
- invokes the installed portable CLI for Codex's truthful unavailable on-demand detail and verifies
  that Codex configuration remains byte-identical;
- rejects injected `OMP`, `omp:`, Bundle shorthand, logo, and fabricated Codex footer claims; and
- enforces hard process deadlines throughout.

The compatible build program accepts `--online` only for the clean CI acquisition; the default
reviewed/local path remains frozen and offline.

## Changed files

- `src/cli/atomic-file.ts`
- `src/cli/flow-status-setup.ts`
- `src/cli/index.ts`
- `src/cli/template-hash.ts`
- `templates/.omp-flow/gitignore`
- `integrations/ccstatusline/build.mjs`
- `tests/flow-status-setup.test.ts`
- `tests/flow-status-installed.mjs`
- `.github/workflows/flow-status-windows.yml`
- `README.md`
- `.omp-flow/wiki/architecture/harness-flow-statusline.md`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/setup-docs-and-integration-repair.md`

The live deployed `.omp-flow/scripts/` runtime and unrelated
`templates/.omp-flow/scripts/common/disposition.py` modification were not edited.

## Verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS: Python snapshot contracts, Claude observer contracts, OMP adapter contracts,
  and **261 focused checks** including setup/update/remove, project/user scope, exact gates,
  conflict/decline/unsupported, and injected atomic recovery.
- Real reviewed ccstatusline build on Windows — PASS: 35 upstream/patched focused tests, 259
  assertions, exact capability/revision, patched build, and tarball.
- `node tests/flow-status-installed.mjs` with that tarball — PASS in **30.6 seconds** on Windows,
  including installed atomic failure recovery and every cross-surface case above.
- `npm pack --dry-run --json` — PASS: **104 entries**, including compiled atomic/setup code,
  canonical resources, and all ccstatusline integration files; no clone cache or runtime state.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

The full source suite and installed fixture are intentionally sequential in CI. A diagnostic
parallel local run briefly caused the explicit 3-second capability probe to time out under
competing build/test load before reaching the injected atomic seam; both prescribed sequential
runs pass.

Actor ID: `executor-flowstatus-integration-repair`

Dispatch receipt: `e58fd7f34f0e4194b0f35c27e477a990`

Review predecessor: `49e27d0f01044632815438ec2057bdec`
