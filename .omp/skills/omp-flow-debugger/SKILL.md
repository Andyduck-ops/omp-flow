---
name: omp-flow-debugger
description: Automated failure analysis and gap-fix skill activated when Ralph FSM steps or tests fail, with root-cause identification and auto-fix loop management.
---

# OMP-Flow Debugger Skill

## Trigger
- Activates when FSM transitions to `S_AUTOFIX` (src/core/fsm.ts:18) — triggered by `advanceNextStep` detecting a `failed` step (src/core/fsm.ts:169).
- Activates when `completeStep` returns `NEEDS_RETRY` with a `quality-gate` decision (src/core/fsm.ts:281).
- Activates on `/omp-flow:gaps` command for explicit gap analysis.
- Activates when `RalphStatus.autoFixIterations > 0` (src/core/fsm.ts:184) and `retry_count < maxAutoFixIterations` (default 3, src/core/fsm.ts:61).
- Activates when `isAutoFixExhausted()` (src/core/fsm.ts:335) returns `false` and pending failed steps exist.

## Inputs
- **Failure logs**: `.omp-flow/scratch/{taskId}/*.log` — test output, error traces, stderr captures.
- **FSM status**: `RalphStatus` from `getStatus()` (src/core/fsm.ts:134) — `steps[]` with `status: 'failed'`, `retry_count`, `completion_summary`, `completion_caveats`.
- **Decision log**: `getDecisionLog()` (src/core/fsm.ts:319) — `DecisionLogEntry[]` with `gateType`, `verdict` ('retry', 'blocked', 'concerns').
- **Findings**: `.omp-flow/findings/{taskId}-findings.json` — `Finding[]` from reviewer, especially those with `root_cause.is_symptom: true` (src/core/finding.ts:36).
- **Context package**: `.omp-flow/scratch/{taskId}/context-package.json` — boundary contract and requirements.
- **Prior context**: `<prior-step-context>` from `buildPriorContext(status, 5)` (src/core/fsm.ts:221) — includes the failed step's caveats and deferred items.
- **Readiness scores**: `readiness_checked` events from EventBus — `gateStatus: 'FAIL'` entries indicate where readiness dropped below 60%.

## Workflow
1. **Identify failure point**: Read `RalphStatus.steps[]` to find steps with `status: 'failed'`. Extract `completion_summary`, `completion_caveats[]`, `retry_count` from the failed step. Check `DecisionLogEntry` for the gate that failed (`quality-gate`, `goal-gate`, `scope-gate`, `reground-gate`).
2. **Classify the gate**: Determine which decision gate type failed (src/core/fsm.ts:273):
   - `quality-gate`: Test failures, lint errors, type errors → code defect.
   - `goal-gate`: `doneWhen` criteria unmet → incomplete implementation.
   - `scope-gate`: Boundary violation detected → scope drift.
   - `reground-gate`: Context invalidation → needs re-reading source.
3. **Gather evidence**: Read failure logs from `.omp-flow/scratch/{taskId}/`. Parse error messages, stack traces, test assertion failures. Cross-reference with `Finding` objects from the reviewer — focus on findings where `root_cause.is_symptom: true` (these are downstream effects, not root causes).
4. **Root-cause analysis**: Construct `IssueAnalysis` (src/core/finding.ts:79) for each failure:
   - `iss_id`: unique identifier.
   - `root_cause`: the underlying cause (not the symptom).
   - `affected_files[]`: files requiring changes.
   - `impact_scope`: blast radius description.
   - `fix_direction`: recommended approach.
   - `confidence`: high, medium, low.
   - `depth`: 'quick' | 'standard' | 'deep'.
5. **Trace related findings**: For each symptom finding, follow `root_cause.related_findings[]` (src/core/finding.ts:35) to find the root-cause finding. The root cause has `is_symptom: false`; symptoms have `is_symptom: true`.
6. **Formulate mini-plan**: Create a focused gap-fix plan (`--gaps` mode) that addresses ONLY the missing logic — no scope expansion. The plan lists:
   - Specific files and line ranges to edit.
   - Exact code changes (add/modify/remove).
   - Tests to add or fix.
   - Verification steps.
7. **Check auto-fix budget**: Read `retry_count` and `maxAutoFixIterations` (default 3). If `retry_count >= maxRetries`, the step will be `skipped` (src/core/fsm.ts:173) — escalate to manual intervention instead of retrying.
8. **Re-dispatch**: The orchestrator's `advanceNextStep` (src/core/fsm.ts:153) automatically re-dispatches the failed step with `retry_count` incremented. The prompt includes `Retry: N/3` info (src/core/fsm.ts:203). Inject the mini-plan into the subagent's context via `appendDiscovery(agentId, 'pattern', { miniPlan, rootCause, fixDirection })`.
9. **Verify fix**: After the executor re-runs, the reviewer re-evaluates. If `DONE`, the quality-gate verdict becomes `pass` (src/core/fsm.ts:280) and the step exits the auto-fix loop. If still `NEEDS_RETRY`, `retry_count` increments again.
10. **Escalate on exhaustion**: If `isAutoFixExhausted()` returns `true` (src/core/fsm.ts:335), log a warning, mark the step as needing manual intervention, and emit a `step_failed` event. The `onSessionStop` hook (src/omp/extension.ts:243) will set `shouldContinue: false`.

## Outputs
- **Mini-plan**: Written to `.omp-flow/scratch/{taskId}/gap-fix-{retry_count}.md` — focused fix plan.
- **IssueAnalysis**: Written to `.omp-flow/findings/{taskId}-issues.json` — array of `IssueAnalysis` objects.
- **discoveries.ndjson**: `appendDiscovery(agentId, 'degradation_event', { failure, rootCause, retryCount })` (src/core/events.ts:237) — type `degradation_event` for failure tracking.
- **EventBus events**: `step_failed`, `drift_detected` (if scope-gate), `boundary_violation` (if scope-gate).
- **FSM state**: Step `retry_count` incremented, `autoFixIterations` incremented (src/core/fsm.ts:184). On success, step → `completed`. On exhaustion, step → `skipped`.
- **Return format**: `{ rootCauses: IssueAnalysis[], miniPlan: string, retryCount: number, maxRetries: number, exhausted: boolean }`.

## Boundary Contract
- **In-scope**: `.omp-flow/scratch/{taskId}/gap-fix-*.md`, `.omp-flow/findings/{taskId}-issues.json`, EventBus discoveries (degradation_event type), FSM status (retry_count via `completeStep`).
- **Out-of-scope**: Application source code (debugger analyzes but does not edit — dispatches executor for fixes), `.omp-flow/specs/` (read-only), `.omp-flow/knowhow/` (read-only).
- **Forbidden**: Directly editing source code (must dispatch executor), bypassing the auto-fix iteration cap, deleting failure logs, modifying `decisionLog` directly (use `completeStep`), retrying beyond `maxAutoFixIterations` (src/core/fsm.ts:61).

## FSM Integration
- Primary state: `S_AUTOFIX` (src/core/fsm.ts:18) — entered when `advanceNextStep` finds a `failed` step (src/core/fsm.ts:185).
- Routes through `S_DECISION_EVAL` (src/core/fsm.ts:272) — evaluates quality-gate verdict:
  - `pass`: exit auto-fix loop, proceed to next step.
  - `retry`: re-enter `S_AUTOFIX`, increment `retry_count` (src/core/fsm.ts:285).
  - `blocked`: halt, require manual intervention.
- Auto-fix loop: max 3 iterations (`DEFAULT_MAX_AUTOFIX`, src/core/fsm.ts:61). `retry_count` tracked per-step (src/core/fsm.ts:35). `autoFixIterations` tracked per-session (src/core/fsm.ts:53).
- `isAutoFixExhausted()` (src/core/fsm.ts:335): returns `true` when `autoFixIterations >= maxAutoFixIterations`.
- On exhaustion: step → `skipped` (src/core/fsm.ts:174), `onSessionStop` sets `shouldContinue: false` (src/omp/extension.ts:245).
- Gap analysis (`--gaps` flag): operates outside the auto-fix loop for manual root-cause investigation.

## Coordination
- **IRC**: Notifies executor of the mini-plan: `irc(op="send", to="<ExecutorId>", message="Gap fix: {rootCause}. Files: {affectedFiles}")`. Notifies reviewer of expected re-evaluation: `irc(op="send", to="<ReviewerId>", message="Re-evaluate step {idx} after gap fix")`. Escalates to Main on exhaustion: `irc(op="send", to="Main", message="Auto-fix exhausted on step {idx}. Manual intervention required.")`.
- **discoveries.ndjson**: Writes `degradation_event` entries with failure details. Reads `finding` type entries from the reviewer for root-cause tracing.
- **priorContext**: Reads the failed step's `completion_caveats` and `completion_deferred` from the sliding window — deferred items may be the source of the failure.
- **Writes for downstream**: `IssueAnalysis` objects in `.omp-flow/findings/` are consumed by `omp-flow-harvester` for learning extraction. `degradation_event` discoveries inform future task planning.

## Finding Schema Usage
- Reads `Finding[]` from `.omp-flow/findings/{taskId}-findings.json` — uses `root_cause` field (src/core/finding.ts:65) to distinguish symptoms from root causes.
- **Root cause tracing**: `FindingRootCause.is_symptom` (src/core/finding.ts:36) — `true` means this finding is a downstream effect; follow `related_findings[]` (src/core/finding.ts:35) to find the actual root cause (`is_symptom: false`).
- **Fix dependencies**: `fix_dependencies[]` (src/core/finding.ts:70) — IDs of findings that must be resolved before this one; used to order the mini-plan.
- **IssueAnalysis**: Constructs `IssueAnalysis` objects (src/core/finding.ts:79) with `root_cause`, `affected_files[]`, `fix_direction`, `confidence`, `depth` — a focused diagnostic output for each failure.
- **Severity routing**: Uses `sortFindingsBySeverity` (src/core/finding.ts:116) to prioritize critical/high findings in the mini-plan. Uses `filterBySeverity` (src/core/finding.ts:130) to focus on actionable findings.
- **Finding-to-fix pipeline**: Debugger sits between reviewer (findings generation) and executor (fix application) — translates `Finding` objects into actionable `IssueAnalysis` + mini-plan, respecting `fix_strategy` (minimal, refactor, rewrite, defer) and `fix_complexity` (trivial, low, medium, high).

## Debug Engine Integration (`src/core/debug-engine.ts`)
- **`investigate(symptom, findings, config)`**: Accepts a symptom string, an array of `Finding[]`, and an `InvestigationConfig`. Generates up to **3 hypotheses** (hard cap) from findings, backward-traces the root cause, and returns an `InvestigationResult`. If all hypotheses are rejected and no root cause is found, includes an `AskUserQuestion` escalation in the result.
- **`traceRootCause(symptom, findings, evidenceDir?)`**: 5-whys backward tracing. Filters findings with `is_symptom: true`, follows `related_findings[]` chains up to depth 5 to reach the root cause (`is_symptom: false`). Returns `RootCauseTrace` or `null` when no symptom findings exist. Persists each chain step as evidence.
- **`escalate(symptom, hypotheses, overrides?)`**: Generates a structured `AskUserQuestion` with context (symptom, hypotheses tried with status), suggestions, and timestamp. Used when the 3-hypothesis cap is exhausted without a confirmed root cause.
- **Evidence persistence**: All three functions append to `<evidenceDir>/evidence.ndjson` with typed entries (`hypothesis_generated`, `hypothesis_updated`, `root_cause_found`, `escalated`, `evidence_collected`).
- **Hypothesis cap enforcement**: `InvestigationConfig.maxHypotheses` is clamped to `[1, 3]` internally. After all hypotheses are rejected, `investigation.exhausted` is `true` and `investigation.escalation` is populated.
- **Type reuse**: Output `IssueAnalysis[]` reuses the `IssueAnalysis` interface from `src/core/finding.ts`. The `Hypothesis.confidence` and `RootCauseTrace.rootCauseFindingId` cross-reference `Finding` objects.

## Break-Loop Retrospective

Invoked after auto-fix exhaustion or persistent failure sequences. The retrospective breaks out of the reactive fix-loop by analyzing why the failure happened, why previous fixes failed, and how to prevent recurrence. It is the **post-loop** phase that feeds `omp-flow-harvester` and updates the knowledge base.

### Trigger
- Called when `isAutoFixExhausted()` returns `true` and retry budget is spent (src/core/fsm.ts:335).
- Called when a step fails after 3 retries with symptom recurrence — the same `RootCauseTrace.chain` repeats.
- Called manually via `/omp-flow:retro` command.
- Invoked when `degradation_event` discoveries exist for the same task but no progress across retries.

### Inputs
- **Auto-fix history**: All `.omp-flow/scratch/{taskId}/gap-fix-*.md` plans produced during retry iterations.
- **Hypothesis trail**: `InvestigationResult.hypotheses[]` from `investigate()` calls across retries — each hypothesis's `status`, `confidence`, and `evidenceFor`/`evidenceAgainst`.
- **Root-cause traces**: `RootCauseTrace.chain` from `traceRootCause()` calls — the 5-whys chain per retry.
- **IssueAnalysis**: `IssueAnalysis[]` from each retry's `investigate()` output — `root_cause`, `fix_direction`, `depth`.
- **Evidence log**: `<evidenceDir>/evidence.ndjson` with `hypothesis_generated`, `hypothesis_updated`, `evidence_collected`, `root_cause_found`, `escalated` entries.
- **Findings with fix attempts**: `Finding[]` where `fix_attempts > 0` — shows what was tried and failed.
- **Decision log**: `DecisionLogEntry[]` from the FSM — `verdict: 'retry'` entries for the failed step.
- **Failure logs**: `.omp-flow/scratch/{taskId}/*.log` from all retry iterations.

### 1. Five Root-Cause Categories

Every failure must be classified into exactly one of these categories. The category is stored as `IssueAnalysis.root_cause` prefixed with the category, e.g. `design-gap: Missing null-check in input pipeline`.

| # | Category | Description | Indicators | Typical fix direction |
|---|----------|-------------|------------|----------------------|
| 1 | `design-gap` | The specification or architecture lacks a required behavior, edge case, or validation path. | Bound conditions undefined; error path not modeled; missing fallback logic. | Add missing design element; update spec first. |
| 2 | `flawed-assumption` | The implementation assumes a precondition, invariant, or environment property that does not hold. | Test passes in isolation but fails in integration; environment-dependent failures; hardcoded values. | Remove or guard the assumption; make the invariant explicit. |
| 3 | `change-propagation` | A change in one module broke consumers that were not updated. | Caller fails after callee API change; type/interface mismatch; re-exports missing. | Update all consumers; add integration tests for the boundary. |
| 4 | `test-coverage` | The test suite lacks coverage for the failing path — the code was correct but undefended. | Regression on a previously unexercised path; coverage gap report exists; tests pass despite the bug. | Add targeted test for the uncovered path; do not redesign code. |
| 5 | `implicit-assumption` | A concealed or undocumented invariant was violated by the change, often from global state or ordering. | Non-deterministic failures; order-dependent behavior; global mutable state interactions. | Document the invariant; remove or enforce it with an explicit guard. |

**Category assignment rules:**
- `design-gap` takes priority when the missing path is clearly defined in the spec but not implemented.
- `flawed-assumption` takes priority when the failure only manifests under certain conditions the code assumed absent.
- `change-propagation` takes priority when the failing file was not directly edited but a dependency was.
- `test-coverage` takes priority when the code logic is correct but no test defends the failing scenario.
- `implicit-assumption` takes priority when the failure is order-dependent, non-deterministic, or tied to global state.
- If multiple categories apply, pick the **deepest** cause — the one that, if fixed, eliminates the others.
- When uncertain, run `traceRootCause(symptom, findings)` and examine the chain: the deepest `chain[depth].because` usually reveals the category.

### 2. Why-Fixes-Failed Analysis

After auto-fix exhaustion, analyze **why each attempted fix failed** before proposing a new approach. This prevents repeating the same incorrect treatment.

#### Analysis procedure
1. **Collect fix attempts**: Read all `gap-fix-{1..N}.md` files. For each, extract the fix description, files changed, and the verification outcome.
2. **For each attempt, classify the failure mode**:
   - `wrong-target`: Fix addressed a symptom, not the root cause. The `RootCauseTrace.chain` did not reach depth 5, or `is_symptom: true` findings were treated as root.
   - `incomplete`: Fix addressed the root cause partially but missed a related code path or side effect. Indicated by same symptom but different location after fix.
   - `regression`: Fix introduced a new failure (different symptom). Indicated by a new `RootCauseTrace.chain` or different `InvestigationResult.symptom`.
   - `superficial`: Fix addressed the error handling instead of the source. Indicated by wrapped try/catch or suppressed error without correcting the logic.
   - `scope-creep`: Fix overscoped and introduced complexity that caused a new `scope-gate` failure. Indicated by boundary violations in the recheck.
3. **Cross-reference with hypothesis history**: For each fix attempt, find the corresponding `Hypothesis` by `findingRef`. Check if the hypothesis was `confirmed` or `rejected` at the time. A `confirmed` hypothesis that led to a `wrong-target` fix means the hypothesis itself was wrong — flag this.
4. **Produce a `WhyFixesFailed` summary**:

```typescript
export interface WhyFixesFailed {
  attemptCount: number;
  attempts: Array<{
    retryIndex: number;
    fixSummary: string;
    failureMode: 'wrong-target' | 'incomplete' | 'regression' | 'superficial' | 'scope-creep';
    rootCauseCategory: string | null;
    hypothesisId: string | null;
    evidenceFiles: string[];
  }>;
  dominantFailureMode: string;
  recommendedSwitch: string;
}
```

5. **Route to next action** based on `dominantFailureMode`:
   - `wrong-target` → Re-run `traceRootCause()` with deeper evidence. Escalate via `escalate()` with the `WhyFixesFailed` summary in `suggestions`.
   - `incomplete` → Expand the `IssueAnalysis.affected_files[]` and re-run `investigate()`.
   - `regression` → Roll back the last fix, add regression tests, then re-apply the fix with guardrails.
   - `superficial` → Delete the error-suppression code, then fix the actual logic gap. File a new finding with `is_symptom: false`.
   - `scope-creep` → Revert the overscoped changes, re-anchor on the boundary contract from the context package.

**Evidence persistence**: The `WhyFixesFailed` summary is appended to `<evidenceDir>/evidence.ndjson` with a new `type: 'fix_failure_analysis'`.

### 3. Prevention Spec Capture

After root cause and why-fixes-failed analysis, capture a **prevention spec** that feeds into future tasks. This is written as a structured block in `.omp-flow/knowhow/{taskId}-prevention-{rootCauseCategory}.md`.

#### Prevention spec structure

```markdown
## Prevention Spec: {rootCauseCategory}

**Task**: {taskId}
**Original failure**: {symptom}
**Root cause**: {RootCauseTrace.root_cause}
**Failure mode**: {WhyFixesFailed.dominantFailureMode}

### Trigger Scenario
Describe the specific scenario that triggers this failure pattern.

### Guards
- [ ] Code-level guard: {specific check, type, or invariant to add}
- [ ] Test-level guard: {specific test scenario to cover}
- [ ] Process-level guard: {review checklist, FSM gate, or spec requirement}

### Prevention Rule
{A single, actionable rule that prevents recurrence. This must be concrete enough for an executor to apply.}

### Related Findings
- {findingId}: {finding title} ([is_symptom: true/false])

### Auto-Fix Caveats
- What went wrong in each retry: {retry-index}: {failure-mode}
- What NOT to try again: {summarize exhausted approaches}

---
```

#### Capture workflow
1. **Create the spec file** at `.omp-flow/knowhow/{taskId}-prevention-{rootCauseCategory}.md`.
2. **Register the spec** in the knowledge base by calling `appendDiscovery(agentId, 'prevention_spec', { taskId, category, rule, filePath })` (src/core/events.ts:237).
3. **Cross-reference** in the harvester: the `omp-flow-harvester` skill reads prevention specs from `.omp-flow/knowhow/` and extracts `knowhow-*.md` entries.
4. **Update the Finding**: Set `Finding.fix_strategy` to `'prevent'` (a new strategy value) on the root-cause finding, linking to the prevention spec path via `Finding.references[]`.

### Debug Engine Integration

The retrospective uses these `src/core/debug-engine.ts` functions:
- **`investigate(symptom, findings, config)`**: Called once per retry to generate hypotheses. The retrospective reads the accumulated hypotheses across all retries to detect hypothesis stagnation (same hypothesis generated each time).
- **`traceRootCause(symptom, findings, evidenceDir?)`**: Called to re-derive the 5-whys chain. The retrospective compares chain depth across retries — if depth never reaches 5, the investigation is incomplete.
- **`escalate(symptom, hypotheses, overrides?)`**: Called when the retrospective determines human intervention is needed. The `WhyFixesFailed` summary is passed in `overrides.suggestions` for richer context.
- **`InvestigationResult.exhausted`**: Used to determine whether to enter the retrospective at all — if hypotheses were never exhausted, retry with a fresh config may suffice.

### Outputs
- `WhyFixesFailed` summary: appended to `<evidenceDir>/evidence.ndjson` as `type: 'fix_failure_analysis'`.
- Prevention spec: written to `.omp-flow/knowhow/{taskId}-prevention-{rootCauseCategory}.md`.
- Discoveries: `appendDiscovery(agentId, 'prevention_spec', { taskId, category, rule, filePath })` (src/core/events.ts:237).
- Findings update: `Finding.fix_strategy = 'prevent'` on the root-cause finding.
- **Return format**: `{ rootCauseCategory: string, whyFixesFailed: WhyFixesFailed, preventionSpec: string, evidenceDir: string }`.

### Boundary Contract
- **In-scope**: `.omp-flow/knowhow/{taskId}-prevention-*.md`, evidence.ndjson fix_failure_analysis entries, reading all `gap-fix-*.md` files across retries.
- **Out-of-scope**: Rewriting previous gap-fix plans (read-only), modifying FSM state directly (use `completeStep`), altering application source code (dispatch executor).
- **Forbidden**: Silently clearing auto-fix history, skipping the why-fixes-failed analysis when `attemptCount > 0`, assigning an incorrect category to mask a design-gap.
