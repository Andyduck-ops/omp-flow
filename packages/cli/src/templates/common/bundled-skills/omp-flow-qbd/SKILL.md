---
name: omp-flow-qbd
description: Coordinate an independent Quality-by-Design gate for omp-flow. Use in phase=qbd1 or phase=qbd2 after Python prepares a bounded audit, and before recording the required human calibration decision.
---

# OMP-Flow QbD

## Gate Meaning

- QbD 1 challenges whether the selected problem, requirements, design, Reference, and contracts are justified.
- QbD 2 challenges whether exact topology, every row brief, bindings, scope, ordering, and verification can realize the approved design.
- Python validation checks structure. The QbD auditor applies adversarial judgment. The human calibrates the result. None replaces another.

## Procedure

1. Confirm the phase and run `omp-flow gate prepare qbd1|qbd2`.
2. Use the exact audit path and bounded evidence returned by Python. Do not create an alternate report name.
3. Dispatch one independent native `qbd-auditor`. Pass gate number, task ID, prepared artifact paths/digest, and the rule that it writes only the reserved audit report.
4. Require explicit `PASS`, `FAIL`, or `NEEDS_EVIDENCE`, with blocking findings, evidence anchors, and required remediation.
5. Run `omp-flow gate inspect qbd1|qbd2`. A malformed report or stale digest is a failure, not a warning.
6. Present the inspected result and material findings to the user. Only the user decides calibration.
7. Record that decision through `omp-flow gate decide ... --decision pass|reject --note "..."`.

## Delta Audit (Amendment)

An amendment to an already-frozen topology runs a scoped `qbd2-delta` audit instead of a whole-topology QbD 2. `omp-flow topology amend prepare` packages the evidence bundle: the proposal, the changed row briefs, the FULL current tasks.csv, and the asserted `designDigest` (plus `prd.md`/`design.md` for an `edit-design`). The auditor report frontmatter must carry `gate: qbd2-delta`, `verdict`, `risk`, and the exact `evidenceDigest`. Judge the change on its merits but confirm it stays consistent with the frozen topology (dependencies, waves, no conflict with completed rows). `omp-flow topology amend inspect` parses the verdict; a PASS still requires the human `omp-flow topology amend decide --decision pass`. Delta attempts are capped at 3, independent of the main qbd2 attempt.

## Transitions

- QbD 1 human PASS -> load `omp-flow-decompose`.
- QbD 2 human PASS -> topology freezes and task becomes `ready`; load `omp-flow-execute`.
- FAIL, NEEDS_EVIDENCE, or human reject -> return to the owning research/design/decomposition phase, repair artifacts, prepare a new audit, and repeat.

## Red Flags

- Never infer human approval from earlier design discussion.
- Never edit gate pointers, digests, decisions, or verdict state manually.
- Never let the author audit its own output.
- Never add fallback parsing for a malformed audit.
