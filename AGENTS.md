# AGENTS.md — omp-flow Engineering Guide

omp-flow is a project-local workflow methodology with portable task knowledge and a small
deterministic runtime kernel.

## Ownership boundary

- Task meaning belongs in one Git-tracked OKF v0.2 Bundle under `.omp-flow/tasks/<task>/`.
- Markdown Concepts, authored indexes, prose, placement, and ordinary relative links carry
  purpose, investigation, provenance, requirements, design, grouping, decisions, handoffs,
  reviews, audits, and human approval.
- Python owns only session selection, path confinement, actor/process correlation, locks, atomic
  side effects, opaque operation receipts, and requested create/archive moves.
- Harnesses own models, native agent spawn, concurrency, progress, cancellation, identity, and UI.
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

Runtime state is ignored under `.omp-flow/.runtime/`. The stable CLI is
`.omp-flow/scripts/omp_flow.py`:

```text
status
task create|list|current|select|show|archive|clear
workflow state
operation start|show|list|finish
```

Every assignment names the Bundle, role, bounded objective, entry Concept, output boundary, actor
ID, opaque receipt, optional predecessor, and verification. `operation start` is the sole producer
of the executable assignment. Forward its complete assignment unchanged as the native task item;
the strict v1 descriptor stays the first non-blank line. Do not parse, rewrite, summarize, or
reconstruct it.

Review operations require a completed same-task predecessor and a different actor. Agents write
linked handoff/review Concepts; Python records only mechanical operation correlation and never
parses the verdict.

## Authoritative source

- `templates/.omp-flow/workflow.md` — workflow semantics.
- `templates/.omp-flow/scripts/omp_flow.py` and `common/{active_task,io,operation_store,paths,task_store}.py`
  — portable runtime kernel.
- `src/cli/` — installation and update.
- `src/omp/extension.ts` — thin OMP adapter.
- `templates/common/skills/` — the single shared Skill source, deployed to universal
  `.agents/skills/` and each selected Harness-native Skill root.
- `templates/{omp,codex,claude}/` — native adapter resources.
- `tests/omp-flow.test.ts` — focused mechanical contract tests.

The deployed project copies may be customized downstream. Update canonical template and tracked
project copies together when both are owned by the change. Never modify the live deployed Python
runtime while it is coordinating an in-flight pre-cutover task.

## Editing and verification

- Use `apply_patch` for manual edits and preserve unrelated user changes.
- Python remains stdlib-only and UTF-8-safe on Windows.
- Use structured parsers for runtime JSON/TOML; do not parse authored Markdown semantics.
- Missing required entries, unsafe paths, stale sessions, identity mismatches, duplicate external
  receipts, and failed moves fail visibly without manufacturing semantic state.
- Task Bundles and archives are Git-visible; `.runtime/` and `cache/repos/` are ignored.

Run:

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```
