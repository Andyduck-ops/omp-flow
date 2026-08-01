---
type: "Work"
title: "Snow native resources and session isolation"
---

# Snow native resources and session isolation

## Objective

Create the canonical, project-local Snow agent and Hook resources and add Snow session identity to
the portable active-task template, while truthfully degrading any native operation path that
cannot preserve exact actor/native-item correlation.

This realizes PRD requirements 2, 3, 5, 6, and 7 and the Snow portion of the Design's native-agent,
Hook, session, ownership, and verification contracts.

## In scope

- Five Snow-native role cards using the documented Snow frontmatter contract and the common role
  Skills: research, architect, QbD, implement, and check.
- `onSessionStart.json`, `beforeToolCall.json`, and their stdlib-only Python handlers, using
  project-relative rendered commands and Snow JSON input/output shapes.
- Mechanical orientation and known file-mutator protection only; no authored Markdown inference
  and no claim that Hooks cover terminal commands, arbitrary MCP mutators, missing Hooks, or known
  upstream fail-open paths.
- `SNOW_SESSION_ID` recognition in the canonical portable `active_task.py` template, preserving
  explicit `OMP_FLOW_CONTEXT_ID` precedence and fail-closed missing identity.
- Focused fixtures for frontmatter, bounded/malformed Hook payloads, safe and unsafe paths,
  Python-command rendering inputs, and two isolated Snow session IDs.
- A truthful Snow card capability boundary: if the pinned native surface cannot prove that the
  main session selects the unique native execution ID before `operation start`, strict operation
  dispatch is explicitly unavailable. A card that would imply callable receipt-safe dispatch is
  omitted unless an end-to-end identity proof exists.

## Out of scope

- Global/user Hook management, merge, composition, or trust policy.
- A Snow dispatcher, identity alias, post-hoc receipt rewrite, new operation schema, or fallback
  from a generated instance ID to an agent type/name.
- A `.snow/skills` tree or copied common Skill content.
- Edits to the live `.omp-flow/scripts/**` deployment while it coordinates this Bundle.
- Flow Status host unions and shared CLI resource registration, which are owned by linked work.

## Useful inputs

- [Approved PRD](../prd.md) and [Design](../design.md)
- [Snow agents and Skills research](../research/agents-skills.md)
- [Snow Hook research](../research/hooks.md)
- [Adapter contract research](../research/adapter-contract.md)
- [Accepted QbD advice](../qbd/design-audit-2.md), especially observations 1 and 2
- Existing `templates/claude/agents/`, `templates/codex/hooks/`, and portable
  `templates/.omp-flow/scripts/common/active_task.py` for reusable behavior, not native identity
  copying

## Allowed code and output boundary

Implementation may create or edit only:

- `templates/snow/agents/omp-flow-{research,architect,qbd,implement,check}.md`
- `templates/snow/hooks/onSessionStart.json`
- `templates/snow/hooks/beforeToolCall.json`
- `templates/snow/hooks/session-start.py`
- `templates/snow/hooks/protect-runtime.py`
- `templates/.omp-flow/scripts/common/active_task.py`
- `tests/snow-hooks.test.py` and Snow-only fixtures under `tests/fixtures/snow/`
- expected handoff: `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/snow-native-resources.md`

Do not register these files in `src/cli/init.ts` or edit README/package integration here.

## Done conditions

- Every installed card uses documented Snow frontmatter, links the correct shared role Skill, and
  requires the strict-v1 assignment as the first non-blank input with explicit Bundle/output
  boundaries and no workflow sub-spawn.
- No card creates receipts, infers predecessor state, normalizes actor IDs, or represents a Snow
  agent type/name as a unique native execution ID.
- The unsupported exact-dispatch boundary is explicit in the cards, or cards that cannot make a
  truthful promise are absent and the handoff records that safe degradation.
- The two event files use exact Snow event shapes and known write-tool matchers. Their handlers
  return bounded native output for valid input and a contract-appropriate bounded error/no-op for
  malformed input.
- The project-Hook-over-global precedence is represented as a user-visible capability fact in the
  resource text or handoff for later README integration; no merge behavior is suggested.
- `SNOW_SESSION_ID` produces a Snow-scoped context key, two values remain isolated, and explicit
  context still wins. No project-global active-task fallback is introduced.
- All Python remains stdlib-only and UTF-8-safe on Windows.

## Focused verification

- `python -X utf8 tests/snow-hooks.test.py`
- `python -X utf8 -m compileall -q templates/snow/hooks templates/.omp-flow/scripts`
- A direct fixture run renders and parses both Snow event files with `python` and `python3`
  command variants without adding a shell wrapper.
- The test uses a temporary deployed runtime to select/show different tasks under two distinct
  `SNOW_SESSION_ID` values and proves neither selection leaks to the other.

## Expected handoff

[Snow native-resources handoff](handoffs/snow-native-resources.md) must link back here, list exact
files changed, report commands/results, state whether every native role card is installed or
safely omitted, and preserve the Hook precedence and exact-identity limitations for documentation
and independent review.
