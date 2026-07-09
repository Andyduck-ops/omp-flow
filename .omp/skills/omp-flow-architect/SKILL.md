---
name: omp-flow-architect
description: Research-grounded architectural planner that turns brainstorm/research/reference inputs into PRD, design, context contracts, tasks.csv, and .task implementation briefs with QbD gates.
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
- `.omp-flow/tasks/{taskId}/research/*.md` — internal/external Research Gate reports. If Research Gate was skipped, the skip reason should be present in `guidance-specification.md` or orchestrator guidance.
- `.omp-flow/tasks/{taskId}/reference/*.meta.json` and digested slices — optional Tier 2 references created by `omp_flow_reference`; bind these through `tasks.csv` `reference` entries such as `ref:<slug>#Lx-y`.
- `.omp-flow/specs/*.md` — active spec rules for constraint injection.
- `.omp-flow/knowhow/harvested-learnings.md` — recent gotchas via `MemoryEngine.getRecentKnowhow(5)`.
- `.omp-flow/state.json` — current milestone, phase, activeWave, existing goals.
- `<prior-step-context>` from `RalphFSMEngine.buildPriorContext` (src/core/fsm.ts:221) — last 5 completed steps.
- `<recent-discoveries>` from `EventBus.recentDiscoveries(5)` (src/core/events.ts:301).

## Workflow
1. **Phase 1 — Conceptual Design**: Parse the user intent, prior brainstorm, Research Gate reports, and digested references into a product + architecture concept. Produce `.omp-flow/tasks/{taskId}/prd.md` and `.omp-flow/tasks/{taskId}/design.md`; PRD captures requirements / DoD, Design captures boundary rationale, tech choices, risk trade-offs, and cross-domain interfaces. If research was skipped, record the skip reason rather than silently designing from a vacuum.
2. **Write context contracts**: When the design introduces architectural decisions or API boundaries, write Markdown records under `.omp-flow/tasks/{taskId}/context/decision/` and `.omp-flow/tasks/{taskId}/context/interface/`. Use stable names such as `ADR-001.md` and `store-api.md`; these are Context plane artifacts for downstream agents to read, not host state.
3. **Run QbD 1 audit**: Dispatch a slow-tier LLM Auditor against `prd.md`, `design.md`, active specs, and context contracts. The audit MUST review boundary rationality, tech selection risk, and spec compliance. On `FAIL`, Architect reads the findings, revises PRD / Design / context contracts, and re-runs QbD 1; loop up to `maxRetries=3`, then escalate to human.
4. **Human approval gate 1**: On QbD 1 `PASS`, stop at `ask` / `resolve` for human approval. If rejected, revise Phase 1 artifacts and repeat QbD 1; if approved, continue to detailed design.
5. **Phase 2 — Detailed Design**: Produce `tasks.csv` and every `.omp-flow/tasks/{taskId}/.task/{rowId}.implement.md` task brief. `tasks.csv` is index / routing metadata only; semantic instructions live in Markdown implement briefs.
6. **Apply Topology Naming**: Every `rowId` / task ID MUST follow `[Unit]-[Deps]-[Seq]`, e.g. `C-AB-001`. `Unit` is the independent domain letter and may map to an isolated worktree such as `worktrees/C/`; `Deps` lists dependency unit letters (`AB` means depends on A and B, empty deps use a placeholder agreed by the runtime); `Seq` is the zero-padded sequence within that Unit. The FSM scheduler derives the DAG from this prefix; do not add or rely on a separate `dependsOn` column.
7. **Bind curated context and references**: For each task row, fill the CSV `context` column with semicolon-separated refs to Phase 1 artifacts, e.g. `decision:ADR-001;interface:store-api`. Fill the CSV `reference` column with semicolon-separated `ref:<slug>#Lx-y` entries only for task-local Tier 2 references created by `omp_flow_reference`. Do not create `context-manifest.jsonl`; do not call or depend on `ContextPackageBuilder.addContextEntry`.
8. **Run QbD 2 audit**: Dispatch a slow-tier LLM Auditor against `tasks.csv`, all `.task/{rowId}.implement.md` files, referenced context contracts, and referenced `ref:` slices. The audit MUST review instruction clarity, interface contract alignment, source-grounding sufficiency for P0 rows, and DAG acyclicity inferred from topology IDs. On `FAIL`, Architect reads findings, revises detailed artifacts, and re-runs QbD 2; loop up to `maxRetries=3`, then escalate to human.
9. **Human approval gate 2**: On QbD 2 `PASS`, stop at `ask` / `resolve` for human approval. If rejected, return to Phase 1 Conceptual Design so PRD / Design / context contracts can be corrected before rebuilding detailed tasks.
10. **Transition FSM**: After human approval gate 2 resolves approved, mark planning complete and transition to dispatch; executor Hook assembly will inject Role Definition, Global Context, Curated Context, Task Brief, and Local Guidance at `onBeforeAgentStart`.

## Outputs
- `.omp-flow/tasks/TASK-{id}/prd.md` — Phase 1 PRD with requirements and definition-of-done.
- `.omp-flow/tasks/TASK-{id}/design.md` — Phase 1 architecture design with boundary rationale, tech choices, and risk notes.
- `.omp-flow/tasks/TASK-{id}/context/decision/*.md` — ADR-style decisions referenced from `tasks.csv` `context` column.
- `.omp-flow/tasks/TASK-{id}/context/interface/*.md` — interface contracts referenced from `tasks.csv` `context` column.
- `.omp-flow/tasks/TASK-{id}/tasks.csv` — Phase 2 routing/index table with topology IDs, `context` refs, and `reference` `ref:` refs.
- `.omp-flow/tasks/TASK-{id}/.task/{rowId}.implement.md` — detailed task briefs consumed by Hook assembly.
- QbD audit findings and human approval records via host-managed `ask` / `resolve` flow.

## Boundary Contract
- **In-scope**: `.omp-flow/tasks/*/prd.md`, `.omp-flow/tasks/*/design.md`, `.omp-flow/tasks/*/tasks.csv`, `.omp-flow/tasks/*/.task/*.implement.md`, `.omp-flow/tasks/*/context/decision/*.md`, `.omp-flow/tasks/*/context/interface/*.md`. Architect may read `research/` and `reference/` but should not manually write Tier 2 reference slices.
- **Out-of-scope**: Application source code (`src/`, `lib/`), test files, `package.json`, host-managed State plane (`.omp-flow/state.json`, `.omp-flow/tasks/*/fsm/status.json`), evidence CSVs, any file listed in the boundary's `out_of_scope`.
- **Forbidden**: Writing executor-level code changes, editing `tasks.csv` after host dispatch begins, modifying `evidence.csv` directly, generating `.task/F-*.json` verdict files (host-managed only), bypassing QbD 1 / QbD 2 gates, creating tasks without topology IDs or verifiable DoD.

## FSM Integration
- Primary state: `S_PLANNING` (src/core/fsm.ts:4) — activated during conceptual and detailed planning.
- May operate in `S_DECOMPOSE` for Phase 2 task breakdown and `S_BUILD_CHAIN` for validating topology-derived DAG ordering.
- Remains blocked on human approval gates after QbD 1 and QbD 2; rejection returns to the appropriate design phase rather than dispatching.
- Transitions to `S_DISPATCH` only after QbD 2 passes and the second human gate is approved.
- Completes via `completeStep(idx, 'DONE', summary)` with decisions such as `['QbD1: pass', 'QbD2: pass', 'Topology: C-AB-001 style DAG ready']`.

## Coordination
- **IRC**: Notifies `Main` agent when Phase 1 is ready for approval, when Phase 2 is ready for approval, and when approved topology IDs are ready for dispatch.
- **discoveries.ndjson**: Writes architectural decisions as `pattern` type discoveries via `EventBus.appendDiscovery(agentId, 'pattern', { decision, rationale })` when the runtime still exposes discovery logging; otherwise prefer ADR files under `context/decision/`.
- **Reads from prior**: Consumes `<prior-step-context>` from brainstorm phase, `<recent-discoveries>` for prior-wave findings, and active specs for QbD inputs.
- **Writes for downstream**: PRD + Design become Global Context; `context/decision/` and `context/interface/` records become Curated Context via the CSV `context` column; digested Tier 2 slices become `<omp-flow-references>` via the CSV `reference` column; `.task/{rowId}.implement.md` becomes the Task Brief for five-layer Hook assembly.
