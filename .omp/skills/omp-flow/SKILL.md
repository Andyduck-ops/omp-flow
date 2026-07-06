---
name: omp-flow
description: Multi-agent workflow orchestration framework integrating Trellis context & Maestro Ralph FSM.
---

# OMP-Flow Core Skill

## Trigger
- Activates on any `/omp-flow:*` slash command dispatched by the OMP runtime.
- Auto-activates when `OMPFlowExtension.onSessionStart` (src/omp/extension.ts:38) detects an active task in `.omp-flow/tasks/.active-task`.
- Re-activates on `session_stop` hook when `RalphFSMEngine.advanceNextStep` returns `isComplete: false`.
- Activates when `state.json` `fsmState` is one of the 15 FSM states defined in `src/core/fsm.ts` (S_PLANNING, S_DISPATCH, S_GRILL, S_HARVEST, S_PARSE_ROUTE, S_RESOLVE_PHASE, S_INFER, S_QUALITY_MODE, S_PLANNING_MODE, S_DECOMPOSE, S_BUILD_CHAIN, S_CREATE_SESSION, S_CONFIRM, S_DECISION_EVAL, S_AUTOFIX).

## Inputs
- `.omp-flow/state.json` — `OMPFlowWorkspaceState` (src/core/state.ts:34): milestone, phase, fsmState, activeWave, goals, tasks, specRules.
- `.omp-flow/tasks/.active-task` — pointer to the current task slug.
- `.omp-flow/fsm/ralph-<sessionId>/status.json` — `RalphStatus` (src/core/fsm.ts:45): steps[], decisionLog[], currentStepIndex, autoFixIterations.
- `.omp-flow/specs/*.md` — active spec rules loaded by `UnifiedWorkspaceManager.getUnifiedState`.
- `.omp-flow/knowhow/harvested-learnings.md` — recent knowhow from `MemoryEngine.getRecentKnowhow`.

## Workflow
1. **Parse command**: Route `/omp-flow:<command>` to the appropriate handler:
   - `/omp-flow:init` → `UnifiedWorkspaceManager.initWorkspace()` (src/core/state.ts:59) creates the `.omp-flow/` tree (specs, tasks, knowhow, scratch, issues, fsm, events, findings, sessions).
   - `/omp-flow:brainstorm [topic]` → delegate to `omp-flow-brainstorm` skill; output to `.omp-flow/tasks/{taskId}/brainstorm.md`.
   - `/omp-flow:plan [intent]` → delegate to `omp-flow-architect` skill; transition FSM to `S_PLANNING`.
   - `/omp-flow:execute` → `RalphFSMEngine.createSession` if none exists, then `advanceNextStep()` (src/core/fsm.ts:153) to dispatch the next step; transition to `S_DISPATCH`.
   - `/omp-flow:continue` → resume by reading `.omp-flow/fsm/ralph-*/status.json` and calling `advanceNextStep()`.
   - `/omp-flow:grill` → delegate to `omp-flow-reviewer` skill; transition to `S_GRILL`.
   - `/omp-flow:harvest` → delegate to `omp-flow-harvester` skill; transition to `S_HARVEST`.
   - `/omp-flow:status` → `executeMaestroState({ action: 'get' })` (src/tools/state-tool.ts:19) returns unified state + Ralph status.
   - `/omp-flow:gaps` → delegate to `omp-flow-debugger` skill for gap analysis.
   - `/omp-flow:events` → `EventBus.tail(20)` (src/core/events.ts:217) for recent events.
   - `/omp-flow:search [query]` → `executeMaestroSpecSearch` (src/tools/spec-search-tool.ts:11) weighted spec search.
   - `/omp-flow:install` → `OMPFlowInstaller.install()` (src/omp/installer.ts:11) provisions `.omp/extensions/omp-flow.ts` + skill files.
2. **Inject context**: `OMPFlowExtension.onSessionStart` builds `<omp-flow-context>` block with active task, milestone, phase, FSM state, current step, spec rules, knowhow breadcrumbs, and boundary contract.
3. **Advance FSM**: `advanceNextStep` prioritizes `running` → `failed` → `pending` steps, builds `priorContext` from the last 5 completed steps (sliding window, src/core/fsm.ts:221), and returns a prompt with step index, skill, args, stage, and retry info.
4. **Dispatch subagent**: `onBeforeAgentStart` (src/omp/extension.ts:98) compiles a `ContextPackage` via `ContextPackageBuilder.buildPackage`, injects boundary contract, prior context, recent discoveries, wave context, and IRC coordination block.
5. **Capture output**: `onAgentComplete` (src/omp/extension.ts:269) appends the subagent's output to `discoveries.ndjson` as an `implementation_note`.
6. **Evaluate completion**: `completeStep` (src/core/fsm.ts:246) records `CompletionStatus` (DONE, DONE_WITH_CONCERNS, NEEDS_RETRY, BLOCKED), routes through `S_DECISION_EVAL` if a decision gate is set, and logs a `DecisionLogEntry`.

## Outputs
- `.omp-flow/state.json` — updated workspace state (phase, milestone, activeWave, goals).
- `.omp-flow/fsm/ralph-<sessionId>/status.json` — updated `RalphStatus` with step statuses and decisionLog.
- `.omp-flow/events/events.jsonl` — appended `OMPFlowEvent` records (19 kinds: task_created, step_advanced, step_completed, step_failed, agent_spawned, agent_completed, boundary_violation, readiness_checked, fsm_transition, etc.).
- `.omp-flow/events/events.jsonl.seq` — monotonic sequence sidecar.
- `.omp-flow/events/discoveries.ndjson` — shared discovery board for cross-agent context.
- Return format: structured JSON from `executeMaestroState` or a human-readable status summary.

## Boundary Contract
- **In-scope**: `.omp-flow/` directory tree (state.json, fsm/, events/, tasks/, scratch/, specs/, knowhow/, findings/, sessions/), `.omp/extensions/omp-flow.ts`, `.omp/skills/*/SKILL.md`.
- **Out-of-scope**: Application source code (`src/`, `lib/`, `app/`), `node_modules/`, `package.json` dependencies, git history.
- **Forbidden**: Modifying source code directly from the core orchestrator (must delegate to executor subagents), deleting `events.jsonl` (append-only), bypassing idempotency checks on `EventBus.append`, forcing FSM transitions that skip `S_DECISION_EVAL` when a decision gate is active.

## FSM Integration
- Operates across all 15 FSM states defined in `FSMState` (src/core/fsm.ts:6).
- Core lifecycle: `S_PLANNING` → `S_DISPATCH` → `S_GRILL` → `S_HARVEST` (the `CoreFSMState` set).
- `advanceNextStep` maps step `stage` to FSM state: planning→S_PLANNING, execution→S_DISPATCH, review→S_GRILL, harvest→S_HARVEST.
- Failed steps trigger `S_AUTOFIX` (src/core/fsm.ts:185); retry_count increments up to `maxAutoFixIterations` (default 3, src/core/fsm.ts:61).
- Decision gates route through `S_DECISION_EVAL` (src/core/fsm.ts:272): quality-gate, goal-gate, scope-gate, reground-gate.
- `transitionTo(nextState)` allows explicit state changes (src/core/fsm.ts:324).
- `isAutoFixExhausted()` (src/core/fsm.ts:335) gates further auto-retry.


## CSV Workflow Enforcement

CSV-driven backlog execution (`.omp-flow/tasks/*/tasks.csv`) follows a strict sequential discipline per row: `pending -> implement -> check -> completed`. The rules below are mandatory — violations degrade trust in the workflow.

### 1. Mandatory Check Before Completed

Every CSV row MUST have an **independent check agent** run BEFORE marking the row `completed`. A row whose implementation finishes but has no check verdict MUST NOT be marked completed. Marking a row completed without check evidence is a workflow violation and triggers warning injection into subsequent agent contexts.

### 2. Check Evidence Requirement

The check agent (dispatched with `reviewer` role) MUST write a structured verdict to `.omp-flow/tasks/{parentTaskId}/.task/{rowId}.json` with at minimum a `result` field containing `"PASS"` or `"FAIL"`. The `assertCheckPassed()` function (src/core/csv-adapter.ts) validates this file exists and contains `PASS` — call it before updating the CSV row status to `completed`.

### 3. CSV Status Visibility

Every dispatched agent receives a `<csv-workflow-status>` block in its context showing the current row's status and how many rows are unchecked. Agents MUST NOT ignore this warning. The block is injected by `onBeforeAgentStart` via `getCSVWorkflowStatus()`.

### 4. Workflow Discipline Rules

Follow this sequence for every CSV row:

1. **Read CSV before dispatch** — call `getCSVWorkflowStatus()` or read `tasks.csv` directly to know which row you are on and its current status.
2. **Dispatch implement agent for the row** — spawn an executor subagent (e.g. `omp-flow-executor`) on the row's target scope.
3. **Dispatch independent check agent** — spawn a separate subagent with a different agent ID and the `reviewer` role. This agent MUST NOT be the same as the implement agent.
4. **Wait for check verdict** — the check agent writes its verdict to `.omp-flow/tasks/{parentTaskId}/.task/{rowId}.json`. Do not proceed until this file exists.
5. **Only mark row `completed` if check verdict is PASS** — call `assertCheckPassed()` to validate the verdict before writing `completed` to the CSV.
6. **If check FAILS** — do not mark the row completed. Retry (dispatch a fix agent then re-check) or escalate to human.

### 5. Violation Detection

The `getCSVWorkflowStatus()` function scans the active task's CSV and `.task/` directory to detect rows that are marked `completed` or `in_progress` but lack a check verdict file. If `unchecked > 0`, a warning is injected into all subsequent agent contexts via `<csv-workflow-status>`. This makes violations visible and prevents silent progression.
## Coordination
- **IRC**: Subagents receive `<irc-coordination-context>` block (src/omp/extension.ts:139) with agent ID and messaging protocol. Direct-message siblings via `irc(op="send", to="<PeerId>")`, broadcast wave-wide via `to="all"`.
- **discoveries.ndjson**: `EventBus.appendDiscovery` (src/core/events.ts:237) writes typed entries (implementation_note, pattern, code_pattern, degradation_event, finding) with dedup keys. `recentDiscoveries(5)` injects the last 5 into each new subagent.
- **priorContext**: `buildPriorContext(status, 5)` (src/core/fsm.ts:221) builds a `<prior-step-context>` block from the last 5 completed steps, including caveats (⚠️), decisions (📌), and deferred items (⏭️).
- **Wave context**: `buildWaveContext(activeWave)` (src/omp/extension.ts:174) injects prior-wave findings for cross-wave propagation.
- **EventBus**: All state transitions emit `fsm_transition` events; agent lifecycle emits `agent_spawned`/`agent_completed`; boundary checks emit `boundary_violation`/`readiness_checked`.
