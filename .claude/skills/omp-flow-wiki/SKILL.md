---
name: omp-flow-wiki
description: Use when project decisions, conventions, or verification contracts in .omp-flow/wiki may affect current work, when bootstrapping a fork with no Wiki, or when harvesting evidenced reusable knowledge.
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
- Durable behavior contracts use the authored `specs/<capability>/spec.md` shape. A Task-local
  draft is not Wiki authority; promotion to `.omp-flow/wiki/specs/<capability>/spec.md` requires a
  linked independent review and explicit human decision. File presence, model verdicts, and
  opaque receipts never authorize promotion.

## Consult

Start at `.omp-flow/wiki/index.md` when the relevant path is unknown, or open a known Concept
directly. The root index lists only `## Domains` with each domain's summary; each
`<domain>/index.md` lists that domain's Concepts. Follow only useful links. Update the index when a
durable Concept adds or changes a useful discovery path. An index is a navigation aid, not a
complete manifest; do not require leaf traversal or hash/graph closure.

A `<domain>/index.md` may carry hand-written frontmatter, including multi-line `title` and
`description` values; `omp_flow.py index wiki` keeps them and refuses to overwrite a domain index
whose frontmatter it cannot read faithfully, rather than dropping hand-written metadata.

## Wiki brief

`.omp-flow/wiki/brief.md` is optional and at most 2,000 characters; session start injects it. Each
entry is one concrete counter-default conclusion or supersession with a relative link to a Concept
that is already explicitly `stable` or `accepted` (or an existing `specs/**` page). Only a Sleep
run or a human writes it. Never put a broad pre-reading slogan such as "read manual X before
doing Y" in it.

## Status

`status` is optional. A Concept that omits it is an ordinary active page; do not back-fill it.
Set it explicitly only to express `draft`, `proposed`, `conflict`, or an inactive state such as
`deprecated` or `archived`, or to mark a page `stable` or `accepted` so `brief.md` may link it.
Sleep writes newly distilled knowledge as `draft`; a different actor verifies it before it becomes
`stable`.

## Optional OKF v0.2 provenance

Authors may add trust context to a Wiki Concept using optional, human-readable fields such as
`sources`, `generated`, `verified`, `status`, and `stale_after`:

```yaml
okf_version: "0.2"
sources:
  - path: "../../tasks/<task>/research/<evidence>.md"
generated:
  by: "<actor>"
  at: "<timestamp>"
verified:
  by: "<reviewer>"
  evidence: "<review-or-test-link>"
status: "draft"
stale_after: "<date>"
```

This is illustrative prose, not a required schema. Keep ordinary links beside it, omit unknown
values, and treat `verified`/`status` as evidence labels rather than runtime approval or Wiki
promotion. A promoted spec must still name its source Task, verifier, human decision, and caveats.

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
- **Archive:** when a Concept no longer describes current truth but its history still has value,
  `git mv` it to `.omp-flow/wiki/archive/<YYYY-MM-DD>--<reason>/<original-path>`, set
  `status: "archived"`, and state the reason and any successor link in the body. Repair inbound
  links that still matter. Use one dated reason folder for each archiving pass.
- **Decide:** record the reasoning behind a choice under `.omp-flow/wiki/decisions/` with
  `omp-flow-adr`; do not archive superseded decisions.
- **Single source of truth:** include `type` (open-set category such as `Spec`, `Architecture`,
  `Knowhow`, `Philosophy`, or any domain-specific type), `title`, one-sentence `description`, and
  `tags: [...]` in each Concept's frontmatter, then run
  `python3 -X utf8 .omp-flow/scripts/omp_flow.py index wiki` to synchronize
  `.omp-flow/wiki/<domain>/index.md` and `.omp-flow/wiki/index.md` automatically.

For a promoted spec, preserve purpose, observable requirements and scenarios, non-goals, verifier,
approval decision, provenance, and ordinary links back to the source Task/evidence. Resolve a
duplicate capability by an explicit revise/merge decision; never overwrite a Wiki spec by filename
alone.

Do not add fixed body headings, a mandatory topic hierarchy, a generic Wiki parser, or project
Concepts beneath this Skill.
