# Synthesis 001 — One project Wiki, thin native Skill

Task `07-30-project-local-wiki`. 2026-07-30.

Evidence: two internal repository reports and one current Tier 2 digest of the local OKF v0.2
source.

## Decision

Use `.omp-flow/wiki/` as the single runtime source of durable project knowledge. Rename
`omp-flow-verifiable-claims` to `omp-flow-wiki`, and reduce it to instructions for consulting and
maintaining that Wiki.

The split is:

```text
package-managed procedure                   project-managed knowledge
templates/common/skills/omp-flow-wiki/      .omp-flow/wiki/
  SKILL.md                                    index.md
                                              optional indexes and Concepts
```

Each configured Harness receives its native copy of the one-file Skill. Every copy resolves the
same repository-root `.omp-flow/wiki/index.md`; none carries a knowledge subtree.

## Why this is simpler and more correct

The previous design made a Skill both an invocation mechanism and a knowledge database. That
forced recursive Skill packaging, three runtime-visible Bundle copies, cache/test seams, and
unclear truth ownership. The repository scan shows that no other shared Skill needs recursive
payload deployment.

Separating the roles removes the accidental infrastructure:

- Skills answer **when and how to act**.
- The project Wiki answers **what the project knows**.
- Git provides persistence and migration.
- OKF supplies optional indexes and self-contained Concepts without imposing a rigid hierarchy.

## Runtime ownership

`.omp-flow/wiki/` is user data, not a managed template tree:

1. Init creates a minimal root `index.md` only when it is missing.
2. It records no managed hash for the Wiki.
3. Update protects `.omp-flow/wiki/` and cannot overwrite it, even in force mode.
4. The package does not ship default Concept copies.
5. This repository migrates the two existing Concepts and the agreed evidence-led exploration
   philosophy once into `.omp-flow/wiki/`.

The tracked Wiki then travels with the project and has one truth source.

## Skill contract

`omp-flow-wiki` should stay concise and procedural:

- trigger when durable knowledge may inform work or when evidenced reusable knowledge should be
  captured;
- begin at `.omp-flow/wiki/index.md`, or open a known Concept directly;
- add only durable, reusable, evidenced knowledge;
- preserve unknown OKF frontmatter when revising;
- deprecate instead of deleting when history or inbound links remain useful;
- add index links only when they improve discovery;
- never store project knowledge inside the Skill.

It should not decide for the model through a fixed taxonomy, required headings, link closure, a
generic parser, or mandatory verification metadata.

## Implementation boundary

In scope:

- add the project-owned Wiki and migrate the three agreed Concepts exactly once;
- replace the old Skill name and all live invocation text;
- reduce shared Skill deployment to `SKILL.md` files;
- retire old managed Skill paths;
- protect Wiki user data and seed only a missing root index;
- keep tests proportional to those executable ownership and deployment behaviors.

Out of scope:

- changing task-local `research/`, `reference/`, or `context/` commands and tiers;
- merging brainstorm and repository research phases;
- redesigning Reference provenance;
- a Wiki database, search engine, schema validator, graph checker, or broad content test suite.

Those larger Reference questions remain a separate follow-up after this ownership correction.

## Rejected alternatives

- **Knowledge inside the Skill:** recreates multiple runtime truths and recursive packaging.
- **Wiki as a managed template:** lets package update own and potentially overwrite project
  knowledge.
- **One Skill per Concept:** confuses invocation procedures with the knowledge units they manage.
- **Strict OKF enforcement:** contradicts the source protocol's flexible progressive-disclosure
  model and addresses no observed failure.

## Research Gate result

Proceed to design with the project-local Wiki split. The evidence is sufficient for this bounded
change; no new external clone or broader ecosystem survey is needed.
