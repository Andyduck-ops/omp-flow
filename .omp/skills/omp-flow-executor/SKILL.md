---
name: omp-flow-executor
description: Specialized worker subagent skill for executing atomic code implementation inside defined boundary contracts without scope drift.
---

# OMP-Flow Executor Skill

## Trigger
- Activates when `OMPFlowExtension.onBeforeAgentStart` (src/omp/extension.ts:98) spawns a subagent with `subagentRole` containing "executor".
- Activates when FSM is in `S_DISPATCH` (src/core/fsm.ts:4) and `advanceNextStep` returns a step with `stage: 'execution'`.
- Activates on `/omp-flow:execute` or `/omp-flow:continue` commands.
- Recommended model tier: `default` (src/omp/extension.ts:115 — executor is not in the slow-tier or smol-tier role lists).

## Inputs
- **Context package**: `.omp-flow/scratch/{taskId}/context-package-{role}.json` compiled by `ContextPackageBuilder.buildPackage` (src/core/context-package.ts:148). Contains `requirements[]`, `boundary` (in_scope, out_of_scope, constraints, done_when), `specRules[]`, `manifest[]`.
- **Context manifest**: `.omp-flow/tasks/{taskId}/context-manifest.jsonl` — curated file list with reasons. Read via `ContextPackageBuilder.readContextManifest` (src/core/context-package.ts:104).
- **Spec rules**: Role-filtered spec rules from `.omp-flow/specs/*.md` (src/core/context-package.ts:191-221). Executor gets all universal specs + layer-matched specs.
- **Prior context**: `<prior-step-context>` from `RalphFSMEngine.buildPriorContext(status, 5)` (src/core/fsm.ts:221) — last 5 completed steps with summaries, caveats, decisions, deferred items.
- **Recent discoveries**: `<recent-discoveries>` from `EventBus.recentDiscoveries(5)` (src/core/events.ts:301).
- **Wave context**: `<wave-context>` from `buildWaveContext(activeWave)` (src/omp/extension.ts:174) — prior wave findings.
- **IRC context**: `<irc-coordination-context>` with agent ID and messaging protocol.
- **Boundary contract block**: `<boundary-contract>` with in/out scope, constraints, done_when (injected by `onSessionStart`, src/omp/extension.ts:71).

## Workflow
1. **Pre-read context**: Read all files listed in the context manifest (`read_first` equivalent). Use `read` tool with specific line ranges to avoid full-file reads. Read all `specRules` from the context package.
2. **Verify boundary**: Confirm target edit paths match `boundary.in_scope` glob patterns and do NOT match `boundary.out_of_scope`. The `onToolCall` hook (src/omp/extension.ts:193) will run `executeMaestroBoundaryCheck` on every `write`/`edit` call — violations emit `boundary_violation` events and log warnings.
3. **Plan atomic edits**: Decompose the requirement into minimal, focused code changes. Each edit should be surgical — use the `edit` tool with precise line ranges from `read` snapshots, never widen ranges over unchanged lines.
4. **Execute edits**: Apply changes using the `edit` tool (SWAP, DEL, INS operations). For multi-file changes, edit files in dependency order. The `cleanTargetFilePath` function (src/tools/drift-check-tool.ts:21) extracts the file path from edit headers for boundary checking.
5. **Coordinate with siblings**: Use IRC to message sibling workers when crossing module boundaries: `irc(op="send", to="<PeerId>", message="...")`. Broadcast wave-wide updates: `irc(op="send", to="all", message="...")`. Check inbox: `irc(op="inbox")`.
6. **Write discoveries**: Call `EventBus.appendDiscovery(agentId, type, data, dedupKey)` (src/core/events.ts:237) to share implementation notes, code patterns, or findings with the shared board. Types: `implementation_note`, `pattern`, `code_pattern`, `degradation_event`, `finding`.
7. **Verify locally**: Run unit tests for modified files. Use `lsp diagnostics` to check for type errors. Assert logical behavior at conditional branches, edge values, and invariants.
8. **Report completion**: Return a structured result with: files modified, tests run (pass/fail counts), decisions made, caveats, deferred items. The `onAgentComplete` hook (src/omp/extension.ts:269) captures output and appends it to `discoveries.ndjson`.
9. **Complete FSM step**: The orchestrator calls `completeStep(idx, completionStatus, summary, { caveats, decisions, deferred })` (src/core/fsm.ts:246). `DONE` proceeds; `NEEDS_RETRY` triggers `S_AUTOFIX`.

## Outputs
- **Source code edits**: Modified files within `boundary.in_scope` only.
- **discoveries.ndjson**: Appended entries via `appendDiscovery` — implementation notes, patterns, findings.
- **EventBus events**: `agent_completed` emitted by `onAgentComplete` (src/omp/extension.ts:276).
- **FSM state**: Step status updated to `completed` or `failed` via `completeStep`.
- **Return format**: Structured JSON `{ filesModified: string[], testsRun: { pass: number, fail: number }, decisions: string[], caveats: string[], deferred: string[] }`.

## Boundary Contract
- **In-scope**: Only files matching `boundary.in_scope` glob patterns from the context package. Only the current task's scratch directory for discovery writes.
- **Out-of-scope**: Any file matching `boundary.out_of_scope`. Other tasks' directories. `.omp-flow/state.json` (read-only). `.omp-flow/events/events.jsonl` (use `EventBus.append`, never direct writes). `.omp-flow/fsm/` status files (managed by `RalphFSMEngine` only).
- **Forbidden**: Modifying files outside `in_scope` (triggers `boundary_violation` event), deleting `events.jsonl` or `discoveries.ndjson`, bypassing the `edit`/`write` tools (no raw `fs` calls), force-pushing git changes, modifying `package.json` dependencies, touching `out_of_scope` paths even for "quick fixes".

## FSM Integration
- Primary state: `S_DISPATCH` (src/core/fsm.ts:4) — execution stage.
- Step status lifecycle: `pending` → `running` → `completed` (or `failed` → `S_AUTOFIX` → retry).
- On `NEEDS_RETRY`: step status set to `failed` (src/core/fsm.ts:260), `retry_count` incremented, FSM enters `S_AUTOFIX` (src/core/fsm.ts:185). `advanceNextStep` re-dispatches with `retry_count/maxAutoFixIterations` info in prompt.
- Auto-fix cap: `DEFAULT_MAX_AUTOFIX = 3` (src/core/fsm.ts:61). After 3 failed retries, step is `skipped` (src/core/fsm.ts:174).
- On `DONE`: if step has a `quality-gate` decision, routes through `S_DECISION_EVAL` with verdict `pass` (src/core/fsm.ts:280).
- Model tier: `default` (src/omp/extension.ts:115).

## Coordination
- **IRC**: Receives `<irc-coordination-context>` with agent ID. Messages siblings before editing shared files. Answers peer questions with `replyTo`. Uses `irc(op="wait")` only when genuinely blocked on a sibling's output.
- **discoveries.ndjson**: Writes `implementation_note` entries with `{ role, taskId, output }`. Reads `<recent-discoveries>` injected by `onBeforeAgentStart` for prior agent context.
- **priorContext**: Consumes the 5-step sliding window from `buildPriorContext` — includes caveats (⚠️), decisions (📌), deferred items (⏭️) from prior steps.
- **Wave context**: Reads `<wave-context>` for prior-wave findings when `activeWave > 1` (src/omp/extension.ts:175).
- **Writes for downstream**: Discoveries appended to `discoveries.ndjson` are read by the next wave's executors and by the reviewer during `S_GRILL`.
