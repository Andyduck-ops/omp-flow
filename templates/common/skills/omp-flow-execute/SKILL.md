---
name: omp-flow-execute
description: Use when approved omp-flow work Concepts after human QbD 2 calibration (or an active Lite route) are ready for native implementation and independent review dispatch.
---

# OMP-Flow Execute

## Implementation Loop

1. Read `work/index.md` or the Bundle links that communicate the accepted work grouping.
2. Select work whose prerequisites are semantically satisfied. Parallelize only an authored group
   whose code/output scopes do not conflict.
3. Start each operation with explicit `task`, work `entry`, implementer `role`, `actor-id`,
   bounded `objective`, handoff/code `output`, and any relevant `predecessor`.
4. Dispatch the native `executor`/`omp-flow-implement` agent with the complete `assignment` string
   returned by that `operation start` as its prompt, exactly unchanged. Keep its strict v1
   `ompFlowDispatch` JSON as the first non-blank line; do not parse, reserialize, prepend, append,
   infer, or drop fields.
5. Require the Implementer to inspect existing patterns, stay in scope, run work verification,
   and write or update the promised linked handoff Concept.
6. Finish the operation with the same actor ID only after the native result and promised output
   exist. A failure remains a visible failed operation and does not manufacture semantic status.
7. Act on the implementer's status: `DONE` goes to review; `DONE_WITH_CONCERNS` goes to review with
   the concerns in the review objective; `NEEDS_CONTEXT` gets the missing context in a new
   operation; `BLOCKED` returns to the owning Work or Design. None of these goes to the human
   unless the blocker is a decision that is theirs.

## Independent Review Loop

1. Start a fresh review operation with the same work Concept as entry, an independent reviewer
   actor ID, a descriptive Review Concept output, and the completed implementation receipt as
   predecessor.
2. Forward that review operation's returned assignment unchanged to the native
   `reviewer`/`omp-flow-check` agent. Its descriptor carries the predecessor receipt and
   predecessor output; do not reconstruct or remove either.
3. Runtime correlation must reject a reviewer who is the implementation actor or whose
   predecessor is not completed.
4. Reviewer follows the work Concept to its handoff, inspects the real changed code and design,
   runs independent checks, and writes the promised Review Concept.
5. Finish with the same reviewer actor ID. Read the review's findings and verdict as knowledge;
   Python does not parse or duplicate them into Evidence or row status. Before repairing, check
   each finding against the code; record a finding that does not hold instead of repairing it.
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
   `FAIL`; repair it inside the Work's own boundary and have a different actor re-review it, for at
   most three repair rounds. A `WORK_FAIL` still open after the third round enters a recorded
   owning-Work backlog with Main's ruling on each finding. Repair never reopens accepted Work or
   preempts the principal checkpoint. `ADVISORY` remains recorded residual risk and is not repaired.
7. A hard/principal failure requires explicit human/design routing. When the principal checkpoint
   produces `continue`, `narrow`, or `stop`, present the remaining backlog and its rulings in one
   list for the human to repair, defer, remove, narrow, or stop. Material design changes repeat the
   applicable QbD decision.

For native batch execution, repeat `operation start` for every item. Give each item its own
operation, actor ID, and unchanged assignment; never share an operation, assignment, actor ID,
receipt, or rewritten prompt across items.

## Completion

Drive each ready Work through implementation (`operation start` -> handoff -> `operation finish`)
and immediately into its independent Review (`operation start` -> Review Concept ->
`operation finish`), then advance to the next non-conflicting Work toward the principal product
acceptance checkpoint without pausing to ask whether to continue between Works. When a minor local
ambiguity is settled inside an approved boundary, require the handoff to record
`Decision: <choice> — <rationale> — <consequence if wrong>` and surface it at the checkpoint. Do
not let `WORK_FAIL` backlog or `ADVISORY` findings preempt that checkpoint. Stop autonomous
continuation when a `HARD_BLOCKER` or `PRINCIPAL_BLOCKER` needs a human/design decision or when
the principal checkpoint has produced its declared continue/narrow/stop evidence; when every
accepted Work has a current independent `PASS` Review and the principal checkpoint holds, load
`omp-flow-finish`.

## Red Flags

- Implementer output is not independent review.
- Reviewer must not repair substantive findings and approve its own repair.
- Do not mark success when verification did not run.
- Do not paste the whole task history into each assignment.
- Do not bypass missing Bundle/entry/output/identity fields with chat or legacy fallback.
- Do not hand-author, partially reconstruct, decorate, or normalize an operation assignment.
