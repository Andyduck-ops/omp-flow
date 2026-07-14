---
name: omp-flow-research
description: Run the omp-flow Research Gate before design. Use in phase=explore to investigate the repository, prior knowledge, external mature implementations, and Tier 1 Reference candidates, then produce and select an evidence-backed synthesis.
---

# OMP-Flow Research Gate

## Preconditions

- Python reports `phase=explore`.
- `brainstorm.md` contains a usable direction or the user supplied a precise research question.
- Each assignment has a bounded topic and an explicit report path under `research/`.

## Decide Research Scope

Choose and persist one of:

- **Internal:** repository code, tests, specs, knowhow, accepted context, history, and existing patterns.
- **External:** primary documentation and mature projects that may become Tier 1 clones under root `reference/<repo>`.
- **Both:** default for consequential architecture or unfamiliar domains.
- **Skip:** only when the user explicitly declines, the change is mechanical inside accepted context, or existing research/reference is sufficient. Record the concrete reason in `guidance.md` or the synthesis.

## Procedure

1. Split uncertainty into independent questions with sortable report names such as `10-internal-001-*.md` and `20-external-001-*.md`.
2. Dispatch Harness-native researcher agents when questions can be investigated independently. Pass task ID, objective, evidence standard, exact output path, and no-implementation boundary.
3. Separate facts, interpretations, counter-evidence, unknowns, and recommendations. Internal claims use `file:line`; external claims use stable source URLs and version/date where relevant.
4. Keep broad investigation in `research/`. Do not manually copy findings into task `reference/`.
5. Clone accepted external candidates read-only into root `reference/<repo>` and identify exact reusable anchors.
6. Digest selected anchors through `omp-flow reference digest-file`; Python writes Tier 2 content and provenance metadata.
7. Write one or more `research/90-synthesis-NNN-*.md` artifacts comparing alternatives, risks, Reference candidates, and the justified direction.
8. Select exactly one synthesis through `omp-flow workflow select-synthesis --path <relative-path>`.

## Exit Gate

- Important claims are evidenced or explicitly uncertain.
- Selected Tier 1 anchors are digested or deliberately deferred with a reason.
- One `90-synthesis` is selected through Python.
- The synthesis lets an Architect design without reconstructing research from chat.

Load `omp-flow-design` next.

## Red Flags

- No investigation means no design authority.
- Search snippets and model memory are not primary evidence.
- A Tier 1 clone is not automatically accepted Reference.
- A Tier 2 slice without Python provenance is invalid.
- Do not hide disagreement to make the synthesis look complete.
