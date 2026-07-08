# Review Standards

> **Purpose**: Define the review pipeline, scoring model, and finding schema used by the omp-flow reviewer skill and the FSM's `S_GRILL` state. A review that does not follow this contract cannot be consumed by the auto-fix loop.

---

## Why a Review Contract?

Reviews in omp-flow are not free-text opinions — they are structured inputs to `S_AUTOFIX`. A finding with the wrong severity or a missing `file`/`lines` field cannot be turned into a fix. This spec makes every review machine-consumable while keeping human judgment in the scoring.

---

## 1. Readiness Scoring — 4 Dimensions

Every review produces a readiness score across four dimensions, each weighted 25:

| Dimension | Weight | What it checks |
|-----------|--------|---------------|
| Completeness | 25 | Does the change cover every item in the task's `## Done When` and every file in `in_scope`? |
| Consistency | 25 | Do the new files follow existing conventions? Any duplicate/contradictory spec entries? |
| Traceability | 25 | Can each change be traced to a prd.md requirement and a context-package artifact? |
| Depth | 25 | Are edge cases, error paths, and FSM state transitions handled, not just the happy path? |

- Each dimension is scored 0–25; total ranges 0–100.
- A dimension scores 0 if its area is untouched despite being in scope; it scores 25 only when fully satisfied with evidence.
- Scores MUST be justified with a one-line rationale per dimension in the review report.

---

## 2. Gate Status

The total readiness score maps to a gate verdict:

| Total | Gate | FSM effect |
|-------|------|-----------|
| ≥ 80% (≥ 80) | **PASS** | FSM advances past `S_GRILL` toward `S_HARVEST` |
| 60–79% | **REVIEW** | FSM enters `S_DECISION_EVAL`; reviewer + debugger negotiate |
| < 60% (< 60) | **FAIL** | FSM enters `S_AUTOFIX` (auto-fix loop, max 3 retries) |

- `PASS` is the only verdict that lets the wave complete without further action.
- `REVIEW` is not a soft pass — it requires an explicit decision (proceed with concerns, or retry).
- `FAIL` triggers the auto-fix loop; after 3 failed retries the FSM escalates to `BLOCKED`.

---

## 3. Finding Schema — 10 Dimensions

Each finding is classified along exactly one of these dimensions:

| # | Dimension | Examples |
|---|-----------|----------|
| 1 | security | untrusted input crossing a trust boundary, secrets in logs |
| 2 | correctness | wrong FSM transition, broken convergence check, off-by-one in wave barrier |
| 3 | performance | O(n²) over the task list, synchronous disk write on the hot path |
| 4 | maintainability | `any`, wrapper function, missing `import type` |
| 5 | testing | missing regression test for a bug fix, tautological test |
| 6 | architecture | new runtime dependency, sixth hook, out-of-band side channel |
| 7 | documentation | spec contradicts code, missing `## Done When` |
| 8 | dependency | non-NodeNext import, dynamic `import()` |
| 9 | ui-ux | (rare in omp-flow core) CLI output formatting regressions |
| 10 | accessibility | (rare in omp-flow core) CLI color contrast for status output |

A finding MUST set exactly one `dimension`. If a defect spans two, pick the more severe and note the secondary in `notes`.

---

## 4. Severity Levels

Ordered highest to lowest:

| Severity | Meaning | Default action |
|----------|---------|----------------|
| `critical` | Breaks the build, corrupts state, or deadlocks a wave | Block; auto-fix loop runs immediately |
| `high` | Violates a spec invariant (e.g., `any` across a public API) | Block until fixed |
| `medium` | Real defect, workaround exists | Fix before yield, but does not block wave |
| `low` | Minor polish | Optional fix; track in accumulated context |
| `info` | Observation, no defect | No action; logged for harvest |

- Severity is set by the reviewer and is subject to the **false-positive budget** (~35% for AI reviewers): every `critical`/`high` finding MUST be verified against the actual code before it blocks. See the Trellis guides index "When Verifying AI Cross-Review Results".

---

## 5. Finding-to-Fix Pipeline

The review pipeline is a fixed data flow — no step may be skipped:

```
reviewer (S_GRILL)
   │  generates  Finding[]
   ▼
sortFindingsBySeverity(Finding[])
   │  critical → high → medium → low → info
   ▼
filterBySeverity(Finding[], threshold)
   │  default threshold: medium and above
   ▼
debugger (S_AUTOFIX)
   │  consumes each Finding → fix → re-check convergence
   ▼
re-review (S_GRILL)
```

- `Finding[]` is the only handoff shape between reviewer and debugger. Free-text review notes are not consumed by the fix loop.
- A Finding without `file` + `lines` (or `symbol`) is dropped by the filter — it cannot become a fix.
- After `S_AUTOFIX` runs, the FSM re-enters `S_GRILL` for a re-review. The readiness score is recomputed; only a `PASS` exits the loop.

---

## 6. Boundary Contract

Every task `prd.md` carries a boundary contract that the reviewer enforces:

| Field | Meaning |
|-------|---------|
| `in_scope` | Files/paths the task is permitted to touch. Changes outside this list are drift. |
| `out_of_scope` | Files/paths explicitly off-limits. Any change here is a `critical` finding. |
| `constraints` | Hard rules the implementation must obey (e.g., "no new dependency", "FSM states unchanged"). |
| `done_when` | The acceptance criteria; mapped 1:1 to the Completeness dimension. |

- A review MUST cite the boundary contract when flagging drift.
- `out_of_scope` violations are always `critical`, regardless of how small the change is.

---

## 7. Drift Check — `matchGlobPattern` against `out_of_scope`

Drift detection runs `matchGlobPattern` of each changed path against the `out_of_scope` glob list:

```
for each changed file in git diff:
    if matchGlobPattern(file, out_of_scope[]):
        emit Finding(severity=critical, dimension=architecture,
                     file=file, message="out-of-scope drift")
```

- Implemented in `src/tools/drift-check-tool.ts` (`executeMaestroBoundaryCheck`).
- Glob patterns follow `.gitignore` semantics (e.g., `src/omp/**`, `*.json` under a given root).
- A drift finding cannot be downgraded — the change must be reverted, not patched.

---

## 8. Reviewer Output Shape

A review report MUST contain:

1. **Readiness score** — four dimensions with per-dimension rationale + total.
2. **Gate verdict** — `PASS` / `REVIEW` / `FAIL`.
3. **Findings** — array of `{ dimension, severity, file, lines, message, notes? }`.
4. **Boundary verdict** — `clean` / `drift detected` + the offending paths.
5. **Traceability map** — each `done_when` item → the file/lines that satisfy it (or `unmet`).

A review missing any of these is itself a `medium` maintainability finding against the reviewer.

---

## 9. When to Update This Spec

- A new Finding dimension is added (rare).
- The readiness weights change (e.g., Depth raised above 25).
- The auto-fix retry ceiling moves off 3.
- The false-positive budget guidance is revised.

Any such change MUST be reflected in `src/core/harvest.ts` and the reviewer skill before this spec is updated — the spec describes the implemented pipeline, not an aspirational one.

---

## Quick Reference

| Concept | Value |
|---------|-------|
| Dimensions × weight | 4 × 25 = 100 |
| PASS | ≥ 80 |
| REVIEW | 60–79 |
| FAIL | < 60 |
| Finding dimensions | 10 |
| Severity order | critical > high > medium > low > info |
| Auto-fix retries | 3 (then BLOCKED) |
| Drift severity | always critical |
| Filter threshold | medium and above |

---

**Related**: [architecture-constraints.md](./architecture-constraints.md) for the invariants this pipeline enforces; [coding-conventions.md](./coding-conventions.md) for the per-rule basis of `maintainability` findings.
