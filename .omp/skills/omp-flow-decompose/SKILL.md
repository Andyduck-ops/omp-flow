---
name: omp-flow-decompose
description: Decompose an approved omp-flow design into exact-topology CSV rows and bounded implementation briefs. Use in phase=decompose after human QbD 1 PASS and before QbD 2.
---

# OMP-Flow Decompose

## Preconditions

- Python reports `phase=decompose`.
- QbD 1 has model evidence and recorded human PASS.
- PRD, Design, selected synthesis, and accepted Tier 2/Tier 3 inputs are stable enough to implement.

## Procedure

1. Identify the smallest independently implementable and reviewable rows. Fold scaffolding and docs into the deliverable that needs them.
2. Write only the fixed schema: `id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd`.
3. Encode dependencies only in exact row IDs. Root: `A-001`. Dependent: `A-A002--003` or `C-A002B001--003`.
4. Derive `wave` from topology. Never create `dependsOn`, another DAG, or `plan.json`.
5. Create one `.task/{fullId}.implement.md` per row with objective, scope, inputs, done conditions, verification commands/results, bindings, and handoff requirements.
6. Bind only relevant Tier 2 Reference and Tier 3 Context entries. Avoid catch-all context packs.
7. Run `omp-flow topology validate`. Fix missing dependencies, cycles, duplicate canonical IDs, wave drift, taskMd mismatches, missing briefs, and invalid bindings.
8. Verify coverage from each PRD requirement to a row and from every row back to an approved requirement.

## Exit Gate

Prepare QbD 2 only when validation passes and every row is bounded, testable, correctly bound, and worth an independent review. Load `omp-flow-qbd` next.

## Red Flags

- Row ordering is not an implicit dependency.
- Do not make one row own unrelated subsystems.
- Do not create placeholder briefs or generic "run tests" verification.
- Do not change frozen topology after QbD 2 PASS without returning through the gate.
- Post-freeze topology corrections go through the amendment path (`omp-flow topology amend`), not by re-decomposing, unless you are doing a full `omp-flow task rework`.
