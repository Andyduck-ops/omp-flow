---
name: omp-flow-architect
description: Architectural planner for breaking down user requirements into Trellis-style PRDs and Maestro Context Packages with boundary contracts.
---

# OMP-Flow Architect Skill

## Trigger
- Activates on `/omp-flow:plan [intent]` command.
- Activates when FSM transitions to `S_PLANNING` (src/core/fsm.ts:119) or `S_DECOMPOSE`.
- Activates when `RalphStatus.currentStepIndex` points to a step with `stage: 'planning'` and `skill: 'plan'`.
- Activates after `omp-flow-brainstorm` completes and writes `brainstorm.md`.
- Recommended model tier: `slow` (src/omp/extension.ts:117 — roles containing "architect" get `slow` tier).

## Inputs
- User intent string from `/omp-flow:plan [intent]` command args.
- `.omp-flow/tasks/{taskId}/brainstorm.md` — design recommendations from prior brainstorm phase (if present).
- `.omp-flow/specs/*.md` — active spec rules for constraint injection.
- `.omp-flow/knowhow/harvested-learnings.md` — recent gotchas via `MemoryEngine.getRecentKnowhow(5)`.
- `.omp-flow/state.json` — current milestone, phase, activeWave, existing goals.
- `<prior-step-context>` from `RalphFSMEngine.buildPriorContext` (src/core/fsm.ts:221) — last 5 completed steps.
- `<recent-discoveries>` from `EventBus.recentDiscoveries(5)` (src/core/events.ts:301).

## Workflow
1. **Analyze intent**: Parse user goal into discrete requirements. Identify system constraints, in-scope paths, out-of-scope boundaries, and definition-of-done criteria.
2. **Decompose goals**: Use `UnifiedWorkspaceManager.addGoal` (src/core/state.ts:221) to register `Goal` objects with `id`, `description`, `doneWhen`, `status: 'pending'`. Each goal's `doneWhen` is a verifiable criterion.
3. **Write PRD**: Write markdown to `.omp-flow/tasks/TASK-{id}/prd.md`. Format: `# PRD {taskId}` with `## Requirements` section using `- ` bullet lists (the `ContextPackageBuilder.buildPackage` parser at src/core/context-package.ts:173 extracts bullet lines as requirements).
4. **Define boundary contract**: Construct `BoundaryContract` (src/core/context-package.ts:4) with:
   - `in_scope`: glob patterns for files the executor MAY touch (e.g., `src/auth/**/*.ts`).
   - `out_of_scope`: glob patterns for protected paths (e.g., `src/legacy/**/*.ts`, `node_modules/**`).
   - `constraints`: coding conventions and rules (e.g., "Follow strict TypeScript", "No inline casts").
   - `done_when`: verifiable completion criteria (e.g., "All tests pass cleanly").
5. **Curate context manifest**: Use `ContextPackageBuilder.addContextEntry` (src/core/context-package.ts:73) to append curated file entries to `.omp-flow/tasks/{taskId}/context-manifest.jsonl`. Each entry has `file`, `reason`, and `type` ('file' | 'directory'). Deduplicates by file path.
6. **Compile context package**: Call `ContextPackageBuilder.buildPackage(taskId, 'architect', boundaryOverride)` (src/core/context-package.ts:148). This reads the PRD, loads role-filtered spec rules, reads the manifest, and writes `.omp-flow/scratch/{taskId}/context-package-architect.json`.
7. **Decompose into waves**: Prepare topological dependency waves (Wave 1, Wave 2, ...) for parallel execution. Each wave contains independent tasks that can be dispatched concurrently. Update `state.json` `activeWave` via `updateState({ activeWave: N })`.
8. **Create task tree**: Use `UnifiedWorkspaceManager.createTask` (src/core/state.ts:272) to register parent/child task records with `TaskRecord` (src/core/state.ts:8). Link children to parents via `subtasks[]` and `children[]`.
9. **Validate manifest**: Call `ContextPackageBuilder.validateContextManifest(taskId)` (src/core/context-package.ts:134) to verify all referenced files exist on disk.
10. **Transition FSM**: Call `RalphFSMEngine.transitionTo('S_DISPATCH')` or mark the planning step complete via `completeStep(idx, 'DONE', summary)`.

## Outputs
- `.omp-flow/tasks/TASK-{id}/prd.md` — PRD markdown with requirements as bullet list.
- `.omp-flow/tasks/TASK-{id}/task.json` — `TaskRecord` with parent/child linkage.
- `.omp-flow/tasks/TASK-{id}/context-manifest.jsonl` — curated context entries (one JSON object per line).
- `.omp-flow/scratch/TASK-{id}/context-package-architect.json` — compiled `ContextPackage` with boundary, specRules, manifest.
- `.omp-flow/state.json` — updated `goals[]` array with new `Goal` entries.
- EventBus: emits `task_created` and `context_injected` events.

## Boundary Contract
- **In-scope**: `.omp-flow/tasks/*/prd.md`, `.omp-flow/tasks/*/task.json`, `.omp-flow/tasks/*/context-manifest.jsonl`, `.omp-flow/scratch/*/context-package*.json`, `.omp-flow/state.json` (goals, activeWave, phase only).
- **Out-of-scope**: Application source code (`src/`, `lib/`), test files, `package.json`, any file listed in the boundary's `out_of_scope`.
- **Forbidden**: Writing executor-level code changes, bypassing `BoundaryContract` validation, creating tasks without `doneWhen` criteria, modifying `events.jsonl` directly.

## FSM Integration
- Primary state: `S_PLANNING` (src/core/fsm.ts:4) — activated during the planning stage.
- May operate in `S_DECOMPOSE` for task tree construction and `S_BUILD_CHAIN` for wave dependency ordering.
- Transitions to `S_DISPATCH` when planning is complete and waves are ready for execution.
- Participates in `S_DECISION_EVAL` when the planning step carries a `goal-gate` or `scope-gate` decision (src/core/fsm.ts:291).
- Completes via `completeStep(idx, 'DONE', summary)` with `decisions: ['Wave decomposition: N waves', 'Goals: M tracked']`.

## Coordination
- **IRC**: Notifies `Main` agent when PRD and context packages are ready. Broadcasts wave readiness to executor siblings via `irc(op="send", to="all", message="Wave N ready for dispatch")`.
- **discoveries.ndjson**: Writes architectural decisions as `pattern` type discoveries via `EventBus.appendDiscovery(agentId, 'pattern', { decision, rationale })`.
- **Reads from prior**: Consumes `<prior-step-context>` from brainstorm phase, `<recent-discoveries>` for prior-wave findings, `<wave-context>` for cross-wave propagation.
- **Writes for downstream**: PRD requirements are parsed by `ContextPackageBuilder` for executor context packages. Goals in `state.json` are checked by the reviewer's goal-gate. Task tree (`children[]`) determines parallel dispatch ordering.
