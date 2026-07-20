---
name: omp-flow-check
description: Independently review one implemented omp-flow row and submit Python-owned Evidence. Use inside the native reviewer agent, or for explicitly selected independent inline review, when row status is review.
---

# OMP-Flow Check

## Required Inputs

Fail closed unless all are available:

- explicit parent task ID, full row ID, and native reviewer agent ID;
- row status `review`;
- committed PRD, Design, row brief, and check context;
- real implementation diff;
- exact report path `.task/{fullId}.review.md`.

## Review Order

1. Check scope and acceptance criteria against the row brief and approved design.
2. Inspect correctness, edge cases, error behavior, compatibility, security, and maintainability proportional to risk.
3. Verify Reference/context MUST and MUST NOT rules.
4. Run independent focused tests and broaden checks for shared behavior or contracts.
5. Write findings first, ordered by severity and anchored to files/lines. Record exact commands and test counts.
6. Write the report, then call `omp-flow evidence submit` with exact task, row, verdict, counts, report, evidence summary, and reviewer agent ID.

PASS requires zero failed tests, no unresolved blocking finding, current evidence, and full scope satisfaction. A substantive finding returns FAIL/`needs_fix`; do not repair it and approve your own change.

## Red Flags

- Implementer self-review is not independent review.
- Green tests do not prove scope or contract compliance.
- Do not accept a stale diff or gate digest.
- Do not hand-write verdict JSON, Evidence CSV, or row status.
