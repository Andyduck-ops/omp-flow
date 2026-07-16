---
name: omp-flow-brainstorm
description: Explore and clarify a consented omp-flow task before research or design. Use in phase=explore when user direction, scope, constraints, alternatives, or success criteria are still unclear.
---

# OMP-Flow Brainstorm

## Preconditions

- The user consented to task creation or selected an existing task.
- Python reports `phase=explore`.
- `brainstorm.md` belongs to the active task.

## Interview Contract

1. Record the initial request and known repository facts in `brainstorm.md`.
2. Inspect code, tests, docs, specs, knowhow, prior tasks, and relevant history before asking repository-answerable questions.
3. Ask the user one decision question at a time. Ask only about intent, preference, scope, risk tolerance, or ambiguity that evidence cannot answer.
4. Keep confirmed facts, assumptions, disagreements, alternatives, constraints, success criteria, and open questions distinct.
5. Present two or three materially different directions when a real design choice exists. State a recommendation and evidence, not a false menu.
6. Update `brainstorm.md` as decisions change. Chat is not the durable source.

## Exit Gate

Brainstorm is ready for Research Gate only when:

- the problem and desired outcome are understandable;
- non-goals and major constraints are recorded;
- unresolved questions have been converted into concrete research topics;
- the user accepts the current direction or explicitly asks to investigate alternatives.

At brainstorm convergence, before dispatching research, the orchestrator (main session) fills `guidance-specification.md`'s three sections and keeps them current as decisions land through the Research Gate:

- `## Research Gate` — the scope decision (Internal / External / Both / Skip) and the selected synthesis, or the concrete skip rationale.
- `## Reference Candidates` — the Tier 1 anchors and their disposition (accepted, deferred, or rejected, each with a reason).
- `## Design Constraints` — binding user decisions, standing constraints, and venue notes the design must honor.

Load `omp-flow-research` next. Brainstorm is not PRD, accepted design, Reference, or implementation authorization.

## Red Flags

- Do not create `tasks.csv` rows during brainstorm.
- Do not force convergence merely to advance the phase.
- Do not ask the user for facts available in the repository.
- Do not treat an attractive external project as selected before investigation.
- Do not dispatch implementation or QbD agents.
