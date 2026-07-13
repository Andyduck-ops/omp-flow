---
name: omp-flow-execute
description: Coordinate native implementation and independent review waves for an approved omp-flow topology. Use in phase=ready or phase=execute to dispatch ready rows, process handoffs, and advance only through Python-owned evidence.
---

# OMP-Flow Execute

## Start

If Python reports `phase=ready`, run `omp-flow task start`. Do not start when a gate is stale, topology is unfrozen, or validation fails.

## Implementation Loop

1. Run `omp-flow topology ready --role executor`.
2. Dispatch only returned rows with Harness-native `task`. Parallelize only rows in the same ready wave whose scopes do not conflict.
3. Use the native `executor`/`omp-flow-implement` role. Pass parent task ID, exact row ID, bounded objective, and artifact paths. Let OMP push or Codex pull authoritative Python context.
4. Require the Implementer to inspect existing patterns, stay in scope, run row verification, and report files/tests/results/caveats. It must not edit workflow state or Evidence.
5. After credible success, run `omp-flow topology mark-result --row <id> --result success`. Failure uses `--result failure` and leaves the row in `needs_fix`.

## Independent Review Loop

1. Run `omp-flow topology ready --role reviewer`.
2. Dispatch a fresh Reviewer independent of the Implementer. Pass task ID, row ID, native reviewer agent ID, report path, and required verification.
3. Reviewer reads the real diff and design, runs checks, and writes `.task/{fullId}.review.md`.
4. Reviewer calls `omp-flow evidence submit` with verdict, test counts, report path, evidence summary, and exact reviewer agent ID.
5. Python transitions PASS to `completed` and FAIL to `needs_fix`. Never hand-edit status, verdict JSON, or `evidence.csv`.
6. Re-run ready queries. Dependents unlock only after exact dependencies have current PASS Evidence.

## Found a Problem Mid-Execution -> Which Path?

The topology is append-only frozen after QbD 2. Never hand-edit tasks.csv, a completed row, or its Evidence. Route the correction by scope:

| Problem | Path |
|---|---|
| One not-completed row's brief is wrong | Amendment with `edit-brief` |
| Add a row, or retire a not-completed row | Amendment with `add-row` / `supersede` |
| PRD/Design is wrong | Amendment with `edit-design` + `valid-completed:` impact |
| Drift too large / amendment cap reached | `omp-flow task rework` (full re-audit) |
| Stuck qbd gate (stale / attempts exhausted) | `omp-flow gate reset` |

An amendment keeps `phase=execute` throughout. Only one amendment may be open at a time. Exact sequence:

1. `omp-flow topology amend propose --reason "..."` creates `qbd/qbd-2/amend-NNN/proposal.md`.
2. Fill the proposal's Change Set and Impact Statement. Edit any changed briefs (and `prd.md`/`design.md` for `edit-design`) on disk first. For `edit-design`, declare surviving completed rows with `valid-completed: <ROW-ID>` lines (use `valid-completed: none` if none survive).
3. `omp-flow topology amend set-change --change '[{"op":"edit-brief","id":"B-001"}]'` (ops: `add-row`, `supersede`, `edit-brief`, `edit-design`).
4. `omp-flow topology amend prepare` packages the scoped delta evidence and reserves `qbd/qbd-2/amend-NNN/audit-NNN.md`.
5. Dispatch the delta audit, then `omp-flow topology amend inspect`.
6. Present findings; the user decides via `omp-flow topology amend decide --decision pass|reject --note "..."`.

On PASS the change set applies: completed-row Evidence is preserved, affected digests recompute, and any completed row not listed `valid-completed:` under an `edit-design` downgrades to `needs_fix`. Editing a completed row's brief is forbidden; superseding a completed row requires a filled Impact Statement.

## Completion

Continue without asking "should I continue?" until all rows complete, a real blocker needs user input, or design/topology must return through a gate. Then load `omp-flow-finish`.

## Red Flags

- Executor output is not completion Evidence.
- Reviewer must not repair substantive findings and approve its own repair.
- Do not mark success when verification did not run.
- Do not paste the whole task history into each assignment.
- Do not bypass failed Hook/context preconditions with a thinner prompt.
