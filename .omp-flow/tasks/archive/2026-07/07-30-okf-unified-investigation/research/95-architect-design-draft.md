# Architecture draft: semantic task Bundle with minimal mechanical control

## Scope and decision

Make each task directory one portable OKF v0.2 Bundle. Markdown Concepts, normal relative links,
and authored indexes own task meaning. Python must not parse authored Markdown to reconstruct
workflow state, topology, or relationships.

Keep a separate, repository-local runtime only for facts that cannot safely be inferred from
documents: session-to-task selection, operation identity, actor identity, locking/atomicity,
independent-review correlation, and receipts for external actions.

This is a replacement architecture, not a Markdown translation of the existing schemas. The
current scaffold creates JSON, CSV, JSONL, context-index, and authored documents together
(`.omp-flow/scripts/common/task_store.py:68-104`); current dispatch then joins several of those
stores (`.omp-flow/scripts/common/context.py:123-151`). The target removes that join.

## Observable requirements

1. Opening the task root `index.md` shows the useful task map and links to the current questions,
   evidence, decisions, design, work, and review without consulting a control file.
2. An agent can start from a Bundle root plus one entry Concept, follow normal Markdown links, and
   complete its assignment without a generated JSONL manifest or rendered XML context pack.
3. Updating a conclusion or review does not require synchronizing a CSV status, JSON projection,
   verdict copy, or paired metadata file.
4. Persistent filenames are descriptive. They do not encode dependencies, waves, or machine
   identity. Authored ordering and grouping remain readable prose and lists.
5. Executor/reviewer independence and external-action correlation remain fail-closed mechanical
   guarantees, but do not control Concept names.
6. Copying or archiving the directory preserves a usable knowledge space because its internal
   navigation uses relative links.
7. Active edits have recoverable Git history.
8. Missing optional indexes, unknown Concept types/fields, and broken semantic links are reported
   for the reader but do not invalidate the whole Bundle. This follows OKF's tolerant consumption
   model (`reference/knowledge-catalog/okf/SPEC.md:731-759`).

## Smallest target Bundle

```text
<task-id>/
├── index.md                       # Bundle entry; okf_version: "0.2"; authored map
├── brainstorm.md                  # Concept: questions and evolving hypotheses
├── research/
│   └── semantic-task-bundle.md    # Concept: evidence, interpretation, synthesis
├── prd.md                         # Concept, when requirements need a distinct document
├── design.md                      # Concept, when design needs a distinct document
├── work/
│   └── simplify-control-plane.md  # Concept: assignment, context links, handoff
└── review/
    └── simplify-control-plane.md  # Concept: independent review and evidence
```

Only the root `index.md` is structurally required by this workflow profile. Directories and nested
indexes appear only when they improve navigation. Existing names such as `reference/`, `context/`,
and `qbd/` may remain when they contain useful knowledge, but they are not tiers or mandatory
states. A small task may link flat Concepts directly from the root index.

Every non-reserved Concept uses OKF's minimal `type` signal; its body remains free-form Markdown.
Only the root index declares `okf_version: "0.2"` (`reference/knowledge-catalog/okf/SPEC.md:153-180`,
`:763-777`). Neither frontmatter nor body structure drives the Python lifecycle.

## Ownership boundary

| Concern | Authoritative owner |
|---|---|
| Questions, sources, interpretations, decisions, requirements, design | Markdown Concepts |
| Work ordering, grouping, relationships, useful reading path | Authored indexes, prose, and links |
| Handoff, review conclusion, supporting evidence | Linked work/review Concepts |
| Source provenance | Source link and explanation in the relevant Concept; attachment only when useful |
| Task selected by a Harness session | Repository runtime |
| One dispatch/retry/review operation and its actor | Opaque runtime operation record |
| Reviewer independence | Runtime comparison of executor and reviewer actor identities |
| Locks, atomic writes, external side-effect occurrence/receipt | Runtime |
| Knowledge history and attribution | Git |

The existing session pointer is already correctly outside task knowledge under
`.omp-flow/.runtime/sessions/` (`.omp-flow/scripts/common/active_task.py:37-56`). Atomic replacement
is also an existing reusable mechanical primitive (`.omp-flow/scripts/common/io.py:45-54`).

A runtime operation needs only an opaque operation ID, task locator, entry Concept path, role,
actor/session identity, current mechanical state, predecessor operation when review correlation
requires it, and an optional external-action receipt. This record is not an OKF Concept, is not
linked as knowledge, and must not contain summaries, requirements, topology, or verdict prose.

## Interface and data flow

The Harness dispatch boundary becomes:

```text
task id + role + entry Concept path + short assignment
        ↓
validate session, confined path, operation identity, actor constraints
        ↓
give the agent the Bundle root and entry Concept
        ↓
agent reads the Concept and follows authored links as needed
        ↓
agent writes the handoff or review Concept
        ↓
runtime records only operation completion / receipt
```

The context builder must stop concatenating `tasks.csv`, `.task` briefs, JSONL manifests,
`context/index.json`, and rendered References—the current assembly is visible at
`.omp-flow/scripts/common/context.py:128-151`. A Harness unable to read workspace files may use a
transport adapter that sends the entry Concept, but that adapter must not recreate a global
manifest or claim authority over linked knowledge.

Semantic incompleteness is handled by the agent: state which link or evidence is missing and
continue best-effort when possible. Mechanical ambiguity fails closed: reject an absent/stale
session, escaping entry path, unknown operation, actor mismatch, same executor/reviewer identity,
conflicting active claim, or missing required side-effect receipt. Current session mismatch checks
provide the intended precedent (`.omp-flow/scripts/common/workflow.py:332-359`).

## Consumer deletion and migration order

Each cutover changes the consumer first, then deletes the obsolete producer. Do not maintain old
and new stores as synchronized authorities.

1. **Scaffold and planning entry:** create the root index and typed Concepts; route researcher and
   architect roles through Bundle entry paths.
2. **Context path:** switch executor/reviewer Harnesses to entry-Concept dispatch. Then remove
   `implement.jsonl`, `check.jsonl`, `context/index.json`, custom context packs, Reference selector
   grammar, and paired `<slug>.*` / `<slug>.meta.json` production.
3. **Work coordination:** replace `tasks.csv`, encoded topology IDs, row-status mutation, and row
   freeze projections with authored work Concepts plus opaque runtime operations. The encoded
   dependency grammar is currently concentrated in `.omp-flow/scripts/common/topology.py:10-92`.
4. **Review/evidence:** write one durable review Concept and retain only runtime actor correlation.
   Then remove `evidence.csv` and verdict JSON; today one review is copied into all three plus row
   and task mutations (`.omp-flow/scripts/common/evidence.py:53-76`).
5. **Lifecycle cleanup:** classify remaining `task.json` consumers. Move only irreducible
   coordination to runtime; express durable decisions in Concepts; derive existence from the
   directory and make archive an explicit operation denied while runtime operations are open.
   Delete `task.json` only after listing, gates, finish, archive, and hooks no longer consume it.

## Versioning

Use the repository's normal Git history for authored task Bundles. Remove the blanket active-task
ignore (`.gitignore:14`) and keep `.omp-flow/.runtime/`, acquisition caches, and temporary material
ignored. Git then supplies diffs, attribution, rollback, and rename-aware archive history, while
`okf_version` declares format compatibility rather than document revision.

Do not introduce task-local nested Git repositories or treat `log.md` as a substitute for history.
An optional `log.md` is authored chronology only.

## Proportional verification

The principal proof is one real dogfood task: enter through `index.md`, spiral between brainstorm
and research, dispatch one implementation from a work Concept, perform independent review, and
archive the Bundle. Inspect navigation and document quality directly.

Add focused automated checks only for retained mechanics: confined entry paths, session/operation
identity, atomic runtime updates, independent reviewer rejection, external receipt correlation,
and safe archive with no open operation. Do not test heading names, list shapes, link closure,
filename grammar, or one-time migration inventories.

## Blocking decisions

No semantic-model decision remains blocking. The default versioning decision is main-repository
Git. If project policy refuses to track active task Bundles, implementation must pause and choose
another recoverable history mechanism; silently retaining the current gitignored state would fail
the accepted versioning requirement.
