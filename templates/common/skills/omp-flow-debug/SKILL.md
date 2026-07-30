---
name: omp-flow-debug
description: Diagnose an omp-flow Bundle, native assignment, runtime receipt, Harness, Adapter, or product failure from raw observations.
---

# OMP-Flow Debug

## Procedure

1. Start from the assigned Bundle root, relevant entry Concept, output boundary, actor identity,
   operation receipt, and predecessor receipt when present. Preserve the exact error, arguments,
   raw log path, session identity, Harness version, and runtime operation observation.
2. Read the entry Concept and follow only links useful to the failure. Do not reconstruct semantic
   input or infer task meaning from runtime JSON.
3. Reproduce at the narrowest boundary that still fails.
4. Classify the owner: Harness native task/model schema; Adapter assignment seam; Python mechanical
   validation; broken Concept/path/receipt binding; or product/test environment.
5. Form falsifiable hypotheses and run the smallest discriminating experiment.
6. Compare successful and failed calls structurally before trusting an error label. A gateway
   `400` may describe the final request, not the root cause.
7. Repair only the assigned code/output boundary and write the promised linked diagnostic or
   implementation handoff Concept.
8. Re-run the original operation without a fallback path and report exact commands/results,
   actor ID, receipt, output, and remaining uncertainty.

## Failure Contract

If blocked, report facts, ruled-out hypotheses, remaining hypothesis, missing evidence, and the next discriminating action. Do not convert failure into partial success.

## Red Flags

- No broad `catch` that continues with empty input.
- No automatic global active-task or legacy-store fallback.
- No duplicate runtime dependency to mask a missing host export.
- No warning suppression or fabricated PASS.
- Do not retry an unchanged deterministic failure.
- Do not edit `.omp-flow/.runtime/` directly or turn Concept prose into machine state.
