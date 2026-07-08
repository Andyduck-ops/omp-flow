---
name: omp-flow-executor
description: Specialized worker subagent skill for executing atomic code implementation inside defined boundary contracts without scope drift.
---

# OMP-Flow Executor Skill

## Trigger
- Activates when `OMPFlowExtension.onBeforeAgentStart` (src/omp/extension.ts:115) spawns a subagent with `subagentRole` containing "executor" and assembles the runtime prompt.
- Activates when FSM is in `S_DISPATCH` (src/core/fsm.ts:7) and `advanceNextStep` (src/core/fsm.ts:627) returns a step with `stage: 'execution'`.
- Activates on `/omp-flow:execute` or `/omp-flow:continue` commands.
- Recommended model tier: `default` unless the current `tasks.csv` row overrides `tier` (src/omp/extension.ts:144-156).

## Recursion Guard
You are already an executor sub-agent dispatched by the orchestrator. Do NOT spawn another executor or reviewer sub-agent. If more work is needed, report that recommendation to the orchestrator instead of spawning. Only the main orchestrator session may dispatch sub-agents.


## Inputs
- **Pre-assembled Hook prompt**: Executor receives a ready-to-use Prompt assembled by `onBeforeAgentStart` with five divider-labeled layers: Role Definition → Global Context → Curated Context → Task Brief → Local Guidance. Runtime context is already curated, injected, and source-separated before startup.
- **Layer 1 — Static role**: `.omp-flow/agents/executor.md` 全量注入，定义 executor role identity、forbidden ops、TypeScript conventions、输出格式与安全红线。
- **Layer 2 — Global context**: `prd.md` + `design.md` full injection（约 10KB）。优先保留完整业务目标、架构决策和技术边界，避免因截断产生实现漂移。
- **Layer 3 — Curated context**: 从 `tasks.csv` 当前行的 `context` column 自动解析并展开 ADR / interface contract refs，作为只读传递面事实契约。
- **Layer 4 — Task brief**: `.task/{rowId}.implement.md` 是本次实现的权威任务正文。Fail-Closed：如果该文件缺失或为空，Hook 会 block subagent start；若仍收到缺失 brief，立即报告 blocked，不要自行猜测任务。
- **Layer 5 — Local guidance**: Orchestrator 可选追加的临时补充，通常为空。只用于当前调度的轻量约束微调，不得覆盖前四层 contract。
- **rowId**: Executor receives the current `rowId`; topology naming encodes DAG dependencies (for example `C-AB-001` means Unit C depends on Units A and B).
- **IRC context**: `<irc-coordination-context>` with agent ID and messaging protocol for sibling coordination inside the current orchestrated wave.

## Workflow
1. **Accept assembled context**: Treat the five-layer Hook output as the source of truth. Do not search for legacy context bundles or manifests; Role Definition, Global Context, Curated Context, Task Brief, and Local Guidance have already been injected before startup.
2. **Validate Task Brief**: Confirm Layer 4 (`.task/{rowId}.implement.md`) is present, specific, and matches the received `rowId`. If missing or ambiguous, fail closed: report blocked to the orchestrator instead of inventing scope.
3. **Verify boundary**: Use `.omp-flow/agents/executor.md` plus the Layer 4 brief to identify allowed edit paths, constraints, done_when, and forbidden operations before any write.
4. **Plan atomic edits**: Decompose the requirement into minimal, focused code changes. Each edit should be surgical — use precise line ranges from `read` snapshots, never widen ranges over unchanged lines.
5. **Execute source edits**: Apply source code modifications inside the boundary only. For multi-file changes, edit in dependency order implied by imports and the `rowId` topology; never modify host-managed control/state files as part of implementation.
6. **Coordinate without recursion**: Use IRC for sibling coordination when crossing module boundaries, but do not spawn executor/reviewer sub-agents. If a task should be split or reviewed differently, recommend that to the orchestrator in the final result.
7. **Record implementation discoveries**: Append implementation notes/patterns only through approved runtime channels (for example EventBus/discovery APIs when available). Do not hand-edit host-managed control files.
8. **Verify locally**: Run focused tests or diagnostics that cover modified behavior. Assert logical behavior at conditional branches, edge values, and invariants; report exact commands and outcomes.
9. **Report completion**: Return a structured result with files modified, tests run (pass/fail counts), decisions made, caveats, and deferred recommendations. The orchestrator owns FSM state transitions and reviewer dispatch.

## Outputs
- **Primary output — source code modifications**: Executor's main deliverable is implemented source changes within the assigned boundary and task brief.
- **Verification evidence**: Report focused tests/diagnostics run and their pass/fail outcome in the final structured result.
- **Completion report**: Include decisions, caveats, and deferred recommendations for the orchestrator; do not encode them as control-plane edits.
- **Secondary discoveries**: `discoveries.ndjson` / approved discovery APIs may capture implementation notes or reusable patterns, but they are not the primary deliverable.
- **No review artifact writes**: Reviewer, not executor, writes `.task/{rowId}.review.md` and calls `omp_flow_submit_verdict(rowId, verdict, tests_run, tests_failed, evidence)`.
- **Host-managed artifacts**: Host generates `.task/{rowId}.verdict.json`, appends `evidence.csv`, and updates `tasks.csv`; executor `MUST NOT hand-write .task/F-*.verdict.json`, `MUST NOT edit tasks.csv`, and must not patch generated verdict/evidence artifacts.
- **Return format**: Structured JSON `{ filesModified: string[], testsRun: { pass: number, fail: number }, decisions: string[], caveats: string[], deferred: string[] }`.

## Boundary Contract
- **Contract source**: `.omp-flow/agents/executor.md` is the authoritative source for executor forbidden operations, TypeScript conventions, safety rails, and report format; this skill mirrors the runtime behavior but does not replace that role spec.
- **In-scope**: Only files identified by the assembled Task Brief and boundary guidance for the current `rowId`.
- **Out-of-scope**: Any path excluded by the task boundary, other tasks' directories, control-plane files (`tasks.csv`, `evidence.csv`), host state (`fsm/status.json`, `state.json`), and verdict JSON artifacts.
- **Forbidden**: Modifying files outside task scope, touching out-of-scope paths for "quick fixes", bypassing approved edit/write tools, force-pushing git changes, modifying dependencies unless explicitly in-scope, `MUST NOT edit tasks.csv` / `evidence.csv`, writing `.task/{rowId}.review.md`, or `MUST NOT hand-write .task/F-*.verdict.json` / `.task/{rowId}.verdict.json`. Verdict JSON and task status are host-managed only.

## FSM Integration
- Primary state: `S_DISPATCH` (src/core/fsm.ts:7) — execution stage. `advanceNextStep` (src/core/fsm.ts:627) supplies execution work only after the orchestrator has advanced through planning gates.
- Executor dispatch happens after Dual QbD + Human Approval: Phase 1 `prd.md` + `design.md` pass QbD 1 and approval; Phase 2 `tasks.csv` + `.task/F-*.implement.md` pass QbD 2 and approval.
- Executor receives the current `rowId`; topology naming follows `[Unit]-[Deps]-[Seq]` (for example `C-AB-001`), so the ID itself encodes DAG dependencies and wave scheduling constraints.
- Same UnitLetter tasks execute in isolated Git Worktrees (for example `worktrees/A/`, `worktrees/B/`); executor stays inside the dispatched worktree and assigned boundary.
- Step status lifecycle remains host-owned: `pending` → `running` → `completed` (or `failed` → `S_AUTOFIX` / `S_DECISION_EVAL` retry flow). Executor reports results; orchestrator updates FSM state.
- On missing `.task/{rowId}.implement.md`, `onBeforeAgentStart` blocks startup Fail-Closed. If a prompt somehow lacks the Task Brief, executor must report blocked rather than proceed.
- Downstream completion is tool-enforced: Reviewer calls `omp_flow_submit_verdict`, host generates verdict/evidence artifacts, and `assertCheckPassed()` requires non-empty implement brief + verdict=`pass` + `tests_failed=0` before marking `tasks.csv` completed.
- Auto-fix cap is 3 retries (`DEFAULT_MAX_AUTOFIX`, src/core/fsm.ts:161); after that, escalate to human instead of recursive agent loops.
- Model tier: `default` for executor unless row-level tier routing overrides it (src/omp/extension.ts:144-156).

## Coordination
- **IRC**: Receives `<irc-coordination-context>` with agent ID. Messages siblings before editing shared files. Answers peer questions with `replyTo`. Uses `irc(op="wait")` only when genuinely blocked on a sibling's output.
- **No recursive dispatch**: Executor never spawns executor/reviewer agents. Additional implementation, review, or split-work needs are reported in `deferred` or caveats for the orchestrator.
- **discoveries.ndjson**: Optional secondary channel for implementation notes and reusable code patterns; it is not a substitute for source edits, verification, or reviewer verdict evidence.
- **Reviewer handoff**: Executor leaves `.task/{rowId}.review.md`, `.task/{rowId}.verdict.json`, `evidence.csv`, and `tasks.csv` updates to Reviewer + host tooling.
