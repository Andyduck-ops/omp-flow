---
type: "Handoff"
title: "Oh My Pi native Flow Status adapter implementation"
---

# Oh My Pi native Flow Status adapter implementation

Status: **DONE**

Implements the bounded
[Oh My Pi native Flow Status adapter](../oh-my-pi-native-status.md) over the accepted shared
`status observe` and `status inspect` boundary.

## Delivered

- Added an exact positive capability probe for the pinned public surface. It requires injected
  `pi.VERSION === "17.2.1"`, structured event registration, command registration, command
  discovery, and no pre-existing `flow-status` command. Older, incomplete, or conflicting
  surfaces register no Flow Status command or event handlers.
- Added a session- and `toolCallId`-bound task-call adapter. It accepts only complete input-indexed
  `TaskToolDetails.progress[]` replacements, requires exact member identities, maps the pinned
  native terminal states, and never merges an unselected concurrent call.
- Sends the closed v1 observation to `omp-flow status observe --host oh-my-pi --session ...` as
  UTF-8 JSON on stdin using a process argument array. The shared Python producer remains the sole
  schema, binding, cache, and snapshot validator.
- Added one native `flow-status` status contribution with one graphical task-set bar, explicit
  current role/position when present, bounded attention, semantic-empty unsupported output, and
  freshness refresh. Session switch/shutdown clears only the adapter-owned key.
- Added one read-only `/flow-status` command backed only by scoped `status inspect`; it does not
  expose dispatch, archive, finish, clear, cancellation, or other mutation.
- Preserved the existing OMP extension's dispatch descriptor validation, tool protection, context
  injection, active-tool setup, and native result delivery without editing `src/omp/extension.ts`.

## Changed files

- `src/omp/flow-status.ts`
- `src/omp/extension-entry.ts`
- `tests/omp-flow-status.test.ts`
- `tests/omp-flow.test.ts` — focused test registration only; predecessor shared-core edits in this
  file were preserved.
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/oh-my-pi-native-status.md`

## Verification

- Pinned flat and batch fixtures cover running updates and terminal `failed`/`aborted` replacement.
- Negative fixtures cover partial progress, input/progress identity mismatch, a concurrent
  unselected call, unsupported version, missing API, command conflict, stale refresh, semantic
  empty, UTF-8 labels, exact-key ownership, no injected branding, and read-only command arguments.
- The pinned flat fixture crosses the real TypeScript-to-Python `status observe` process boundary
  and is read back as a validated cached snapshot.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS, including `PASS: flow-status Python contract checks` and
  `PASS: 237 focused checks`.
- `npm pack --dry-run` — PASS, including the compiled `dist/omp/flow-status` module.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

## Decisions and caveats

- Native task `requests`, tool counts, tokens, duration, and cost do not establish a stable
  current-task denominator, so the adapter intentionally emits no `ProgressObservation` from
  those fields.
- A sole running native member supplies the explicit native assignment role and target binding;
  unknown roles omit assignment presentation instead of inventing a methodology position.
- The locally installed OMP remains older than the pinned positive version. Positive behavior is
  verified against the pinned 17.2.1 fixture/public API and the real portable core boundary, not a
  live interactive 17.2.1 binary smoke session. The runtime probe therefore keeps that local
  installation unsupported.

Actor ID: `executor-flowstatus-omp`

Dispatch receipt: `9546f6eb9e82435cb24300da7003d322`

Predecessor receipt: `a6be1da7fc854a2295c073a2d5d7f309`
