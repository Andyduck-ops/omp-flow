---
name: omp-flow-check
description: Use when an implemented omp-flow work Concept and its completed predecessor handoff are ready for independent review by a different actor.
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

1. Resolve the completed predecessor operation and use its output path as the required handoff. Read
   the work Concept and handoff, verify they identify each other and that the handoff's stated
   reading of the assignment matches the Work, then inspect the real diff and changed files
   read-only (never mutate HEAD, index, or working tree). When reviewing a committed range
   `BASE..HEAD`, verify `git merge-base --is-ancestor BASE HEAD` and non-empty commits before
   grading.
2. Check scope, end-to-end data flow, and acceptance criteria against the work Concept and approved
   design. For removed or renamed behavior, verify against the pre-change baseline that old code
   paths are gone. If the Work or Design itself mandates a defect, flag it explicitly as
   *work/design-mandated* for coordinator/human routing rather than waving it through.
3. Inspect correctness, edge cases (spec silence on a plausible input is not permission to crash or
   corrupt state), error behavior, security, maintainability, and test falsifiability (two imagined
   edits: fails when behavior breaks, passes when internals change).
4. Verify applicable linked decisions, interfaces, and source constraints. Separate the required
   invariant violated from any non-binding example fix hint.
5. Do not re-run heavy full test suites that the handoff already ran with fresh recorded output;
   run independent focused checks for specific doubts, unverified claims, or shared contracts.
   Distinguish `Not applicable` from `Unverified (missing evidence)`.
6. Write the Review Concept at the supplied output path, link it to the work and handoff, lead
   with severity-ordered findings, give every finding all applicable `HARD_BLOCKER`,
   `PRINCIPAL_BLOCKER`, `WORK_FAIL`, and `ADVISORY` labels, record exact commands/results, and list
   cleared risks plus any disproven false-positive leads with `file:line` evidence.

The Review Concept may carry optional OKF v0.2 provenance prose (`sources`, `generated`,
`verified`, `status`, `stale_after`) linking the inspected Work/Handoff, revision range, reviewer,
and tests. Keep it human-readable and additive: metadata is not a verdict, approval, or runtime
gate, and unknown fields/values must be omitted rather than invented.

For a resumed review, state the complete inspected range (`BASE..HEAD`). For a repair review, use
the linked repair handoff's `FIX_BASE..HEAD`, identify each addressed finding, and run focused tests
for those findings plus regression checks. The new reviewer remains a different actor; an old PASS,
receipt, or green command does not replace this review. During a repair review (`FIX_BASE..HEAD`),
a newly raised issue on code unchanged since `FIX_BASE` that was not in the prior Review may be
labeled `WORK_FAIL` or `PRINCIPAL_BLOCKER` only when backed by a reproducible failure (red
test/command) or a violated `HARD_BLOCKER` boundary; otherwise record it as `ADVISORY` so repair
rounds converge.

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
backlog. Main repairs a `WORK_FAIL` inside the Work's boundary for at most three rounds, each
re-reviewed by a different actor; what remains goes to the human at the principal checkpoint. Repair
does not preempt the principal queue.

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
