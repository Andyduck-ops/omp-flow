---
type: "Implementation Handoff"
title: "Claude observation authority and distribution-claim repair"
---

# Claude observation authority and distribution-claim repair

Status: **DONE**

This repairs every finding in the independent
[Claude/ccstatusline review](../../review/claude-ccstatusline.md) for the bounded
[Claude/ccstatusline work](../claude-ccstatusline.md). It preserves the accepted shared observation
boundary and does not change the reviewed ccstatusline patch.

## Finding closure

### Stale or replayed membership cannot be revived

The observer state now carries bounded `lastObservedAtUnixMs` and up to 128 unique recent
tool-use IDs in addition to its monotonic adapter sequence. A delta is accepted only when:

- the state matches the exact Claude session;
- its stored observation time is within the 30-second source authority window and not
  clock-uncertain;
- it still contains a complete non-empty baseline; and
- the correlated tool-use ID has not already been observed.

Filesystem mtime is not used as authority. An expired delta publishes `unavailable/stale` and
removes the local baseline. A replayed tool result revokes the baseline as malformed. A new,
successful, complete `TaskList` may restore authority because it replaces membership rather than
refreshing an old delta.

The real-hook regression writes an expired `lastObservedAtUnixMs`, refreshes the state file mtime,
then proves that `TaskCreate` cannot revive the set. A separate regression submits the same
`TaskUpdate` tool-use ID twice and proves the replay cannot refresh authority.

### Current task requires exactly one active member

`currentTaskId` is now emitted only when the complete member set contains exactly one active
member. Zero or multiple active members emit `null`. The real hook suite establishes two active
members and verifies `active = 2` with `currentTask = null`; the existing zero-active delta check
continues to verify `currentTask = null`.

### Deleted update removes one known member

`TaskUpdate(status: "deleted")` now removes exactly the correlated known member before the next
membership revision is produced. Deleting the only remaining member degrades to incomplete rather
than manufacturing an available empty set. An unknown-member delete still fails closed and cannot
bootstrap membership.

The real-hook regression deletes the sole active member from a three-member baseline and verifies
`total = 2`, `active = 0`, and no retained current task, then proves an unknown delete publishes
`unavailable/malformed`.

### Tarball digest claim is per artifact

The original [implementation handoff](claude-ccstatusline.md) now distinguishes stable
distribution trust from one npm-packed byte stream:

- stable trust: pinned upstream revision, reviewed patch SHA-256, exact package name/version,
  successful clean build/tests, and exact runtime capability;
- per-artifact trust: the `tarballSha256` calculated and returned by that specific build execution.

It explicitly records that the executor and independent reviewer obtained different tarball
digests despite matching all stable identity/capability checks. It no longer offers either digest
as a cross-replay or byte-reproducibility guarantee. `build.mjs` already computes the actual
digest after every pack, so no build-code change was needed.

## Changed files

- `templates/claude/hooks/flow-status-observe.py`
- `tests/claude-flow-status.test.py`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/claude-ccstatusline.md`
- `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/claude-ccstatusline-repair.md`

The shared Python producer/cache, reviewed ccstatusline patch and manifest, generic installer,
live deployed runtime, unrelated `disposition.py`, and OMP adapter were not changed. The ignored
ccstatusline acquisition remains clean at
`83c8ffd551ec700fceeed98fe9ab50de84cb49fa`.

## Verification

- `python -X utf8 tests/claude-flow-status.test.py` — PASS, including real-hook stale stored-time,
  replayed tool-use, multiple/zero active, known delete, unknown delete, baseline/delta,
  invalidation, partial-payload, and CJK scenarios
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS
- `npm run build` — PASS
- `npm test` — PASS, 240 focused repository checks and the expanded Claude hook contract
- `npm pack --dry-run --json` — PASS; repaired observer and unchanged reviewed integration boundary
  are included
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were printed

Actor ID: `executor-flowstatus-claude-repair`

Dispatch receipt: `ecb63220b31c430cbf860f3f0397d655`

Review predecessor: `c159e0fcd74d4b01ab89ecfd29e4e010`
