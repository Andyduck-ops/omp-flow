---
type: "Work"
title: "Cursor native resources and session bridge"
---

# Cursor native resources and session bridge

## Objective

Create the canonical Cursor-native agent and Hook resources, bridging the documented
`conversation_id` into omp-flow's existing explicit session context without adding a Cursor task
store, duplicate rule, or identity alias.

This realizes PRD requirements 2, 4, 5, 6, and 7 and the Cursor portion of the Design's
native-agent, Hook, session, ownership, and verification contracts.

## In scope

- Five `.cursor/agents` role cards with documented Cursor frontmatter, `model: inherit`, and
  `readonly` for read-only roles.
- One version-1 `.cursor/hooks.json` registering `sessionStart` and known-write `preToolUse` Hook
  handling through project-relative rendered commands.
- A stdlib-only session handler that requires a non-empty documented `conversation_id`, returns
  the same value as `OMP_FLOW_CONTEXT_ID`, returns `OMP_FLOW_HOST=cursor`, and emits only bounded
  mechanical orientation in `additional_context`.
- A stdlib-only runtime-protection handler for documented Cursor payloads and known write tools.
- A focused `subagentStart` fixture and decision: register a `subagentStart` Hook only if the
  fixture proves a required strict-dispatch check that is unavailable earlier. Otherwise test and
  document its intentional absence.
- Static fixtures for top-level session output, malformed/empty/mismatched identity, `preToolUse`,
  `subagentStart`, Windows/POSIX command rendering inputs, and isolation of two conversation IDs.

## Out of scope

- `.cursor/rules`, `.cursor/skills`, or a duplicate of root `AGENTS.md`.
- Global/user Hook management or JSON merging.
- Treating `session_id` as the primary undocumented identity. If a released version requires that
  compatibility input, it must be explicit, version-scoped, tested against mismatch, and must not
  silently replace `conversation_id`.
- A caller-invented `subagent_id`, agent-name alias, post-hoc receipt rewrite, or custom dispatch
  layer.
- Flow Status host unions and shared CLI resource registration, which are owned by linked work.

## Useful inputs

- [Approved PRD](../prd.md) and [Design](../design.md)
- [Cursor adapter research](../research/cursor.md)
- [Cursor primary references](../reference/cursor.md)
- [Accepted QbD advice](../qbd/design-audit-2.md), especially observations 3 and 4
- Existing `templates/claude/agents/` and `templates/codex/hooks/` for common behavior only

## Allowed code and output boundary

Implementation may create or edit only:

- `templates/cursor/agents/omp-flow-{research,architect,qbd,implement,check}.md`
- `templates/cursor/hooks.json`
- `templates/cursor/hooks/session-start.py`
- `templates/cursor/hooks/protect-runtime.py`
- an optional Cursor subagent Hook handler only when the focused proof justifies its registration
- `tests/cursor-hooks.test.py` and Cursor-only fixtures under `tests/fixtures/cursor/`
- expected handoff: `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/cursor-native-resources.md`

Do not register these files in `src/cli/init.ts` or edit README/package integration here.

## Done conditions

- Agent cards use the native Cursor contract, link the correct common role Skill, require the
  strict-v1 assignment first, respect explicit Bundle/output boundaries, and prohibit workflow
  sub-spawn.
- Cards and Hooks never create receipts, infer predecessor state, or claim exact actor/native-item
  correlation without a pre-dispatch proof.
- Valid `sessionStart` input returns `OMP_FLOW_CONTEXT_ID=<conversation_id>` and
  `OMP_FLOW_HOST=cursor`; missing, blank, or conflicting identity produces no manufactured task
  selection.
- Two conversation IDs produce two isolated active-task pointers through the existing explicit
  context precedence. There is no Cursor-specific Python session key or project-global fallback.
- Hook output is bounded and mechanical. `preToolUse` denies unsafe runtime writes for the known
  native write-tool shapes without claiming universal enforcement.
- `hooks.json` is a single exact-owned project resource. `subagentStart` is included only with a
  demonstrated strict check; otherwise the fixture makes the non-registration deliberate.
- No `.cursor/rules` or `.cursor/skills` artifact exists.

## Focused verification

- `python -X utf8 tests/cursor-hooks.test.py`
- `python -X utf8 -m compileall -q templates/cursor/hooks`
- Direct fixtures parse version-1 `hooks.json`, validate both Python command variants, exercise
  `sessionStart`, `preToolUse`, and `subagentStart`, and reject empty/mismatched identity.
- A temporary deployed runtime consumes each returned explicit context and proves two concurrent
  conversation IDs do not share task selection.

Static fixtures do not satisfy the separate released-runtime lifecycle check; that claim belongs
to [Released-Harness compatibility verification](released-harness-verification.md).

## Expected handoff

[Cursor native-resources handoff](handoffs/cursor-native-resources.md) must link back here, list
exact files changed, report commands/results, record the `subagentStart` registration decision,
and identify every lifecycle path still awaiting real Cursor runtime evidence.
