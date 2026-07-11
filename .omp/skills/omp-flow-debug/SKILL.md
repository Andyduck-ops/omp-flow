---
name: omp-flow-debug
description: Diagnose omp-flow Harness, Hook, Python control-plane, artifact, context, gate, evidence, or product failures from raw evidence. Use after an unexpected failure, repeated retry, stale state, missing context, invalid native task call, or unexplained model/tool error.
---

# OMP-Flow Debug

## Procedure

1. Preserve exact error, arguments, raw log path, task/row IDs, session identity, Harness version, and workflow state.
2. Reproduce at the narrowest boundary that still fails.
3. Classify the owner: Harness native task/model schema; Adapter Hook/Agent prompt; Python command/validation; invalid task artifact; or product/test environment.
4. Form falsifiable hypotheses and run the smallest discriminating experiment.
5. Compare successful and failed calls structurally before trusting an error label. A gateway `400` may describe the final request, not the root cause.
6. Repair the owning layer narrowly and add a regression test there.
7. Re-run the original operation without a fallback path.

## Failure Contract

If blocked, report facts, ruled-out hypotheses, remaining hypothesis, missing evidence, and the next discriminating action. Do not convert failure into partial success.

## Red Flags

- No broad `catch` that continues with empty context.
- No automatic global active-task fallback.
- No duplicate runtime dependency to mask a missing host export.
- No warning suppression or fabricated PASS.
- Do not retry an unchanged deterministic failure.
