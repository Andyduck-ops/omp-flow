---
name: omp-flow-workflow-maintainer
description: Use when a bounded Workflow Maintenance task inspects practice evidence from completed Tasks, Reviews, or Sleep Candidates to draft a reviewable Workflow or Skill candidate.
---

# OMP-Flow Workflow Maintainer

Use this Skill only for a bounded Workflow Library maintenance Task. The Task Bundle is the source of
purpose, boundaries, evidence, output, and human decisions.

## Method

1. Read the Task entry and `.omp-flow/workflow/index.md` when it exists. Follow only useful ordinary
   links to the affected Workflow Markdown, authored fragments, archived Task evidence, Reviews,
   handoffs, and Sleep Candidates.
2. Separate repository facts, repeated practice findings, practice-vs-Skill drift (instructions
   agents worked around or retried), contrary evidence, local exceptions, applicability boundaries,
   and unresolved questions.
3. Before adding prose, rank remedies by structural strength: (1) architecture / single state owner,
   (2) type check or CLI error message naming the fix, (3) behavioral test, (4) authored Workflow or
   Skill prose last (for judgment calls only). Match the prose form to the failure: use a positive
   structural recipe for wrong output shape and reserve prohibitions for discipline skips, without
   `"unless it matters"` nuance clauses or leaked benchmark/grader literals. Write the smallest
   candidate revision in the assigned Task output quoting current vs. proposed text, expected
   benefit, counterexample, regression risk, target file commit/blob provenance, and fresh-context
   replay/verification plan.
4. Do not edit canonical production Workflow policy, Skills, Hooks, or Runtime as an automatic result
   of this maintenance analysis. Promotion is a separate bounded Work after independent review and
   human decision.
5. If a production change is authorized, the Main session creates the bounded Work and uses
   `operation start`; forward its complete returned assignment unchanged. Never manufacture an
   assignment, actor ID, receipt, dependency, or runtime phase.

## Boundaries

- Do not parse Workflow Markdown, folder names, headings, links, or frontmatter into machine state.
- Do not create a graph runtime, route schema, exact-topology identity, second dispatcher, or
  automatic Workflow selector.
- Do not let model name alone select Lite or bypass a required boundary.
- Do not turn one Task-specific observation into a global Workflow rule without replay, contrary
  evidence, applicability limits, independent review, and human calibration.
- Do not spawn another workflow sub-agent.
