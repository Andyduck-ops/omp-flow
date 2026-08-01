---
type: "Review"
title: "Cursor native resources and session bridge review"
---

# Cursor native resources and session bridge review

## Findings

### HIGH — Safe matched writes return no JSON and can be denied by `failClosed`

`templates/cursor/hooks.json` registers the `preToolUse` handler with `failClosed: true`, but
`templates/cursor/hooks/protect-runtime.py` returns normally without writing stdout when a matched
`Write`, `StrReplace`, or `Delete` target is safe. The focused test explicitly treats this empty
stdout as an allow result (`tests/cursor-hooks.test.py:175-177`).

That is not a valid permission response under Cursor's current command-Hook contract. The
[official Hooks reference](https://cursor.com/docs/hooks.md) specifies JSON over stdout, defines
`preToolUse.permission` as `allow` or `deny`, and says `failClosed: true` blocks Hook failures
including invalid JSON. Empty stdout is not JSON. A direct independent probe of the safe fixture
observed exit code 0, stdout length 0, and `json.loads` failing with `JSONDecodeError`. On a
released Cursor that applies the documented fail-closed behavior, ordinary safe file writes can
therefore be blocked even though the unit suite reports them as allowed.

This violates the Work's known-write behavior and makes the protection Hook potentially unusable
for normal implementation/review output. Required fix: emit an explicit valid allow response for
every safe matched write path (for example, `{"permission":"allow"}`), update the focused test to
parse and assert that response, and verify the rendered `failClosed` path against a released
Cursor runtime when available. Malformed or unverifiable known writes should remain denied.

### MEDIUM — The `subagentStart` fixture and handoff do not match the current documented event

The deliberate decision not to register `subagentStart` is safe: neither the fixture nor released
runtime evidence proves that Main can caller-select Cursor's native `subagent_id` as the strict
descriptor `actorId`, so exact native operation dispatch correctly remains unavailable.

However, the fixture uses `model` and `is_background`, while the current official payload uses
`subagent_model` and `is_parallel_worker`; it also labels the ID
`generated-after-spawn-7f2`. The official reference says `subagentStart` is called **before**
spawning and supplies `subagent_id` at that point. The handoff repeats the inaccurate claim that
the event supplies a generated ID "after spawn." The test then proves only that two authored
fixture strings differ; it is not native evidence about when or how Cursor chooses that ID.

Required fix: align the fixture and assertions with the documented current field names and
pre-spawn timing, and revise the handoff rationale to the narrower truthful claim: the Hook sees an
ID before spawn, but no evidence proves that the caller can preselect it to equal `actorId` before
submitting the strict assignment. Unless released evidence establishes that binding, retaining no
`subagentStart` registration and keeping all exact native dispatch paths unavailable is correct.

## Verdict

**FAIL.** The explicit Cursor conversation bridge, invalid-identity failure behavior, isolated
temporary runtime contexts, bounded orientation, agent-card dispatch warnings, and deliberate
non-registration of `subagentStart` are directionally correct. The unresolved high-severity
safe-write response defect fails a core Hook behavior, and the medium-severity fixture/handoff
contract mismatch weakens the claimed native evidence. No implementation code was repaired during
this review.

## Scope and correlation

- Reviewed Work: [Cursor native resources and session bridge](../cursor-native-resources.md)
- Reviewed handoff: [Cursor native resources implementation](../handoffs/cursor-native-resources.md)
- Completed predecessor receipt: `3e397ad7c0614b9d81196b03928d199b`
- Predecessor actor: `cursor_native_implementer`
- Reviewer actor: `cursor_native_reviewer`
- Review dispatch receipt: `bcf5ac18d7f7486291164815cc600c87`

The predecessor runtime record is `completed`, names the assigned Work entry, and resolves its
output to the reviewed handoff. The handoff links back to that Work. Reviewer and implementer
actors differ.

Scoped `git status --short --untracked-files=all` reports only the expected new Cursor templates,
focused test/fixtures, and handoff inside this Work's boundary. The live deployed `.cursor` and
`.omp-flow/scripts` paths have no tracked or untracked changes from this Work. Other concurrent
worktree changes were not attributed to this implementation or included in its acceptance
decision.

## Contract assessment

- **Conversation identity:** PASS. `sessionStart` requires non-blank `conversation_id`; an
  optional `session_id` must be non-blank and identical. Valid output exports the same identity as
  `OMP_FLOW_CONTEXT_ID` and exports `OMP_FLOW_HOST=cursor`.
- **Session failure behavior:** PASS. Malformed, missing, blank, conflicting, wrong-event, or
  workspace-mismatched inputs emit no `env` and manufacture no task selection. A valid identity
  retains its explicit bridge when bounded status orientation is unavailable.
- **Isolation:** PASS in the temporary deployed-runtime test. Two explicit conversation contexts
  select distinct task pointers, and a process without any supported context sees no active task.
  This remains fixture/runtime-kernel evidence, not proof of Cursor resume, reopen, or subagent
  environment propagation.
- **Agent cards:** PASS. All five cards use the documented Cursor fields, `model: inherit`, strict
  assignment requirements, correct role Skills, explicit output boundaries, no workflow
  sub-spawn, and truthful unsupported-correlation warnings. `readonly: false` is justified because
  each role must write its assigned Concept, review, audit, or handoff; Cursor `readonly: true`
  would prohibit those required writes.
- **Resource scope:** PASS. No `.cursor/rules` or `.cursor/skills` artifact exists, and the cards
  and Hooks do not create receipts, infer predecessors, or alias generated native identity.
- **Runtime-write protection:** FAIL for safe matched writes as described above. Runtime targets
  and unverifiable known-write paths otherwise produce bounded deny responses.
- **`subagentStart`:** safe degradation is PASS, but the fixture and handoff evidence need the
  medium-severity correction above. No Hook is registered and no exact dispatch capability is
  claimed available.

## Independent verification

- `python -X utf8 tests/cursor-hooks.test.py` — **PASS**, 11 tests in 17.349 seconds.
- `python -X utf8 -m compileall -q templates/cursor/hooks` — **PASS**, exit 0.
- `git diff --check -- templates/cursor tests/cursor-hooks.test.py tests/fixtures/cursor` —
  **PASS**, exit 0. These implementation paths are untracked, so the additional whitespace scan
  below is the meaningful content check.
- `rg -n "[ \\t]+$" templates/cursor tests/cursor-hooks.test.py tests/fixtures/cursor` —
  **PASS**, no matches (exit 1 normalized as zero matches).
- `git status --short --untracked-files=all -- templates/cursor tests/cursor-hooks.test.py
  tests/fixtures/cursor .omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/cursor-native-resources.md`
  — **PASS**, exactly the files listed by the handoff.
- `git status --short -- .cursor .omp-flow/scripts` and
  `git diff --name-only -- .cursor .omp-flow/scripts` — **PASS**, no live deployed runtime or
  destination changes.
- `python -X utf8 -` with an inline stdlib subprocess probe invoking
  `templates/cursor/hooks/protect-runtime.py` from `pre-tool-use-safe.json` — **FAIL as expected**:
  `handler_exit=0`, `stdout_length=0`, and parsing stdout raised `JSONDecodeError`.
- Read-only inspection of `https://cursor.com/docs/hooks.md` on 2026-08-01 — current official
  contract confirms base `conversation_id`, `sessionStart.session_id` as the same identity,
  `preToolUse` JSON permission output, `failClosed` handling of invalid JSON, and pre-spawn
  `subagentStart` fields `subagent_id`, `subagent_model`, and `is_parallel_worker`.
