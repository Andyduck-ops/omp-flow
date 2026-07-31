---
type: "QbD Audit"
title: "QbD 1: repaired ccstatusline-informed status line"
---

# QbD 1 audit: repaired ccstatusline-informed status line

## Verdict

**FAIL**

The current repair closes most of the four blockers in the
[prior audit](statusline-audit-3.md): native thread/turn scope is explicit, context is normalized
to percent used, the work bar has priority over the context bar, the profile/width matrix defines
action and `+N` behavior, input-shape discrimination is fail-closed, and
[host/Git presentation v1](../../interfaces/host-presentation-v1.md) now bounds and redacts the
standalone presentation inputs.

Three material contradictions remain. They can associate an unrelated current Codex plan with the
selected Bundle, allow two graphical bars in the preferred coexistence path, and size a
ccstatusline child against the whole terminal rather than the space available to that child. The
design therefore cannot yet prove the requested honest, non-crowded composed status line.

This model verdict is not human calibration or implementation authorization.

## Blocking findings

### 1. `codexPlan` is turn-bound but not task/receipt-bound

The repaired [native scope](../../interfaces/statusline-snapshot-v1.md#closed-envelope) and
[progress rules](../../interfaces/statusline-snapshot-v1.md#progress-measures) correctly require
the plan, source, and current render scope to share the exact Codex `threadId` and `turnId`. The
snapshot also requires `task.id == renderScope.selectedTaskId`.

Those two equalities do not prove that the current Codex turn belongs to that selected omp-flow
task. `codexPlan.actorId` and `operationReceipt` remain nullable, and no rule requires either field
to match a current public receipt binding before the plan is rendered inside the `omp:<bundle>`
zone. A fresh plan from an unrelated turn can therefore appear visually as the selected Bundle's
`3/5` progress.

Required remediation:

- Give `codexPlan` a required task/receipt/actor binding for omp-flow-zone eligibility and validate
  it against the current public runtime snapshot, or render an unbound current-turn plan outside
  the omp-flow zone with an explicit `unbound` meaning and no Bundle association.
- Add fixtures for correct turn but wrong task, wrong receipt, wrong actor, missing binding, stale
  binding, and receipt-set replacement.

### 2. The one-graphical-bar invariant is unenforceable in coexistence mode

[PRD R2](../../prd.md#r6--honest-task-set-and-task-local-progress), the
[progress selector](../../design.md#flowstatussnapshot-v1), and the normative width matrix
require at most one graphical bar: a valid work plan wins, with context reduced to a number.
That rule is implementable in the standalone renderer because it owns both zones.

In the preferred coexistence path, however, the existing compositor owns model/context/Git and the
[segment contract](../../interfaces/statusline-segment-v1.md#accepted-input-shapes) deliberately
ignores context. ccstatusline may independently render its own graphical context bar while the
omp-flow segment renders a `codexPlan` bar. Neither process can observe or suppress the other's
selected bar, so the composed product can violate the normative one-bar rule even though both
components individually conform.

Required remediation:

- Define a coexistence rule that can actually enforce the invariant: for example, make composition
  mode render work progress as a ratio only, or require an explicit user-reviewed configuration in
  which the outer context bar is disabled when the omp segment may draw a bar.
- Separate standalone and composition acceptance fixtures and assert the final composed output,
  not only the omp-flow child output.

### 3. ccstatusline width is a global ceiling, not a segment allocation

The [segment command](../../interfaces/statusline-segment-v1.md#command) uses ccstatusline's
allowlisted `terminal_width` as its display-width candidate when `--width` is absent. At the pinned
ccstatusline revision, that field is the detected width of the entire terminal, added to every
Custom Command payload; it is not the width remaining after ccstatusline's other widgets. See the
[ccstatusline Custom Command evidence](../../research/ccstatusline.md) and its pinned
`CustomCommand.tsx` behavior.

The [two-zone design](../../design.md#flow-status-widget) simultaneously requires the
outer compositor to reserve the returned segment width and forbids byte slicing or semantic
reinterpretation. A segment that compacts against the full terminal can consume the host zone's
budget or be truncated by the outer compositor, defeating the canonical retention matrix and the
non-crowding guarantee.

Required remediation:

- For ccstatusline composition, require an explicit allocated `--width`, or define a conservative
  fixed/derived segment budget that treats `terminal_width` only as a global upper bound.
- Make installer guidance and fixtures include host widgets plus the omp-flow child, and assert the
  final line's display width, retained facts, separator behavior, and absence of outer truncation
  at every normative width.

## Reassessed areas with no current blocker

- Context orientation, rounding, fill direction, and the standalone work-over-context selection
  are now closed and testable.
- The normative retention matrix aligns profile eligibility, width tiers, action visibility, and
  bounded `+N` disclosure.
- Minimal versus ccstatusline input is deterministically discriminated with no validation fallback.
  The standalone host/Git contract closes field paths, bounds, presence states, repository scope,
  cache age, and raw-field redaction.
- Empty-slot-only installation, exact-owner uninstall, cached-action revalidation, bounded
  snapshot storage, performance deadlines, Windows fixtures, and the current unsupported Codex
  footer limitation remain appropriately scoped.
- No Markdown parser, inferred workflow phase, semantic ledger, private transcript/account reader,
  or receipt mutation is required; the remaining issues do not require violating omp-flow
  ownership to repair.

## Gate

Repair the three current contradictions and run a fresh independent QbD 1 audit. Only a subsequent
model verdict plus an explicit linked human decision can authorize decomposition.
