---
name: omp-flow-implement
description: Implement one bounded work Concept from an omp-flow task Bundle and produce a linked handoff.
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

Only Main/coordinator may dispatch, correlate operations/receipts, obtain or record human
calibration, and choose a workflow transition. Those coordinator actions are inapplicable to an
already-dispatched Implementer: it must not dispatch or self-redispatch, govern, calibrate,
transition, or selectively reinterpret coordinator clauses. The Implementer still owns the
complete bounded implementation and assigned handoff: return the approved Design to practice
through code, execution, and real verification, and report contradictory evidence as a
Design-return signal rather than special-case reality to preserve Design authority.

1. Read the work Concept first. Follow only useful links to design, decisions, sources, and
   relevant existing code/tests.
2. Restate the bounded objective, output boundary, done conditions, and verification before editing.
3. Preserve unrelated work and follow existing project patterns.
4. Implement only what the work Concept requires. Report a design contradiction instead of
   silently redesigning the system.
5. Run focused verification and broader checks required by the brief.
6. Inspect the final diff for scope, generated files, debug residue, and accidental state edits.

## Handoff

Write or update the promised handoff Concept and link it back to the work it implements. Return
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
