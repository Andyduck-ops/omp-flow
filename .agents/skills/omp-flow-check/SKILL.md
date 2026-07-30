---
name: omp-flow-check
description: Independently review one implemented work Concept, its linked handoff, and changed code, then write a linked Review Concept.
---

# OMP-Flow Check

## Required Inputs

Fail closed unless all are available:

- task Bundle root, review role, bounded objective, and work entry Concept;
- explicit Review Concept output path;
- native reviewer actor ID and review dispatch receipt;
- completed implementation predecessor receipt from a different actor;
- work Concept and predecessor-linked handoff, plus any applicable linked design or decisions;
- real implementation diff;

## Review Order

1. Resolve the completed predecessor operation and use its output path as the required handoff.
   Read the work Concept and handoff, verify they identify each other, then inspect the real diff
   and changed files.
2. Check scope and acceptance criteria against the work Concept and approved design.
3. Inspect correctness, edge cases, error behavior, security, maintainability, and test adequacy
   proportional to risk.
4. Verify applicable linked decisions, interfaces, and source constraints.
5. Run independent focused tests and broaden checks for shared behavior or contracts.
6. Write the Review Concept at the supplied output path, link it to the work and handoff, lead
   with severity-ordered findings, and record exact commands/results.

PASS requires zero failed tests, no unresolved blocking finding, and full scope satisfaction. A
substantive finding returns FAIL to the owning work; do not repair it and approve your own change.

## Red Flags

- Implementer self-review is not independent review.
- Green tests do not prove scope or contract compliance.
- Do not accept a stale diff, missing handoff, or mismatched predecessor receipt.
- Do not write an Evidence ledger or ask Python to parse the Review Concept.
