---
type: "QbD Audit"
title: "QbD 1: native Flow Status capability fixtures"
---

# QbD 1 audit: native Flow Status capability fixtures

## Verdict

**NEEDS_EVIDENCE**

The sole evidence blocker in the
[prior audit](flowstatus-audit-3.md) is almost, but not completely, closed. The new
[fixture attachment](../../reference/native-capability-fixtures.md) supplies sufficient
pre-implementation design evidence for Claude Code and for the claimed Oh My Pi batch path, and
`codexPlanV1` is explicitly absent from the
[v1 source union](../../interfaces/flow-status-source-observation-v1.md#task-set-union). One
promised Oh My Pi payload shape remains unattached.

This verdict is independent QbD judgment, not human calibration or implementation authorization.

## Remaining evidence requirement

### The Oh My Pi flat task-call fixture is still missing

The prior audit required structured Oh My Pi **flat, batch, background, failed, aborted,
concurrent, stale, and disconnected** task-call fixtures. The pinned
fixture at `tests/fixtures/flow-status/oh-my-pi-task-events-v17.2.1.json`
now covers the capability keys, a complete `args.tasks[]` batch, background progress,
failed/aborted terminal states, partial progress, a concurrent unselected call, and
stale/disconnected invalidation.

It contains no flat single-task `tool_execution_start.args` scenario. That omission is material
because the [source contract](../../interfaces/flow-status-source-observation-v1.md#task-set-union)
says the pinned native arguments may be either one flat task or a batch, while
[PRD acceptance criterion 13](../../prd.md#acceptance-criteria) and the
[design verification strategy](../../design.md#verification-strategy) explicitly promise flat
coverage. The attached batch payload cannot prove the distinct raw flat argument shape or its
one-member full-progress correlation.

**Required remediation:** attach one pinned flat-call scenario containing the raw
`tool_execution_start.args`, a complete one-entry indexed update or terminal progress snapshot,
and the expected available counts/current-task mapping. Alternatively, narrow the v1 contract,
PRD, and verification claim to batch-only support. Then run a fresh independent QbD 1 audit.

## Evidence now sufficient

- The Claude fixture combines the official 2.1.220 `PostToolUse`, `TaskListOutput`, and
  `SessionStart.source` schemas, preserves the public `tool_response.tasks` shape, and covers
  resume/compact/fork invalidation. That is adequate design evidence for the closed producer
  contract.
- The failed local Claude probe is disclosed accurately: authentication failed before a model
  turn, so the attachment is not misrepresented as a live capture. An authenticated live smoke
  remains useful implementation verification after design approval; it is not a reason to reject
  the published-schema design fixture.
- The Oh My Pi attachment pins package 17.2.1 and revision
  `7a2ced50bea8b97dbab7d9bd579329c4ea704de0`, links public types and upstream test anchors, and
  correctly withholds authority from the locally installed 16.4.4 binary.
- Codex plan support has been removed from v1 rather than left as an unevidenced positive
  capability. First-release Codex remains the separately closed read-only `$flow-status` detail
  Skill, so no app-server connection/thread/turn fixture is required for this gate.

All structural remediations confirmed by audit 3 remain closed. A later model PASS will still
require an explicit linked human decision before decomposition.
