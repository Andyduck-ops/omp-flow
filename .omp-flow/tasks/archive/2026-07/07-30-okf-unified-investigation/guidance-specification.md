# Guidance Specification: Unify explore investigation and evidence with OKF

## Research Gate

Scope: **Both**, satisfied by focused internal investigation of the current Python/file consumers
and the accepted Google Open Knowledge Format v0.2 primary source.

Selected synthesis: `research/90-synthesis-001-semantic-task-bundle.md`.

The investigation was intentionally bounded because prior exploration had already identified the
architecture direction. Research persisted and checked those claims instead of reopening
brainstorming or manufacturing additional alternatives.

## Reference Candidates

- **Accepted:** GoogleCloudPlatform `knowledge-catalog` OKF v0.2 `SPEC.md`, commit
  `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`.
  - Role: external format and progressive-disclosure anchor.
  - Tier 2 digest: deliberately deferred because the stable upstream clone and exact line anchors
    are already available, and using the paired source/meta store under redesign would add a
    redundant copy.
- **Rejected as Reference:** historical OmpFlow task artifacts and control-plane source.
  - Role: internal evidence cited directly from repository paths and Git history, not external
    reusable Reference.

## Design Constraints

- A task directory is one portable OKF Bundle; preserve useful existing directory names.
- Markdown, normal links, document placement, and authored indexes carry semantic relationships.
- Agents interpret authored Markdown directly. No regular-expression extraction, Markdown DSL,
  fixed heading/list grammar, or frontmatter-driven workflow state.
- `index.md` is navigation and ordering, not a closed manifest or hidden CSV.
- Persistent folders and filenames do not encode exact topology IDs by default.
- Brainstorm and research are a spiral inside Explore, not a one-way transfer chain.
- Keep only demonstrated irreducible mechanical state in code; do not translate legacy fields
  wholesale.
- Preserve independent review and external-action correlation as outcomes, not necessarily as
  their current CSV/JSON formats.
- Prefer deletion over compatibility layers when no real consumer remains.
- Verification is proportional: one end-to-end dogfood flow plus focused checks for retained
  mechanical invariants; visible Markdown structure is reviewed directly.
