---
name: omp-flow-brainstorm
description: Multi-perspective exploratory design skill combining Trellis Socratic inquiry and Maestro-style OMP dynamic subagent debate.
---

# OMP-Flow Brainstorm Skill

## Trigger
- Activates on `/omp-flow:brainstorm [topic]` command or `omp-flow brainstorm` CLI call.
- Activates when FSM transitions to `S_PLANNING_MODE` (src/core/fsm.ts:12) prior to locking PRDs.
- Activates when a step has `skill: 'brainstorm'` and `stage: 'planning'`.
- Recommended model tier: `slow` (src/omp/extension.ts:117 — architect/brainstorm roles get `slow` tier for deep reasoning).

## Inputs
- **User Topic / Intent**: Raw user idea, issue description, or feature request.
- **Upstream Context**: Optional `--from` context-package (src/core/context-package.ts:11) providing locked constraints, terminology, or non-goals.
- **Repository Evidence**: Codebase files (`src/`, `lib/`), tests, configs, and existing specs under `.omp-flow/specs/*.md` (loaded via `MemoryEngine.searchKnowhow`, src/core/memory.ts:116).
- **Recent Discoveries**: `<recent-discoveries>` from `EventBus.recentDiscoveries(10)` (src/core/events.ts:303) — learnings from prior sessions.

## Workflow: 3-Stage Socratic + OMP Dynamic Debate Pipeline

```
[Stage 1: Socratic Inquiry] (Trellis-style)
  ├── 1. Repository Evidence Search (Codebase first! Never ask repo-answerable questions)
  ├── 2. First-Principles Problem Decomposition (Strip to fundamental truths)
  ├── 3. Sequential 1-by-1 Socratic Questions (with Rec Answer + Trade-offs)
  └── 4. Single-Question Incremental Disk Persistence (.omp-flow/tasks/{taskId}/brainstorm.md)
        │
        ▼
[Stage 2: Dynamic OMP Subagent Debate] (Maestro-style, OMP-native)
  ├── 1. Dynamic Role Inference (Infer 2-4 domain specialists matching topic; NO static role lists!)
  ├── 2. Parallel OMP Subagent Spawn (`task` with model tier allocation)
  ├── 3. Per-Role Analysis (Evaluate design routes, trade-offs, edge cases)
  ├── 4. Cross-Agent Debate via IRC (`IrcBus`) & Shared Board (`discoveries.ndjson`)
  └── 5. Evidence-Weighted Conflict Resolution
        │
        ▼
[Stage 3: Lossless Convergence Pass] (Synthesis)
  ├── 1. Fold & Flatten: Merge confirmed facts, user decisions, role analyses, and non-goals
  ├── 2. Apply RFC 2119 Keywords (MUST, SHOULD, MAY, MUST NOT)
  └── 3. Persist Final `.omp-flow/tasks/{taskId}/brainstorm.md` & Hand off to `omp-flow plan`
```

### Stage 1: Socratic Inquiry Rules
1. **Non-Negotiable Evidence Rule**: Before asking the user any question, inspect the repository (`grep`, `glob`, `read`, `spec-search`). Ask ONLY about product intent, user preference, scope boundaries, or risk tolerance.
2. **First-Principles Analysis**:
   - Step 1: Restate problem in 1 sentence (strip implementation detail).
   - Step 2: List fundamental physical/business/technical invariants.
   - Step 3: Challenge assumptions (fact vs convention? what if removed?).
   - Step 4: Build minimum mechanism required by fundamental truths.
3. **Single-Question Rule**: Ask only 1 question per turn. Every question MUST include:
   - The decision needed
   - Why the answer matters
   - Recommended answer
   - Trade-off if user chooses differently
4. **Incremental Disk Write**: Update `.omp-flow/tasks/{taskId}/brainstorm.md` after EVERY user response.

### Stage 2: Dynamic Subagent Debate Protocol
1. **Dynamic Role Inference**: Analyze topic keywords and infer 2-4 specialist roles. Examples:
   - Topic: "TUI layout" → `tui-specialist`, `performance-architect`, `accessibility-expert`
   - Topic: "JWT Auth" → `security-architect`, `api-designer`, `data-privacy-expert`
   - Topic: "Event Engine" → `distributed-systems-engineer`, `event-bus-architect`
2. **Subagent Spawning**: Spawn parallel subagents via OMP `task` tool:
   - Assign `role: "omp-flow-researcher"` or custom dynamic role.
   - Set model tier: `slow` for system architect, `default` for domain roles.
3. **Cross-Agent Communication**:
   - Direct Message: `irc(op="send", to="<PeerId>", message="...")` for direct debate.
   - Shared Board: `EventBus.appendDiscovery(agentId, 'pattern', { role, topic, decision }, dedupKey)` to publish findings.
4. **Conflict Resolution**:
   - Higher specificity (file:line evidence) wins over general claims.
   - Evidence-weighted consensus > single opinion.
   - Unresolved conflicts marked as `DEFERRED` for user choice.

### Stage 3: Lossless Convergence Pass
1. Collapse repeated facts into one authoritative section.
2. Fold temporary sections (`What I know`, `Assumptions`, resolved `Open Questions`) into Requirements, Non-Goals, or Architectural Decisions.
3. Apply RFC 2119 normative language (`MUST`, `SHOULD`, `MAY`, `MUST NOT`).
4. Write final `.omp-flow/tasks/{taskId}/brainstorm.md` (human-readable exploration log).
5. Write `.omp-flow/tasks/{taskId}/guidance-specification.md` (machine-readable structured contract with § sections).

### Stage 2.5: Cross-Role Review (post-debate)
After parallel role analysis, a cross-role reviewer reads all `{role}/analysis.md` files and compares §2 Decision Digests:
- **Conflicts**: Wrap original in `<!-- superseded -->`, insert resolution. Append to `guidance-specification.md §12`.
- **Gaps**: Add breadcrumb at reference, definition at owner.
- **Synergies**: Cross-reference in both files (original untouched).

## Outputs
- **Brainstorm Artifact**: `.omp-flow/tasks/{taskId}/brainstorm.md` — human-readable exploration log with:
  1. Problem Statement & First-Principles Decomposition
  2. Confirmed Repository Facts
  3. Product Intent & User Choices
  4. Non-Goals (Out of Scope)
  5. Dynamic Role Analyses & Cross-Agent Debates
  6. Resolved & Deferred Trade-offs
  7. Feature Candidate List (F-001, F-002...)
- **Guidance Specification**: `.omp-flow/tasks/{taskId}/guidance-specification.md` — machine-readable structured contract with:
  - §1 Problem Statement, §2 Terminology, §3 Non-Goals
  - §4 Feature Decomposition (F-001, F-002... with slug, priority, related roles)
  - §5-N Role Decisions (MUST/SHOULD/MAY per role)
  - §12 Cross-Role Resolutions (populated by Stage 2.5)
- **Feature Store**: `Feature[]` in `state.json` (src/core/state.ts) — each feature has `{id, slug, title, description, relatedRoles, priority}`. Managed via `addFeature()`, `getFeatures()`, `updateFeature()`.
- **State Update**: Sets `activeTask: taskId` in `UnifiedWorkspaceManager` (src/core/state.ts:129).
- **Discoveries**: Appends design patterns to `.omp-flow/events/discoveries.ndjson` (src/core/events.ts:237).
- **EventBus**: Emits `task_started` event with `{topic, roles, mode}` (src/core/events.ts:11).

## Context Package Extraction (Handoff to `plan`)
`ContextPackageBuilder.extractFromBrainstorm(taskId)` (src/core/context-package.ts) converts brainstorm artifacts into `context-package.json` fields:

| ContextPackage Field | Source Section | Extraction Rule |
|---------------------|----------------|----------------|
| `domain.problem_statement` | §1 Problem Statement | First paragraph after heading |
| `domain.terminology[]` | §2 Terminology table | Each table row → `{term, definition}` |
| `non_goals[]` | §3 Non-Goals | Each bullet point |
| `requirements[]` | §4 Feature Decomposition | Each table row → `F-{id}: {title} ({slug})` |
| `constraints[]` | §5-N MUST / MUST NOT | Lines containing MUST or MUST NOT |
| `open_questions[]` | §5-N SHOULD / MAY | Lines containing SHOULD or MAY |
| `insights[]` | `{role}/analysis.md` §3 Cross-Cutting | Each bullet under Cross-Cutting subsection |
| `references[]` | All key file paths | Absolute paths to brainstorm + guidance + role analyses |

`buildPackage()` merges extracted fields into the final `ContextPackage`. Extracted fields supplement but do NOT overwrite explicit PRD fields.

## Boundary Contract
- **In-scope**: `.omp-flow/tasks/{taskId}/brainstorm.md`, `.omp-flow/tasks/{taskId}/guidance-specification.md`, `.omp-flow/tasks/{taskId}/{role}/analysis.md`, `.omp-flow/scratch/{taskId}/*`, `.omp-flow/events/discoveries.ndjson`, `state.json` (features only).
- **Out-of-scope**: Application source code (`src/`, `lib/`), production tests (brainstorming is read-only for codebase).
- **Forbidden**: Making code edits during brainstorm, skipping repository evidence check, asking process questions ("should I search?"), generating hardcoded role analyses without dynamic topic adaptation, bypassing `guidance-specification.md` generation.

## FSM Integration
- Primary state: `S_PLANNING_MODE` (src/core/fsm.ts:12) — pre-PRD exploration.
- Transitions: `S_PARSE_ROUTE` → `S_PLANNING_MODE` → `S_DECOMPOSE` → `S_BUILD_CHAIN`.
- Hand-off: `guidance-specification.md` + `brainstorm.md` are consumed by `ContextPackageBuilder.extractFromBrainstorm()` (src/core/context-package.ts) → merged into `context-package.json` → fed to `omp-flow plan` for `prd.md` generation.

## Coordination
- **IRC**: Subagents use `irc` tool for live debate across dynamic role perspectives (src/omp/extension.ts:123).
- **discoveries.ndjson**: Shared append-only board for cross-role findings (src/core/events.ts:237).
- **Model Tiers**: Architect/reviewer roles run on `slow` tier; scanner/checker roles run on `smol`/`default` tier (src/omp/extension.ts:104).
- **guidance_path**: Each Stage 2 role agent receives the absolute path to `guidance-specification.md` as its primary input contract (not raw topic text).

## Finding Schema Usage
- Uses `Finding` type (src/core/finding.ts:51) to tag identified architecture risks (e.g. `dimension: 'architecture'`, `severity: 'high'`, `title: 'Single Point of Failure in State Persistence'`).
- Sorts identified risks via `sortFindingsBySeverity` (src/core/finding.ts:116) and includes top risks in `brainstorm.md` §6 Trade-offs.
