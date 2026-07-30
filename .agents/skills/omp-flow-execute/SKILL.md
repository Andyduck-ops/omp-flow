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
6. A substantive failure returns to the owning work/design Concept for repair and another
   independent review. Material design changes repeat the applicable QbD decision.

For native batch execution, repeat `operation start` for every item. Preserve each independent
`(id = actorId, role, assignment)` tuple; never share an operation, assignment, actor ID, receipt,
or rewritten prompt across items.

## Completion

Continue without asking "should I continue?" until the accepted work has linked independent
reviews, a real blocker needs user input, or design/work must return through a gate. Then load
`omp-flow-finish`.

## Red Flags

- Implementer output is not independent review.
- Reviewer must not repair substantive findings and approve its own repair.
- Do not mark success when verification did not run.
- Do not paste the whole task history into each assignment.
- Do not bypass missing Bundle/entry/output/identity fields with chat or legacy fallback.
- Do not hand-author, partially reconstruct, decorate, or normalize an operation assignment.
