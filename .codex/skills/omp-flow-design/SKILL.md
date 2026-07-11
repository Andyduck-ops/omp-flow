---
name: omp-flow-design
description: Turn the selected omp-flow research synthesis into approved requirements, technical design, and Tier 3 contracts. Use in phase=design after Research Gate selection and before QbD 1 or task decomposition.
---

# OMP-Flow Design

## Preconditions

- Python reports `phase=design`.
- A selected `research/90-synthesis-*.md` exists.
- Required Tier 2 Reference provenance is valid.

## Procedure

1. Dispatch the native Architect with task ID, selected synthesis path, relevant Reference/context paths, and explicit output ownership.
2. Rewrite `prd.md` into observable requirements, non-goals, constraints, acceptance criteria, and unresolved product decisions. Remove temporary brainstorm duplication.
3. Write `design.md` with components, interfaces, data flow, state ownership, error behavior, migration/compatibility, verification strategy, and rejected alternatives.
4. Distill stable decisions into `context/decision`, interfaces into `context/interface`, reusable row guidance into `context/brief`, and confirmed hazards into `context/finding`.
5. Express binding constraints as precise MUST/MUST NOT rules and retain provenance to synthesis or Tier 2 Reference.
6. Review PRD, Design, and context for contradictions, placeholders, unowned decisions, and requirements with no verification path.

## Exit Gate

- Every acceptance criterion is testable.
- Architecture boundaries and ownership are explicit.
- Important alternatives and risks are recorded.
- No unresolved question blocks decomposition.
- Accepted Reference and Tier 3 contracts agree with the Design.

Prepare QbD 1 through Python and load `omp-flow-qbd`. Do not create concrete `tasks.csv` rows before human QbD 1 approval.

## Red Flags

- Do not treat synthesis prose as a committed requirement.
- Do not add abstractions without an evidenced need.
- Do not leave `TBD`, implicit ownership, or unverifiable success language.
- Do not let the Architect approve its own design gate.
