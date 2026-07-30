# Internal investigation: current task knowledge and control

## Confirmed facts

Task creation builds the knowledge directories and the control artifacts together. The scaffold
writes `task.json`, authored planning documents, `tasks.csv`, `evidence.csv`,
`implement.jsonl`, `check.jsonl`, `context/index.json`, and the `research/` and `reference/`
README files in one operation
(`.omp-flow/scripts/common/task_store.py:70-104`).

The formats are not passive exports:

- task listing, lifecycle, archive, gates, amendment handling, and synthesis selection repeatedly
  read or mutate `task.json` (`.omp-flow/scripts/omp_flow.py:72-319`,
  `.omp-flow/scripts/common/gates.py:112-418`,
  `.omp-flow/scripts/common/amend.py:120-640`);
- topology installation and execution use `tasks.csv`
  (`.omp-flow/scripts/omp_flow.py:319-387`);
- context resolution requires a structured `context/index.json` and rejects an index without an
  `entries` array (`.omp-flow/scripts/common/context.py:55-64`);
- executor and reviewer context are reconstructed from `tasks.csv`, `.task/<row>.implement.md`,
  the applicable JSONL manifest, context-index bindings, and rendered Reference slices
  (`.omp-flow/scripts/common/context.py:128-151`);
- Evidence submission writes a verdict JSON, appends `evidence.csv`, mutates row status in
  `tasks.csv`, and may then mutate the task phase in `task.json`
  (`.omp-flow/scripts/common/evidence.py:35-76`).

Reference digestion normalizes source paths into a generated slug, writes source content and
provenance as a `<slug>.<ext>` / `<slug>.meta.json` pair, and later resolves a separate
semicolon-delimited selector grammar before rendering custom XML blocks
(`.omp-flow/scripts/common/reference.py:41-65`,
`.omp-flow/scripts/common/reference.py:69-108`).

Active task directories are excluded from repository Git history (`.gitignore:14`). Archive is a
relocation of final task files, so it does not provide recoverable edit history during an active
investigation (`.omp-flow/scripts/common/task_store.py:135-149`).

The current Python control plane was introduced by commit `be73ebb`. That change deleted the large
TypeScript context, state, CSV, audit, and Reference engines but seeded the replacement Python
scaffold with the present JSON/CSV/JSONL and paired-Reference formats. This supports treating the
formats as inherited implementation mechanisms rather than independent product requirements.

## Interpretation

The current task directory combines four different concerns:

1. authored knowledge;
2. navigation and context selection;
3. durable workflow decisions and evidence;
4. runtime coordination and mutable lifecycle state.

Several files are synchronized projections of the same event. A reviewer result, for example,
appears as a verdict document, an Evidence ledger row, a topology status mutation, and sometimes a
task phase mutation. Context also passes through research prose, digested slices, indexed context,
row bindings, and rendered handoff blocks.

This creates real migration breadth: deleting a format requires changing its consumers. It does
not justify translating every field into Markdown or designing a Markdown grammar that preserves
the old object model.

## Counter-evidence and constraints

The rigid control plane currently provides useful outcomes: atomic lifecycle updates, explicit
session identity, independent reviewer attribution, fail-closed gate checks, deterministic
dispatch eligibility, and safe archive behavior. Those outcomes must be evaluated separately from
their storage formats.

The design must therefore distinguish semantic knowledge, which an agent can understand directly,
from irreducible mechanical facts that code must coordinate. Simplification is not permission to
silently infer whether an external action occurred.

## Unknowns for design

- Which lifecycle facts cannot be derived from the actual artifacts or the active runtime?
- Which Harness boundaries can receive a bundle entry path and follow links without a generated
  manifest?
- Whether active-task version history should use normal Git, a task-local Git history, or another
  simple recoverable mechanism.
- Whether any real execution graph requires more than authored ordering and grouping.

## Recommendation

Replace synchronized knowledge projections with one task-local semantic document space. Challenge
each remaining Python consumer and keep only demonstrated mechanical guarantees. Do not preserve
the current schemas through Markdown tables, encoded filenames, regular-expression extraction, or
frontmatter-driven state machines.
