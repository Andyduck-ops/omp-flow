---
name: omp-flow-decompose
description: Use when an approved omp-flow design after human QbD 1 calibration needs bounded work Concepts and an authored execution view before QbD 2.
---

# OMP-Flow Decompose

## Preconditions

- The Bundle links the approved PRD, Design, applicable audit, and human QbD 1 decision.
- The assignment identifies the Bundle root, design entry, bounded output area, actor ID, and receipt.

## Procedure

Main/coordinator alone dispatches, correlates receipts, records human calibration, and chooses
transitions. After linked human QbD 1 approval, a dispatched Architect performs only the bounded
Decompose responsibility and assigned work outputs; it does not dispatch, govern, calibrate,
transition, or reinterpret coordinator clauses. It maps
the approved Design into bounded, independently reviewable work Concepts and an authored prose
execution view, without inventing approval or encoding a machine DAG.

1. Identify the smallest independently implementable and reviewable work items. Fold scaffolding and
   docs into the deliverable that needs them.
2. Write one descriptive work Concept per item with objective, in/out scope, useful linked inputs,
   allowed code/output boundary, neighbor interface contracts (`Consumes` / `Produces` exact
   signatures when work items interact), done conditions, verification command with expected output,
   and expected handoff Concept.
3. Specify decisions, not code transcripts: state exact file paths, signatures, pinned values, and
   concrete test assertions (including implied edge/failure inputs from the Design) so the
   implementer can write one unambiguous implementation; include a code body only for a non-obvious
   algorithm that the signature and assertions do not determine.
4. Author `work/index.md` when it improves discovery. Use prose and grouping to communicate normal
   ordering, parallel work, alternatives, and relevant follow-up.
5. Link only useful Concepts. Do not generate a closed context manifest or require link closure.
6. Give every work item a descriptive path; do not encode dependencies or dispatch receipts in
   filenames.
7. Verify coverage from each PRD requirement to work, check signature consistency across neighbor
   Work Concepts, and check proportion: if a Work Concept is dominated by implementation bodies,
   replace the bodies with signatures and test assertions.

## Exit Gate

In Main/coordinator context only, prepare QbD 2 and load `omp-flow-qbd` when every work item is
bounded, testable, understandable from its entry path, and worth independent review. The
already-dispatched Architect returns the assigned work map and does not choose or perform that
transition.

## Red Flags

- Do not make one work Concept own unrelated subsystems.
- Do not create placeholder briefs or generic "run tests" verification.
- Do not introduce `tasks.csv`, exact-topology IDs, `dependsOn`, `plan.json`, or another graph.
- When work changes materially after approval, update the linked Concepts and repeat the
  appropriately scoped human/auditor review.
