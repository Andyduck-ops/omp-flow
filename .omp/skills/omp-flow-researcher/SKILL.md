---
name: omp-flow-researcher
description: Read-only code and technology scout skill that locates patterns, inspects dependencies, and persists findings to .omp-flow/tasks/{taskId}/research/*.md using the memory engine for relevance-ranked retrieval.
---

# OMP-Flow Researcher Skill

## Trigger
- Activates when `OMPFlowExtension.onBeforeAgentStart` (src/omp/extension.ts:98) spawns a subagent with `subagentRole` containing "researcher".
- Activates during `S_PLANNING` (src/core/fsm.ts:4) when the architect needs codebase reconnaissance before writing the PRD.
- Activates during `S_DISPATCH` when an executor needs to understand existing patterns before implementing.
- Activates on explicit request from any sibling agent via IRC: `irc(op="send", to="<ResearcherId>", message="Research: {topic}")`.
- Recommended model tier: `default` (src/omp/extension.ts:115 — researcher is not in the slow-tier or smol-tier lists).

## Inputs
- **Research topic**: Specified by the requesting agent (architect, executor, or Main).
- **Context package**: `.omp-flow/scratch/{taskId}/context-package-researcher.json` — compiled by `ContextPackageBuilder.buildPackage(taskId, 'researcher')` (src/core/context-package.ts:148). Contains requirements, boundary, spec rules (role-filtered: researcher gets specs matching "research", src/core/context-package.ts:209).
- **Memory engine**: `MemoryEngine.searchKnowhow(query)` (src/core/memory.ts:123) — searches `.omp-flow/knowhow/`, `.omp-flow/specs/`, and `.omp-flow/scratch/` with user-intent-weighted relevance scoring.
- **Spec search**: `executeMaestroSpecSearch(query, workspaceDir)` (src/tools/spec-search-tool.ts:11) — weighted search across `.omp-flow/specs/` and `.omp-flow/knowhow/` with file-name (10x), heading (5x), intent-keyword (3x), and content (1x) weights.
- **Recent knowhow**: `MemoryEngine.getRecentKnowhow(5)` (src/core/memory.ts:215) — last 5 harvested learnings.
- **Spec rules**: `.omp-flow/specs/*.md` — active spec rules for the current task.
- **priorContext**: `<prior-step-context>` from `buildPriorContext` (src/core/fsm.ts:221).
- **Recent discoveries**: `<recent-discoveries>` from `EventBus.recentDiscoveries(5)` (src/core/events.ts:301).

## Workflow
1. **Strip injection tags**: Use `stripInjectionTags(content)` (src/core/memory.ts:52) to remove framework-injected prompt blocks before analysis. Strips: `<system-reminder>`, `<workflow-state>`, `<omp-flow-context>`, `<subagent-boundary-context>`, `<irc-coordination-context>`, `<active-spec-rules>`, `<instructions>`, `<local-command-stdout>`, `<local-command-stderr>`, `<INSTRUCTIONS>` (src/core/memory.ts:15-26). This ensures clean research output without framework noise.
2. **Detect bootstrap preambles**: Use `isBootstrapTurn(content)` (src/core/memory.ts:66) to identify and exclude bootstrap preamble content (e.g., `# AGENTS.md instructions`, `<INSTRUCTIONS>`) from research scope.
3. **Search knowhow**: Call `MemoryEngine.searchKnowhow(query)` (src/core/memory.ts:123). This walks `.omp-flow/knowhow/`, `.omp-flow/specs/`, and `.omp-flow/scratch/` (src/core/memory.ts:128-132), scoring each `.md`/`.json` file:
   - File name match: +10 per token.
   - Heading match (`#`): +5 per token.
   - Intent keyword match (gotcha, rule, lesson, recipe, requirement): +3 per token.
   - Regular content match: +1 per token.
   - Results sorted by score descending (src/core/memory.ts:139).
4. **Search specs**: Call `executeMaestroSpecSearch(query)` (src/tools/spec-search-tool.ts:11) for weighted search across `.omp-flow/specs/` and `.omp-flow/knowhow/`. Returns `SpecSearchResult[]` with `filePath`, `category`, `score`, `matches[]`.
5. **Locate code patterns**: Use `grep` (built-in) for regex search and `glob` for file pattern matching. Use `ast_grep` for structural code discovery (calls, declarations, language constructs). Use `lsp` for symbol-aware navigation (definition, references, hover, implementation).
6. **Read targeted ranges**: Use `read` with offset/limit selectors (e.g., `src/foo.ts:50-200`) instead of full-file reads. Use `read` directory listing for structure mapping. Reuse existing patterns — a second convention beside an existing one is prohibited.
7. **Persist findings**: Write research report to `.omp-flow/tasks/{taskId}/research/{topic}.md`. Format:
   ```markdown
   # Research: {topic}
   ## Summary
   ## Findings
   ## Code References
   ## Recommendations
   ## Related Specs
   ```
8. **Write discoveries**: Call `EventBus.appendDiscovery(agentId, 'pattern', { topic, summary, fileRefs }, dedupKey)` (src/core/events.ts:237) to share research findings with the shared board.
9. **Return summary**: Return file paths of written research reports and a concise summary of key findings.

## Outputs
- `.omp-flow/tasks/{taskId}/research/{topic}.md` — detailed research report markdown.
- **discoveries.ndjson**: `pattern` type entries via `appendDiscovery` — research summaries with file references.
- EventBus: `agent_completed` event (src/omp/extension.ts:276).
- **Return format**: `{ researchFiles: string[], summary: string, keyFindings: string[], relatedSpecs: string[] }`.

## Boundary Contract
- **In-scope (WRITE)**: `.omp-flow/tasks/{taskId}/research/*.md` ONLY. EventBus discoveries (append-only).
- **In-scope (READ)**: Entire codebase (`src/`, `lib/`, `tests/`, etc.), `.omp-flow/specs/`, `.omp-flow/knowhow/`, `.omp-flow/scratch/`, `.omp-flow/findings/`, `.omp-flow/tasks/`.
- **Out-of-scope (WRITE)**: Source code (`src/`, `lib/`, `app/`, `tests/`), `.omp-flow/state.json`, `.omp-flow/fsm/`, `.omp-flow/events/events.jsonl`, any file outside `.omp-flow/tasks/{taskId}/research/`.
- **Forbidden**: Editing source code (researcher is strictly read-only for code), git operations (`commit`, `push`, `merge`), modifying `.omp-flow/specs/` (read-only — only harvester writes specs), deleting any files, running build/test commands that modify state (read-only analysis only).

## FSM Integration
- Operates in `S_PLANNING` (src/core/fsm.ts:4) — provides reconnaissance to the architect before PRD writing.
- May operate in `S_DISPATCH` — provides pattern lookup for executors during implementation.
- May operate in `S_INFER` (src/core/fsm.ts:10) — infers code structure and patterns.
- Does NOT participate in `S_DECISION_EVAL`, `S_AUTOFIX`, `S_GRILL`, or `S_HARVEST` — researcher is a support role, not a gated stage.
- Step completion: returns `DONE` with research file paths in `completion_summary`; `completion_decisions` lists key architectural findings.

## Coordination
- **IRC**: Receives research requests from architect/executor siblings. Returns summaries via `irc(op="send", to="<RequesterId>", message="Research complete: {summary}. Report: {filePath}", replyTo="<originalMsgId>")`. Broadcasts significant findings: `irc(op="send", to="all", message="Pattern discovered: {summary}")`.
- **discoveries.ndjson**: Writes `pattern` type entries for code patterns and architectural findings. Reads `<recent-discoveries>` from prior researchers/executors to avoid duplicating research.
- **priorContext**: Reads prior step summaries to understand what research has already been done and what the current task needs.
- **Writes for downstream**: Research reports in `.omp-flow/tasks/{taskId}/research/` are read by:
  - The architect for PRD requirements and boundary definition.
  - The executor for `read_first` file lists and pattern guidance.
  - The harvester for learning extraction (research reports are walked by `walkScratch`, src/core/harvest.ts:37).
- **Memory engine integration**: Research findings become searchable via `MemoryEngine.searchKnowhow` (src/core/memory.ts:123) in future sessions — the `.omp-flow/scratch/` directory is one of the search targets (src/core/memory.ts:131, category: 'finding').

## Finding Schema Usage
- This skill does NOT generate `Finding` objects — it is a read-only research role, not a review role.
- However, it READS existing findings from `.omp-flow/findings/*.json` and `.omp-flow/scratch/` to provide context about known issues and patterns.
- When research uncovers a potential issue, it writes a `pattern` discovery (not a `finding`) and notifies the reviewer via IRC for formal finding generation.
- Research reports reference finding IDs (e.g., "Related to finding SEC-001") for traceability, using the `generateFindingId` prefix scheme (SEC, COR, PRF, etc., src/core/finding.ts:97-108).
