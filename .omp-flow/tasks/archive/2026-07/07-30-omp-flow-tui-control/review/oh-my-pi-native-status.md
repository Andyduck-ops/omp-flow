---
type: "Review"
title: "Oh My Pi native Flow Status adapter review"
---

# Oh My Pi native Flow Status adapter review

Verdict: **CHANGES_REQUESTED**

Reviewed work:

- [Oh My Pi native Flow Status adapter](../work/oh-my-pi-native-status.md)
- [implementation handoff](../work/handoffs/oh-my-pi-native-status.md)
- [approved design](../design.md#oh-my-pi)
- [source-observation contract](../interfaces/flow-status-source-observation-v1.md)
- [pinned 17.2.1 fixture provenance](../reference/native-capability-fixtures.md)

The completed predecessor operation
`9546f6eb9e82435cb24300da7003d322` resolves to the linked handoff, was produced by
`executor-flowstatus-omp`, and is independent from this review actor.

## Findings

### High — session switching clears the adapter permanently instead of rebinding it

`registerOMPFlowStatus` registers `session_before_switch` to `adapter.reset(ctx)` and registers
`session_start`, but it never registers the pinned public `session_switch` event. `reset` sets
`sessionId` to `null`. Oh My Pi 17.2.1 emits `session_before_switch` followed by `session_switch`
for new, resume, fork, and handoff transitions; it does not emit a second `session_start` for that
transition. The pinned upstream itself uses `session_switch` to rehydrate session-owned features.

Consequently, after the first native session transition:

- subsequent task execution events return immediately because `sessionId` is null;
- `/flow-status` reports `Flow Status is unavailable: no active session`; and
- the native contribution never becomes active again until the extension process is restarted.

This violates the work's native status/detail lifecycle and the design's exact-session scoping:
the old session must be invalidated, but the adapter must then bind to the new session context.
Register `session_switch` to initialize the new session after the pre-switch reset (and cover any
other pinned post-transition event that changes the adapter's session scope). Add a replay test
that executes `session_start(old) -> session_before_switch(old) -> session_switch(new) -> task
start/update`, proves only the old key is cleared, proves the new observation uses the new session,
and proves `/flow-status` inspects the new session.

The current registration test only checks that shutdown and task handlers exist; it cannot detect
this failure.

## Verified behavior

Subject to the lifecycle blocker above, the implementation:

- gates the positive path on the exact `pi.VERSION === "17.2.1"` module surface plus structured
  registration and command discovery, while older/missing/conflicting API fixtures register
  nothing;
- accepts only full, unique input-indexed progress replacements, maps `failed` and `aborted` to
  failed members with attention, and fails closed for incomplete, mismatched, or concurrent calls;
- invokes the portable producer with an argument array and UTF-8 JSON on stdin, without a shell;
- renders only the `flow-status` key, clears semantic-empty output, and exposes a read-only inspect
  command without dispatch, cancellation, archive, finish, or clear ownership;
- preserves the existing dispatch validation, tool protection, context injection, and result
  delivery paths in `src/omp/extension.ts`; and
- injects no `OMP`, `omp:`, logo, or Bundle shorthand in adapter-authored compact output.

## Independent verification

- `npm run build` — PASS.
- `npm test` — PASS, including `PASS: flow-status Python contract checks` and
  `PASS: 237 focused checks`.
- `git diff --check` — PASS; emitted only existing LF-to-CRLF warnings.
- Pinned-source inspection — PASS for the existence of `pi.VERSION`, `ctx.ui.setStatus`,
  `registerCommand`, `getCommands`, structured tool-execution events, and extension-owned timers.
- Pinned-source lifecycle inspection — FAIL for the implementation: 17.2.1 declares and emits a
  distinct post-transition `session_switch`, while `src/omp/flow-status.ts` does not subscribe to
  it.

Review actor: `reviewer-flowstatus-omp`

Review dispatch receipt: `6f22028d02224c50b241653f71ac8b19`

Implementation predecessor receipt: `9546f6eb9e82435cb24300da7003d322`
