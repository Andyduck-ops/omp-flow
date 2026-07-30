---
name: omp-flow-wiki
description: Consult, bootstrap, distill, and maintain durable project knowledge in the repository-root .omp-flow/wiki. Use when project knowledge may affect a decision, when starting from a fork with no Wiki, or when evidenced reusable knowledge should outlive the current task.
---

# OMP-Flow Wiki

Operate the project Wiki at repository-root `.omp-flow/wiki/`. This Skill contains procedure only;
project knowledge belongs in the Wiki.

## Method

- Keep one project truth in `.omp-flow/wiki/`.
- Grow it through progressive disclosure: load and link only the smallest coherent topic needed.
- Persist knowledge only when it is durable, reusable, and supported by the strongest evidence
  reasonably available.
- Keep verification proportional to the claim and the decision it may change.
- Leave temporary state, task notes, and unconfirmed explanations in task artifacts rather than
  promoting them to the Wiki.

## Consult

Start at `.omp-flow/wiki/index.md` when the relevant path is unknown, or open a known Concept
directly. Follow only useful links. An index is a navigation aid, not a complete manifest, and the
current directory layout is not a fixed taxonomy.

## Bootstrap when absent

If `.omp-flow/wiki/index.md` does not exist, create a minimal root index and add Concepts only as
the current work establishes them. Do not scan the whole repository to manufacture an up-front
summary, closed taxonomy, or speculative documentation set.

## Distill progressively

During investigation and implementation, identify knowledge that will improve future decisions:
architecture boundaries, behavioral contracts, project conventions, recurring failure modes, and
reasoning that is expensive to rediscover. Confirm each candidate from authoritative code, tests,
project documentation, build or configuration behavior, history, or observed failures. Use the
strongest evidence appropriate to the claim without imposing an arbitrary source count.

For a fork, distinguish upstream facts from fork-local behavior and divergence whenever that
difference matters. Useful paths, revisions, or upstream anchors may be recorded as provenance;
they are not mandatory fields.

## Maintain

- **Add:** write a self-contained Markdown Concept with parseable YAML frontmatter and a non-empty
  descriptive `type`. Organize the body freely and add an index link only when it aids discovery.
- **Revise:** update claims when stronger evidence or changed behavior warrants it. Preserve
  unknown frontmatter and do not fill optional metadata mechanically.
- **Merge:** consolidate duplicated knowledge when one Concept can preserve the useful distinctions
  and provenance.
- **Index:** add or adjust navigation where it helps a future reader find a topic. Do not require
  complete membership, reverse links, or link closure.
- **Deprecate:** preserve useful history by marking a Concept deprecated and naming a successor or
  reason when known; delete only when the history has no continuing value.

Do not add fixed body headings, a mandatory topic hierarchy, a generic Wiki parser, or project
Concepts beneath this Skill.
