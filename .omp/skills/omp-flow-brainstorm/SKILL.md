---
name: omp-flow-brainstorm
description: Explore and clarify a consented omp-flow task Bundle when direction, scope, constraints, alternatives, or success criteria are unclear or need reframing.
---

# OMP-Flow Brainstorm

## Preconditions

- The user consented to task creation or selected an existing task.
- The active task is a readable Bundle with a root index.
- The assignment identifies the Bundle root, bounded objective, entry Concept, and allowed output.
- The entry normally points to `brainstorm.md` or a linked framing Concept.

## First-Principles Orientation

For a non-trivial Explore, use repository/Wiki evidence and human calibration to form or revise a
provisional first-principles anchor（第一性锚定）before broad Research. Keep it in useful authored
prose, not a required file or fixed checklist. It should be sufficient to expose the observable
problem, current principal contradiction（主要矛盾）, irreducible outcome, human boundaries, a
strong counter-hypothesis, and evidence that would revise the framing. Mechanical low-ambiguity
work may proceed directly when this step would not improve a decision.

Concentrate interaction on the material decision frontier:

- For purpose, values, risk tolerance, and non-negotiable outcomes, the human states a position
  first; then give the strongest counter-case, counterexample, and consequence.
- For evidence-led technical choices, an Agent may lead with a recommendation only when it also
  gives the strongest counter-case and a falsifier: the evidence that would overturn it.
- Use targeted high-intensity Grill only while a question can change the problem core or outcome.
  Do not exhaust branches, prescribe a question count, or let the Agent silently rank human values.

## Interview Contract

1. Read the entry Concept and follow only useful links from the Bundle.
2. Record the initial request and known repository facts in the assigned framing Concept.
3. Inspect code, tests, docs, prior tasks, relevant history, and applicable durable knowledge
   through the native `omp-flow-wiki` Skill before asking repository-answerable questions.
4. Ask the user one material decision question at a time. Ask only about intent, preference,
   scope, risk tolerance, or ambiguity that evidence cannot answer.
5. Keep confirmed facts, assumptions, disagreements, alternatives, constraints, success criteria,
   and open questions distinct.
6. Present materially different directions only when a real choice exists. Follow the human-first
   and recommendation/counter-case order above instead of anchoring value choices with a model
   default.
7. Update the linked framing Concept as decisions change. Chat is not the durable source.
8. When a question needs evidence, link a bounded research Concept or assignment and state what
   anchor assumption, contradiction, or practical decision the result may change. When research
   confirms, revises, or falsifies the framing, update the authored anchor and next question. This
   is a practice test（实践检验）spiral, not a one-way gate.

## Exit Gate

Framing is ready to support design when:

- the problem and desired outcome are understandable;
- non-goals and major constraints are recorded;
- consequential uncertainty is linked to evidence or an explicit research topic;
- consequential default assumptions and counter-hypotheses are visible;
- the user confirms shared understanding sufficient for the next Research question or Design,
  or explicitly asks to investigate alternatives.

Load `omp-flow-research` whenever evidence is needed; it may return to this Skill. Brainstorm is
not PRD, accepted design, or implementation authorization.

## Red Flags

- Do not create implementation work merely to force progress.
- Do not force convergence merely to advance the phase.
- Do not ask the user for facts available in the repository.
- Do not treat an attractive external project as selected before investigation.
- Do not dispatch implementation or QbD agents.
- Do not require fixed headings, list shapes, or link closure in the framing Concept.
- Do not preserve an anchor after practice evidence shows it no longer improves problem selection
  or stopping decisions; revise or remove it instead of defending process compliance.
