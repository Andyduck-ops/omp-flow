---
name: omp-flow-reviewer
description: Quality audit skill for reviewing code changes against boundary contracts, security rules, and project specifications using the Finding schema.
---

# OMP-Flow Reviewer Skill

## Trigger
- Activates on `/omp-flow:grill` command.
- Activates when FSM transitions to `S_GRILL` (src/core/fsm.ts:4) or `S_QUALITY_MODE`.
- Activates when `advanceNextStep` returns a step with `stage: 'review'` and `skill: 'grill'`.
- Recommended model tier: `slow` (src/omp/extension.ts:117 — roles containing "reviewer" or "grill" get `slow` tier).

## Inputs
- **Context package**: `.omp-flow/scratch/{taskId}/context-package.json` — `BoundaryContract` with in_scope, out_of_scope, constraints, done_when.
- **Modified files**: List of files changed by executor subagents (tracked via `onToolCall` boundary checks, src/omp/extension.ts:197).
- **Spec rules**: `.omp-flow/specs/*.md` — active spec rules for compliance checking. Role-filtered: reviewer gets specs matching "review" or "quality" (src/core/context-package.ts:210).
- **Prior context**: `<prior-step-context>` from `buildPriorContext` (src/core/fsm.ts:221) — executor step summaries, caveats, decisions, deferred items.
- **Recent discoveries**: `<recent-discoveries>` from `EventBus.recentDiscoveries(15)` — for the reviewer role the discovery window is bumped from 5 to 15 (src/omp/extension.ts). Executor `implementation_note` discoveries carry an `assumptions` field; treat them as falsification targets (Step 7), not trusted context.
- **Goals**: `UnifiedWorkspaceManager.getGoals()` (src/core/state.ts:241) — tracked goals with `doneWhen` criteria and `status`.
- **EventBus events**: `boundary_violation` and `readiness_checked` events emitted during execution (src/omp/extension.ts:207, 218).

## Workflow
1. **Run boundary check**: Call `executeMaestroBoundaryCheck(taskId, modifiedFiles, workspaceDir)` (src/tools/drift-check-tool.ts:81). This loads `.omp-flow/scratch/{taskId}/context-package.json`, checks each modified file against `out_of_scope` glob patterns via `matchGlobPattern`, and returns `DriftCheckResult` with `hasDrift`, `violations[]`, `passedCriteria[]`, `readiness`.
2. **Calculate readiness score**: `calculateReadinessScore` (src/tools/drift-check-tool.ts:135) computes a 6-Dimension × 3-Level score:
   - **Project-level metrics** (40% weight, 10 pts each):
     - **Completeness** (10 max): 10 if zero drift + has requirements, 6 if zero drift only, 2 if drift detected.
     - **Consistency** (10 max): 10 if zero drift, 4 if drift.
     - **Traceability** (10 max): 10 if in-scope files modified, 6 otherwise.
     - **Depth** (10 max): 10 if spec rules loaded, 6 otherwise.
   - **Dimension-level metrics** (60% weight, 6 core dims × 10 pts each):
     - **Security** (10 max): 10 advisory, 6 moderate, 2 critical — based on security findings severity.
     - **Correctness** (10 max): 10 advisory, 6 moderate, 2 critical — based on correctness findings severity.
     - **Performance** (10 max): 10 advisory, 6 moderate, 2 critical — based on performance findings severity.
     - **Maintainability** (10 max): 10 advisory, 6 moderate, 2 critical — based on maintainability findings severity.
     - **Testing** (10 max): 10 advisory, 6 moderate, 2 critical — based on testing findings severity.
     - **Architecture** (10 max): 10 advisory, 6 moderate, 2 critical — based on architecture findings severity.
   - **Level per dimension**: `critical` (blocking — any critical/high finding in dimension), `moderate` (should-fix — any medium finding, no critical/high), `advisory` (optional — low/info findings only, or none).
   - **Gate status**: `PASS` (≥80), `REVIEW` (60-79), `FAIL` (<60).
   - `computeDimensionReadiness` (src/core/finding.ts:221) derives the per-dimension breakdown from `Finding[]`.
3. **Generate findings**: For each issue discovered, construct a `Finding` via `createFinding(partial)` (src/core/finding.ts:165) — the factory applies lifecycle defaults (`status: 'open'`, `fix_attempts: 0`) and generates an `id` when absent. Required fields:
   - `id`: generated via `generateFindingId(dimension, index)` (src/core/finding.ts:111) — dimension-prefixed (SEC-001, COR-002, PRF-003, MNT-004, TST-005, ARC-006, DOC-007, DEP-008, UIX-009, A11Y-010).
   - `dimension`: one of 10 dimensions (security, correctness, performance, maintainability, testing, architecture, documentation, dependency, ui-ux, accessibility).
   - `severity`: critical, high, medium, low, info.
   - `source`: tool, llm, tool+llm, manual.
   - `fix_strategy`: minimal, refactor, rewrite, defer.
   - `fix_complexity`: trivial, low, medium, high.
   - `fix_dependencies[]`: IDs of findings that must be fixed first.
4. **Sort findings**: Call `sortFindingsBySeverity(findings)` (src/core/finding.ts:131) — orders critical → high → medium → low → info for topological fix ordering.
5. **Filter unresolved**: Call `filterBySeverity(findings, 'medium')` (src/core/finding.ts:145) to focus on actionable findings at or above medium severity. `filterBySeverity` now keys off the `status` lifecycle: a Finding is unresolved iff `status !== 'fixed' && status !== 'deferred'` (deferred findings remain visible so the escalation pass can see them).

### 5b. AUTO-FIX LOOP (NEW — Gap 2 closed)
For each `Finding` F with `severity in {'critical','high','medium'}` and `status === 'open'`, processed in `sortFindingsBySeverity` order:

#### GUARDS (all must be true to attempt a direct fix)
- `F.fix_strategy === 'minimal'`
- `F.fix_complexity === 'trivial'`
- `F.suggested_fix` is **self-contained** — names a concrete patch referencing only `F.location.file` (exact file + line + change). Vague directives such as "fix the race condition" defer. Self-containment test: would a fresh executor with no manifest context be able to apply the patch?
- `F.fix_attempts < 3` (`maxAutoFixIterations = 3`)

#### If guards pass
1. **Mark fixing**: `F = transitionFindingStatus(F, 'fixing', agentId)` (src/core/finding.ts:179). This sets `status='fixing'`, records `fixed_by=agentId`. Persist the findings file before editing.
2. **Apply fix**: Use the `edit` tool (SWAP/DEL/INS per `F.suggested_fix` and `F.location`). Every edit is boundary-checked by `onToolCall` (src/omp/extension.ts) — for the reviewer+fix path a `boundary_violation` is a hard THROW, not a warn-and-allow. If the throw fires, catch it, set `F.status = 'deferred'`, emit a `deferred_fix` discovery, and do NOT retry the same edit.
3. **RECHECK** (all three must be green for a fix to land):
   a. `executeMaestroBoundaryCheck(taskId, modifiedFiles)` — must return `boundary_ok: true` (i.e. `hasDrift === false`).
   b. Workspace-wide diagnostics: `lsp diagnostics` on every file touched by the edit (and its import graph).
   c. `npm run build` — must exit 0 with zero TypeScript errors.
4. **Record result**: set `F.last_recheck_result = { boundary_ok, build_ok, diagnostics }` (the `RecheckResult` shape from src/core/finding.ts:56).
5. **All green** → `F = transitionFindingStatus(F, 'fixed', agentId)` (sets `fixed_at` ISO timestamp), then set `F.last_fix_summary` to a human-readable summary of the applied patch.
6. **Recheck failed** → `F.fix_attempts++`, `F = transitionFindingStatus(F, 'open', agentId)`, set `F.last_fix_summary = "attempt N: <what failed>"`. If `F.fix_attempts < 3`, loop back to GUARDS for another attempt on F; otherwise fall through to the defer path below.
7. **Guard fails or budget exhausted** → `F = transitionFindingStatus(F, 'deferred', agentId)`.

#### If guards fail (non-trivial / refactor / rewrite)
- `F = transitionFindingStatus(F, 'deferred', agentId)`.
- Escalate via `NEEDS_RETRY` to the FSM — the executor is re-dispatched with a `<fix-directives>` block built from the deferred findings (`fsm.ts:advanceNextStep` embeds `{id, severity, dimension, location, suggested_fix, last_fix_summary}` per finding).

#### After the loop
- Any F with `status in {'open','deferred'}` AND `severity in {'critical','high'}` forces `completionStatus = NEEDS_RETRY`.
- Emit a `deferred_fix` discovery for each deferred F via `appendDiscovery(agentId, 'deferred_fix', { findingId, reason, suggested_fix }, findingId)` so the executor's `<recent-discoveries>` carries the fix directive.

### 6. Final pass (fullScope only — F-003)
When `step.fullScope === true` (set on the LAST grill step by `createSession`, src/core/fsm.ts):
- Load ALL affected package specs — the union of every sub-task scope across all waves in `plan.json`, not just the latest chunk.
- Widen `executeMaestroBoundaryCheck` to the union of all packages' `out_of_scope` glob patterns.
- This is the LAST check before commit — it must cover the full scope. A defect found here that is `severity >= 'high'` AND `dimension in {'architecture','correctness'}` is a contract-level defect and triggers `rollbackToPlanning(reason, findingId)` (src/core/fsm.ts) — `S_GRILL → S_PLANNING`, `rollbackCount` capped at `DEFAULT_MAX_ROLLBACK = 1`. A second rollback attempt becomes a hard `S_DECISION_EVAL` blocked verdict.

### 7. IRC handoff protocol (NEW — from OmpNativeLeverager)
Before issuing formal Findings, the reviewer DMs the implementer agent for clarification to collapse `NEEDS_RETRY` cycles into an inline debate:
- `irc(op='send', to='<implementerId>', message='...')` — ask about ambiguous assumptions, suspicious implement-only manifest entries, or unexpected behavior. Only send a Finding if the implementer cannot resolve it inline.
- **Read `recentDiscoveries(15)`** as primary review material (the implementer's `implementation_note` discoveries carry an `assumptions` field). For the reviewer role the discovery window is bumped from 5 to 15 (src/omp/extension.ts).
- **Frame discoveries as FALSIFICATION TARGETS, not trusted context.** An executor's `implementation_note` is the implementer's *claim* about its own work — probe it, do not anchor on it.
- **Use `diffManifests(taskId)` for directed skepticism.** It returns `{implementOnly, checkOnly, shared}` (paths + reason only, NO file contents). `implementOnly` entries are paths the reviewer did NOT see via `check.jsonl` — these are exactly the files to probe via IRC ("you touched `auth.ts` but it is not in my check manifest — what did you change and why?"). The IRC escape hatch is the substitute for reading `implement.jsonl`, which the reviewer MUST NOT do.

8. **Check goals**: For each `Goal` in `getGoals()`, evaluate whether `doneWhen` criteria are met. Call `updateGoalStatus(goalId, 'met' | 'unmet', evidence)` (src/core/state.ts:230) with evidence.
9. **Determine gate status**: Combine readiness score + finding severities + goal status + auto-fix loop outcome:
   - `DONE`: PASS gate (≥80), **zero `status === 'open'` critical/high findings** (all either `fixed` or successfully deferred-and-escalated), all goals met.
   - `DONE_WITH_CONCERNS`: PASS/REVIEW gate, only `medium` open findings remain, most goals met.
   - `NEEDS_RETRY`: FAIL gate (<60), OR any `critical`/`high` finding still `open` or `deferred` after exhausting `fix_attempts`, OR goals unmet.
   - `BLOCKED`: Cannot evaluate (missing context package, malformed files).
10. **Complete step**: Call `completeStep(idx, completionStatus, summary, { caveats, decisions, deferred })` (src/core/fsm.ts:246). If the step has a `quality-gate` decision (src/core/fsm.ts:276):
   - `DONE` → verdict `pass`, proceed.
   - `NEEDS_RETRY` → verdict `retry`, step marked `failed`, `retry_count` incremented, enters `S_AUTOFIX`.
   - `DONE_WITH_CONCERNS` → verdict `concerns`, proceed with caveats.
   - `BLOCKED` → verdict `blocked`.

## Outputs
- **Findings**: `.omp-flow/findings/{taskId}-findings.json` — array of `Finding` objects sorted by severity.
- **Readiness score**: Emitted as `readiness_checked` event (src/omp/extension.ts:218) with `{ score, gateStatus, breakdown }`.
- **Goal updates**: `state.json` `goals[]` updated with `status: 'met' | 'unmet'` and `evidence`.
- **Decision log**: `DecisionLogEntry` appended to `status.json` `decisionLog[]` (src/core/fsm.ts:296) with `gateType`, `verdict`, `timestamp`.
- **EventBus events**: `finding_recorded`, `readiness_checked`, `boundary_violation` (if drift), `fix_applied` (per 5b fix), `deferred_fix` (per finding deferred to executor), `step_completed` or `step_failed`.
- **Return format**: `{ gateStatus, readinessScore, findings: Finding[], fixLog: { findingId, attempts, finalStatus, fixedBy?, reason? }[], goalStatuses: { id, status, evidence }[], completionStatus }`. `fixLog` records the outcome of the 5b AUTO-FIX LOOP for each finding the reviewer touched.

## Boundary Contract
- **In-scope**: `.omp-flow/findings/*.json`, `.omp-flow/state.json` (goals only), `.omp-flow/fsm/*/status.json` (decisionLog via `completeStep`), EventBus events (read + append), and `src/` files listed in `boundary.in_scope` **for the fix path only** (5b AUTO-FIX LOOP, gated by the guards above).
- **Out-of-scope**: Files matched by `boundary.out_of_scope` glob patterns, `.omp-flow/specs/` (read-only), `.omp-flow/knowhow/` (read-only), and `implement.jsonl` — the reviewer has NO read path to `implement.jsonl`, not for fixing, not for disambiguating, not for "understanding context."
- **onToolCall enforcement**: Every `edit` call in the 5b fix path is intercepted by `onToolCall` (src/omp/extension.ts). For the reviewer+fix path, a `boundary_violation` is a hard THROW (not warn-and-allow as on non-fix paths). The reviewer catches the throw → `F.status = 'deferred'`, no retry of the same edit. Non-fix paths keep the warn-and-allow behavior.
- **Forbidden**: Editing any file NOT in `boundary.in_scope` (enforced by the THROW above), deleting or modifying `events.jsonl`, bypassing the Finding schema (all issues must be structured as `Finding` objects via `createFinding`), skipping `sortFindingsBySeverity` before persisting, applying a fix whose guard check failed, reading `implement.jsonl` for any purpose.

## FSM Integration
- Primary state: `S_GRILL` (src/core/fsm.ts:4) — review stage.
- May operate in `S_QUALITY_MODE` for deep quality analysis.
- Routes through `S_DECISION_EVAL` (src/core/fsm.ts:272) when step has `decision: 'quality-gate'`.
- Quality-gate verdicts: `pass` (DONE), `retry` (NEEDS_RETRY → `S_AUTOFIX`), `concerns` (DONE_WITH_CONCERNS), `blocked` (BLOCKED) (src/core/fsm.ts:276-290).
- On `NEEDS_RETRY`: enters auto-fix loop (max 3 iterations, src/core/fsm.ts:61). The re-dispatched executor receives a `<fix-directives>` block built from deferred findings. After exhaustion, step is `skipped` (src/core/fsm.ts:174).
- **fullScope** (F-003): the last grill step has `step.fullScope === true` (set by `createSession`, src/core/fsm.ts). On this step the reviewer widens scope to all affected packages (Step 6). A contract-level defect (`severity >= 'high'` AND `dimension in {'architecture','correctness'}`) triggers `rollbackToPlanning(reason, findingId)` — `S_GRILL → S_PLANNING`, `rollbackCount` capped at `DEFAULT_MAX_ROLLBACK = 1`; a second attempt becomes a hard `S_DECISION_EVAL` blocked verdict.
- **Hybrid fix ownership**: the reviewer fixes trivial/minimal findings inline (5b AUTO-FIX LOOP); the executor is re-dispatched with `<fix-directives>` for refactor/rewrite/high-complexity findings the reviewer deferred.

## Coordination
- **IRC (pre-Finding handoff, Step 7)**: Before issuing formal Findings, DM the implementer agent for clarification: `irc(op='send', to='<implementerId>', message='...')`. Probe ambiguous assumptions, suspicious implement-only manifest entries (from `diffManifests(taskId)`), or unexpected behavior. Only escalate to a formal Finding if the implementer cannot resolve it inline — this collapses `NEEDS_RETRY` cycles into an inline debate. Broadcasts gate status: `irc(op='send', to='all', message='Quality gate: REVIEW (score 72/100)')`.
- **discoveries.ndjson**: Writes findings as `finding` type entries via `appendDiscovery(agentId, 'finding', findingObject, findingId)`. Writes `deferred_fix` entries (per 5b deferred finding) via `appendDiscovery(agentId, 'deferred_fix', { findingId, reason, suggested_fix }, findingId)` so the executor's `<recent-discoveries>` carries the fix directive. Reads `recentDiscoveries(15)` for executor `implementation_note` entries — framed as falsification targets, not trusted context.
- **priorContext**: Reads executor step's `completion_caveats` and `completion_deferred` from the sliding window to check if deferred items are now resolved.
- **Writes for downstream**: Findings in `.omp-flow/findings/` are consumed by `omp-flow-debugger` for root-cause analysis and by `omp-flow-harvester` for learning extraction. Goal statuses in `state.json` are checked by `omp-flow-harvester` for final goal verification.

## Finding Schema Usage
- Uses the `Finding` interface (src/core/finding.ts:51) as the contract for all review outputs.
- **10 dimensions checked**: security, correctness, performance, maintainability, testing, architecture, documentation, dependency, ui-ux, accessibility (src/core/finding.ts:14-24).
- **Severity levels**: critical, high, medium, low, info (src/core/finding.ts:8) — sorted via `sortFindingsBySeverity` (src/core/finding.ts:116) using the order map.
- **Finding-to-fix pipeline** (hybrid ownership — reviewer fixes inline, executor re-dispatched for complex):
  1. Reviewer generates `Finding[]` via `createFinding(partial)` with `fix_strategy`, `fix_complexity`, `fix_dependencies[]`, `status='open'`, `fix_attempts=0`.
  2. `sortFindingsBySeverity` orders them for topological fix ordering (critical first).
  3. `filterBySeverity(findings, 'medium')` removes low-priority noise (keys off `status`, not the legacy `resolved` flag).
  4. **5b AUTO-FIX LOOP**: reviewer applies trivial/minimal fixes inline via `edit` + `transitionFindingStatus`; rechecks via boundary check + `lsp diagnostics` + `npm run build`; sets `status` to `fixed`/`open`/`deferred`.
  5. Deferred findings (refactor/rewrite/high-complexity, or guard-failed, or budget-exhausted) escalate via `NEEDS_RETRY` — executor re-dispatched with `<fix-directives>` block.
  6. Debugger consumes findings with `root_cause.is_symptom: true` to identify root causes.
  7. Harvester extracts `status === 'fixed'` findings into `harvested-findings.json` (src/core/harvest.ts:75).
- **ID generation**: `generateFindingId(dimension, index)` (src/core/finding.ts:96) — prefix map: SEC, COR, PRF, MNT, TST, ARC, DOC, DEP, UIX, A11Y.
- **Root cause tracking**: `FindingRootCause` (src/core/finding.ts:33) with `description`, `related_findings[]`, `is_symptom` — distinguishes symptoms from root causes for the debugger.
- **6-Dimension × 3-Level model**: `FindingDimensionLevel` (src/core/finding.ts:11) defines 3 readiness levels per dimension — `critical` (blocking), `moderate` (should-fix), `advisory` (optional). `computeDimensionReadiness` (src/core/finding.ts:221) derives per-dimension readiness entries from findings. The readiness score in Step 2 uses this to compute a dimension-level breakdown (60% of total score).
