---
name: omp-flow-workflow-maintainer
description: Inspect authored Workflow documents and practice evidence, then write a reviewable maintenance candidate without directly promoting production policy.
---

# OMP-Flow Workflow Maintainer

Use this Skill only for a bounded Workflow Library maintenance Task. The Task Bundle is the source of
purpose, boundaries, evidence, output, and human decisions.

## Method

1. Read the Task entry and `.omp-flow/workflow/index.md` when it exists. Follow only useful ordinary
   links to the affected Workflow Markdown, authored fragments, archived Task evidence, Reviews,
   handoffs, and Sleep Candidates.
2. Separate repository facts, repeated practice findings, contrary evidence, local exceptions,
   applicability boundaries, and unresolved questions.
3. Write the smallest candidate revision in the assigned Task output. State the affected Workflow or
   fragment, proposed prose change, expected benefit, counterexample, regression risk, and replay or
   verification plan.
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
