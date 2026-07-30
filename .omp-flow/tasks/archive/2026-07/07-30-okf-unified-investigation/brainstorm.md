# Brainstorm: Unify explore investigation and evidence with OKF

## Raw Direction

- The current Explore sequence is backwards: `brainstorm` is treated as a conversational
  phase that converges before Git clone and external implementation investigation, although
  evidence should be able to reshape the problem while it is being framed.
- Git clone, repository inspection, local code/history inspection, alternatives, findings,
  and synthesis belong to one iterative Explore process rather than a one-way chain of
  separately rewritten context stores.
- `brainstorm` and `research` remain distinct cognitive operations: brainstorm frames and
  reframes questions, assumptions, and alternatives; research acquires sources and tests
  those ideas against evidence. Their control flow is spiral, not serial.
- `reference` is overloaded across root `reference/<repo>` clones, task-local source slices,
  `tasks.csv.reference` bindings, rendered context blocks, and OKF's own optional
  `references/` convention. The name no longer communicates ownership or lifecycle.
- Use the flexibility of Open Knowledge Format v0.2 to unify task-local investigation into a
  human-readable, agent-readable, portable bundle.
- Preserve the repository's existing folder naming and organization where it is already
  useful. OKF should supply a common document/index/provenance convention rather than force
  a new taxonomy.
- Consider OKF for the wider task knowledge plane, not only the current `reference/`
  implementation, provided the conversion removes duplication instead of translating every
  legacy artifact one-for-one.
- The resulting OKF corpus needs an explicit versioning story.
- Preserve useful outcomes, not the current mechanisms. Delete pseudo-requirements, repeated
  summaries, physical Tier layers, strict document schemas, broad compatibility machinery,
  and tests for results that are obvious by inspecting the produced bundle.
- Do not require exact-topology IDs to appear in directory or file names. Ordering,
  grouping, and relationships may be expressed directly by an authored `index.md`; names
  should remain descriptive rather than act as a second machine protocol.
- Do not parse authored Markdown with regular expressions, exact frontmatter extraction, or
  a home-grown Markdown DSL. Markdown is the semantic and navigational medium: headings,
  prose, lists, relative links, and document placement already express rich relationships
  that an agent can follow directly.

## Confirmed Repository Facts

- A workflow task currently owns one flat `reference/` directory; topology rows do not own
  subdirectories. Rows select shared material through `tasks.csv.reference`.
- Broad findings are written under `research/`; full external clones live under root
  `reference/<repo>`; accepted slices are copied into task `reference/`; accepted local
  contracts are separately written under `context/`.
- The current `<slug>.<ext>` plus `<slug>.meta.json` structure was inherited from the deleted
  TypeScript custom-dispatch/context system and then ported almost unchanged to Python.
- Historical task data demonstrates silent slice overwrite and source-line versus
  slice-line ambiguity.
- OKF v0.2 requires only Markdown concept documents with a `type` field. Directory layout,
  indexes, provenance, lifecycle fields, links, and a `references/` directory are otherwise
  optional or producer-defined.
- OKF distinguishes format declaration (`okf_version` at the bundle root), optional
  chronological `log.md`, and normal Git distribution/history; it does not prescribe a
  custom version-control runtime.
- `.omp-flow/tasks/` is currently gitignored and no task artifact is tracked by the
  repository Git history. Task archive provides a final relocation/snapshot, not edit
  history during the brainstorm/research spiral.
- `task.json` is currently read or written throughout the Python lifecycle as the centralized
  business-state object. Its format is an implementation choice, not a product requirement.
- Several `task.json` fields are duplicated projections of existing artifacts: gate reports,
  evidence paths/digests, human decisions, amendment records, and selected artifact pointers
  also exist under `qbd/`, `research/`, or topology artifacts.
- The deployed brainstorm Skill still refers to a missing `omp-flow-wiki` Skill, while the
  expected `omp-flow-verifiable-claims` deployment is also missing. This is evidence of
  naming and deployment drift to investigate, not an implementation request during
  brainstorm.

## Candidate Angles

### A. Spiral Explore over one task-local OKF Bundle

Keep brainstorm and research as distinct operations that alternate inside `phase=explore`.
Treat task-local problem framing, source discovery, evidence, interpretation, and synthesis
as concepts in one OKF bundle. Root Git clones remain an acquisition cache, not another
knowledge tier. Rows later bind stable concept paths or IDs.

This is the current recommendation because it removes repeated transfers while preserving
progressive disclosure, distinct reasoning roles, and traceability.

### B. Keep existing stores and add an OKF index

Retain `brainstorm.md`, `research/`, flat `reference/`, `context/`, and synthesis, then add an
OKF facade over them. This is less disruptive but preserves most duplication and naming
confusion, so it is unlikely to meet the task's purpose.

### C. Repository-wide shared investigation bundle

Move all task investigation into one project-level OKF corpus. This maximizes reuse but
weakens task-local ownership and archive portability. It should not be selected without
evidence that cross-task sharing is the primary need.

## Current and Candidate Trees

### Current task scaffold

```text
<task-id>/
├── brainstorm.md
├── guidance-specification.md
├── research/
│   └── README.md
├── reference/
│   ├── README.md
│   ├── <slug>.<source-ext>
│   └── <slug>.meta.json
├── context/
│   ├── index.json
│   ├── brief/
│   ├── decision/
│   ├── finding/
│   └── interface/
├── prd.md
├── design.md
├── .task/
├── .summaries/
├── qbd/qbd-1/
├── qbd/qbd-2/
├── task.json
├── tasks.csv
├── evidence.csv
├── implement.jsonl
└── check.jsonl
```

The tree mixes authored knowledge, indexes, workflow state, dispatch manifests, and evidence
without a common document convention. `reference/` additionally relies on filename pairing.

### Candidate: task root is the OKF Bundle

```text
<task-id>/                         # OKF Bundle root + workflow control files
├── index.md                       # okf_version + progressive-disclosure navigation
├── brainstorm.md                  # type: Brainstorm
├── research/
│   ├── index.md
│   └── <topic>.md                 # type: Research Finding / Investigation
├── reference/
│   ├── index.md
│   ├── <source-concept>.md        # type: Reference; source and local meaning together
│   └── assets/                    # optional exact source material, only when useful
├── context/
│   ├── index.md
│   ├── brief/
│   ├── decision/
│   ├── finding/
│   └── interface/                 # existing useful category names remain
├── prd.md                         # knowledge concept if it remains a distinct artifact
├── design.md                      # knowledge concept if it remains a distinct artifact
│
├── .task/                         # row handoff/review artifacts; scope to investigate
├── qbd/                           # audit/evidence artifacts, not automatically OKF
├── task.json                      # Python-owned control plane, not OKF
├── tasks.csv                      # Python/architect topology contract, not OKF
├── evidence.csv                   # Python-owned evidence index, not OKF
├── implement.jsonl                # dispatch manifest, not OKF
└── check.jsonl                    # dispatch manifest, not OKF
```

This candidate adds no wrapper directory and preserves useful category names. The meaningful
changes are:

- `index.md` turns the task root and relevant subdirectories into progressive-disclosure
  navigation.
- Authored Markdown becomes self-describing OKF concepts rather than relying on its directory
  alone.
- `reference/<slug>.<ext> + <slug>.meta.json` becomes one readable Reference concept with an
  optional source attachment.
- `context/index.json` can disappear if row bindings safely use concept paths/IDs directly;
  no general YAML parser should be introduced merely to replace it.
- Brainstorm and research update the same bundle in a spiral while remaining different
  concept types and reasoning operations.
- Control/evidence files coexist with the bundle but remain governed by Python and their
  existing deterministic formats.

Open structural questions remain deliberately unresolved: whether `guidance-specification.md`
is useful or duplicate, whether synthesis stays a separately selected artifact, whether row
briefs become OKF concepts, and whether the root external-clone `reference/<repo>` cache should
be renamed or only re-described.

### Candidate: replace `task.json` with a minimal Task concept

The JSON file itself is not necessary if the wider knowledge/control simplification removes
duplicated gate and amendment state. A possible shape is:

```text
<task-id>/
├── index.md                       # reserved OKF bundle index; okf_version only
├── task.md                        # type: Task; minimal authoritative current state
├── qbd/...                        # gate/audit/decision concepts own their own facts
├── research/...                   # selected synthesis is linked, not copied
└── tasks.csv                      # topology state remains separate unless later evidence
                                    # supports replacing it
```

`task.md` would contain only useful task knowledge that cannot be safely derived or found in
the linked bundle. It should not repeat full gate reports, evidence paths, row digests, or
amendment payloads.

The previously considered option of putting JSON syntax in frontmatter and extracting it
with exact delimiter or regular-expression logic is rejected. `task.md` must not become a
machine-state file disguised as Markdown. Research should instead challenge which remaining
Python consumers truly need scalar control state and isolate only that irreducible runtime
need without imposing a grammar on authored Markdown.

### Candidate: replace the CSV/JSONL control matrix with an authored work index

The remaining strong-format files mostly repeat facts that can be owned by a small set of
Markdown concepts and one readable work index:

| Current file | Current purpose | Candidate source of truth |
|---|---|---|
| `tasks.csv` | row definition, exact topology, bindings, mutable status | ordered/grouped links in a work `index.md` |
| `evidence.csv` | append-only review summary/index | linked review/evidence concepts |
| `implement.jsonl` | repository files injected for implementation | Markdown links in the work concept |
| `check.jsonl` | repository files injected for review | Markdown links in the review concept |
| verdict JSON | structured copy of reviewer result | reviewer Evidence concept and its links |

A candidate tree is:

```text
<task-id>/
├── index.md
├── task.md
├── brainstorm.md
├── research/
├── reference/
├── context/
├── prd.md
├── design.md
├── work/
│   ├── index.md
│   ├── simplify-task-state.md
│   └── unify-investigation.md
├── review/
│   ├── index.md
│   └── simplify-task-state.md
└── qbd/
```

`work/` and `review/` above are illustrative groupings, not required names or required
directories. A small task may put the ordered work list directly in the root `index.md` and
link to descriptively named concepts wherever they naturally belong. Directories should
appear only when they improve navigation at the current scale.

There is no directory per row and no requirement that a filename encode identity or
dependencies. `work/index.md` can express the useful execution shape directly and visibly:

```markdown
# Wave 1

- [Simplify task state](simplify-task-state.md)

# Wave 2

- [Unify investigation](unify-investigation.md)
- [Simplify review evidence](../review/simplify-task-state.md)
```

Items in the same group may run together; later groups follow earlier groups. If a future
case requires a relationship more precise than grouped order, the index can state or link it
in normal Markdown. It should not trigger a new encoded-ID grammar by default.

A work item's lifecycle may be derived from its linked artifacts:

```text
work concept only                  -> pending
implementation handoff present     -> review
latest review FAIL                -> needs_fix
latest review PASS                -> completed
explicit retirement concept       -> superseded/cancelled
```

This would make authored concepts and evidence the source of truth instead of keeping them
synchronized with mutable status cells and ledgers. The index is authored navigation and
ordering, not a hidden CSV written in Markdown syntax. Agents follow its normal Markdown
links and meaning directly; Python must not reconstruct a strict topology grammar from it
with regular expressions.

The main risk to investigate is whether every Harness can receive or pull the linked row
context without recreating `implement.jsonl`/`check.jsonl` as another hidden manifest.
Fail-closed dispatch identity and independent reviewer Evidence remain desired outcomes, but
their current storage formats are not assumed to be requirements. If a Harness needs a
stable dispatch identifier, Python may assign an opaque runtime handle; that handle does not
need to control the bundle's folder or file names.

## Constraints and Non-goals

- Do not turn Tier 1/2/3 into required directories, schemas, or state transitions.
- Do not introduce regular-expression extraction, a general YAML/Markdown validator, a
  Markdown DSL, graph-closure rules, or mandatory link/index completeness.
- Do not preserve old `ref:` syntax or flat pair compatibility by default; first establish a
  real consumer that needs it.
- Do not encode one-time migration inventories as permanent tests.
- Prefer direct inspection for visible authored structure and one bounded smoke check for any
  code path that resolves selected concepts into a row handoff.

## Research Topics

- Identify the smallest useful task-local OKF concept set without translating every current
  artifact one-for-one.
- Inventory the wider authored knowledge plane and distinguish it from Python-owned
  lifecycle/control/evidence artifacts before expanding OKF scope beyond investigation.
- Classify every current `task.json` field as irreducible current state, derivable projection,
  or obsolete mechanism; do not translate the object wholesale into Markdown frontmatter.
- Classify every CSV/JSONL field the same way. Do not create Markdown tables or frontmatter
  fields merely to reproduce a legacy column that no remaining consumer needs.
- Trace each consumer that claims to need deterministic Markdown extraction. Remove or
  redesign the consumer instead of constraining the bundle to a regular-expression-friendly
  subset of Markdown.
- Determine whether grouped order in `work/index.md` covers the real execution cases. Only
  retain explicit dependency data for a demonstrated case that grouped order cannot express.
- Determine whether "version control" means OKF format compatibility only or recoverable
  concept history during an active task, because current task directories are gitignored.
- Determine which current `research`, `reference`, `context`, synthesis, render, and binding
  mechanisms can be deleted rather than migrated.
- Separate root Git clone acquisition/cache semantics from task-local knowledge organization
  without another object model.
- Decide whether selected synthesis remains a Python lifecycle pointer, becomes an OKF
  concept, or can be represented by an existing bundle index/view.
- Trace all Harness handoff consumers so the new bundle is loaded once with progressive
  disclosure rather than repeatedly summarized.

## Convergence Notes

- The user explicitly accepted the current architecture direction and authorized moving into
  design. Further exploration should only resolve evidence-backed design boundaries, not reopen
  the rejected schema/parser directions.
- The task is a simplification and naming repair, not an OKF conformance project.
- Do not remove either brainstorm or research. Remove only the assumption that brainstorm
  must finish before research starts or that research cannot return the task to brainstorming.
- The desired sequence is spiral: frame a question, inspect or clone evidence, update the
  same investigation space, reframe from the evidence, investigate again, and converge only
  when the remaining uncertainty no longer changes the chosen direction.
- Git clone belongs to the research operation, but research may begin as soon as brainstorm
  identifies a useful question; it does not wait for a separately approved brainstorm gate.
- Logical provenance must remain understandable, but logical distinctions do not require
  separate physical copies.
- Existing useful directory names are inputs to the OKF organization, not migration targets
  to rename for their own sake.
