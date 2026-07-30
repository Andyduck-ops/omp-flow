# External investigation: Open Knowledge Format v0.2

## Source

Primary source: GoogleCloudPlatform `knowledge-catalog`, Open Knowledge Format `SPEC.md`, local
read-only clone at commit `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`.

Upstream: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/3fcbb9f828c2f23d109c855ee403c3a4c81f3a96/okf/SPEC.md>

## Confirmed facts

OKF defines a Bundle as a directory tree of Markdown whose organization is producer-defined. Root
and nested Concepts, optional `index.md`, optional `log.md`, and arbitrary subdirectories may
coexist. Git is the recommended distribution because it supplies history, attribution, and diffs
(`reference/knowledge-catalog/okf/SPEC.md:109-132`).

Every non-reserved Concept is Markdown with YAML frontmatter and a required non-empty `type`; its
body is otherwise free-form (`SPEC.md:153-180`). This is the small conformance core, not a
requirement to encode workflow state in frontmatter.

Markdown links assert relationships. The relationship kind comes from surrounding prose rather
than a typed edge schema, and consumers must tolerate broken links (`SPEC.md:451-463`). The
`references/` directory is only a convention, not a required taxonomy (`SPEC.md:476-482`).

An `index.md` may appear anywhere and exists for progressive disclosure so a human or agent can
see available knowledge before opening individual documents (`SPEC.md:502-526`). Missing indexes,
unknown fields, unknown types, and broken links are explicitly tolerated (`SPEC.md:731-759`).

A Bundle may declare `okf_version: "0.2"` only at the root index. Consumers that do not understand
the declared version should attempt best-effort consumption rather than refuse the Bundle
(`SPEC.md:763-777`).

## Interpretation

OKF supports a deliberately light architecture:

- documents are knowledge units;
- normal Markdown links carry relationships whose meaning remains in prose;
- indexes are navigation views rather than closed manifests;
- directory structure follows the knowledge instead of a universal taxonomy;
- Git can supply ordinary portability and version history.

Nothing in v0.2 requires a producer to build a regular-expression parser, a graph closure
validator, a mandatory provenance family, a fixed `references/` hierarchy, or a workflow state
machine. A project can use the minimal `type` signal for Concepts while letting agents read the
semantic body directly.

## Tension to preserve

Strict OKF conformance does require parseable frontmatter and `type` on Concepts. That does not
mean the workflow runtime must parse the authored body or derive control state from fixed
headings, list shapes, filenames, or frontmatter fields. The design should keep this distinction
explicit.

## Reference disposition

The upstream clone is accepted as the format anchor. A task-local Tier 2 digest is deliberately
deferred: the exact source, revision, and line anchors above are already stable, while exercising
the paired source/meta digestion mechanism being replaced would create another redundant copy
without improving the design.

## Recommendation

Adopt the smallest useful OKF profile: one Bundle-root version declaration, self-describing
Concepts with `type`, free-form Markdown bodies, normal relative links, and authored indexes only
where they aid discovery. Treat all richer metadata families as optional and evidence-driven.
