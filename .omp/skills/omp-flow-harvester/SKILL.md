---
name: omp-flow-harvester
description: Self-reinforcing learning skill that extracts gotchas, recipes, and architectural insights from completed task scratch reports into knowhow and spec rules using Finding-schema aware extraction.
---

# OMP-Flow Harvester Skill

## Trigger
- Activates on `/omp-flow:harvest` command.
- Activates when FSM transitions to `S_HARVEST` (src/core/fsm.ts:4) — the final stage of the core lifecycle.
- Activates when `advanceNextStep` returns a step with `stage: 'harvest'` and `skill: 'harvest'` (src/core/fsm.ts:102).
- Activates when all execution/review steps are `completed` or `skipped` (src/core/fsm.ts:305).
- Activates on session completion when `RalphStatus.status === 'completed'` (src/core/fsm.ts:307).

## Inputs
- **Scratch directory**: `.omp-flow/scratch/` — recursively walked by `HarvestManager.walkScratch` (src/core/harvest.ts:89) for `.md`, `.log`, and `.json` files.
- **Task directories**: `.omp-flow/tasks/{taskId}/` — also walked for research reports and scratch files (src/core/harvest.ts:37).
- **Existing knowhow**: `.omp-flow/knowhow/harvested-learnings.md` — read for deduplication (src/core/harvest.ts:47).
- **Findings**: `.omp-flow/findings/*.json` — `Finding[]` objects extracted via `isFinding` type guard (src/core/harvest.ts:155).
- **Goals**: `UnifiedWorkspaceManager.getGoals()` (src/core/state.ts:241) — tracked goals with `status: 'met' | 'unmet'` and `evidence`.
- **Decision log**: `RalphFSMEngine.getDecisionLog()` (src/core/fsm.ts:319) — gate verdicts (pass, retry, concerns, blocked) for learning extraction.
- **EventBus events**: `harvest_completed`, `finding_recorded`, `step_completed`, `step_failed` — all events from the completed session.

## Workflow
1. **Initialize directories**: `HarvestManager.harvestLearnings()` (src/core/harvest.ts:18) ensures `.omp-flow/knowhow/`, `.omp-flow/specs/`, and `.omp-flow/findings/` exist (src/core/harvest.ts:24-26).
2. **Walk scratch and tasks**: Recursively walk `.omp-flow/scratch/` and `.omp-flow/tasks/` (src/core/harvest.ts:31-39). For each file:
   - **Markdown/Log files** (`.md`, `.log`): Scan line-by-line for lines containing `gotcha:`, `lesson:`, or `recipe:` (case-insensitive, src/core/harvest.ts:113). Strip leading list markers (`- `, `* `) and add to `gotchasSet`.
   - **JSON files** (`.json`): Parse and check via `isFinding` type guard (src/core/harvest.ts:155) — requires `id`, `dimension`, `severity`, `title`, `description` as strings. Collect `Finding[]` into `allFindings`. Also extract gotcha patterns from JSON string content via regex `/gotcha|lesson|recipe:\s*([^"\\]+)/gi` (src/core/harvest.ts:139).
3. **Merge with existing knowhow**: Read `.omp-flow/knowhow/harvested-learnings.md` (src/core/harvest.ts:47). Parse existing bullet lines, add to `mergedGotchas` set for deduplication (src/core/harvest.ts:50-57). Union with new gotchas (src/core/harvest.ts:59-61).
4. **Persist knowhow**: Write `.omp-flow/knowhow/harvested-learnings.md` with header `# Harvested Learnings & Recipes` and all gotchas as `- {gotcha}` bullets (src/core/harvest.ts:65-66).
5. **Auto-register spec rules**: Write `.omp-flow/specs/harvested-rules.md` with each gotcha reformatted as `- [Learned Rule] {gotcha}` (src/core/harvest.ts:69-70). This file is auto-loaded by `UnifiedWorkspaceManager.getUnifiedState` (src/core/state.ts:130) and injected into future task contexts via `<active-spec-rules>`.
6. **Persist findings**: If `allFindings.length > 0`, call `sortFindingsBySeverity(allFindings)` (src/core/finding.ts:116) and write to `.omp-flow/findings/harvested-findings.json` (src/core/harvest.ts:74-76). This preserves the session's findings for future reference and pattern matching.
7. **Check goal status**: For each `Goal` in `getGoals()` (src/core/state.ts:241):
   - If `status === 'met'`: extract the `evidence` as a successful recipe → add to knowhow as `Recipe: {goal.description} — {evidence}`.
   - If `status === 'unmet': extract the gap as a gotcha → add to knowhow as `Gotcha: Goal unmet — {goal.description}. Gap: {missing evidence}`.
   - Call `updateGoalStatus(goalId, status, evidence)` (src/core/state.ts:230) to finalize.
8. **Extract from decision log**: For each `DecisionLogEntry` (src/core/fsm.ts:38):
   - `verdict: 'retry'` → `Gotcha: Quality gate failed at step {stepIndex} ({gateType}). Root cause: {from IssueAnalysis}`.
   - `verdict: 'concerns'` → `Lesson: Completed with concerns at step {stepIndex}. Caveats: {from step.completion_caveats}`.
   - `verdict: 'blocked'` → `Gotcha: Blocked at step {stepIndex}. Manual intervention was required.`.
9. **Emit harvest event**: `EventBus.append('harvest_completed', { harvestedCount, findingsCount, gotchasExtracted })` (src/core/events.ts:23).
10. **Return result**: `HarvestResult` (src/core/harvest.ts:5): `{ harvestedCount, extractedGotchas, findingsCount }`.

## Outputs
- `.omp-flow/knowhow/harvested-learnings.md` — merged gotchas, recipes, and lessons (deduplicated).
- `.omp-flow/specs/harvested-rules.md` — auto-registered spec rules (loaded into future contexts).
- `.omp-flow/findings/harvested-findings.json` — sorted `Finding[]` from the session.
- EventBus: `harvest_completed` event.
- `state.json`: goal statuses finalized (`met`/`unmet` with evidence).
- Return format: `HarvestResult { harvestedCount: number, extractedGotchas: string[], findingsCount: number }`.

## Boundary Contract
- **In-scope**: `.omp-flow/knowhow/harvested-learnings.md` (write), `.omp-flow/specs/harvested-rules.md` (write), `.omp-flow/findings/harvested-findings.json` (write), `.omp-flow/state.json` (goals only), EventBus (harvest_completed event).
- **Out-of-scope**: Application source code, `.omp-flow/events/events.jsonl` (append-only via EventBus, never direct writes), `.omp-flow/fsm/*/status.json` (read-only — use `getStatus`/`getDecisionLog`).
- **Forbidden**: Deleting or overwriting existing knowhow (must merge + dedup), bypassing `sortFindingsBySeverity` before persisting findings, modifying scratch/task source files (read-only harvesting), creating spec rules that contradict existing constraints without flagging.

## FSM Integration
- Primary state: `S_HARVEST` (src/core/fsm.ts:4) — final stage of the core lifecycle (`S_PLANNING → S_DISPATCH → S_GRILL → S_HARVEST`).
- Entered when all steps are `completed` or `skipped` (src/core/fsm.ts:305-308) or when `advanceNextStep` finds no actionable step (src/core/fsm.ts:162-165).
- Terminal state: after harvest, `RalphStatus.status` is `completed` (src/core/fsm.ts:307) and `onSessionStop` sets `shouldContinue: false` (src/omp/extension.ts:261).
- Does NOT participate in `S_DECISION_EVAL` or `S_AUTOFIX` — harvest is a terminal, non-gated stage.

## Coordination
- **IRC**: Broadcasts harvest completion: `irc(op="send", to="all", message="Harvest complete: {harvestedCount} learnings, {findingsCount} findings persisted")`. Notifies Main: `irc(op="send", to="Main", message="Session complete. Knowhow updated for future tasks.")`.
- **discoveries.ndjson**: Reads all `degradation_event` and `finding` entries from the session for learning extraction. Does not write new discoveries (harvest is terminal).
- **Reads from prior**: Consumes the full `decisionLog[]` (src/core/fsm.ts:319), all step `completion_summary`/`completion_caveats`/`completion_decisions`/`completion_deferred` via `buildPriorContext` with a large window, all findings from `.omp-flow/findings/`, all goals from `state.json`.
- **Writes for downstream**: Knowhow in `harvested-learnings.md` is injected into future sessions via `MemoryEngine.getRecentKnowhow(5)` (src/core/memory.ts:215) in `onSessionStart` (src/omp/extension.ts:59). Spec rules in `harvested-rules.md` are auto-loaded by `getUnifiedState` (src/core/state.ts:130) and injected into `<active-spec-rules>`. Findings in `harvested-findings.json` are searchable via `MemoryEngine.searchKnowhow` (src/core/memory.ts:123) and `executeMaestroSpecSearch` (src/tools/spec-search-tool.ts:11).

## Finding Schema Usage
- Uses `isFinding` type guard (src/core/harvest.ts:155) to extract `Finding` objects from JSON files — requires `id`, `dimension`, `severity`, `title`, `description` as string fields.
- Calls `sortFindingsBySeverity(allFindings)` (src/core/finding.ts:116) before persisting to `.omp-flow/findings/harvested-findings.json` — ensures critical findings appear first for future reference.
- **Finding-schema aware extraction**: Unlike simple text scraping, the harvester recognizes structured `Finding` objects and preserves them intact, maintaining the `dimension`, `severity`, `root_cause`, `fix_strategy`, and `fix_complexity` fields for future pattern matching.
- **Goal evidence → recipe**: Converts met goals' `evidence` into recipe-format gotchas for the knowhow board.
- **Decision log → gotcha**: Converts failed gate verdicts into gotcha-format learnings, preserving the `gateType` and `stepIndex` for traceability.
