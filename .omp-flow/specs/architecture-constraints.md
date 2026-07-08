# Architecture Constraints

> **Purpose**: Encode the non-negotiable architectural decisions of omp-flow. These are the load-bearing invariants; violating any of them silently breaks a multi-agent wave or the FSM.

---

## Why These Constraints?

omp-flow coordinates LLM agents through a fixed pipeline: brainstorm → guidance-spec → context-package → prd → wave-dispatch → review → harvest. Every constraint below exists because breaking it has, in past sessions, produced a wave that deadlocks, an FSM that loops, or a task that can't be reviewed. They are not stylistic preferences.

---

## 1. Zero External Runtime Dependencies

- `package.json` `"dependencies"` MUST be empty. No third-party runtime libraries.
- Allowed `devDependencies`: the TypeScript compiler and the test runner. Nothing else.
- Node built-ins (`fs`, `path`, `crypto`, `url`, `os`) are the only permitted runtime surface.
- Rationale: omp-flow runs inside an AI-agent harness with a frozen dependency tree. A new runtime dependency cannot be audited in-session and breaks the determinism that wave parallelism relies on.
- See [coding-conventions.md §5](./coding-conventions.md) for the matching coding rule.

```bash
# This MUST print an empty dependencies block (or omit it):
grep -A2 '"dependencies"' package.json
```

---

## 2. OMP HookAPI Native — Current Registered Hook Set

omp-flow integrates with the host harness exclusively through the OMP HookAPI. The current registered hook set is **eight** hooks, aligned with `reference/oh-my-pi/docs/hooks.md` as the authoritative runtime surface:

| Hook | Handler | When it fires |
|------|---------|---------------|
| `session_start` | `onSessionStart` | Agent session begins; reads active task + FSM state |
| `before_agent_start` | `onBeforeAgentStart` | Before each subagent is spawned |
| `tool_call` | `onToolCall` | Before/after a tool is invoked by a subagent |
| `context` | `onContext` | Before each LLM call; may inject task-scoped context |
| `agent_end` | `onAgentEnd` | A subagent finishes its runtime loop |
| `agent_complete` | `onAgentComplete` | A subagent reports assignment completion |
| `session_stop` | `onSessionStop` | Agent session ends; may continue with additional context |
| `session_compact` | `onSessionCompact` | Session compaction completed; next context call may re-inject context |

- No out-of-band side channels. If a feature needs lifecycle awareness, it MUST go through a documented OMP hook.
- Each hook MAY append to the JSONL event bus (see §9) but MUST NOT block the host harness synchronously beyond a fast disk write.
- Primary registration lives in `src/omp/extension-entry.ts`; legacy compatibility registration remains in the default export at the bottom of `src/omp/extension.ts`.
- If OMP adds or removes hook events, update this section to match `reference/oh-my-pi/docs/hooks.md` before treating the new surface as a project invariant.

---

## 3. Task as Self-Contained Directory

A task is a directory under `.omp-flow/tasks/{taskId}/` containing its complete lifecycle:

```
.omp-flow/tasks/{taskId}/
├── prd.md                 # requirements + done-when + in/out scope
├── design.md              # (optional) technical design
├── implement.md          # (optional) implementation notes
├── plan.json             # WavePlan: waves[] of TASK-NNN ids
├── task.json             # TaskRecord: status, parent/child links
├── .task/                # atomic TaskDefinition files (TASK-001.json, ...)
└── .summaries/           # completion summaries (TASK-001-summary.md, ...)
```

- A task MUST NOT reference files outside its own directory except via the shared event bus, `state.json`, and the `fsm/` status files.
- Sub-tasks (`TASK-NNN`) are defined in `.task/{id}.json` with `files[]` and `convergence.criteria[]`.
- Parent/child relationships are recorded in `task.json`'s `parentId` / `childIds` fields (see `TaskRecord` in `src/core/state.ts`).
- Archived tasks move under `.omp-flow/tasks/archive/{YYYY-MM}/` wholesale — the directory is the unit of archival.

---

## 4. Wave-Based Parallel Execution

- A `WavePlan` (`src/core/state.ts`) is a `waves[]` array; each wave holds a `tasks[]` list of `TASK-NNN` ids.
- The wave dispatcher (`src/core/fsm.ts`, `S_WAVE_DISPATCH`) reads `plan.json` and the per-subtask `.task/{id}.json` files directly from disk — it does not hold them in memory across waves.
- Within a wave, sub-tasks are dispatched in parallel; the next wave starts only after every sub-task in the current wave reports completion (barrier semantics).
- The FSM records `waveTaskIds` on the active `RalphStatus` so observers can see the in-flight wave.
- A sub-task's `convergence.criteria[]` MUST be satisfied before its wave is considered complete.

---

## 5. Grep-Verifiable Convergence Criteria

Every `TaskConvergence.criteria[]` entry MUST be a string that can be checked with a grep against the produced code — no subjective language.

```jsonc
// GOOD — grep-verifiable
"convergence": {
  "criteria": [
    "src/cli/index.ts contains 'case \\'index\\''",
    ".omp-flow/specs/index.md exists",
    "npm run build exits 0"
  ]
}

// FORBIDDEN — subjective
"convergence": {
  "criteria": ["the index looks good", "code is clean"]
}
```

- The checker (`src/core/convergence-checker.ts`) runs each criterion as a grep / existence / exit-code assertion.
- If a criterion cannot be phrased as a grep or a build exit, it does not belong in `convergence`. Move it to a reviewer Finding instead (see [review-standards.md](./review-standards.md)).

---

## 6. Ralph FSM — 11 States with Auto-Fix Loop

The FSM (`src/core/fsm.ts`) has exactly these states:

| State | Stage | Meaning |
|-------|-------|---------|
| `S_PLANNING_MODE` | planning | Brainstorm/guidance-spec mode |
| `S_PLANNING` | planning | Producing prd.md / context-package |
| `S_DECOMPOSE` | planning | Splitting goals into sub-tasks |
| `S_BUILD_CHAIN` | planning | Building the context handoff chain |
| `S_CREATE_SESSION` | planning | Spawning agent session |
| `S_CONFIRM` | planning | Confirming the plan before dispatch |
| `S_DECISION_EVAL` | gate | Decision gate (pass / retry / concerns / blocked) |
| `S_DISPATCH` | execution | Sequential execution step |
| `S_WAVE_DISPATCH` | execution | Wave-based parallel dispatch |
| `S_AUTOFIX` | fix-loop | Auto-fix loop, max 3 retries |
| `S_GRILL` | review | Reviewer scoring + findings |
| `S_HARVEST` | harvest | Capture lessons into knowhow |

- **Auto-fix loop**: when a review step returns `NEEDS_RETRY`, the FSM increments `autoFixIterations` and enters `S_AUTOFIX`. After **3** retries the FSM escalates to `BLOCKED` rather than looping forever.
- **Decision gates**: a step carrying a `decision` field routes through `S_DECISION_EVAL` and records a verdict in `decisionLog`. The pass path leaves `fsmState` untouched so `advanceNextStep` can re-derive it; non-pass paths persist `S_DECISION_EVAL`.
- The 4 core states (`S_PLANNING | S_DISPATCH | S_GRILL | S_HARVEST`) form the `CoreFSMState` union; the remaining 7 extend it.

---

## 7. Context Handoff Chain

The planning phase produces a strict artifact chain, each stage consuming the previous:

```
brainstorm.md  →  guidance-specification.md  →  context-package.json  →  prd.md
```

- `brainstorm.md` — feature decomposition (F-001, F-002…) and goals, produced by `omp-flow-brainstorm`.
- `guidance-specification.md` — the consolidated spec the architect turns into a plan.
- `context-package.json` — the assembled handoff package (built by `ContextPackageBuilder` in `src/core/context-package.ts`).
- `prd.md` — the per-task requirements with `## Done When` and `## In-Scope` / `## Out-of-Scope`.

Skipping a stage is forbidden. Each stage's output is the next stage's input; the architect MUST NOT author a `prd.md` without a `context-package.json` to ground it.

---

## 8. File Management — Monthly Buckets + Artifact Registry

- **Archive**: completed/abandoned tasks move to `.omp-flow/tasks/archive/{YYYY-MM}/`. The bucket is the calendar month of archival.
- **Artifact registry**: `Artifact` records (`src/core/state.ts`) track lifecycle `created → completed → harvested | failed`, with IDs like `ANL-001`, `BLP-001`.
- **Graduated migration**: when an artifact is harvested, a snapshot is written into the milestone archive (`ArtifactArchiveEntry`) so the original can be pruned without losing the lesson.
- **Pruning**: `omp-flow prune` rotates the JSONL event log and prunes accumulated context against `specs/*.md` content.

---

## 9. Event Bus — JSONL with Idempotency

- All cross-agent events are appended to `.omp-flow/events/events.jsonl`.
- Each event carries an **idempotency key** so a replayed step does not double-record.
- A `.seq` sidecar (`events.jsonl.seq`) holds the monotonic sequence counter.
- Reviewers and harvesters read from this bus; `discoveries.ndjson` is the shared board for cross-agent discoveries surfaced during a wave.
- Events MUST NOT be edited in place — append-only. Correction is a new event.

---

## Quick Reference

| Constraint | Where enforced |
|------------|----------------|
| Zero runtime deps | `package.json`, build gate |
| 5 hooks only | `src/omp/extension.ts` |
| Self-contained task dir | `src/core/state.ts` `TaskRecord` |
| Wave parallel + barrier | `src/core/fsm.ts` `S_WAVE_DISPATCH` |
| Grep-verifiable convergence | `src/core/convergence-checker.ts` |
| 11-state FSM + 3-retry autofix | `src/core/fsm.ts` `FSMState` |
| Context handoff chain | `src/core/context-package.ts` |
| Monthly archive buckets | `.omp-flow/tasks/archive/` |
| JSONL idempotent bus | `.omp-flow/events/events.jsonl` + `.seq` |

---

**Related**: [coding-conventions.md](./coding-conventions.md) for the per-file rules that implement these constraints; [review-standards.md](./review-standards.md) for how violations are caught.
