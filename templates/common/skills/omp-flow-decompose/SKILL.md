---
name: omp-flow-decompose
description: Map an approved omp-flow design into descriptive, bounded work Concepts and an authored execution view before QbD 2.
---

# OMP-Flow Decompose

## Preconditions

- The Bundle links the approved PRD, Design, applicable audit, and human QbD 1 decision.
- The assignment identifies the Bundle root, design entry, bounded output area, actor ID, and receipt.

## Procedure

1. Identify the smallest independently implementable and reviewable work items. Fold scaffolding and
   docs into the deliverable that needs them.
2. Write one descriptive work Concept per item with objective, in/out scope, useful linked inputs,
   allowed code/output boundary, done conditions, verification, and expected handoff Concept.
3. Author `work/index.md` when it improves discovery. Use prose and grouping to communicate normal
   ordering, parallel work, alternatives, and relevant follow-up.
4. Link only useful Concepts. Do not generate a closed context manifest or require link closure.
5. Give every work item a descriptive path; do not encode dependencies or dispatch receipts in
   filenames.
6. Verify coverage from each PRD requirement to work and from every work Concept back to an
   approved requirement or design decision.

## Exit Gate

Prepare QbD 2 only when every work item is bounded, testable, understandable from its entry path,
and worth independent review. Load `omp-flow-qbd` next.

## Red Flags

- Do not make one work Concept own unrelated subsystems.
- Do not create placeholder briefs or generic "run tests" verification.
- Do not introduce `tasks.csv`, exact-topology IDs, `dependsOn`, `plan.json`, or another graph.
- When work changes materially after approval, update the linked Concepts and repeat the
  appropriately scoped human/auditor review.
