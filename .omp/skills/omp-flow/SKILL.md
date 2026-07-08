---
name: omp-flow
description: Multi-agent workflow orchestration framework integrating Trellis context & Maestro Ralph FSM.
---

# OMP-Flow Core Skill

## Trigger
- Activates on any `/omp-flow:*` slash command dispatched by the OMP runtime.
- Auto-activates when `OMPFlowExtension.onSessionStart` (src/omp/extension.ts:56) loads the active workspace state and injects the per-turn workflow breadcrumb.
- Re-activates on `session_stop` hook when `RalphFSMEngine.advanceNextStep` returns `isComplete: false`.
- Activates when `state.json` / `fsm/status.json` `fsmState` is one of the 16 FSM states defined in `src/core/fsm.ts` (S_PLANNING, S_DISPATCH, S_GRILL, S_HARVEST, S_PARSE_ROUTE, S_RESOLVE_PHASE, S_INFER, S_QUALITY_MODE, S_PLANNING_MODE, S_DECOMPOSE, S_BUILD_CHAIN, S_CREATE_SESSION, S_CONFIRM, S_DECISION_EVAL, S_AUTOFIX, S_WAVE_DISPATCH).

## Inputs
- `.omp-flow/state.json` — host-managed `OMPFlowWorkspaceState` state plane (src/core/state.ts:186): milestone, phase, fsmState, activeWave, goals, tasks, specRules. Agents read this through injected context/tools; they MUST NOT edit it directly.
- `.omp-flow/fsm/ralph-<sessionId>/status.json` — host-managed `RalphStatus` state plane (src/core/fsm.ts:92): steps[], decisionLog[], currentStepIndex, retry/blocked metadata. Agents MUST NOT write `fsm/status.json` directly.
- `.omp-flow/tasks/.active-task` — pointer to the current task slug.
- `.omp-flow/tasks/{taskId}/tasks.csv` — control-plane task index: row id, status, role/tier, topology ID, and Markdown/data-plane references. Host tools own status writes.
- `.omp-flow/tasks/{taskId}/evidence.csv` — control-plane evidence index appended by host after reviewer verdict submission.
- `.omp-flow/tasks/{taskId}/.task/{rowId}.implement.md` — data-plane implementation brief. Executor consumes this as the canonical Task Brief; missing file is Fail-Closed.
- `.omp-flow/tasks/{taskId}/.task/{rowId}.review.md` / `.task/{rowId}.verdict.json` — data-plane review notes and host-generated verdict artifact.
- `.omp/agents/*.md` - OMP-native static role specs (`executor.md`, `reviewer.md`) with `tools` frontmatter whitelist injected by Hook as Role Definition. Canonical roles are exactly `executor`, `reviewer`, `qbd-auditor`, `architect`, `explore`, `planner`, `oracle`, and `researcher`; no legacy fallback exists.
- `context/**/*.md` — context-plane ADR / interface contracts produced by Architect and read-only for executors/reviewers.
- CSV `context` and `reference` columns — index columns resolved by the Hook into Curated Context, replacing ad-hoc `context-manifest.jsonl` handoff.
- `.omp-flow/specs/*.md` and `.omp-flow/knowhow/harvested-learnings.md` — global spec and memory material loaded into the session breadcrumb when present.

## Workflow
1. **Parse command**: Route `/omp-flow:<command>` to the appropriate handler:
   - `/omp-flow:init` → `UnifiedWorkspaceManager.initWorkspace()` (src/core/state.ts:217) creates the `.omp-flow/` tree and host-managed state plane.
   - `/omp-flow:brainstorm [topic]` → delegate to `omp-flow-brainstorm` skill; output to `.omp-flow/tasks/{taskId}/brainstorm.md`.
   - `/omp-flow:plan [intent]` → delegate to `omp-flow-architect` skill; transition FSM to `S_PLANNING`.
   - `/omp-flow:execute` → `RalphFSMEngine.createSession` (src/core/fsm.ts:231) if none exists, then `advanceNextStep()` (src/core/fsm.ts:627) to dispatch the next topology-ready step; transition to `S_DISPATCH` / `S_WAVE_DISPATCH` as needed.
   - `/omp-flow:continue` → resume by reading `.omp-flow/fsm/ralph-*/status.json` through host APIs and calling `advanceNextStep()`.
   - `/omp-flow:grill` → delegate to `omp-flow-reviewer` skill; transition FSM to `S_GRILL`.
   - `/omp-flow:harvest` → delegate to `omp-flow-harvester` skill; transition to `S_HARVEST`.
   - `/omp-flow:status` → `executeMaestroState({ action: 'get' })` (src/tools/state-tool.ts:14) returns unified state + Ralph status.
   - `/omp-flow:gaps` → delegate to `omp-flow-debugger` skill for gap analysis.
   - `/omp-flow:events` → `EventBus.tail(20)` (src/core/events.ts:260) for recent events.
   - `/omp-flow:search [query]` → `executeMaestroSpecSearch` (src/tools/spec-search-tool.ts:11) weighted spec search.
   - `/omp-flow:install` → `OMPFlowInstaller.install()` (src/omp/installer.ts:11) provisions `.omp/extensions/omp-flow.ts` + skill files.
2. **Inject workflow-state breadcrumb**: `OMPFlowExtension.onSessionStart` (src/omp/extension.ts:56) appends a compact `<omp-flow-context>` / `<workflow-state>` style breadcrumb with active task, milestone, phase, FSM state, current step, active wave, spec rules, knowhow, verify commands, and boundary contract.
3. **Advance FSM**: `advanceNextStep()` prioritizes `running` → `failed` → `pending`, applies retry/escalation rules, builds `priorContext` from the last 5 completed steps (src/core/fsm.ts:738), and returns the next role/stage prompt.
4. **Assemble subagent prompt**: `onBeforeAgentStart` (src/omp/extension.ts:115) runs the Semi-Automated Hook Assembly Engine. Orchestrator supplies scheduling metadata and optional Local Guidance; it does not hand-write long assignments.

   Hook output MUST use five labeled divider layers:

   ```text
   ─── omp-flow: Role Definition (from .omp/agents/{role}.md) ───
   {static role spec from .omp/agents/{role}.md}

   ─── omp-flow: Global Context (prd.md + design.md) ───
   {full PRD + full Design; omission is fatal}

   ─── omp-flow: Curated Context (ADR / Interface refs from CSV context column) ───
   {context/**/*.md and CSV reference material}

   ─── omp-flow: Task Brief ({rowId}.implement.md) ───
   {canonical implementation brief}

   ─── omp-flow: Local Guidance (Orchestrator) ───
   {short run-specific constraints, usually empty}
   ```

   Fail-Closed rule: if `.omp-flow/tasks/{taskId}/.task/{rowId}.implement.md` is missing or empty for an executor/reviewer row, the Hook MUST block subagent start instead of falling back to prompt-only execution.
   Canonical role definitions live only under `.omp/agents/{role}.md`. The eight canonical roles are `executor`, `reviewer`, `qbd-auditor`, `architect`, `explore`, `planner`, `oracle`, and `researcher`. Row-bound dispatch uses `executor`, `reviewer`, and `qbd-auditor`; support sessions use Pattern 14 tool pruning for `architect`, `explore`, `planner`, `oracle`, and `researcher`.
5. **Dispatch by topology**: Schedule rows whose prefix dependencies are satisfied, route each UnitLetter to its isolated worktree, and inject IRC + CSV workflow status into the assembled prompt. Use `omp_flow_dispatch(rowId, role)` for row-bound roles (`executor`, `reviewer`, `qbd-auditor`) needing five-layer assembly; use Pattern 14-pruned native `task(agent, assignment)` sessions for support roles (`explore`, `planner`, `oracle`, `researcher`) without curated row context.
6. **Capture output**: `onAgentComplete` (src/omp/extension.ts:459) records lifecycle events and appends concise implementation notes to `discoveries.ndjson` for cross-agent context.
7. **Evaluate completion**: `completeStep` (src/core/fsm.ts:850) records `CompletionStatus` (DONE, DONE_WITH_CONCERNS, NEEDS_RETRY, BLOCKED), routes decision gates through `S_DECISION_EVAL`, and logs `DecisionLogEntry` records.

## Outputs
- `.omp-flow/state.json` — host-updated workspace state (phase, milestone, activeWave, goals); state-plane file, not agent-editable.
- `.omp-flow/fsm/ralph-<sessionId>/status.json` — host-updated `RalphStatus` with step statuses, current wave, retry metadata, and decisionLog.
- `.omp-flow/tasks/{taskId}/tasks.csv` — host-updated control-plane row statuses; agents MUST NOT edit directly.
- `.omp-flow/tasks/{taskId}/evidence.csv` — host-appended evidence rows generated from reviewer `omp_flow_submit_verdict` calls.
- `.omp-flow/tasks/{taskId}/.task/{rowId}.verdict.json` — host-generated verdict artifact paired with Markdown review evidence.
- `.omp-flow/events/events.jsonl` and `.omp-flow/events/events.jsonl.seq` — append-only event log and monotonic sequence sidecar.
- `.omp-flow/events/discoveries.ndjson` — shared discovery board for cross-agent context.
- `worktrees/{UnitLetter}/` — per-topology-unit execution worktree when parallel code-writing rows are dispatched.
- Return format: structured JSON from `executeMaestroState` or a concise human-readable status summary.

## Boundary Contract
- **In-scope**: `.omp-flow/` directory tree (state.json, fsm/, events/, tasks/, scratch/, specs/, knowhow/, findings/, sessions/, agents/, context/), `.omp/extensions/omp-flow.ts`, `.omp/skills/*/SKILL.md`, and topology worktrees created by the orchestrator.
- **Out-of-scope**: Application source code (`src/`, `lib/`, `app/`) for the core orchestrator itself, `node_modules/`, `package.json` dependencies, git history.
- **Forbidden**: Modifying application source code directly from the core orchestrator (must delegate to executor subagents), agent direct-edits to host-owned `tasks.csv`, `evidence.csv`, `state.json`, or `fsm/status.json`, deleting `events.jsonl` (append-only), bypassing idempotency checks on `EventBus.append`, forcing FSM transitions that skip `S_DECISION_EVAL` when a decision gate is active.

## FSM Integration
- Operates across all 16 FSM states defined in `FSMState` (src/core/fsm.ts:9), including topology-aware `S_WAVE_DISPATCH`.
- Core lifecycle: `S_PLANNING` → `S_DISPATCH` / `S_WAVE_DISPATCH` → `S_GRILL` → `S_HARVEST` (the `CoreFSMState` set plus wave dispatch).
- `state.json` and `fsm/ralph-<sessionId>/status.json` are State Plane artifacts: host APIs update them, agents receive read-only breadcrumbs.
- `advanceNextStep()` maps step `stage` to FSM state and returns the next schedulable step (src/core/fsm.ts:627); topology scheduling may fan out ready CSV rows inside the dispatch phase.
- Failed steps trigger `S_AUTOFIX` through `enterAutofix()` (src/core/fsm.ts:687); retry_count increments up to `maxAutoFixIterations` / `maxRetries=3` before human escalation.
- Decision gates route through `S_DECISION_EVAL` (src/core/fsm.ts:928): quality-gate, goal-gate, scope-gate, reground-gate, structural, plus QbD approval gates.
- `transitionTo(nextState)` allows explicit host-controlled state changes (src/core/fsm.ts:1046).
- `isAutoFixExhausted()` (src/core/fsm.ts:1081) gates further auto-retry.


## Topology Naming & DAG Scheduling

Task IDs encode dependency topology directly. Format: `[UnitLetter]-[DependencyLetters]-[Sequence]`, for example `A-001` (unit A, no dependency), `C-A-001` (unit C depends on A), and `C-AB-001` (unit C depends on A and B).

- FSM scheduler parses the ID prefix letters to build the in-memory DAG and compute ready waves; CSV no longer needs a separate `dependsOn` column.
- The current UnitLetter is the first segment before the first dash; dependency Units are the optional middle letter group.
- Same UnitLetter rows execute inside the same isolated Git Worktree, e.g. `worktrees/A/`, while different ready UnitLetters can run concurrently without physical file conflicts.
- Merge/review waits until dependency Units have completed and their evidence rows pass before downstream Units become schedulable.

## Dual QbD Gates

QbD gates are LLM audit + human approval barriers before implementation starts:

1. **Phase 1: 概要设计** — Architect produces `prd.md` + `design.md`; QbD 1 auditor reviews global boundary, technical choice risk, and spec compliance; human approval gate 1 must pass before detailed planning.
2. **Phase 2: 详细设计** — Architect produces `tasks.csv` + all `.task/F-*.implement.md` briefs; QbD 2 auditor reviews instruction clarity, interface-contract alignment, and DAG acyclicity; human approval gate 2 locks design and activates task rows.

Each QbD gate uses `maxRetries=3`: failed audit findings go back to Architect for revision; after three failed loops, escalate to human instead of silently weakening the contract.

## Orchestrator Stability

Stability is enforced by three layers: per-turn `<workflow-state>` breadcrumb injection keeps the orchestrator grounded, per-agent recursion guards in `.omp/agents/*.md` prevent same-type agent self-spawn loops, and global `AGENTS.md` constraints define repository-wide behavioral hard lines.

## CSV Workflow Enforcement

CSV-driven backlog execution (`.omp-flow/tasks/*/tasks.csv`) follows a strict host-controlled row lifecycle: `pending -> in_progress -> check -> completed`. The rules below are mandatory — violations degrade trust in the workflow.

### 1. Mandatory Check Before Completed

Every CSV row MUST have an **independent check agent** run BEFORE the host marks the row `completed`. A row whose implementation finishes but has no submitted review verdict MUST NOT be completed. Marking a row completed without tool evidence is a workflow violation and triggers warning injection into subsequent agent contexts.

### 2. Check Evidence Requirement

The check agent (dispatched with `reviewer` role) MUST call `omp_flow_submit_verdict(rowId, verdict, tests_run, tests_failed, evidence)`. The reviewer MUST NOT hand-write `.task/{rowId}.json` or mutate CSV files. The host tool generates `.omp-flow/tasks/{parentTaskId}/.task/{rowId}.verdict.json`, appends `evidence.csv`, and makes the verdict available to `assertCheckPassed()` before `tasks.csv` can move to `completed`.

### 3. CSV Status Visibility

Every dispatched agent receives a `<csv-workflow-status>` block in its assembled prompt showing the current row's status and how many rows are unchecked. Agents MUST NOT ignore this warning. The block is injected by `onBeforeAgentStart` via `getCSVWorkflowStatus()`.

### 4. Workflow Discipline Rules

Follow this sequence for every CSV row:

1. **Read CSV through host tooling before dispatch** — call `getCSVWorkflowStatus()` / scheduler APIs to know the row status, topology prefix, `context`, and `reference` indexes.
2. **Dispatch implement agent for the row** — Hook assembles the executor prompt from `.omp/agents/executor.md`, PRD/design, curated context, and `.task/{rowId}.implement.md`.
3. **Dispatch independent check agent** — spawn a separate subagent with a different agent ID and the `reviewer` role. This agent MUST NOT be the same as the implement agent.
4. **Submit verdict by tool** — reviewer calls `omp_flow_submit_verdict(...)`; host writes `.task/{rowId}.verdict.json` and appends `evidence.csv`.
5. **Only host marks row `completed` if check verdict is pass** — `assertCheckPassed()` must validate verdict=`pass`, `tests_failed=0`, and non-empty `.task/{rowId}.implement.md` before the host updates `tasks.csv`.
6. **If check FAILS** — do not mark the row completed. Retry (dispatch a fix agent then re-check) or escalate to human after retry exhaustion.

### 5. Violation Detection

`getCSVWorkflowStatus()` scans the active task's CSV and evidence artifacts to detect rows that are `completed` or `in_progress` without review evidence. `assertCheckPassed()` is the final guard: it checks `evidence.csv` verdict=`pass`, `tests_failed=0`, and `.task/{rowId}.implement.md` non-empty before completion. If `unchecked > 0` or evidence is contradictory, a warning is injected via `<csv-workflow-status>` and silent progression is blocked.

## Coordination
- **IRC**: Subagents receive `<irc-coordination-context>` block (src/omp/extension.ts:170) with agent ID and messaging protocol. Direct-message siblings via `irc(op="send", to="<PeerId>")`, broadcast wave-wide via `to="all"`.
- **discoveries.ndjson**: `EventBus.appendDiscovery` (src/core/events.ts:280) writes typed entries (implementation_note, pattern, code_pattern, degradation_event, finding) with dedup keys. `recentDiscoveries(5)` (src/core/events.ts:346) injects recent findings into new contexts when requested.
- **priorContext**: `buildPriorContext(status, 5)` (src/core/fsm.ts:755) builds a `<prior-step-context>` block from the last 5 completed steps, including caveats, decisions, and deferred items.
- **Wave context**: `buildWaveContext(activeWave)` (src/omp/extension.ts:228) injects prior-wave findings for cross-wave propagation.
- **EventBus**: All state transitions emit `fsm_transition` events; agent lifecycle emits `agent_spawned`/`agent_completed`; boundary checks emit `boundary_violation`/`readiness_checked`.
