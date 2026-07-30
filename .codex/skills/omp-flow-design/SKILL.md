---
name: omp-flow-design
description: Turn a selected synthesis in an omp-flow task Bundle into linked requirements, technical design, decisions, and interfaces before implementation.
---

# OMP-Flow Design

## Preconditions

- The assignment identifies the Bundle root, role, objective, selected synthesis entry Concept,
  allowed output paths, actor ID, and receipt.
- Source provenance needed for the design is readable through ordinary links.

## Procedure

1. Dispatch the native Architect with Bundle root, selected synthesis entry, bounded objective,
   relevant linked Concepts, explicit output ownership, actor ID, and receipt. Create the
   operation first and forward its complete returned assignment unchanged with native item
   `id = actor_id = actorId` and matching descriptor role. Preserve the strict v1
   `ompFlowDispatch` descriptor as the first non-blank line.
2. Rewrite `prd.md` into observable requirements, non-goals, constraints, acceptance criteria, and unresolved product decisions. Remove temporary brainstorm duplication.
3. Write `design.md` with components, interfaces, data flow, state ownership, error behavior, migration/compatibility, verification strategy, and rejected alternatives.
4. Add linked decision, interface, brief, or finding Concepts only when they improve navigation or
   reuse. Their directories and filenames are descriptive, not tiers or identifiers.
5. Express binding constraints precisely and retain links to the synthesis or source Concepts.
6. Review PRD, Design, and linked Concepts for contradictions, placeholders, unowned decisions,
   and requirements with no verification path.

## Exit Gate

- Every acceptance criterion is testable.
- Architecture boundaries and ownership are explicit.
- Important alternatives and risks are recorded.
- No unresolved question blocks decomposition.
- Linked sources and accepted contracts agree with the Design.

Load `omp-flow-qbd` for independent challenge and record the human decision as a linked Concept.
Do not create implementation work before human QbD 1 approval.

## Red Flags

- Do not treat synthesis prose as a committed requirement.
- Do not add abstractions without an evidenced need.
- Do not leave `TBD`, implicit ownership, or unverifiable success language.
- Do not let the Architect approve its own design gate.
- Do not turn optional frontmatter, headings, or indexes into a machine-consumed design schema.
