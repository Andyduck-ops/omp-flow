---
type: "Implementation Handoff"
title: "Flow Status v2 implementation"
---

# Flow Status v2 implementation

Implemented the approved [completion-audit repair](../completion-audit-repair.md) across the
explicit root Task/Flow publisher, portable cache receiver, two-view ccstatusline integration,
Claude authorization/observation boundary, Oh My Pi presentation, stable fixtures, setup,
supervision, tests, README, and durable Wiki.

Operation receipt: `a8cc0dd6c1eb4906ae5a169fb23942a4`

## Delivered

- Added the sole typed `buildRootFlowPublishRequestV2` constructor and public
  `omp-flow flow-status publish|renew|clear` CLI boundary.
- Added closed v2 publication/snapshot validation, movement and Work-catalog relations, CAS,
  idempotent retry, lease renewal/expiry/clear, one scoped atomic cache envelope, and independent
  optional v1 `nativeActivity` in the canonical portable runtime.
- Added the pinned ccstatusline v2 patch and manifest for exact `root-task` and `flow` views,
  shared one-read-per-frame provider behavior, Powerline width degradation, one labelled measure,
  and no persistent Wave.
- Reworked setup/update/doctor/removal around the exact capability quartet, two placements,
  ownership v2, pending recovery, atomic commit/rollback, fresh Powerline defaults, and preservation
  of existing user configuration.
- Added the short-lived no-shell supervisor with 1 MiB input, 64 KiB output, and 400 ms presentation
  deadline/termination boundary.
- Added Claude identity binding, synchronous TaskUpdate guard, guarded binding/progress
  reconciliation, structured task/attention observation, and TaskUpdate-without-Agent capability
  for the five managed agents.
- Kept Oh My Pi native batch facts separately labelled when no explicit root publication exists;
  Codex remains read-only/on-demand and does not claim a persistent third-party footer.
- Moved executable payloads to `tests/fixtures/flow-status/`, added binding/progress/attention
  fixture cases, and removed the task-local payload tier.
- Updated README and the architecture/philosophy Wiki pages to the shipped v2 model and its
  availability qualifications.

## Verification

Passed:

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks .claude/hooks`
- `npm run build`
- `npm test` — 262 focused checks
- `npm pack --dry-run`
- `node tests/flow-status-installed.mjs`
- `git diff --check`
- exact guard `--self-test`
- v2 patch applies to clean ccstatusline revision
  `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`
- clean-source compatible build — 34 tests, 258 expects, bundle/package capability probe PASS;
  patch SHA-256 `70059e925fae587ecfc8301674892b2f5b71eda58b807f78853c64a7e7f147d8`

The deterministic benchmark entry emitted all samples and clocks. On this active Windows machine:

- provider open/read/validate/format warm p95: `0.382 ms` — PASS (`<= 50 ms`)
- 20 hung-child cases: kill lateness max `418 ms`, presentation max `524 ms`, cleanup max
  `532 ms` — PASS (`<= 450/600/1000 ms`)
- 40 cold supervisor invocations: p95 `288.4 ms` — does not meet the pinned idle-job
  `<= 250 ms` gate on this run

The Windows workflow runs this benchmark with strict gating. This handoff does not convert the
local cold miss into a pass and does not claim authenticated Claude native E2E evidence; doctor
reports that evidence as `unproven`.

## Review focus

Independent review should concentrate on:

1. complete Work-catalog/accepted-review adversarial relations and publication transition rules;
2. Claude guard reservation/reconciliation and revocation paths;
3. two-view setup ownership/recovery and one-read-per-frame rendering;
4. the strict Windows cold p95 result on an idle supported runner; and
5. archive-aware links and final completion claims before the task is archived.
