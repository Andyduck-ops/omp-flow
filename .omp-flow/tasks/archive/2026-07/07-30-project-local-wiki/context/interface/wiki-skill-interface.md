# Interface — `omp-flow-wiki`

## Managed shape

```text
templates/common/skills/omp-flow-wiki/SKILL.md
.omp/skills/omp-flow-wiki/SKILL.md
.codex/skills/omp-flow-wiki/SKILL.md
.claude/skills/omp-flow-wiki/SKILL.md
```

Only configured Harness destinations are deployed. No path above may contain project Concepts or
a nested knowledge Bundle.

## Procedure contract

The Skill MUST:

- trigger for consulting or maintaining durable project knowledge;
- resolve the repository-root `.omp-flow/wiki/index.md`;
- explain progressive navigation and add/update/deprecate operations;
- preserve unknown OKF frontmatter and keep optional fields optional;
- distinguish durable reusable knowledge from temporary observations;
- state that project knowledge never belongs inside the Skill.

The Skill MUST NOT require:

- fixed Concept body headings or fixed directory classes;
- complete or unique index membership;
- link/reverse-link closure;
- a generic parser or mandatory verification metadata.

## Deployment contract

Registered shared Skills are managed as one declared `SKILL.md` each. Missing sources fail
explicitly. The old recursive directory walker and cache have no remaining consumer and MUST be
removed. Existing managed `omp-flow-verifiable-claims` files are retired through the normal
obsolete-resource path without a runtime alias.

## Provenance

- `research/10-internal-002-skill-simplification.md`
- `ref:reference-knowledge-catalog-okf-spec-md`
- `research/90-synthesis-001-project-wiki.md`
