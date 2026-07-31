---
type: "Handoff"
title: "Oh My Pi session-switch rebind repair"
---

# Oh My Pi session-switch rebind repair

Status: **DONE**

Repairs the single lifecycle blocker from the independent
[Oh My Pi adapter review](../../review/oh-my-pi-native-status.md) without changing the accepted
event translation or shared snapshot boundary.

## Repair

- Registered the pinned Oh My Pi 17.2.1 `session_switch` post-transition event.
- Kept `session_before_switch` as the old-scope invalidation point: it cancels the old freshness
  timer, clears only the adapter-owned `flow-status` key, and forgets selected calls/session scope.
- Reuses the same exact session initialization used by `session_start` after `session_switch`.
  The new context's `sessionManager.getSessionId()` becomes the sole scope for subsequent
  observations, freshness inspection, and `/flow-status`.
- Added a lifecycle replay for:
  `session_start(old) → session_before_switch(old) → session_switch(new) → task start/update →
  /flow-status`.

The replay proves the old contribution is cleared, the new contribution becomes active, the
observation document binds `hostSessionId: "session-new"`, no post-transition observe call
contains the old session, and the detail command inspects only the new session.

## Changed files

- `src/omp/flow-status.ts`
- `tests/omp-flow-status.test.ts`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/oh-my-pi-native-status-repair.md`

## Verification

- `npm run build` — PASS.
- `npm test` — PASS, including `PASS: flow-status Python contract checks` and
  `PASS: 239 focused checks`.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm pack --dry-run` — PASS, including the repaired compiled Flow Status module.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

The fixed event shape was verified against pinned
`extensibility/shared-events.ts`: `SessionSwitchEvent` has `reason:
"new" | "resume" | "fork" | "handoff"` and `previousSessionFile`, while exact new-session
identity is supplied by the post-transition handler context. The adapter therefore does not guess
identity from event fields.

Actor ID: `executor-flowstatus-omp-repair`

Dispatch receipt: `669dc86fa6f14df785922eebac1d1836`

Predecessor review receipt: `6f22028d02224c50b241653f71ac8b19`
