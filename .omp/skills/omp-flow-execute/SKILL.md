---
name: omp-flow-execute
description: Coordinate native implementation and independent review from approved work Concepts, using opaque runtime receipts only for mechanical correlation.
---

# OMP-Flow Execute

## Implementation Loop

1. Read `work/index.md` or the Bundle links that communicate the accepted work grouping.
2. Select work whose prerequisites are semantically satisfied. Parallelize only an authored group
   whose code/output scopes do not conflict.
3. Start each operation with explicit `task`, work `entry`, implementer `role`, `actor-id`,
   bounded `objective`, handoff/code `output`, and any relevant `predecessor`.
4. Dispatch the native `executor`/`omp-flow-implement` role with the complete `assignment` string
   returned by that `operation start`, exactly unchanged. Keep its strict v1
   `ompFlowDispatch` JSON as the first non-blank line; do not parse, reserialize, prepend, append,
   infer, or drop fields. Set native item `id` to the returned operation's
   `actor_id`/descriptor `actorId`, and keep the item role equal to descriptor `role`.
5. Require the Implementer to inspect existing patterns, stay in scope, run work verification,
   and write or update the promised linked handoff Concept.
6. Finish the operation with the same actor ID only after the native result and promised output
   exist. A failure remains a visible failed operation and does not manufacture semantic status.

## Independent Review Loop

1. Start a fresh review operation with the same work Concept as entry, an independent reviewer
   actor ID, a descriptive Review Concept output, and the completed implementation receipt as
   predecessor.
2. Forward that review operation's returned assignment unchanged with native item
   `id = actor_id = actorId` and matching reviewer role. Its descriptor carries the predecessor
   receipt and predecessor output; do not reconstruct or remove either.
3. Runtime correlation must reject a reviewer who is the implementation actor or whose
   predecessor is not completed.
4. Reviewer follows the work Concept to its handoff, inspects the real changed code and design,
   runs independent checks, and writes the promised Review Concept.
5. Finish with the same reviewer actor ID. Read the review's findings and verdict as knowledge;
   Python does not parse or duplicate them into Evidence or row status.
6. Classify every finding with all applicable labels:
   - `HARD_BLOCKER` violates a non-negotiable safety, authority, identity, integrity,
     assignment/receipt/source-binding, or irreversible-effect boundary;
   - `PRINCIPAL_BLOCKER` concretely prevents the next authored principal product checkpoint;
   - `WORK_FAIL` violates the bounded Work's own acceptance criteria or a test that exercises
     them; it may overlap either stronger label;
   - `ADVISORY` is any other recorded quality, robustness, completeness, or elegance risk.
   A failed prerequisite Work required by the next principal checkpoint is also
   `PRINCIPAL_BLOCKER`. `HARD_BLOCKER` and `PRINCIPAL_BLOCKER` pause the principal path and
   return to the owning work/design Concept for explicit routing. `WORK_FAIL` makes that Work
   `FAIL` and enters a recorded owning-Work backlog; absent a hard/principal label it must not
   autonomously create repair/review work, reopen accepted Work, or preempt the principal
   checkpoint. `ADVISORY` remains recorded residual risk and has none of those effects.
7. A hard/principal failure requires explicit human/design routing. When the principal checkpoint
   produces `continue`, `narrow`, or `stop`, present every recorded `WORK_FAIL` backlog to the
   human/design decision for explicit repair, deferral, removal, narrowing, or stop; none of those
   routes is autonomous. Material design changes repeat the applicable QbD decision.

For native batch execution, repeat `operation start` for every item. Preserve each independent
`(id = actorId, role, assignment)` tuple; never share an operation, assignment, actor ID, receipt,
or rewritten prompt across items.

## Completion

Continue through the authored work order toward the next principal product acceptance checkpoint.
Do not let `WORK_FAIL` backlog or `ADVISORY` findings preempt that checkpoint. Stop autonomous
continuation when a `HARD_BLOCKER` or `PRINCIPAL_BLOCKER` needs a human/design decision or when
the principal checkpoint has produced its declared continue/narrow/stop evidence; do not
manufacture completion by clearing every secondary finding.

## Red Flags

- Implementer output is not independent review.
- Reviewer must not repair substantive findings and approve its own repair.
- Do not mark success when verification did not run.
- Do not paste the whole task history into each assignment.
- Do not bypass missing Bundle/entry/output/identity fields with chat or legacy fallback.
- Do not hand-author, partially reconstruct, decorate, or normalize an operation assignment.
