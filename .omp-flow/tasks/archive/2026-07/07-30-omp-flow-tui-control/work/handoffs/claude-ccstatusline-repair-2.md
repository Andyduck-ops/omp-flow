---
type: "Implementation Handoff"
title: "Claude persisted-member closed-validation repair"
---

# Claude persisted-member closed-validation repair

Status: **DONE**

This closes the sole remaining finding in the independent
[Claude authority repair review](../../review/claude-ccstatusline-2.md) for the bounded
[Claude/ccstatusline work](../claude-ccstatusline.md).

## Repair

The persisted observer-state decoder now accepts `tasks` only when every member:

- is an object with exactly `taskId`, `label`, and `state`;
- has a non-empty string ID of at most 256 characters;
- has a non-empty string label of at most 512 characters;
- uses one normalized state from `completed`, `active`, `pending`, or `failed`; and
- has a task ID unique within the bounded zero-or-1–128 member list.

An empty list remains the explicit no-baseline state created by session invalidation. Any malformed
non-empty member list returns the decoder's `malformed` result before delta logic can index it.
The normal hook path then deletes the local observer baseline, publishes the closed
`unavailable/malformed` observation for the exact repository/session, retains no current task, and
returns zero. A later delta sees no complete baseline and remains `unavailable/incomplete` until
a new successful complete `TaskList`.

## Regression coverage

The real-hook test now corrupts a valid persisted baseline with:

- `{}`;
- missing and empty IDs;
- duplicate IDs;
- unsupported state;
- non-string label;
- a non-object member; and
- an extra field.

Every corrupt-state delta returns zero without a traceback, publishes
`unavailable/malformed` with `currentTask = null`, and deletes the state file. The test also proves
that a subsequent delta cannot bootstrap after revocation.

## Changed files

- `templates/claude/hooks/flow-status-observe.py`
- `tests/claude-flow-status.test.py`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/claude-ccstatusline-repair-2.md`

The ccstatusline patch, build manifest/program, shared runtime, installer, and OMP adapter were not
changed. The ignored acquisition remains clean at
`83c8ffd551ec700fceeed98fe9ab50de84cb49fa`.

## Verification

- `python -X utf8 tests/claude-flow-status.test.py` — PASS, including all corrupt-state cases and
  prior baseline/delta/stale/replay/current/delete/invalidation scenarios
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS
- `npm run build` — PASS
- `npm test` — PASS, 240 focused checks
- `npm pack --dry-run --json` — PASS
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were printed

Actor ID: `executor-flowstatus-claude-repair2`

Dispatch receipt: `dcc48a378ff74e54a13e342252e0d545`

Review predecessor: `2a610a8a06fd4c1fbc61e4cc477e392e`
