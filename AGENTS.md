# AGENTS.md — omp-flow Engineering Guide

omp-flow is a project-local workflow methodology with portable task knowledge and a small
deterministic runtime kernel.

## Ownership boundary

- Task meaning belongs in one Git-tracked OKF v0.2 Bundle under `.omp-flow/tasks/<task>/`.
- Markdown Concepts, authored indexes, prose, placement, and ordinary relative links carry
  purpose, investigation, provenance, requirements, design, grouping, decisions, handoffs,
  reviews, audits, and human approval.
- Python owns validated WorkScope selection from an explicit Task/workspace pair, or a valid local
  marker only where a command permits omitted Task input; it also owns path confinement,
  actor/process correlation, locks, atomic side effects, opaque operation receipts, and requested
  create/archive moves.
- Harnesses own models, native agent spawn, concurrency, progress, cancellation, native identity,
  and UI.
- Platform adapters stay thin and must not reconstruct task knowledge.

Do not add a lifecycle database, exact-topology IDs, Evidence ledger, context renderer, Reference
selector, Markdown parser, compatibility reader, dual write, custom dispatcher, or one-to-one
replacement for a retired schema.

## Workflow

```text
task Bundle
  → brainstorm ↔ research / Reference Concepts
  → selected synthesis → PRD / Design
  → independent QbD 1 audit → linked human decision
  → authored work map and bounded work Concepts
  → independent QbD 2 audit → linked human decision
  → native implementation → linked handoff
  → independent review → linked Review Concept
  → integration / knowledge harvest / commit / archive
```

This is a reasoning direction, not machine phase state. Evidence can return work to framing or
design. A model PASS is not human approval, and executor success is not reviewer acceptance.

## Bundle contract

A new task starts with:

```text
.omp-flow/tasks/<task>/
├── index.md       # declares okf_version: "0.2"; authored navigation
├── task.md        # purpose and durable task identity
└── brainstorm.md  # questions, hypotheses, alternatives, reframing
```

Add descriptive Concepts and directories only when useful. A larger task may use `research/`,
`reference/`, `context/`, `work/`, `review/`, and `qbd/`, plus `prd.md` and `design.md`. These names
do not imply a required tier or schema. Concept bodies are free Markdown; OmpFlow does not parse
headings, list shapes, filenames, links, or arbitrary frontmatter into workflow state.

External clones belong in ignored `.omp-flow/cache/repos/`. A Reference Concept stores the exact
URL/revision, useful anchors, local interpretation, caveats, and ordinary links. Do not create
paired metadata or copied tiers.

## Runtime and assignment contract

Runtime state is ignored under `.omp-flow/.runtime/`. The stable portable CLI is
`.omp-flow/scripts/omp_flow.py`:

```text
task create
task list
task open <task> [--workspace <path>] --replace
task show <task> [--workspace <path>]
task archive <task> [--workspace <path>]
operation start|show|list|finish
sleep start|show|list|finish
index [all|wiki|tasks|<task>]
```

This is the complete retained portable inventory; no other top-level command family is retained.
`task create` is Bundle-only: it creates no WorkScope, marker, operation, or session state. A valid
local marker is only a convenience default for omitted Task input where the named command permits
it; it never overrides an explicit validated Task/workspace pair.

`task open` validates the Task and canonical workspace before any mutation. Opening the same pair is
idempotent; `--replace` is the explicit option for atomically replacing a different local marker,
and validation always precedes that replacement. `task archive` removes a marker only when it still
names the archived `{taskId, workspaceRoot}` pair.
Opening a WorkScope succeeds from that validated pair without a host attachment or native session.

Every `operation start|show|list|finish` command resolves an explicit WorkScope or only the
permitted valid local-marker default before reading or writing the current worktree's operation
store. Operation protection is the actor plus opaque receipt in that worktree; a session cannot
select, finish, replace, reuse, or claim an operation. The strict v1 `ompFlowDispatch` descriptor
remains the first non-blank assignment line and contains exactly `actorId`, `bundle`, `entry`,
`objective`, `output`, `predecessor`, `predecessorOutput`, `receipt`, `role`, and `version`.

`sleep start|show|list|finish` operates on explicit archived-source and Sleep-run receipts.
`index [all|wiki|tasks|<task>]` regenerates `index.md` navigation maps from Markdown Concept YAML
frontmatter (`type`, `title`, `description`, `tags`, and optional `status`).
The retired `task current`, `task select`, `task clear`, bare selector-backed `status`,
`workflow state`, and `task create --no-start` commands have no alias or fallback. This release
has no attachment/takeover interface or coordinator machinery, and no session-derived Task
selection.

Every assignment names the Bundle, role, bounded objective, entry Concept, output boundary, actor
ID, opaque receipt, optional predecessor, and verification. `operation start` is the sole producer
of the executable assignment. Forward its complete assignment unchanged as the native task item;
the strict v1 descriptor stays the first non-blank line. Do not parse, rewrite, summarize, or
reconstruct it.

Review operations require a completed same-task predecessor and a different actor. Agents write
linked handoff/review Concepts; Python records only mechanical operation correlation and never
parses the verdict.

## Authoritative source

- `templates/.omp-flow/workflow/index.md` and `templates/.omp-flow/workflow/full-delivery.md` —
  canonical Workflow Library semantics and the Task-first authority contract.
- `templates/.omp-flow/scripts/omp_flow.py` and `common/{io,operation_store,paths,task_store}.py`
  — portable runtime kernel.
- `src/cli/` — installation and update.
- `src/omp/extension.ts` — thin OMP adapter.
- `templates/common/skills/` — the single shared Skill source, deployed to universal
  `.agents/skills/` and each selected Harness-native Skill root.
- `templates/{omp,codex,claude}/` — native adapter resources.
- `tests/omp-flow.test.ts` — focused mechanical contract tests.

The managed-deployment Work alone reproduces the tracked deployed Workflow from these canonical
sources and proves byte-equivalence. This contract Work edits no deployed copy. Deployed project
copies may be customized downstream only where their ownership is explicit; never modify the live
runtime while it is coordinating an in-flight pre-cutover task.

## Editing and verification

- Use `apply_patch` for manual edits and preserve unrelated user changes.
- Python remains stdlib-only and UTF-8-safe on Windows.
- Use structured parsers for runtime JSON/TOML; do not parse authored Markdown semantics.
- Missing required entries, unsafe paths, stale markers, invalid WorkScopes, identity mismatches,
  duplicate external receipts, and failed moves fail visibly without manufacturing semantic state.
- Task Bundles and archives are Git-visible; `.runtime/` and `cache/repos/` are ignored.

Run:

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```
