---
name: omp-flow-debug
description: Use when an omp-flow Bundle, native assignment, runtime receipt, Harness, Adapter, or product operation fails unexpectedly or repeatedly.
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
5. Form falsifiable hypotheses and run the smallest discriminating experiment. When two fixes
   sharing one premise fail the same check, write that shared premise down in one sentence and test
   it directly before trying a third fix.
6. Ask whether the state that triggered the symptom is legitimate: if the state is valid, handling
   it where the code broke is the root-cause fix; if the state should never exist, a local guard
   (`?.`, fallback, retry, swallowed catch) hides the fault—trace upstream to what produced the
   invalid state.
7. Compare successful and failed calls structurally before trusting an error label. A gateway
   `400` may describe the final request, not the root cause. When inspecting large session or
   runtime logs, check line counts/lengths before reading and extract bounded slices with `path:line`
   citations rather than dumping raw megabyte lines into context.
8. Repair only the assigned code/output boundary and write the promised linked diagnostic or
   implementation handoff Concept. If the deciding fact took a deep dig to uncover, note the cheap
   error message, assertion, or diagnostic signal that would expose it immediately next time.
9. Re-run the original operation without a fallback path and report exact commands/results,
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
