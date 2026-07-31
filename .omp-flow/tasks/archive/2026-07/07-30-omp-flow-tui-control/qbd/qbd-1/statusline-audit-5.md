---
type: "QbD Audit"
title: "QbD 1: final ccstatusline-informed embedded status line"
---

# QbD 1 audit: final ccstatusline-informed embedded status line

## Verdict

**PASS**

The current [synthesis](../../research/statusline-synthesis.md), [PRD](../../prd.md),
[design](../../design.md), [closed snapshot](../../interfaces/statusline-snapshot-v1.md),
[segment contract](../../interfaces/statusline-segment-v1.md), and
[host/Git presentation contract](../../interfaces/host-presentation-v1.md) resolve the three
blockers in the [previous audit](statusline-audit-4.md) without weakening the earlier scope,
freshness, trust, coexistence, or non-crowding constraints. The product now has one implementable
meaning for each displayed measure and one bounded guarantee for each presentation path:
standalone owns the only graphical bar, while composition emits ratio-only omp progress and claims
final-width safety only for a reviewed outer profile with an explicit matching allocation.

No current QbD 1 blocker remains. This is an independent model verdict, not human calibration or
implementation authorization.

## Reassessment of the prior blockers

### 1. Codex plan-to-Bundle binding — remediated

The snapshot now supplies a current live
[`NativeScope`](../../interfaces/statusline-snapshot-v1.md#closed-envelope), requires the plan,
source, and render scope to share the exact Codex `threadId` and `turnId`, and makes missing current
turn identity ineligible. It also requires `task.id == renderScope.selectedTaskId`.

More importantly, [`codexPlan`](../../interfaces/statusline-snapshot-v1.md#progress-measures) now
has a non-null `(taskId, operationReceipt, actorId)` binding. The task must match both selected-task
fields, and receipt plus actor must match a current public runtime binding represented by the
current receipt-set correlation. Wrong, missing, stale, or replaced binding and receipt-set
replacement invalidate the measure. This prevents a merely current but unrelated turn plan from
appearing as progress for `omp:<bundle>`.

The PRD and verification strategy now require correct-turn/wrong-task, wrong-receipt, wrong-actor,
missing-binding, session-reuse, and receipt-replacement fixtures. The binding is presentation
eligibility only; it does not change a receipt or manufacture workflow meaning.

### 2. One graphical bar across both presentation paths — remediated

The [progress selection design](../../design.md#flowstatussnapshot-v1) now distinguishes
the two ownership models:

- standalone output selects exactly one graphical bar; a valid runtime-bound Codex plan wins and
  context becomes numeric, otherwise context-used may own the bar; and
- composition output is always graphical-bar-free in the omp segment, exposing eligible work only
  as the labelled ratio `plan 3/5`.

The [segment output contract](../../interfaces/statusline-segment-v1.md#output-semantics) makes the
ratio-only rule normative rather than leaving it to a profile preference. A supported outer
ccstatusline profile may contain zero or one graphical context/quota bar. Multiple outer bars are
reported `composition-needs-config`, so the installer does not claim a guarantee it cannot
enforce. Standalone and final-composition fixtures separately assert the selected bar kind,
ratio-only omp output, and absence of a second bar.

The examples now follow the rule: standalone work progress owns the bar and displays context
numerically; context owns the bar only when no eligible work plan exists.

### 3. Explicit child allocation and final composed width — remediated

For ccstatusline composition, [`--width`](../../interfaces/statusline-segment-v1.md#command) is now
a required explicit 20–64-column child allocation. `terminal_width` is only a whole-terminal
ceiling, and the effective child budget is their minimum. The supported recipe requires the same
integer for `--width` and ccstatusline Custom Command `maxWidth`; a missing, invalid, or mismatched
allocation is nonconforming.

The [width-aware renderer](../../design.md#flow-status-widget) emits one
separator-safe, pre-compacted segment with no graphical bar. Installation preserves an occupied
renderer, previews the exact command and final composition, and reports `composable` only for the
bounded reviewed profile; other configurations remain unchanged as
`composition-needs-config`.

Verification has moved from child-only output to the actual composed line. Fixtures include outer
model, Git, and context widgets plus the omp ratio segment, matching `--width`/`maxWidth`,
zero/one/multiple outer bars, all normative terminal widths, final display-column measurement,
retained facts, separator repair, and proof of no outer truncation. This directly tests the
non-crowding claim at the ownership boundary where truncation could occur.

## Earlier repairs remain consistent

### Progress, context, and width semantics

Context is normatively whole percent **used**, with remaining-only conversion, agreement checks
when both orientations are supplied, bounded floating-point tolerance, half-up rounding, and
left-to-right fill. Context, Git, receipt counts, cost, and duration cannot become work
completion. Mechanical operations remain categorical `✓/↻/✕` counts.

The single retention matrix now agrees across PRD, synthesis, and design. It separates visual
order from semantic retention, defines 160/120/100/80/60/unknown behavior, makes action hints
optional below 100 columns, and limits `+N` to capped attention/activity detail. Profiles change
eligible detail, not source truth or denominator meaning.

### Input closure and trust boundary

Minimal segment input is discriminated by the exact `kind: "ompFlowSegmentInput"` value and rejects
unknown fields with no validation fallback. Absence of `kind` selects the ccstatusline branch,
which requires `workspace.current_dir`, allowlists only workspace, session-binding candidate, and
terminal ceiling, and ignores all other fields. Hybrid, malformed, private-field, and future-field
behavior is deterministic.

The standalone [host/Git contract](../../interfaces/host-presentation-v1.md) closes raw field
paths, normalized shapes, numeric and string bounds, presence states, repository equality, Git
cache age, and redaction. Raw payloads, transcripts, account data, credentials, private usage
endpoints, network Git enrichment, and arbitrary child commands are outside the renderer.

### Coexistence, Codex limitation, cache, and action safety

Claude installation remains empty-slot-only and exact-owner reversible. An occupied renderer is
never rewritten or auto-composed. The current Codex surface is described truthfully: no persistent
third-party footer is claimed, `tui.status_line` remains unchanged, and detail is available through
`$omp-flow-status` or the direct inspector.

Snapshot and Git caches are bounded, expiring, reconstructable, and display-only. The render hot
path has explicit input/output and deadline bounds and no network/private-store dependency. Cached
status cannot authorize attach, interrupt, stop, or receipt mutation; the inspector must re-query
the owning live adapter and exact capability.

No lifecycle database, semantic event ledger, Markdown parser, inferred phase, approval, review
verdict, or overall task percentage is introduced.

## Residual implementation risks

These are required verification obligations already represented by the design, not QbD blockers:

- the app-server adapter must preserve the assignment-to-thread/turn/receipt/actor correlation and
  invalidate it atomically when either native scope or the public receipt set changes;
- setup must treat unrecognized or dynamically bar-producing outer widgets as outside the reviewed
  profile rather than optimistically declaring them composable;
- final-composition fixtures should remain pinned to each supported ccstatusline contract and
  capability-probe later versions before promising `maxWidth` behavior; and
- real Windows CI must enforce display-column measurement, UTF-8 paths, process deadlines, atomic
  cache/config writes, and conservative unknown-width behavior.

## Gate

Present this PASS and the current linked artifacts for explicit human calibration. Only a linked
human PASS may authorize decomposition; this audit alone does not advance or approve the task.
