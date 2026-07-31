---
type: "Implementation Handoff"
title: "Atomic preparation and pinned doctor final repair"
---

# Atomic preparation and pinned doctor final repair

Status: **DONE**

This narrowly repairs the two residual findings in the
[final repair review](../../review/setup-docs-and-integration-2.md) without changing the accepted
setup, removal, presentation, or Harness semantics from the
[preceding repair](setup-docs-and-integration-repair.md).

## Preparation cleanup repair

`atomicCommitFilesSync()` now establishes cleanup ownership before preparing the first temporary
file. Preparation proceeds incrementally inside the same protected `try/catch/finally` as commit
and rollback. Each temporary path is registered before `open`/write/fsync, so a failure while
creating or writing any later target still removes every earlier or partial temporary file.

A tracked source regression and an independent compiled-module regression both use:

1. an existing first target with a complete old document; and
2. a second target whose parent is an existing regular file.

Both prove preparation fails before rename, the first target retains its exact old bytes, and no
`.tmp` member remains.

## Exact pinned doctor predicate

Configured command classification is centralized as `exact-pinned`, `generic-ccstatusline`, or
`other`. Setup and doctor now use this same predicate:

- setup accepts an existing owner only when it is `exact-pinned`;
- doctor reports `ready` only when the configured command is `exact-pinned` and the exact
  package/capability/revision probe succeeds;
- generic documented commands remain discoverable as `statusOwner: ccstatusline`, but report
  `manual-compatible-build-required`; and
- other absolute or ccstatusline-like commands remain conflicts.

Source and compiled regressions cover `ccstatusline`, `npx -y ccstatusline@latest`, and another
absolute ccstatusline-like command while a separate pinned probe succeeds. None can borrow that
probe's readiness.

## Changed files

- `src/cli/atomic-file.ts`
- `src/cli/flow-status-setup.ts`
- `tests/flow-status-setup.test.ts`
- `tests/flow-status-final-repair.test.mjs`
- `.github/workflows/flow-status-windows.yml`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/setup-docs-and-integration-repair-2.md`

The live deployed Python runtime, accepted adapters/presentation, README/Wiki semantics, and
unrelated `templates/.omp-flow/scripts/common/disposition.py` modification were not changed.

## Verification

- `npm run build` — PASS.
- `node tests/flow-status-final-repair.test.mjs` — PASS against compiled modules.
- `npm test` — PASS, **265 focused checks**.
- `node tests/flow-status-installed.mjs` with the reviewed compatible tarball — PASS, **37.1
  seconds**, preserving every accepted installed cross-surface and atomic recovery case.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm pack --dry-run --json` — PASS, **104 entries**.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

Actor ID: `executor-flowstatus-integration-repair2`

Dispatch receipt: `0bc8cc93296c465cac818e9cc44b555b`

Review predecessor: `e6e3461924834b468e5f97b443deb830`
