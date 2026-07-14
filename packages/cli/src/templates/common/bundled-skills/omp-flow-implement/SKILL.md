---
name: omp-flow-implement
description: Implement one exact omp-flow row from an accepted handoff. Use inside the native implementation agent, or for explicitly selected inline execution, when phase=execute and the row is pending or needs_fix.
---

# OMP-Flow Implement

## Required Inputs

Fail closed unless all are available:

- explicit parent task ID and full row ID;
- Python-resolved row context;
- committed PRD and Design;
- `.task/{fullId}.implement.md`;
- resolved Reference/context bindings;
- row status `pending` or `needs_fix`.

## Procedure

1. Read the row brief first, then bound context/Reference and relevant existing code/tests.
2. Restate bounded done conditions and verification before editing.
3. Preserve unrelated work and follow existing project patterns.
4. Implement only what the row requires. Report a design contradiction instead of silently redesigning the system.
5. Run focused verification and broader checks required by the brief.
6. Inspect the final diff for scope, generated files, debug residue, and accidental state edits.

## Handoff

Return `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`, plus changed files, commands, test counts, decisions, and caveats. Do not mutate `task.json`, row status, gate files, verdict JSON, `evidence.csv`, or session pointers. Success goes to independent review.

## Red Flags

- "Should work" is not verification.
- Do not widen scope to fix unrelated findings.
- Do not fabricate missing context or Reference.
- Do not spawn another workflow sub-agent.
