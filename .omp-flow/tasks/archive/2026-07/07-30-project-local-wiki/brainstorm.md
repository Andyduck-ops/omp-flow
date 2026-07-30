# Brainstorm: Move OKF knowledge into the project-local Wiki and simplify the Wiki Skill

## Raw Direction

The prior `07-26-knowledge-skills` task placed the OKF Bundle below
`omp-flow-verifiable-claims` and recursively copied the complete Skill directory into every
configured Harness. That confuses two responsibilities:

- a Skill explains when and how an agent performs an operation;
- project knowledge is runtime state that follows the project.

The project needs one runtime source of truth under `.omp-flow`, not one knowledge copy per
Harness. The Skill should be Wiki-oriented and contain only:

- when to consult the project Wiki;
- when new information belongs in the Wiki;
- how to add, update, navigate, and deprecate Wiki Concepts;
- how to avoid temporary observations, duplicated knowledge, and unnecessary validation
  machinery.

## Confirmed Direction

- The runtime OKF Bundle lives at `.omp-flow/wiki/`.
- The native Skill is named `omp-flow-wiki`.
- `.omp/`, `.codex/`, and `.claude/` may each need a native Skill entry for discovery, but those
  entries contain procedure only and all read/write the same `.omp-flow/wiki/`.
- Knowledge content must not be bundled below a Harness Skill.
- The existing Verification Contract, Detector Pathologies, and Evidence-led Exploration design
  philosophy belong in the single project Wiki.
- The Wiki uses OKF progressive disclosure without inventing a rigid body schema, graph closure,
  generic parser, or large validation framework.
- Visible authored outcomes need focused inspection, not permanent tests merely to prove their
  directory shape.

## Repository Facts

- `src/cli/init.ts` currently registers `omp-flow-verifiable-claims` and recursively deploys every
  file below its Skill directory to all configured Harnesses.
- The current Skill assumes its Bundle begins at a relative `knowledge/` directory.
- Brainstorm, research, finish, and workflow guidance name
  `omp-flow-verifiable-claims` directly.
- No `.omp-flow/wiki/` currently exists.
- The template Skill and three deployed copies currently contain the same six-file knowledge
  tree, creating four runtime-visible knowledge copies in this repository.
- The recursive managed-Skill walk was introduced primarily to ship nested knowledge with this
  Skill; whether it retains another real consumer must be investigated before keeping it.

## Scope Recommendation

This task should correct the project Wiki boundary and the Skill that operates it:

1. establish one project-local `.omp-flow/wiki/` OKF Bundle;
2. migrate the existing Concepts once;
3. replace `omp-flow-verifiable-claims` with a concise `omp-flow-wiki` procedure;
4. update lifecycle guidance and installation behavior;
5. retire the old knowledge-bearing Skill and redundant Harness knowledge copies.

The broader redesign of explore, Git source acquisition, task-local Reference, synthesis, and row
context should be a follow-up task. Its guiding philosophy will be preserved in the Wiki here, but
combining both changes would obscure the smaller single-source correction.

## Non-Goals

- Do not redesign task-local `reference/` or the Reference Python API in this task.
- Do not merge brainstorm and research phases in this task.
- Do not create a general Wiki database, search engine, graph validator, or schema registry.
- Do not preserve the old Skill name or duplicated knowledge layout merely for compatibility.
- Do not treat migration inventories or exact Concept counts as permanent invariants.

## Open Questions for Research

- How should init seed `.omp-flow/wiki/` without later update operations overwriting
  project-maintained knowledge?
- Can the recursive managed-Skill discovery be deleted once Skills contain only `SKILL.md`, or
  does another current Skill require nested resources?
- Which template/runtime files and golden fixtures name the old Skill?
- What is the smallest migration and retirement path that leaves one runtime truth without
  fabricating compatibility machinery?
