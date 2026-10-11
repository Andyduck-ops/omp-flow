# Interrogate: Challenge Implemented Code

Use this optional code layout with `omp-flow-check` for an evidence-led adversarial review of one
bounded implementation. The Check Skill's inputs, independent identity, verdict rules, and native
assignment remain authoritative. Reuse the assigned Review Concept. Headings are suggestions, not
a fixed schema, a new Concept per invocation, or an additional approval gate.

## Fix the review target

- Read the approved Work, linked design/decisions, and completed predecessor handoff. Confirm the
  reviewer is a different actor and the required receipt/output links match. A handoff is a claim,
  not independent evidence of acceptance.
- Inspect the real diff and affected callers at the exact revision. Record the complete inspected
  `BASE..HEAD`; for repair use the handoff's `FIX_BASE..HEAD` and identify the addressed findings.
  If reviewing uncommitted changes, identify the base and exact inspected working-tree snapshot
  rather than pretending it is a committed range. Do not use a stale diff.
- State the bounded approved intent, acceptance criteria, applicable non-negotiable boundaries, and
  linked principal checkpoint. If a required input or linkage is missing, report it rather than
  inventing the missing intent or checkpoint.

## Build concrete failure trajectories

Challenge the code with plausible inputs, state, and event ordering. Trace each suspected failure
from trigger through the relevant branch or interaction to an observable consequence. Use code
citations at the inspected revision; run a focused reproduction when it clarifies or tests the
claim and the assignment permits it. Distinguish an observed result from a proposed reproduction
or source-based inference.

Inspect the risks relevant to this diff, not an obligatory checklist of findings:

- **Scope and contracts:** approved behavior, affected callers, public/API or stored-data semantics,
  invariants, and acceptance checks; detect unrelated changes or a green test that misses the goal.
- **Security and trust:** input/path boundaries, authority, sensitive data, and fail-closed behavior.
- **State and concurrency:** ownership, ordering, races, cancellation, and partially completed work.
- **Errors and cleanup:** propagation, surviving side effects, resource lifetime, and release paths.
- **Maintainability and evidence:** unnecessary complexity, hidden coupling, regression coverage,
  and the limits of actual verification.

Seek the strongest counter-case to the implementation and to the design's causal assumptions.
If code or practice contradicts the approved framing, preserve the evidence in the Review rather
than dismissing it as outside the story. Do not force a finding count, multiple models, or invented
faults. Do not broadly auto-fix code or expand the Review into implementation.

## Preserve Check verdict semantics

Give every finding all applicable labels; do not call every issue a Hard Blocker:

- `HARD_BLOCKER`: violates a non-negotiable boundary.
- `PRINCIPAL_BLOCKER`: concretely prevents the linked principal checkpoint.
- `WORK_FAIL`: fails this Work's acceptance criterion or a test exercising it. If the Work is
  required for the next principal checkpoint, also apply `PRINCIPAL_BLOCKER`.
- `ADVISORY`: explicit residual risk that does not fail Work acceptance or the principal checkpoint.
  A red test is advisory only with evidence that it is unrelated, pre-existing, and separately
  attributable, including the exact command/result. Missing or ambiguous attribution cannot
  justify `PASS`.

Any `HARD_BLOCKER`, `PRINCIPAL_BLOCKER`, or `WORK_FAIL` makes this Work `FAIL`; only the first two
pause the principal path. A `WORK_FAIL` without a stronger label stays in the recorded owning-Work
backlog and requires explicit human/design routing at the principal checkpoint, not autonomous
repair/review dispatch. Advisory findings alone do not fail or reopen accepted Work or preempt the
principal queue.

Use `PASS` only when the Work's acceptance criteria hold, the linked principal checkpoint is not
blocked and required linkage is present, and every test exercising either passes. Record cleared
risks and remaining evidence gaps explicitly; unexamined behavior is not a cleared risk. A model
verdict never replaces human/QbD judgment or authorizes a workflow transition.

## Suggested output navigation

Adapt to the assigned Review without weakening the Check contract:

- **Verdict and severity-ordered findings:** all applicable labels, concrete consequence, affected
  requirement/checkpoint, code citations, reproduction/evidence, and a bounded repair direction.
- **Inspected scope:** Work/handoff/design links, revision or snapshot, reviewer identity, and receipts.
- **Verification:** exact exercised commands/results and counts; distinguish pending checks from passes.
- **Cleared risks and gaps:** what was challenged, supporting evidence, residual risks, and limits.
- **Contradictions and disposition:** design/framing-return signals for Main and any required routing.
