---
type: "QbD Audit"
title: "QbD 1: final Harness-native Flow Status"
---

# QbD 1 audit: final Harness-native Flow Status

## Verdict

**FAIL**

The three structural blockers in the
[prior audit](flowstatus-audit-2.md) are repaired. One evidence blocker remains, stated explicitly
by the new
[native capability research](../../research/native-harness-flow-capabilities.md#claims-safe-to-hand-back-to-design):
the positive native payload/capability fixtures needed to authorize the claimed first-release
sources have not yet been captured and linked.

This is an independent QbD 1 verdict, not human calibration or implementation authorization.

## Current blocker

### Positive native capability evidence is specified but not yet demonstrated

The [source-observation contract](../../interfaces/flow-status-source-observation-v1.md) now
defines exact Claude, Codex, and Oh My Pi capability evidence, completeness rules, scope,
continuity, terminal-state translation, and invalidation. However, the research records these
remaining prerequisites before QbD PASS:

- a pinned successful Claude `TaskList` `PostToolUse` response fixture proving the exact
  `tool_response.tasks` shape and resume/compact/fork invalidation;
- an Oh My Pi minimum-version/capability-probe fixture plus structured flat, batch, background,
  failed, aborted, concurrent, stale, and disconnected task-call fixtures; and
- if `codexPlanV1` remains a positive supported capability, an app-server fixture proving the
  request-correlated connection/thread/turn map.

The first two sources underpin the ambient first-release outcome in
[PRD Outcome](../../prd.md#outcome). Schema prose and pinned upstream types justify the design, but
without at least the promised captured positive fixtures the Bundle cannot yet prove that the
adapter accepts the real public payload rather than a hand-constructed normalized observation.
The current Claude project hooks also do not yet provide that observation path, and the installed
Oh My Pi binary is older than the pinned positive revision.

Required remediation: add the bounded, redacted research fixtures and link their exact
version/revision and observed field mapping from the capability Concept. A Codex fixture may be
deferred by explicitly removing `codexPlanV1` from first-release positive support; the managed
`$flow-status` path needs no plan claim.

## Confirmed remediations

- Available/unavailable task-set observations are closed; ephemeral membership is validated,
  discarded after aggregation, and represented by a deterministic canonical SHA-256 digest.
- Assignment/progress equality is explicit, `unitSetRevision` is retained, and denominator changes
  require both unit-set and source-revision changes.
- The snapshot uses a discriminated literal role/position union, including `executor` and neutral
  `explore`, `oracle`, and `orchestrator`; forbidden cross-pairs are testable.
- The selected synthesis and Wiki reject Custom Command and consistently use `flow-status`.
- The one-widget second line is the only retention-guaranteed profile; one-line placement is
  explicitly best-effort and unknown width uses the conservative 20-column ASCII budget.
- Codex `$flow-status` and direct CLI behavior are closed and read-only. The Oh My Pi design now
  correctly distinguishes pinned upstream positive capability from the older local adapter.
- Presentation adds no OMP branding, infers no Markdown/lifecycle state, minimally extends
  ccstatusline, separates task-set and task-local measures, and retains bounded cache, security,
  Windows, installation, and documentation-truthfulness requirements.

## Gate

Add the missing positive capability fixtures, or narrow first-release positive claims to the
evidence already captured, then run a fresh independent QbD 1 audit. A later model PASS still
requires an explicit linked human decision before decomposition.
