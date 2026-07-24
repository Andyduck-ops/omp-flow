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
2. Create or update `context/index.json` entries for every Tier-3 context item you will reference.
3. Write the row draft to `.task/tasks-draft.csv` using the fixed 11-column schema:
   `id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd`.
4. Encode dependencies only in exact row IDs. Root: `A-001`. Dependent: `A-A002--003` or `C-A002B001--003`. Set `status` to `pending` for every row.
5. Derive `wave` from topology. Never create `dependsOn`, another DAG, or `plan.json`.
6. Write one `.task/{fullId}.implement.md` per row with objective, scope, inputs, done conditions, verification commands/results, bindings, and handoff requirements.
7. Bind only relevant Tier 2 Reference and Tier 3 Context entries. Avoid catch-all context packs.
8. Run `omp-flow topology validate` to preview validation.
9. Run `omp-flow topology accept --file .task/tasks-draft.csv` to install the rows.
10. Fix any validation or commitment errors and re-run `accept` until it succeeds.
11. Verify coverage from each PRD requirement to a row and from every row back to an approved requirement.

## Exit Gate

Prepare QbD 2 only when validation passes and every row is bounded, testable, correctly bound, and worth an independent review. Load `omp-flow-qbd` next.

## Red Flags

- Row ordering is not an implicit dependency.
- Do not make one row own unrelated subsystems.
- Do not create placeholder briefs or generic "run tests" verification.
- Do not write `.omp-flow/tasks/<id>/tasks.csv` directly; install rows only through `omp-flow topology accept --file .task/tasks-draft.csv`.
- Do not reference a context entry that does not exist in `context/index.json`.
- Do not leave uncommitted-template markers in briefs.
- Do not change frozen topology after QbD 2 PASS without returning through the gate.
- Post-freeze topology corrections go through the amendment path (`omp-flow topology amend`), not by re-decomposing, unless you are doing a full `omp-flow task rework`.
