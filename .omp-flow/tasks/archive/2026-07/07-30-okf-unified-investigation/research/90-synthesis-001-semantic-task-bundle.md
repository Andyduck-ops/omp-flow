# Selected synthesis: semantic task bundle with a minimal mechanical runtime

## Decision

Make each task directory one portable Open Knowledge Format Bundle. Use Markdown Concepts,
relative links, and authored indexes as the task's knowledge and navigation plane. Preserve only
the smallest runtime mechanism needed for facts that are inherently mechanical.

This direction was accepted by the user after comparing the current scaffold with a task-root
OKF Bundle and removing the proposed Markdown/frontmatter parsing scheme.

## Why this direction is justified

The current system maintains the same workflow events across JSON, CSV, JSONL, verdict documents,
context indexes, digested source pairs, and rendered handoff blocks. These are active,
cross-coupled sources rather than harmless exports
([internal investigation](10-internal-001-current-task-knowledge-and-control.md)).

OKF v0.2 already supplies the useful knowledge model without prescribing a domain taxonomy:
Markdown Concepts, prose-qualified links, optional indexes for progressive disclosure, tolerant
consumption, and ordinary Git distribution
([OKF investigation](20-external-001-open-knowledge-format.md)).

The combination removes lossy knowledge transfers while retaining a narrow place for process
identity, locking, atomic side effects, and facts about actions that actually occurred.

## Architecture direction

The task root is the Bundle root. Existing useful names such as `research/`, `reference/`,
`context/`, `qbd/`, `prd.md`, and `design.md` may remain when they improve navigation. They are not
mandatory tiers, schemas, or state transitions.

Root and nested `index.md` files provide progressive disclosure. A small task may list work
directly from its root index; a larger task may add descriptive subdirectories and local indexes.
Individual work and review Concepts remain flat where extra hierarchy adds no value. Persistent
filenames do not need encoded topology IDs.

Brainstorming and research remain distinct reasoning operations inside Explore, but form a spiral:
questions drive investigation, evidence reframes questions, and both update one connected
knowledge space until uncertainty no longer changes the direction.

Sources, interpretations, decisions, briefs, handoffs, reviews, and evidence become linked
Concepts instead of rows and projections that must be synchronized. The agent follows normal
Markdown links and understands the surrounding prose. `index.md` is not a database, topology
ledger, or hidden CSV.

The runtime is evaluated from zero. Every old `task.json`, CSV, JSONL, context-index, Reference
selector, and filename-protocol field must be classified as:

1. semantic knowledge owned by a Concept;
2. derivable from an actual artifact;
3. an irreducible mechanical fact;
4. obsolete.

Only category 3 justifies a machine-owned representation.

## Explicit rejections

- Do not translate the current JSON/CSV/JSONL schemas one-for-one into Markdown.
- Do not parse authored Markdown with regular expressions or exact delimiter, heading, list, or
  filename rules.
- Do not introduce a Markdown DSL, mandatory link closure, typed-edge graph, or general
  YAML/Markdown validator.
- Do not preserve physical Tier 1/2/3 copies where links and provenance convey the distinction.
- Do not keep exact-topology identifiers in persistent paths merely to make dependencies
  machine-readable.
- Do not add compatibility machinery before identifying a real surviving consumer.
- Do not create permanent tests for visible one-time structure or migration inventory.

## Alternatives not selected

### Add an OKF facade over the old stores

This reduces migration risk but preserves the duplicated sources of truth and naming confusion.
It fails the simplification goal.

### Move all task investigation into one repository-wide corpus

This maximizes cross-task reuse but weakens task ownership, portability, and archive boundaries.
Reusable conclusions may still be deliberately distilled to the project Wiki without moving
temporary task reasoning there.

### Replace each strong-format file with a strictly parsed Markdown equivalent

This retains the old control model and makes Markdown a more fragile serialization format. It was
explicitly rejected.

## Risks the design must resolve

- Mechanical identity: dispatch, retry, independent review, and external side effects need a
  small correlation mechanism without controlling Concept names.
- Version history: active task directories are currently gitignored, so OKF's Git benefit is not
  automatic.
- Harness context: implementation and review agents must be able to enter at a useful index or
  Concept and follow links without recreating JSONL manifests.
- Complex execution: authored waves and grouping should be the default; explicit dependency data
  is justified only by a demonstrated case they cannot express.
- Migration: current Python consumers are broad, so deletion should follow consumer removal
  rather than leave two synchronized systems.

## Verification posture

Use one real end-to-end task as the principal proof that agents can navigate the Bundle from
indexes and links through investigation, implementation, and independent review. Add focused
checks only for retained mechanical guarantees such as identity, atomicity, and external action
correlation. Inspect visible authored structure directly.

## Design handoff

The Architect should specify:

1. the smallest Concept set and example task map;
2. the semantic-knowledge / mechanical-runtime boundary;
3. the consumer deletion and migration sequence;
4. how Harness assignments enter and traverse the Bundle;
5. active-task versioning;
6. a minimal dogfood verification path.
