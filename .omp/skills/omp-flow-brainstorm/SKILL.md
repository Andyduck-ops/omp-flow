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

## Interview Contract

1. Read the entry Concept and follow only useful links from the Bundle.
2. Record the initial request and known repository facts in the assigned framing Concept.
3. Inspect code, tests, docs, prior tasks, relevant history, and applicable durable knowledge
   through the native `omp-flow-wiki` Skill before asking repository-answerable questions.
4. Ask the user one decision question at a time. Ask only about intent, preference, scope, risk
   tolerance, or ambiguity that evidence cannot answer.
5. Keep confirmed facts, assumptions, disagreements, alternatives, constraints, success criteria,
   and open questions distinct.
6. Present materially different directions only when a real choice exists. State a recommendation
   and evidence, not a false menu.
7. Update the linked framing Concept as decisions change. Chat is not the durable source.
8. When a question needs evidence, link a bounded research Concept or assignment. When research
   changes the framing, return here and update the question. This is a spiral, not a one-way gate.

## Exit Gate

Framing is ready to support design when:

- the problem and desired outcome are understandable;
- non-goals and major constraints are recorded;
- consequential uncertainty is linked to evidence or an explicit research topic;
- the user accepts the current direction or explicitly asks to investigate alternatives.

Load `omp-flow-research` whenever evidence is needed; it may return to this Skill. Brainstorm is
not PRD, accepted design, or implementation authorization.

## Red Flags

- Do not create implementation work merely to force progress.
- Do not force convergence merely to advance the phase.
- Do not ask the user for facts available in the repository.
- Do not treat an attractive external project as selected before investigation.
- Do not dispatch implementation or QbD agents.
- Do not require fixed headings, list shapes, or link closure in the framing Concept.
