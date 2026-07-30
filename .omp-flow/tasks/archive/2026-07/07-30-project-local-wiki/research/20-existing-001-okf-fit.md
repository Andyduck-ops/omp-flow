# Existing Reference 001 — OKF fits a project-local Wiki

## Anchor

`ref:reference-knowledge-catalog-okf-spec-md` digests
`reference/knowledge-catalog/okf/SPEC.md:L504-526` through the Python Reference command.

## What the source establishes

OKF permits `index.md` at the bundle root or in any directory. Indexes support progressive
disclosure, may carry lightweight descriptions and tags, and do not define a mandatory closed
graph. Producers may generate them, but consumers must tolerate missing or stale navigation.

## Application here

The project Wiki can remain deliberately small:

```text
.omp-flow/wiki/
  index.md
  <optional folders and Concepts as the project needs them>
```

That is enough to preserve the useful part of the earlier design: a root entry point, optional
sub-indexes, self-contained Markdown Concepts, provenance where it conveys real information, and
flexible growth. It does not require `specs/` and `knowhow/` as fixed top-level categories, a
database, graph traversal, link-closure tests, or one `SKILL.md` per knowledge unit.

The Skill can therefore be a procedural index manager while the OKF bundle remains the sole
project knowledge store.
