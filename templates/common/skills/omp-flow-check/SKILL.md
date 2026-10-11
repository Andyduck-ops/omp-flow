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

## Code layouts (on demand)

Read only for the matching code-review question; resolve the installed path from the project root,
not from the Skill directory:

- Adversarial review of bounded implemented code: `.omp-flow/workflow/code/interrogate.md`.

## Review Order

Main/coordinator alone dispatches, correlates receipts, records human calibration, and chooses
transitions. A dispatched Reviewer performs only the bounded independent Review and assigned Review
Concept; it does not dispatch, govern, calibrate, transition, or reinterpret coordinator clauses.
The Reviewer compares actual code and verification with
the intended work/Design consequence, and reports evidence contradicting the Design or its
principal-problem framing through that output rather than let a handoff or superficial green check
substitute for the practice result.

1. Resolve the completed predecessor operation and use its output path as the required handoff.
   Read the work Concept and handoff, verify they identify each other, then inspect the real diff
   and changed files.
2. Check scope and acceptance criteria against the work Concept and approved design.
3. Inspect correctness, edge cases, error behavior, security, maintainability, and test adequacy
   proportional to risk.
4. Verify applicable linked decisions, interfaces, and source constraints.
5. Run independent focused tests and broaden checks for shared behavior or contracts.
6. Write the Review Concept at the supplied output path, link it to the work and handoff, lead
 with severity-ordered findings, give every finding all applicable `HARD_BLOCKER`,
 `PRINCIPAL_BLOCKER`, `WORK_FAIL`, and `ADVISORY` labels, and record exact commands/results.

The Review Concept may carry optional OKF v0.2 provenance prose (`sources`, `generated`,
`verified`, `status`, `stale_after`) linking the inspected Work/Handoff, revision range, reviewer,
and tests. Keep it human-readable and additive: metadata is not a verdict, approval, or runtime
gate, and unknown fields/values must be omitted rather than invented.

For a resumed review, state the complete inspected range (`BASE..HEAD`). For a repair review, use
the linked repair handoff's `FIX_BASE..HEAD`, identify each addressed finding, and run focused tests
for those findings plus regression checks. The new reviewer remains a different actor; an old PASS,
receipt, or green command does not replace this review.

The bounded Work may be `PASS` only when all of these hold:

- its own authored acceptance criteria are satisfied;
- the linked principal product checkpoint is not blocked, and any required principal-checkpoint
  linkage is present;
- every test that exercises the Work's acceptance criteria or the linked principal checkpoint
  passes.

A finding that violates a non-negotiable boundary is `HARD_BLOCKER`; one that concretely prevents
the linked principal checkpoint is `PRINCIPAL_BLOCKER`. A failed Work acceptance criterion or test
exercising it is `WORK_FAIL`, and labels may overlap. If the failed Work is required for the next
principal checkpoint, it is also `PRINCIPAL_BLOCKER`. Any `HARD_BLOCKER`, `PRINCIPAL_BLOCKER`, or
`WORK_FAIL` makes the bounded Work `FAIL`; only `HARD_BLOCKER` and `PRINCIPAL_BLOCKER` pause the
principal path. A `WORK_FAIL` without either stronger label enters the recorded owning-Work
backlog. When the principal checkpoint produces `continue`, `narrow`, or `stop`, that backlog
requires explicit human/design routing for repair, deferral, removal, narrowing, or stop; it does
not autonomously create repair/review work or preempt the principal queue.

A failed test may be `ADVISORY` only when the reviewer records evidence that it is unrelated to
the Work acceptance and principal checkpoint, pre-existing, and separately attributable, with the
exact command and result. Missing or ambiguous attribution is not a basis for `PASS`.
`ADVISORY` findings remain explicit residual risk but do not make the Work `FAIL`, reopen accepted
Work, or preempt the principal checkpoint. `PASS` may carry only those explicitly attributed
unrelated red tests and other advisory findings.

## Red Flags

- Implementer self-review is not independent review.
- Green tests do not prove scope or contract compliance.
- Do not accept a stale diff, missing handoff, or mismatched predecessor receipt.
- Do not write an Evidence ledger or ask Python to parse the Review Concept.
