# OMP-Flow Development Workflow

---

## Core Principles

1. **Plan before code** — brainstorm before PRD; classify the request and seek consent before creating a task.
2. **Quality by Design** — audit before execute, not after; both design layers pass QbD and human approval before implementation starts.
3. **Topology naming** — task IDs encode DAG dependencies and worktree isolation boundaries directly.
4. **Specs injected, not remembered** — `specs/index.md`, `knowhow/index.md`, `tasks/index.md`, and workflow breadcrumbs are loaded at runtime, never recalled from memory.
5. **Persist everything** — research, decisions, evidence, and lessons go to files; conversations get compacted, files don't.
6. **Wave-based execution** — topology-ready tasks run in parallel waves; convergence is verified between waves, never assumed.
7. **Capture learnings** — after each task, harvest gotchas/recipes back into `knowhow/` before archiving.

---

## Phase Index

```
Phase 1: Plan    → brainstorm → create task → Phase 1 design (prd.md + design.md)
                 → QbD 1 audit → human approval gate 1
                 → Phase 2 design (tasks.csv + .task/F-*.implement.md)
                 → QbD 2 audit → human approval gate 2 → start task
Phase 2: Execute → dispatch wave (topology-aware) → executor implements
                 → reviewer audits + submit_verdict → convergence check → grill
Phase 3: Finish  → harvest → prune → archive
```

### Phase 1: Plan
- 1.0 Brainstorm `[required · once]` — `omp-flow brainstorm <topic>` (Socratic) or `--dynamic` (multi-agent debate)
- 1.1 Create task `[required · once]` — `omp-flow task create "<title>"` (after task-creation consent)
- 1.2 Phase 1 design `[required · once]` — Architect produces `prd.md` + `design.md`
- 1.3 QbD 1 audit `[required · loopable]` — global design audit for boundaries, technical risk, and spec compliance; FAIL returns to Architect, maxRetries=3
- 1.4 Human approval gate 1 `[required · once]` — approve global design before detailed implementation planning
- 1.5 Phase 2 design `[required · once]` — Architect produces `tasks.csv` with topology IDs, CSV `context` references, and all `.task/F-*.implement.md` briefs
- 1.6 QbD 2 audit `[required · loopable]` — implementation-instruction audit for ambiguity, interface alignment, and DAG acyclicity; FAIL returns to Architect, maxRetries=3
- 1.7 Human approval gate 2 `[required · once]` — approve locked design, then `omp-flow task start <taskId>`; status → `in_progress`

### Phase 2: Execute
- 2.1 Dispatch wave `[required · repeatable]` — `omp-flow execute` / `omp-flow execute-wave <taskId>` dispatches topology-ready rows in parallel
- 2.2 Executor implements `[required · repeatable]` — Hook injects role definition, global context, curated context, task brief, and local guidance
- 2.3 Reviewer audits `[required · repeatable]` — independent reviewer calls `omp_flow_submit_verdict(rowId, verdict, tests_run, tests_failed, evidence)`
- 2.4 Convergence check `[required · repeatable]` — host validates verdict evidence and completed dependencies before unlocking downstream topology units
- 2.5 Grill review `[required · repeatable]` — `omp-flow grill --step <N>` runs the reviewer FSM gate
- 2.6 Auto-fix `[on demand]` — `omp-flow-debugger` skill loops on failures (max 3 retries before human escalation)
- 2.7 Rollback `[on demand]` — return to Phase 1 when a PRD or design defect surfaces mid-execution

### Phase 3: Finish
- 3.1 Harvest learnings `[required · once]` — `omp-flow harvest` extracts gotchas/recipes to `knowhow/`
- 3.2 Prune context `[optional · once]` — `omp-flow prune` rotates accumulated context + events
- 3.3 Archive task `[required · once]` — `omp-flow task archive <taskId>` moves task to `archive/` and flips status to `completed`
- 3.4 Spec sync `[optional · once]` — update `specs/` if new conventions/decisions emerged

---

## [workflow-state:STATUS] Breadcrumb Blocks

These blocks are the SINGLE source of truth for the per-turn `<workflow-state>` breadcrumb injected by `onBeforeAgentStart`. STATUS charset: `[A-Za-z0-9_-]+`. When a tag is missing, the breadcrumb degrades to a visible "Refer to workflow.md" line so users notice and fix the gap.

[workflow-state:no_task]
No active task. Classify the request first and seek task-creation consent before creating any omp-flow task.
Simple conversation / small fix: ask whether this turn should create a task; if the user says no, skip omp-flow for this session.
Complex deliverable: ask whether you may create a task and enter planning. If the user says no, do not begin broad inline implementation — clarify scope or suggest a smaller split.
Before execution can start, planning must produce topology-formatted task IDs (`[Unit]-[Deps]-[Seq]`) and pass both QbD gates plus both human approval gates.
Entry point: `omp-flow brainstorm <topic>` or `omp-flow task create "<title>"`.
[/workflow-state:no_task]

[workflow-state:planning]
Active task is in `planning` status. Load `omp-flow-brainstorm` for exploration or `omp-flow-architect` for PRD/design, topology CSV, and `.task/F-*.implement.md` generation.
Phase 1 design: complete `prd.md` + `design.md`, then run QbD 1 global design audit. FAIL returns findings to Architect for revision (maxRetries=3); PASS requires human approval gate 1.
Phase 2 design: produce `tasks.csv` with topology IDs and CSV `context` column references, plus every `.task/F-*.implement.md` brief. Run QbD 2 implementation-instruction audit. FAIL returns findings to Architect for revision (maxRetries=3); PASS requires human approval gate 2 before `task start`.
Multi-deliverable scope: encode dependencies in topology IDs, not by tree position or an implied `dependsOn` field.
Brainstorm variant: `omp-flow brainstorm <topic> --dynamic`.
[/workflow-state:planning]

[workflow-state:in_progress]
Implementation is in progress (status stays `in_progress` from `task start` until `task archive`).
Dispatch next topology-ready wave: `omp-flow execute` / `omp-flow execute-wave <taskId>`. Hook assembly is five-layer and Fail-Closed: Role Definition → Global Context (`prd.md` + `design.md`) → Curated Context (CSV `context` / `reference` refs) → Task Brief (`.task/{rowId}.implement.md`) → Local Guidance.
Read order for any dispatched row: `prd.md` → `design.md` → `.task/{rowId}.implement.md` → CSV `context` refs.
Sub-agents MUST NOT spawn other sub-agents; only the main orchestrator dispatches executor/reviewer/QbD agents.
After implementation, dispatch an independent reviewer. Reviewer MUST call `omp_flow_submit_verdict(rowId, verdict, tests_run, tests_failed, evidence)`; agents MUST NOT edit `tasks.csv` or hand-write verdict JSON.
After each wave: host validates submitted evidence, runs convergence checks, then `omp-flow grill --step <N>` for the reviewer gate.
Failure path: load `omp-flow-debugger` skill; max 3 auto-fix retries before human escalation.
[/workflow-state:in_progress]

[workflow-state:completed]
Task is completed. Run `omp-flow harvest` to extract learnings into `knowhow/`, then `omp-flow task archive <taskId>` to move the task directory to `archive/` and flip status.
Optional: `omp-flow prune` to rotate accumulated context, and update `specs/` if new conventions surfaced.
[/workflow-state:completed]

---

## Planning Artifacts

| Artifact | Plane / Owner | Purpose | Required |
|----------|---------------|---------|----------|
| `prd.md` | Data plane / Architect | Requirements, constraints, acceptance criteria | Always |
| `design.md` | Data plane / Architect | Technical design: boundaries, contracts, data flow, tradeoffs, rollout/rollback | Always for QbD-gated tasks |
| `tasks.csv` | Control plane / Host-managed | Task index with topology ID, status, role/tier, `context`, and `reference` columns | Always before start |
| `.task/F-*.implement.md` | Data plane / Architect-generated | Canonical implementation brief consumed by executor/reviewer Hook assembly | Every executable row |
| `.task/F-*.review.md` | Evidence plane / Reviewer-generated | Markdown review notes and findings for the row | Every reviewed row |
| `.task/F-*.verdict.json` | Evidence plane / Host-generated | Verdict artifact generated only via `omp_flow_submit_verdict` | Every reviewed row |
| `evidence.csv` | Control plane / Host-appended | Evidence index appended from reviewer verdict submissions | Every reviewed row |
| `brainstorm.md` | Data plane / Architect or brainstormer | Socratic inquiry + dynamic multi-agent debate log | When brainstorm is run |
| `.task/QBD-GLOBAL-AUDIT.md` | Evidence plane / QbD auditor | Phase 1 global design audit output | Before approval gate 1 |
| `.task/QBD-IMPL-AUDIT.md` | Evidence plane / QbD auditor | Phase 2 implementation-instruction audit output | Before approval gate 2 |

Lightweight tasks may stay outside omp-flow when the user declines task creation. Once an omp-flow task enters planning, implementation MUST wait for both QbD gates and both human approval gates.

---

## Topology Naming Convention

Task IDs encode dependency topology directly. Format: `[Unit]-[Deps]-[Seq]`.

- `Unit` is the current unit letter and determines the isolated Git Worktree, for example `worktrees/C/`.
- `Deps` is the optional group of upstream unit letters that must complete before this row is schedulable.
- `Seq` is the stable sequence number inside the unit.
- Example: `C-AB-001` means Unit C depends on Units A and B; the FSM auto-parses that prefix into the in-memory DAG.

Rows with the same UnitLetter run in the same isolated worktree. Different ready UnitLetters can run concurrently after their dependency Units have passed review evidence.

---

## Dual QbD Gates

QbD gates are audit-before-execute barriers. They run before implementation, not after code has already been written.

1. **Phase 1: Global design audit** — Architect produces `prd.md` + `design.md`; QbD 1 audits boundary fit, technical choice risk, and spec compliance; PASS proceeds to human approval gate 1.
2. **Phase 2: Implementation instruction audit** — Architect produces `tasks.csv` + every `.task/F-*.implement.md`; QbD 2 audits instruction clarity, interface-contract alignment, and DAG acyclicity; PASS proceeds to human approval gate 2.

Each QbD gate auto-loops on FAIL: Architect reads the findings, revises the artifacts, and retries up to `maxRetries=3`. After three failed loops, the FSM escalates to human decision instead of weakening the contract.

---

## Five-Layer Hook Assembly

`onBeforeAgentStart` assembles executor, reviewer, and QbD auditor prompts from five labeled layers. The orchestrator supplies scheduling metadata and optional Local Guidance; it does not hand-write long assignments.

```text
─── omp-flow: Role Definition (from agents/{role}.md) ───
{static role spec from .omp-flow/agents/*.md}

─── omp-flow: Global Context (prd.md + design.md) ───
{full PRD + full Design}

─── omp-flow: Curated Context (ADR / Interface refs from CSV context column) ───
{context/**/*.md and CSV reference material}

─── omp-flow: Task Brief ({rowId}.implement.md) ───
{canonical implementation brief}

─── omp-flow: Local Guidance (Orchestrator) ───
{short run-specific constraints, usually empty}
```

Fail-Closed rule: if `.omp-flow/tasks/{taskId}/.task/{rowId}.implement.md` is missing or empty for an executor/reviewer row, the Hook MUST block subagent start instead of falling back to prompt-only execution.

---

## FSM State → Skill Mapping

The Ralph FSM drives task progression. Each FSM state maps to a specialized skill that should be loaded when the task reaches that state.

| FSM State | Skill | Stage |
|-----------|-------|-------|
| `S_PLANNING_MODE` | `omp-flow-brainstorm` | Pre-PRD exploration, Socratic inquiry |
| `S_PLANNING` | `omp-flow-architect` | Phase 1/2 design, topology CSV, and implementation briefs |
| `S_CONFIRM` | `omp-flow-architect` + human approval | Human approval gate after each passing QbD audit |
| `S_DISPATCH` / `S_WAVE_DISPATCH` | `omp-flow-executor` | Topology-aware wave dispatch and parallel execution |
| `S_GRILL` | `omp-flow-reviewer` | Independent audit, Finding schema, and verdict submission |
| `S_HARVEST` | `omp-flow-harvester` | Learning extraction to `knowhow/` |
| `S_AUTOFIX` | `omp-flow-debugger` | Failure auto-fix loop for QbD, implementation, or review failures (max 3 retries) |
| `S_DECISION_EVAL` | `omp-flow-reviewer` (quality-gate) / `omp-flow-debugger` (fix-loop) | Gate routing decision |

### Active Task Routing

When a user request matches one of these intents inside an active task, route to the skill first, then load the detailed phase step:

- Planning or unclear requirements → `omp-flow-brainstorm`
- PRD/design/topology CSV/implementation brief construction → `omp-flow-architect`
- Human approval gate after QbD PASS → `S_CONFIRM`
- `in_progress` implementation → `omp-flow-executor` (via topology-aware wave dispatch)
- Independent review after a row implementation → `omp-flow-reviewer` with `omp_flow_submit_verdict`
- Failure analysis + auto-fix → `omp-flow-debugger`
- Learning extraction → `omp-flow-harvester` (via `harvest`)

---

## Parent / Child Task Trees

Use a parent task when one user request contains several independently verifiable deliverables. The parent owns the source requirement set, the task map, cross-child acceptance criteria, and the final integration review — it is normally NOT the implementation target unless it also has direct work.

Use child tasks for deliverables that can be planned, implemented, checked, and archived independently. Parent/child structure is NOT a dependency system: if one child must wait for another, encode that dependency in topology IDs and keep each child's acceptance criteria testable.

```bash
omp-flow task create "Child title" --parent <parent-id>
omp-flow task add-subtask <parent-id> <child-id>
omp-flow task tree                    # visualize the tree
```

---

## Guardrails

1. **Task creation ≠ implementation approval.** Implementation waits for both QbD gates and both human approval gates.
2. **Quality by Design comes first.** Audit `prd.md` + `design.md`, then audit `tasks.csv` + `.task/F-*.implement.md`, before any executor writes code.
3. **Task IDs MUST follow `[Unit]-[Deps]-[Seq]` topology format.** The FSM parses IDs for DAG scheduling and worktree routing.
4. **Sub-agents MUST NOT spawn other sub-agents.** Recursion Guard: only the main orchestrator dispatches executor, reviewer, QbD, debugger, or harvester agents.
5. **Agents MUST NOT edit `tasks.csv` or hand-write verdict JSON.** Reviewers submit verdicts only through `omp_flow_submit_verdict`; the host writes `.task/F-*.verdict.json` and `evidence.csv`.
6. **Convergence criteria MUST be tool-verifiable** — file existence, content match, command exit code, submitted verdict evidence. Vague "feels done" criteria are rejected.
7. **Max 3 auto-fix retries** before the task is blocked and surfaced for human decision.
8. **Planning and evidence must be persisted** to task artifacts; checks must run before reporting completion.
9. **Phases can roll back** — Execute revealing a PRD/design defect returns to Plan; fix the artifact, then re-enter gated execution.

---

## Rules

1. Identify which Phase you are in, then continue from the next step in that phase.
2. Run steps in order inside each Phase; `[required]` steps cannot be skipped.
3. Steps tagged `[once]` are skipped if their output already exists; do not re-run.
4. Artifact presence informs the next step: missing `.task/F-*.implement.md` is Fail-Closed for executable rows.
5. The `[workflow-state:STATUS]` breadcrumb is the only per-turn channel — every mandatory step must be mentioned in its phase's breadcrumb block or the AI will silently skip it.

---

## CLI Quick Reference

| Command | Description |
|---------|-------------|
| `omp-flow init` | Initialize `.omp-flow/` workspace directory |
| `omp-flow brainstorm <topic>` | Socratic inquiry session; `--dynamic` for multi-agent debate |
| `omp-flow plan "<intent>" --task <id>` | Generate PRD/design, topology CSV, implementation briefs, and QbD artifacts |
| `omp-flow execute` | Advance the FSM one step |
| `omp-flow continue` / `resume` | Resume from current FSM state with full context |
| `omp-flow execute-wave <taskId>` | Dispatch next topology-ready wave in parallel with Hook-assembled prompts |
| `omp-flow check <taskId>` | Validate submitted verdict evidence and convergence criteria |
| `omp-flow grill --step <N>` | Run reviewer FSM gate; `--status <STATUS>` to inject a status |
| `omp-flow harvest` | Extract learnings (gotchas/recipes) into `knowhow/` |
| `omp-flow gaps --task <id>` | Analyze issue gaps (Maestro-style) |
| `omp-flow events --count <N>` | Tail the EventBus; `--kind <k>` to filter |
| `omp-flow search <query>` | Search `knowhow/` via the Memory Engine |
| `omp-flow status` | Show active task + FSM state + accumulated context |
| `omp-flow install` | Install omp-flow extension + skills into `.omp/` |
| `omp-flow archive <taskId>` | Move completed task to monthly archive |
| `omp-flow prune` | Rotate accumulated context + EventBus entries |
| `omp-flow milestone <action>` | Archive or list milestones |
| `omp-flow artifacts` | List registered artifacts; `--task` / `--status` to filter |
| `omp-flow task <subcommand>` | Unified lifecycle: `create`, `list`, `start`, `finish`, `archive`, `tree`, `add-subtask` |
> Run `omp-flow help` to see the authoritative, up-to-date command list.
