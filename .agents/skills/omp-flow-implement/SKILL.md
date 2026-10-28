---
name: omp-flow-implement
description: Use when dispatched or assigned to implement one bounded work Concept from an omp-flow task Bundle and write its linked handoff.
---

# OMP-Flow Implement

## Required Inputs

Fail closed unless all are available:

- task Bundle root;
- role and bounded objective;
- descriptive work entry Concept;
- allowed code scope and handoff output Concept;
- actor ID and opaque dispatch receipt;
- completed predecessor receipt when the operation requires one.

## Procedure

Main/coordinator alone dispatches, correlates receipts, records human calibration, and chooses
transitions. A dispatched Implementer performs only the bounded implementation and assigned
handoff; it does not dispatch, govern, calibrate, transition, or reinterpret coordinator clauses.
It returns the approved Design to practice
through code, execution, and real verification, and reports contradictory evidence as a
Design-return signal rather than special-case reality to preserve Design authority.

1. Read the work Concept first. Follow only useful links to design, decisions, sources, and
   relevant existing code/tests.
2. Restate the bounded objective, output boundary, done conditions, and verification before editing.
3. Preserve unrelated work and follow existing project patterns.
4. Implement only what the work Concept requires. Report a design contradiction instead of
   silently redesigning the system. When settling a minor local choice inside the approved
   boundary, record `Decision: <choice> — <rationale> — <consequence if wrong>` in the handoff.
5. Run focused verification and broader checks required by the brief. Verify against usable
   end-to-end behavior (and judge new tests against two imagined edits: breaking behavior fails the
   test, restructuring internals keeps it passing); report environment-blocked checks explicitly as
   unverified rather than disguising a type-check as full verification.
6. Inspect the final diff for scope, generated files, debug residue, and accidental state edits.
   Update a Task index or linked map only when the implementation adds or changes a useful
   discoverable link.

When a Work/Handoff Concept benefits from provenance, authors may use optional OKF v0.2 prose
(`sources`, `generated`, `verified`, `status`, `stale_after`). Link the source Task, checkpoint or
commit, producer actor, and verification evidence where known. These fields are descriptive only;
absence does not invalidate a handoff, and they never replace the opaque operation receipt or a
different-actor Review.

## Handoff

Write or update the promised handoff Concept and link it back to the work it implements. Open it
with one or two sentences on the purpose, end state, and limits you understood from the assignment,
so the reviewer can check your reading (the receiver summary of I-PASS clinical handoffs). Return
`DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`, plus changed files, commands, test
counts, decisions, caveats, output path, actor ID, and receipt. Do not mutate runtime/session
records. The Implementer returns this assigned handoff; only Main/coordinator chooses and
dispatches the independent Review operation.

## Red Flags

- "Should work" is not verification.
- Do not widen scope to fix unrelated findings.
- Do not fabricate a missing entry, output, source, or predecessor.
- Do not spawn another workflow sub-agent.
- Do not invoke a legacy context renderer or parse Markdown into workflow state.
