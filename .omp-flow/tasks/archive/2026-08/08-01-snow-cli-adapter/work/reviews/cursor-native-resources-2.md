---
type: "Review"
title: "Cursor native resources and session bridge re-review"
---

# Cursor native resources and session bridge re-review

## Findings

No findings. The prior safe-write response defect and `subagentStart` fixture/documentation
mismatch are resolved in the current revision. No implementation code was repaired during this
review.

## Verdict

**PASS.** The current revision satisfies the bounded Work and has zero failed focused checks and
no unresolved blocking finding. Safe matched `Write`, `StrReplace`, and `Delete` calls emit one
valid `{"permission":"allow"}` JSON response while `failClosed` is enabled. Runtime targets,
malformed input, missing write paths, and repository escapes remain denied with valid JSON.

The focused `subagentStart` fixture uses the current documented pre-spawn event fields, including
`subagent_id`, `subagent_type`, `task`, `parent_conversation_id`, `tool_call_id`,
`subagent_model`, and `is_parallel_worker`. The optional `git_branch` field is not needed by this
fixture. The fixture, cards, and handoff make the appropriately narrow claim: the Hook observes a
native ID before spawn, but no evidence proves the caller can preselect that ID to equal the
strict descriptor `actorId` before assignment submission. `subagentStart` therefore remains
deliberately unregistered and all exact receipt-safe Cursor native dispatch paths remain visibly
unavailable pending released-runtime proof.

## Scope and correlation

- Reviewed Work: [Cursor native resources and session bridge](../cursor-native-resources.md)
- Reviewed handoff: [Cursor native resources implementation](../handoffs/cursor-native-resources.md)
- Prior Review: [Cursor native resources and session bridge review](cursor-native-resources.md)
- Completed implementation predecessor receipt: `b3d9a4fb5fe54667bcfeb53780c319be`
- Implementation actor: `cursor_native_rework`
- Reviewer actor: `cursor_native_rereviewer`
- Review dispatch receipt: `99e55a6b52634b51a005009a646e74c8`

The read-only runtime operation record for the predecessor is `completed`, names
`work/cursor-native-resources.md`, and resolves its output to the reviewed handoff. The handoff
links back to that Work and records the same rework receipt. The reviewer and implementation
actors differ. The review operation names the same Work, this Review output, and the completed
rework receipt as its predecessor.

Scoped status reports the 19 expected untracked files: five Cursor agent cards, `hooks.json`, two
Hook handlers, the focused test, nine Cursor fixtures, and the handoff. These match the handoff's
file list and Work boundary. The live `.cursor` and `.omp-flow/scripts` paths have no tracked or
untracked changes from this Work. Other concurrent worktree changes were excluded from this
acceptance decision.

## Contract assessment

- **Fail-closed safe writes:** PASS. `hooks.json` sets `failClosed: true` and matches exactly
  `Write|StrReplace|Delete`; every matched safe path emits one parseable allow object.
- **Deny behavior:** PASS. All three known write shapes deny `.omp-flow/.runtime` targets.
  Malformed JSON, absent/conflicting target fields, and paths outside the repository also emit a
  bounded parseable deny object. Unmatched tools remain outside the matcher and silent in the
  handler.
- **Current native fixture:** PASS. Event-specific field names and pre-spawn timing match the
  current official Cursor Hook reference; removed legacy fixture names `model` and
  `is_background` do not recur.
- **Exact identity boundary:** PASS. The static fixture demonstrates only the available payload
  shape and a non-equivalent sample ID. It does not manufacture caller control, register a Hook,
  alias identity, rewrite a receipt, or claim exact dispatch support.
- **Conversation bridge and isolation:** PASS. The prior accepted identity, failure, and
  temporary-runtime isolation behavior remains covered and unchanged.
- **Agent cards and resource scope:** PASS. All five cards retain the strict-v1 startup,
  appropriate role Skill, explicit boundaries, workflow-subspawn prohibition, and truthful
  unsupported-correlation warning. No Cursor rule or duplicate Skill tree exists.

Released Cursor lifecycle and enforcement behavior remains explicitly unproven and assigned to
[Released-Harness compatibility verification](../released-harness-verification.md). This
residual unavailability is not represented as completed fixture evidence.

## Independent verification

- `python -X utf8 tests/cursor-hooks.test.py` — **PASS**, 11 tests in 13.364 seconds.
- Inline stdlib subprocess probe of `templates/cursor/hooks/protect-runtime.py` with
  `failClosed: true` asserted — **PASS**: three safe native tool shapes each returned exactly one
  valid allow JSON object; three runtime-target shapes plus malformed, missing-path, and escaping
  inputs returned six valid deny JSON objects.
- `python -X utf8 -m compileall -q templates/cursor/hooks` with
  `PYTHONPYCACHEPREFIX` redirected outside the workspace — **PASS**, exit 0.
- `rg -n '[ \\t]+$' templates/cursor tests/cursor-hooks.test.py tests/fixtures/cursor` —
  **PASS**, no matches (exit 1 interpreted as zero matches).
- `git diff --check -- templates/cursor tests/cursor-hooks.test.py tests/fixtures/cursor` —
  **PASS**, exit 0. The implementation files are untracked, so the explicit whitespace scan above
  is the meaningful content check.
- `git status --short --untracked-files=all -- templates/cursor tests/cursor-hooks.test.py
  tests/fixtures/cursor .omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/cursor-native-resources.md`
  — **PASS**, exactly the 19 scoped files described above.
- `git status --short -- .cursor .omp-flow/scripts` and
  `git diff --name-only -- .cursor .omp-flow/scripts` — **PASS**, no live deployed destination or
  runtime changes.
- Read-only inspection of the current official [Cursor Hooks reference](https://cursor.com/docs/hooks.md)
  on 2026-08-01 — **PASS**: `preToolUse` accepts `permission: "allow" | "deny"`, invalid JSON is
  blocking under `failClosed`, and `subagentStart` is called before spawning with the fixture's
  current event-specific fields.
