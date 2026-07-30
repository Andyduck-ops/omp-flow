---
type: Technical Design
title: Semantic task Bundle and minimal runtime kernel
description: A task-root OKF knowledge plane navigated by agents, with code restricted to irreducible runtime coordination.
---

# Architecture

## Target task map

```text
<task-id>/                         # tracked OKF Bundle root
├── index.md                       # okf_version + authored task map
├── task.md                        # task purpose and durable human-readable identity
├── brainstorm.md                  # framing and reframing Concept
├── research/
│   ├── index.md
│   └── <descriptive-topic>.md
├── reference/
│   ├── index.md
│   ├── <descriptive-source>.md    # provenance and local meaning together
│   └── assets/                    # optional exact attachments
├── context/
│   ├── index.md
│   ├── brief/
│   ├── decision/
│   ├── finding/
│   └── interface/
├── prd.md
├── design.md
├── work/
│   ├── index.md                   # readable ordering/grouping
│   └── <descriptive-work>.md
├── review/
│   ├── index.md
│   └── <descriptive-review>.md
└── qbd/
    ├── index.md
    └── <audit-or-human-decision>.md
```

Only the Bundle root, root index, and Concept minimum are architectural requirements. Nested
directories and indexes appear only when they improve discovery at the task's scale. Small tasks
may link work and review Concepts directly from the root index.

`guidance-specification.md`, `.task/`, `.summaries/`, paired Reference metadata, and the current
JSON/CSV/JSONL control files are not part of the target. Useful guidance, summaries, handoffs, and
evidence become ordinary linked Concepts rather than receiving replacement containers one-for-one.

## Knowledge plane ownership

The Bundle owns task identity and purpose, framing, sources and provenance, findings, alternatives,
requirements, design, work intent, handoffs, reviews, audits, human decisions, and navigational
relationships.

Every Concept is normal OKF Markdown. `type` helps recognition; all other frontmatter is optional
unless a particular Concept author finds it useful. Workflow semantics live in prose and links,
not in machine-consumed frontmatter.

An index is a view authored for the next reader. Sections can communicate order, grouping,
parallelism, relevance, or alternative paths in ordinary language. OmpFlow does not parse those
sections into a graph.

## Runtime kernel ownership

The runtime remains responsible for:

- mapping the current session to an active task directory;
- confining filesystem operations to authorized roots;
- starting and correlating native agents/processes;
- preventing duplicate or conflicting mechanical side effects;
- returning native dispatch receipts and failures;
- atomically creating, selecting, relocating, or archiving directories when requested.

Runtime data stays under ignored session/runtime storage outside the Bundle. It is private
coordination data, not portable task knowledge. The runtime does not own task phase, row status,
dependency topology, evidence meaning, selected design, or gate interpretation.

The current `workflow state` payload is reduced to mechanical orientation such as active task path
and live dispatch state. Phase-specific Skills inspect the linked Bundle and choose their semantic
operation; Python no longer reconstructs a phase from task data.

## Agent entry interface

Every assignment supplies:

1. the task Bundle root or root `index.md`;
2. the role and bounded objective;
3. the most relevant entry Concept;
4. the allowed output Concept path or code scope;
5. the native dispatch receipt when identity correlation matters.

The receiving agent reads the entry Concept, follows only useful links, and reports missing
semantic context plainly. The main session passes paths, not a rendered concatenation of
brainstorm, synthesis, manifests, context entries, Reference slices, and row JSON.

Planning roles normally enter through the root index and the relevant framing, research, or design
Concept. An implementer enters through a work Concept. A reviewer enters through the same work
Concept plus the linked handoff and changed code. Review output links back to what it evaluated.

## Explore data flow

```text
question or hypothesis
        ↓
brainstorm Concept
        ↓
repository/source investigation
        ↓
research and Reference Concepts
        ↓
links and evidence reframe the question
        ↺
selected synthesis → PRD/Design
```

No step copies the same passage merely to promote it between physical tiers. A source clone is
acquired into an ignored cache such as `.omp-flow/cache/repos/<repo>`; the task stores a Reference
Concept with URL, revision, useful anchors, interpretation, and normal links. An exact attachment
is copied only when offline or immutable access materially requires it.

## Work and review data flow

`work/index.md` communicates the useful execution shape. Items in the same authored group may be
dispatched together; later groups normally follow earlier groups. The main session makes that
semantic scheduling decision and asks the native Harness to run the selected entry Concepts.

The Harness returns an opaque dispatch receipt. The receipt correlates a live implementer or
reviewer with its assignment but does not become a persistent filename grammar.

An implementer adds or updates the agreed code and writes a linked handoff Concept. An independent
reviewer reads the work and handoff, examines the code, and writes a Review Concept. The review
states its subject and verdict in readable language. Agents decide the next action from that
evidence; there is no synchronized Evidence ledger or topology status cell.

## Human gates

QbD audits and human decisions are Concepts linked from `qbd/index.md` and from the design or work
they concern. Human approval is a semantic decision, not a Python phase mutation. Skills MUST see
an applicable human decision before proceeding; the runtime only preserves the native identity
and dispatch receipt when independence must be established.

# Interfaces

## Bundle creation

Input: human title, descriptive task directory name, optional parent link.

Output: a tracked directory with root `index.md`, `task.md`, and only the smallest useful initial
Concepts. Creation MUST NOT seed empty ledgers, example JSONL records, placeholder tier
directories, or control-plane schemas.

## Bundle selection

Input: an existing task Bundle path.

Output: a session-local active-task pointer plus the root index path injected for orientation.
Selection validates path confinement and directory existence, not Markdown semantics.

## Native dispatch

Input: role, objective, task root, entry Concept, output boundary.

Output: native dispatch receipt and native completion/failure. OmpFlow does not generate an
intermediate context manifest. When a receipt should outlive the process, the agent may mention it
in the relevant handoff or review Concept; Python does not parse that prose back into state.

## Archive

Input: explicit human/main-session request and a task Bundle path.

Output: a Git-visible relocation or immutable archive placement that preserves relative links.
Archive does not require rewriting the Bundle into a separate schema.

# Error behavior

- Missing or broken optional links remain valid knowledge. The reader reports the gap and continues
  when the missing target is not required for the current decision.
- A missing required entry Concept blocks that assignment visibly. There is no fallback to
  `tasks.csv`, JSONL, or generated prompt content.
- Unknown Concept types and additional frontmatter remain readable.
- Invalid task paths, session collisions, unauthorized filesystem targets, failed dispatches,
  duplicate mechanical side effects, and failed archive moves fail closed in the runtime.
- Ambiguous prose causes a semantic clarification or a document improvement, not a new parser.

# Versioning

The repository Git history is the canonical Bundle history. New active tasks and their later
archive locations are tracked. Ignored paths are narrowed to native sessions/runtime data and the
external repository cache.

Existing ignored task history is not rewritten. At cutover, legacy task directories are retained
as immutable historical material outside the new runtime contract or relocated once to a clearly
named ignored legacy area. No permanent reader or dual-format migration layer is added.

`log.md` remains optional. It may summarize meaningful updates for readers, but it never replaces
Git history or becomes a required event ledger.

# Cutover design

The implementation lands as a direct consumer cutover:

1. Introduce the Bundle scaffold, tracked task path policy, and path-based session orientation.
2. Change Skills, agent cards, Hooks, and native assignments to enter through Bundle/Concept paths.
3. Change source acquisition to an ignored clone cache and Reference Concepts; remove digest and
   render consumers.
4. Change work/review coordination to linked Concepts and native receipts; remove topology,
   Evidence, context-index, and manifest consumers.
5. Remove Python lifecycle/gate semantics that duplicate authored knowledge, retaining only the
   runtime kernel boundary.
6. Stop generating and delete the legacy task formats and their tests/templates in the same
   cutover.
7. Run a new real dogfood task through the complete Bundle path.

Intermediate implementation commits MAY temporarily have incomplete consumers, but no released or
accepted state may dual-write both models. Historical archives stay historical rather than
driving compatibility code.

# Verification

## Semantic verification

Inspect the created Bundle and one real dogfood task:

- the root index provides a clear entry map;
- Concepts are readable and linked without a prescribed body template;
- brainstorm and research can alternate without copying knowledge;
- work grouping is visible without encoded IDs;
- implementer and reviewer can navigate from assigned paths;
- review and human decisions remain traceable;
- copying or archiving the Bundle preserves relative navigation.

This is a bounded workflow demonstration, not a permanent schema test suite.

## Mechanical verification

Retain focused executable checks only for:

- safe task-path confinement;
- active-session selection;
- native dispatch receipt identity and independent reviewer correlation;
- duplicate external-side-effect prevention;
- atomic create/archive behavior;
- cache/runtime ignore boundaries and Git visibility of Bundle changes.

## Retirement verification

Search active source, templates, Hooks, Skills, agent cards, and tests for consumers of:

```text
task.json
tasks.csv
evidence.csv
implement.jsonl
check.jsonl
context/index.json
<slug>.meta.json
ref:
exact-topology filename grammar
```

Any surviving match must identify a deliberate historical fixture or documentation example.
There is no compatibility allowlist for active consumers.

# Rejected alternatives

- An OKF facade over the existing stores keeps synchronization and naming problems.
- Strictly parsed Markdown recreates the old schema as a hidden DSL.
- A repository-wide shared task corpus weakens task-local ownership; reusable conclusions belong
  in the separately curated project Wiki.
- A typed dependency graph and permanent scheduler protocol are unjustified without a real case
  that authored grouping cannot express.
- Task-local nested Git repositories add operational complexity; normal repository Git already
  supplies the history OKF recommends.

# Provenance

This design implements the selected
[`semantic task Bundle` synthesis](research/90-synthesis-001-semantic-task-bundle.md), the
accepted constraints in `guidance-specification.md`, and the format behavior summarized from
Google Open Knowledge Format v0.2 at commit
`3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`. Its general ownership rationale is distilled
separately as the project Wiki philosophy
[`Semantic knowledge, mechanical control`](../../wiki/philosophy/semantic-knowledge-mechanical-control.md).
