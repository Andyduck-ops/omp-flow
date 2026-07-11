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

## Completion

Continue without asking "should I continue?" until all rows complete, a real blocker needs user input, or design/topology must return through a gate. Then load `omp-flow-finish`.

## Red Flags

- Executor output is not completion Evidence.
- Reviewer must not repair substantive findings and approve its own repair.
- Do not mark success when verification did not run.
- Do not paste the whole task history into each assignment.
- Do not bypass failed Hook/context preconditions with a thinner prompt.
