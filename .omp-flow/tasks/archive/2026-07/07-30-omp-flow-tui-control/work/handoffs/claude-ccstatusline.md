---
type: "Implementation Handoff"
title: "Claude task observations and pinned ccstatusline Flow Status capability"
---

# Claude task observations and pinned ccstatusline Flow Status capability

Status: **DONE_WITH_CONCERNS**

This implements [the bounded Claude/ccstatusline work](../claude-ccstatusline.md) against the
accepted shared-core [repair review](../../review/shared-snapshot-and-inspect-2.md), the
[Flow Status snapshot](../../interfaces/flow-status-snapshot-v1.md), and the pinned
[Claude/ccstatusline evidence](../../research/ccstatusline.md).

## Delivered

- Added one bounded Claude structured-task observer hook. A successful complete `TaskList`
  establishes the member map; correlated `TaskCreate` and `TaskUpdate` results may update that map
  only afterward. Startup, resume, clear, compact, and fork remove authority until a new baseline.
  Partial or malformed evidence also revokes the baseline rather than leaving prior counts current.
- Kept adapter state in an ignored, session-keyed, atomically replaced presentation cache under
  `.omp-flow/.runtime/flow-status/claude-observer/`. The hook starts no daemon, reads no transcript
  or global session directory, and forwards one closed UTF-8 object through the accepted
  `omp-flow status observe --host claude --session ...` stdin boundary without a shell.
- Added the exact pinned integration manifest, isolated build program, and reviewed upstream patch
  for `sirmalloc/ccstatusline` revision
  `83c8ffd551ec700fceeed98fe9ab50de84cb49fa` (`v2.2.27`).
- The patch registers exactly one `FlowStatusProvider` and one `flow-status` widget. The provider
  computes the exact repository/Claude-session cache key and performs one bounded synchronous
  cache-file read. The widget participates in ccstatusline's existing registry, editor keybinds,
  semantic-empty handling, ANSI/Powerline renderer, and final width allocation.
- Implemented compact/full forms, task-set/current-task bar selection, at most one Flow Status
  graphical bar, ratio-first compaction, 20–80 column local budgets, conservative ASCII unknown
  width, current task/assignment/progress, bounded attention, freshness/degradation, and
  adapter-authored no-branding fixtures.
- Added `ccstatusline --capabilities --json`, which reports only the accepted capability and exact
  upstream revision. The isolated build rewrites package identity only after dependency
  verification, then produces `@omp-flow/ccstatusline@2.2.27-flowstatus.1`.
- Added focused Claude baseline/delta/invalidation/partial-payload/CJK tests and upstream
  provider/widget/catalog/Powerline composition tests. Existing ccstatusline widgets and user
  configuration remain untouched.

## Exact distribution identity and per-artifact result

- Package: `@omp-flow/ccstatusline@2.2.27-flowstatus.1`
- Upstream revision: `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`
- Patch SHA-256:
  `e7dcebff8a6a1b8f124b026585affd0d83272758e0c0eeb7f69bf472c680d4f4`
- Executor-run tarball:
  `omp-flow-ccstatusline-2.2.27-flowstatus.1.tgz`
- SHA-256 of that specific executor-run artifact:
  `4e7b322605c1f79fd73b6372e6f99963604f727c42c5d7b1f21c28c74076041d`
- Captured capability:

```json
{
  "flowStatusWidgetV1": true,
  "upstreamRevision": "83c8ffd551ec700fceeed98fe9ab50de84cb49fa"
}
```

The tarball is a reconstructable ignored build output under
`.omp-flow/.runtime/ccstatusline-artifacts/`; it is not a committed opaque binary. npm packing is
not claimed byte-reproducible: an independent clean replay produced the same reviewed patch,
revision, package identity, build checks, and runtime capability but a different tarball SHA-256,
`9dc36a8cc40796b1ff6eef6c6806e140ba78dc38a95c343c8637c84f20697857`.
Each produced artifact must therefore carry and be checked against its own build-reported digest.
Setup trust is anchored to the pinned upstream revision, reviewed patch digest, exact package
identity, successful clean checks, and exact runtime capability—not to the executor-run tarball
digest above.

## Changed files

- `templates/claude/hooks/flow-status-observe.py`
- `templates/claude/settings.json`
- `integrations/ccstatusline/flow-status-build.json`
- `integrations/ccstatusline/build.mjs`
- `integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch`
- `tests/claude-flow-status.test.py`
- `tests/omp-flow.test.ts`
- `package.json`

The accepted shared Python producer/cache modules, live deployed `.omp-flow/scripts/`, unrelated
`templates/.omp-flow/scripts/common/disposition.py`, and OMP-owned files were not edited by this
work. The ignored acquisition clone was restored to a clean
`83c8ffd551ec700fceeed98fe9ab50de84cb49fa` worktree after patch generation.

## Verification

- Clean isolated replay from the pinned local Git acquisition:
  - revision and patch SHA checks — PASS
  - `git apply --check` and apply — PASS
  - `bun install --frozen-lockfile --offline` — PASS
  - upstream TypeScript check and focused ESLint — PASS
  - provider/widget/catalog/Powerline tests — PASS, 35 tests / 259 assertions
  - upstream build and exact capability probe — PASS
  - npm pack — PASS
- `python -X utf8 tests/claude-flow-status.test.py` — PASS
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS
- `npm run build` — PASS
- `npm test` — PASS, 240 focused repository checks, including the Claude hook contract
- `npm pack --dry-run --json` — PASS; all three integration files and the observer template are
  present
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were printed

The first isolated pack attempt reached a successful build/capability probe but exposed Windows
`spawnSync npm.cmd` returning `EINVAL`. The build program now invokes the adjacent npm CLI with
Node directly; a second complete clean replay produced the executor-run artifact recorded above.

## Setup dependency and concern

The work Concept explicitly makes generic installer configuration an input rather than this
executor's ownership. Therefore `src/cli/init.ts` was not widened here. It still needs a
setup/integration-owned registration of `flow-status-observe.py` in the managed Claude hook
resources before claiming that `omp-flow init --harness claude` installs the observer. The package
contains the hook and settings already; until that exact resource registration lands, an installed
Claude template may reference a hook that init did not copy. Setup must also preserve an existing
status owner and user widget/theme/order configuration, and must probe the exact package before
adding one widget.

Actor ID: `executor-flowstatus-claude`

Dispatch receipt: `df52be28381041899cb350ab1d73a022`
