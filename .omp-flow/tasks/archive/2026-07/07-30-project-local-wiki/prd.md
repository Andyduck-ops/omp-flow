# PRD: Move OKF knowledge into the project-local Wiki and simplify the Wiki Skill

## Goal

Give omp-flow one durable, project-local knowledge source at `.omp-flow/wiki/`, operated through a
small native `omp-flow-wiki` Skill. Remove the duplicated knowledge-bearing Skill machinery
without changing the task-local Research/Reference workflow.

## Requirements

### R1 — One runtime knowledge source

- Durable project knowledge MUST live under `.omp-flow/wiki/`.
- Harness Skill directories MUST NOT contain Wiki Concepts or a nested knowledge Bundle.
- The project Wiki MUST remain version-control friendly and portable with the repository.

### R2 — Thin native Wiki Skill

- The shared Skill MUST be named `omp-flow-wiki`.
- Its frontmatter MUST trigger consultation and maintenance of durable project knowledge.
- Its body MUST explain when and how to consult, add, revise, index, and deprecate Concepts.
- Every configured Harness MUST receive its native `SKILL.md`, and every copy MUST resolve the
  same repository-root `.omp-flow/wiki/index.md`.
- The Skill MUST NOT prescribe fixed Concept headings, a closed taxonomy, graph closure, a generic
  parser, or mandatory optional OKF metadata.

### R3 — Project-owned initialization and update

- Init MUST create a minimal `.omp-flow/wiki/index.md` only when that file is absent.
- Init MUST NOT record Wiki files in the managed resource hash map, including in force mode.
- Update MUST treat `.omp-flow/wiki/` as protected user data and MUST NOT overwrite it.
- The package MUST NOT ship default Concept copies for future updates to install.

### R4 — Current-project migration

- The existing `Verifiable claim` and `Detector pathologies` Concepts MUST be preserved once in
  the project Wiki.
- The agreed `Evidence-led exploration` philosophy MUST be added once to the project Wiki.
- The root index MUST make these Concepts progressively discoverable without claiming exhaustive
  membership.
- The old `omp-flow-verifiable-claims` template and deployed knowledge copies MUST be retired.

### R5 — Remove unsupported deployment complexity

- Shared Skill deployment MUST manage each registered `SKILL.md` without the recursive Skill-tree
  walker, cache, or test-only cache reset.
- Live workflow and phase guidance MUST invoke `omp-flow-wiki`, not the retired Skill name.
- Existing downstream managed copies of the retired Skill MUST have a bounded update disposition;
  no runtime compatibility alias is required.

## Non-goals

- Redesigning task-local `research/`, `reference/`, `context/`, their tier model, or the Python
  Reference command.
- Merging brainstorm and research.
- Creating a Wiki database, search engine, schema registry, OKF parser, or link graph validator.
- Encoding migration inventories, exact Concept counts, or authored prose quality as permanent
  tests.

## Constraints

- Preserve unrelated changes in the dirty worktree.
- Update shared templates and currently deployed Harness copies together where both are tracked.
- Keep OKF navigation flexible according to `ref:reference-knowledge-catalog-okf-spec-md`.
- Prefer deletion of the one-consumer recursive packaging path over a compatibility abstraction.

## Acceptance Criteria

1. The repository has one `.omp-flow/wiki/` Bundle containing the three agreed Concepts, and no
   live Harness Skill contains a knowledge subtree.
2. `omp-flow-wiki/SKILL.md` is the only registered Wiki procedure and is deployed for each selected
   Harness.
3. Running init against an absent Wiki creates the root index; running init again, including force
   mode, preserves user-authored Wiki content byte-for-byte.
4. Managed-resource enumeration contains no `.omp-flow/wiki/` destination, force update preserves
   a Wiki sentinel, and focused source review confirms the protected user-data prefix.
5. Recursive Skill discovery/cache code and its generic nested-tree tests are absent.
6. A focused review confirms the two migrated Concepts retained their substance, the new
   exploration philosophy matches the approved direction, and the root index supports progressive
   discovery.
7. Build, existing tests, and package dry-run pass after test expectations and affected generated
   fixtures are updated.
