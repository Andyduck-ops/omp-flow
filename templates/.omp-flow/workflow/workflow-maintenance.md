# Workflow Maintenance

Workflow Maintenance turns repeated practice evidence into a reviewable change candidate for the
authored Workflow Library. It is a knowledge-maintenance route: its output is a candidate, not an
automatic production edit.

## Route cues

- **Use when:** completed Task/review/sleep evidence suggests a reusable improvement to authored
  Workflow guidance.
- **Do not use when:** the request is a product implementation, one-off explanation, or an untested
  preference; route those to Full Delivery, Research, or the relevant Task Workflow.
- **Entry evidence:** a Task reads the affected Workflow, representative completed Tasks, reviews,
  failed verifiers, human decisions, and Sleep Candidates; Wiki consultation is conditional.
- **Expected output:** a smallest-change maintenance Candidate with evidence, applicability limits,
  counterexample, regression risk, and verification plan.
- **Verifier and approval:** replay or compare representative practice and obtain an independent
  Review; only a human decision promotes the candidate to canonical policy.
- **Return/escalation:** insufficient or contradictory evidence returns to Research/Experiment; a
  candidate that changes a contract or safeguard becomes a new Design/Full Delivery Task.

## Investigate

Create a Task and read the Workflow Library index. Follow the links that bear on the question. Read
completed Tasks, handoffs, Reviews, failed verifiers, rework patterns, human decisions, and Sleep
Candidates. Separate repository facts, local exceptions, contrary evidence, and patterns that appear
reusable across Tasks.

## Form a candidate

Before adding prose rules for a recurring mistake, rank remedies by structural strength:
(1) eliminate the invalid state with architecture or a single source of truth; (2) enforce it with a
type, check, or CLI error message that names the fix; (3) add a behavioral test; (4) write Workflow
or Skill prose last, only for judgment calls.

Match the prose form to the baseline failure: use a positive structural recipe (stating what the
output contains, in order) when the failure is wrong output shape, and reserve hard prohibitions for
discipline skips. Avoid `"unless it matters"` nuance clauses and never leak benchmark prompts or
private grader literals into canonical prose. Describe the smallest useful change: the affected
passage, practice problem, expected benefit, applicability boundary, counterexample, regression
risk, and verification plan. Keep the candidate in the Task Bundle until its evidence is strong
enough to review.

## Replay and review

Replay representative archived Tasks or run a bounded comparison in a fresh sub-agent context (one
that has not seen the maintainer's failure analysis in its conversation history) when the claim is
consequential. Check that the candidate improves the observed problem without regressing
representative non-target cases or weakening a required identity, authorization, data, or
irreversible-effect safeguard. Write a linked handoff and obtain an independent Review that states
its evidence and verdict.

## Promote or retain

Human decision determines whether the candidate is promoted to the canonical template and project
copy, retained for more evidence, narrowed to an applicability boundary, or rejected. A promotion is
a separate bounded Work using the normal assignment contract, followed by verification and integration.

## Execution

Main selects the maintenance Work and `operation start` produces its exact assignment. The Maintainer
reads and proposes authored knowledge; Runtime and Harness retain ownership of assignments, receipts,
actor identity, and execution mechanics.
