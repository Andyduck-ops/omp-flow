# AGENTS.md - omp-flow Engineering Guide

This file is the authoritative entry for agents working on omp-flow.

## Product Boundary

omp-flow is a project-local workflow methodology and portable deterministic control plane.

- Python owns workflow state, task lifecycle, exact topology, context selection, Reference provenance, QbD records, Evidence, and archive.
- Agents own research, design, implementation, and independent review content.
- Harnesses own models, native agent spawn, batch concurrency, progress, cancellation, IRC, isolation, and UI.
- OMP integration is a thin extension around native task.
- OMP is a push-based adapter around native task; Codex uses project TOML agents with pull-based Python context and may run inline when native collaboration is unavailable.
- Claude is a strict push-based adapter: `PreToolUse(Agent)` Hooks inject Python context before native `Agent` spawn and are fail-closed with no pull fallback. It is template/fixture-validated only (see the Claude Adapter section).

Do not reintroduce a generic custom dispatcher, model aliases, progress renderer, Ralph workflow, plan.json DAG, or custom lifecycle/reference/verdict tools.

## Workflow

    init
      -> brainstorm and research
      -> Tier 1 clone / Tier 2 digestion
      -> validation and selected 90-synthesis
      -> PRD + Design + Tier 3 context
      -> QbD 1 + human decision
      -> exact-topology CSV + row briefs
      -> QbD 2 + human decision
      -> native execution waves
      -> independent review + Python evidence
      -> integration check / harvest / archive

Investigation precedes design. Design precedes implementation. Deterministic validation is not QbD; model PASS is not human approval; executor success is not reviewer PASS.

## Authoritative Files

- templates/.omp-flow/workflow.md: workflow semantics and state blocks.
- templates/.omp-flow/scripts/omp_flow.py: stable Python CLI.
- templates/.omp-flow/scripts/common/: deterministic modules.
- .omp-flow/config.json: configured Harness registry for this project.
- src/omp/extension-entry.ts and src/omp/extension.ts: thin OMP adapter.
- .omp/agents/: OMP native agent/tool/model definitions.
- templates/common/skills/: Harness-neutral router and phase Skill sources.
- templates/omp/: OMP adapter installation sources.
- templates/codex/: Codex adapter installation sources.
- templates/claude/: Claude adapter installation sources (settings.json, five agent cards, five Python Hook wrappers).
- .omp/skills/: OMP-native deployed router and phase Skills.
- tests/fixtures/claude-hooks/: hand-authored Claude Hook payload fixtures plus _provenance.json (capturedFromLiveRun:false).
- docs/claude-adapter-verification.md: Claude adapter verification record and deferred native-validation list.

The project-local .omp-flow/workflow.md is copied from the managed template and can be customized by downstream projects.

## Task Scaffold

Task create prebuilds task.json, brainstorm/guidance/PRD/Design templates, header-only tasks.csv, manifests, evidence.csv, research, reference, context, qbd/qbd-1, qbd/qbd-2, .task, and .summaries.

It must not seed concrete rows, row briefs, audits, decisions, verdicts, approvals, or PASS.

task.json is the only business lifecycle state:

    status: planning | in_progress | completed | archived
    phase: explore | design | qbd1 | decompose | qbd2 | ready | execute | finish | completed

Active task is session-scoped under .omp-flow/.runtime/sessions. The old .active-task pointer is legacy diagnostics only.

## Exact Topology Contract

Root:

    A-001

Dependent:

    A-A002--003
    C-A002B001--003

Grammar:

    RootId        := Unit "-" Seq
    DependentId   := Unit "-" DependencyRef+ "--" Seq
    DependencyRef := Unit Seq
    Unit          := [A-Z]
    Seq           := [0-9]{3}

The parser produces fullId, canonicalId, Unit, Seq, and exact canonical dependencies. Duplicate canonical rows, missing dependencies, self-dependencies, cycles, wave mismatches, and taskMd mismatches are errors.

tasks.csv has exactly:

    id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd

No new dependsOn column or plan.json. Full ID names implement/review/verdict row artifacts.

## Research and Reference

Research reports go under task research/. Use sortable names and finish design research with a selected 90-synthesis artifact.

Reference tiers:

1. Tier 1 full clone: repository root reference/<repo>, read-only and gitignored.
2. Tier 2 slices: task reference/<slug> plus <slug>.meta.json provenance.
3. Tier 3 contracts: task context/ decision/interface/brief/finding.

Use the Python reference command. Do not manually fabricate Tier 2 metadata.

## QbD

There are two authoritative gates:

- qbd1: selected synthesis + PRD + Design + accepted context/reference.
- qbd2: approved design + exact topology + every row brief and binding.

Python gate prepare reserves qbd/qbd-N/audit-NNN.md and computes the evidence digest. The native qbd-auditor writes only that report. Python inspect validates frontmatter and digest. Python decide records human calibration.

A pre-PRD problem challenge belongs in research/validation and does not create a third mandatory gate.

## Native Task

OMP native task already provides project agent discovery, model frontmatter, batch mode, structured progress/details, result artifacts, async delivery, IRC, isolation, cancellation, and recursion depth.

The extension may:

- set the main orchestrator native tool belt;
- inject workflow-state after start/compaction;
- enrich recognized executor/reviewer/planning task assignments with Python context;
- block direct writes to Python-owned state/evidence files.

It must not register omp_flow_* tools or intercept a prepared qbd-auditor prompt.

Project agent frontmatter controls child tools. Do not regex-prune child tools in session_start.

## Claude Adapter

Structure (all under templates/claude/, deployed to .claude/):

- settings.json: registers command Hooks for SessionStart (startup/resume/clear/compact), UserPromptSubmit, PreToolUse(Agent), PreToolUse(Task) compatibility alias, PreToolUse(Write|Edit|Bash) protection, and one SubagentStart matcher per managed agent name. No permissions allowlist, no enabledPlugins. `{{PYTHON_CMD}}` is substituted to `python`/`python3` at deploy time (renderManagedResource in src/cli/init.ts).
- agents/: exactly five cards omp-flow-{research,architect,qbd,implement,check}.md. Frontmatter `name` MUST equal the mapped role name exactly; workflow children get no Agent/Task tool.
- hooks/: five stdlib-only Python wrappers (session-start, inject-workflow-state, inject-agent-context, inject-agent-identity, protect-python-owned). Each reads one UTF-8 JSON payload on stdin, uses payload session_id as authoritative identity, invokes the core with `python -X utf8 <script> --cwd $CLAUDE_PROJECT_DIR hook <kind>`, and emits exactly one JSON object. The Python surface is a thin read-only addition (`hook claude-*` kinds in omp_flow.py) mirroring the codex-workflow-state pattern; it reuses common/context.py build_context and per-row freeze (verify_row_frozen), adding no Claude-specific bypass.

Fail-closed contract (do not weaken): recognized dispatch requires exact tool_name Agent/Task, exact subagent_type, string prompt, and a v1 JSON dispatch descriptor as the first non-blank prompt line. Unknown non-omp-flow agents pass through unchanged; unknown omp-flow-* names deny. Malformed/stale/mismatched descriptors deny before spawn. Success replaces only tool_input.prompt and prepends `<!-- omp-flow-claude-dispatch:v1 -->`. There is no pull fallback. If a captured live payload ever differs, only parser field names or settings records may change — never the fail-closed semantics, never a guessed alias, never a pull route. QbD gains no no-active-task route and no persistent authorization binding.

Template/fixture-validated only. Deferred native validation (not a completion condition for this task; must be captured before any live-behavior or platform claim):

1. Capture raw 2.1.199+ and current-stable payloads for every selected event and exact Agent input; exercise the Task compatibility alias where the runtime permits.
2. Prove the separate exact settings matchers load without duplicate dispatch, and that each of the five names yields exactly one SubagentStart identity injection with matching agent_id/agent_type.
3. Prove Windows command quoting, UTF-8 stdin/stdout, non-ASCII project paths, and actual Bash sourcing of the appended OMP_FLOW_CONTEXT_ID export.
4. Prove an interactively trusted project loads every Hook, and identify how an enterprise allowManagedHooksOnly policy presents when project Hooks are denied. Print mode is never trust evidence.
5. Validate the strict Write/Edit/Bash field parsers against real payloads; the Write payload must prove availability of the session and identity fields used by the QbD report exception, otherwise that exception must be denied and the design revised before release. Shell obfuscation remains outside the boundary.
6. Upgrade any local install below 2.1.199 before native validation.

Known implementation gap vs PRD R7 (documented, not patched by Row F): `omp-flow init --claude` does not yet invoke `claude --version` to preflight/reject < 2.1.199, and `doctor` does not report Claude version or settings/Hook drift (it reports only legacy artifacts). The >= 2.1.199 floor is currently a manual maintainer prerequisite. Do not claim automated preflight in docs.

Run the verification:

    python -X utf8 -m compileall -q templates/.omp-flow/scripts
    npm run build
    npm test
    npm pack --dry-run    # confirm all templates/claude files ship and no __pycache__ leaks

Then a project-level smoke check: `node bin/omp-flow.js init --claude` in a scratch dir, confirm `.claude/` deploys, `.omp-flow/config.json` records claude, settings.json has no residual `{{PYTHON_CMD}}`, and `update --dry-run` reports all resources unchanged.

## Role Context

- researcher/planner/explore/oracle: intent, guidance, current research; no CSV requirement.
- architect: selected synthesis and design inputs.
- qbd-auditor: bounded gate prepare output.
- executor: status=in_progress, phase=execute, pending/needs_fix exact row, committed design, bindings, implement manifest and brief.
- reviewer: status=in_progress, phase=execute, review row, committed design, check manifest and brief.

Missing required context blocks dispatch.

## Evidence

Reviewer writes .task/{fullId}.review.md and calls Python evidence submit with the native reviewer agent ID. Python validates identity, row/status/path/test counts, writes verdict JSON, appends evidence.csv, and transitions row to completed or needs_fix.

Do not hand-edit evidence.csv, verdict JSON, task.json lifecycle fields, gate pointers, or session pointers.

## Editing Rules

- Use apply_patch for manual edits.
- Preserve unrelated user changes.
- Use structured parsers for JSON/CSV/frontmatter.
- Keep Python stdlib-only and force UTF-8 on Windows entrypoints.
- New failures must be explicit; do not add broad catches or permissive fallback data.
- Platform resources belong under their native `.omp/` or `.codex/` roots; shared lifecycle/runtime belongs under `.omp-flow/`.
- Shared Skill templates belong under `templates/common/skills/` and deploy into each configured Harness's native root; one Adapter must not source another Adapter's files.
- Update template and project copies together where both are tracked.
- README, AGENTS, workflow, agents, skills, CLI help, and tests must describe the same executable path.

## Verification

Run:

    python -X utf8 -m compileall -q templates/.omp-flow/scripts
    npm run build
    npm test
    npm pack --dry-run

Tests must cover session isolation, scaffold invariants, workflow-state extraction, topology grammar/DAG/waves, gate stale behavior, role fail-closed context, evidence transitions, Codex Hook output, native OMP task preservation, Claude harness registry/isolation across every non-empty subset, the Claude settings/agent-card static contract, the Claude Hook control-plane API (Row C), the Claude Hook wrappers against hand-authored fixtures (Row D), and the package audit (Claude templates ship; generated __pycache__ does not).

## OMP Reference Source

Runtime source clones under reference/ are read-only and gitignored. Relevant native task docs:

- reference/oh-my-pi/docs/tools/task.md
- reference/oh-my-pi/docs/task-agent-discovery.md
- reference/oh-my-pi/packages/coding-agent/src/task/

Trellis methodology references:

- reference/Trellis/packages/cli/src/templates/trellis/workflow.md
- reference/Trellis/packages/cli/src/templates/trellis/scripts/
- reference/Trellis/packages/cli/src/templates/shared-hooks/
- reference/Trellis/packages/cli/src/templates/codex/hooks.json
