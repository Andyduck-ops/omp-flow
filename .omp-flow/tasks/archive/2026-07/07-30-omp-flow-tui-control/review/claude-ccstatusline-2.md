---
type: "Review"
title: "Claude observation authority repair review"
---

# Claude observation authority repair review

Verdict: **CHANGES_REQUESTED**

This independently re-reviews the
[Claude/ccstatusline work](../work/claude-ccstatusline.md), the prior
[CHANGES_REQUESTED review](claude-ccstatusline.md), and the linked
[repair handoff](../work/handoffs/claude-ccstatusline-repair.md) against the approved
[source observation contract](../interfaces/flow-status-source-observation-v1.md) and the accepted
[shared snapshot boundary](shared-snapshot-and-inspect-2.md).

## Finding

### Medium — malformed persisted member state escapes the closed failure path

`templates/claude/hooks/flow-status-observe.py::_load_state()` now validates the observer envelope,
stored time, recent tool-use IDs, and list bounds, but it does not validate each persisted
`tasks[]` member. A JSON state containing `"tasks": [{}]` therefore passes `_load_state()`.
The next `TaskUpdate` reaches `_apply_update()`, evaluates `item["taskId"]`, and raises an
uncaught `KeyError`.

An independent temporary-repository probe established a valid baseline, replaced only the
persisted member array with `[{}]`, and submitted a bounded update. It produced:

```text
CORRUPT_STATE_EXIT 1 ... KeyError: 'taskId'
```

The hook neither published `unavailable/malformed` nor followed its intended non-blocking return
path. This violates the work's session-scoped closed failure and corrupt-cache recovery boundary.
It can also leave the previously published snapshot visible until ordinary snapshot expiry.

Repair the state decoder so every persisted member is a closed object with exactly one bounded
`taskId`, bounded `label`, and allowed normalized state, with unique task IDs and the same
1–128 complete-baseline rule used after `TaskList`. Any malformed stored member must:

1. revoke/delete the local baseline;
2. publish `unavailable/malformed` for the exact repository/session;
3. return zero so the observation hook remains non-blocking; and
4. require a new complete `TaskList` before a later delta can restore availability.

Add a real-hook regression that corrupts the persisted member shape, invokes a delta, asserts all
four behaviors above, and proves that a subsequent delta cannot bootstrap the set.

## Prior finding closure

### Stale and replayed delta authority — closed

The observer now retains bounded `lastObservedAtUnixMs` and recent tool-use IDs. Independent
probes refreshed filesystem mtime while making the stored observation 30,001 ms old and then
replayed an accepted update:

```text
STALE unavailable stale
REPLAY unavailable malformed
```

Neither delta revived task authority. The expanded real-hook suite covers both cases.

### Exactly-one-active current task — closed

`_current_task()` now returns a task ID only when exactly one member is active. The independent
probe reported:

```text
MULTI 2 None
```

The existing zero-active regression also retains `currentTask = null`.

### Known and unknown delete behavior — closed

The independent probes reported:

```text
DELETE_KNOWN available 2 0 None
DELETE_UNKNOWN unavailable malformed
```

A known `deleted` update removes exactly that member and cannot retain it as current. An unknown
delete fails closed and does not bootstrap membership. The implementation also degrades an empty
post-delete set to incomplete rather than emitting an available empty set.

### Distribution digest claim — closed

The amended handoff explicitly separates stable distribution identity from one npm-packed byte
stream. It records both independently observed tarball digests, disclaims byte reproducibility,
and requires each build result to carry its own computed `tarballSha256`. Stable trust is now
accurately anchored to the pinned upstream revision, reviewed patch digest, exact package
name/version, successful checks, and exact runtime capability.

## Unchanged ccstatusline boundary

- The tracked patch SHA-256 remains
  `e7dcebff8a6a1b8f124b026585affd0d83272758e0c0eeb7f69bf472c680d4f4`,
  exactly matching the build manifest and the bytes independently clean-replayed in the prior
  review.
- `git apply --check` still accepts the patch against the clean acquisition at
  `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`; that acquisition remains clean.
- Because the patch, build program, manifest, package identity, and capability declaration are
  unchanged, the prior independent 35-test/259-assertion provider, widget, catalog, Powerline,
  no-branding, and capability probe remains applicable. Per dispatch direction, this review did
  not repeat the five-minute clean build.

## Verification

- Repair predecessor `ecb63220b31c430cbf860f3f0397d655` is completed by
  `executor-flowstatus-claude-repair`, links the required repair handoff, and differs from reviewer
  actor `reviewer-flowstatus-claude-repair`.
- `python -X utf8 tests/claude-flow-status.test.py` — PASS, including stale/replay, multiple/zero
  active, known/unknown delete, baseline/delta, invalidation, partial-payload, and CJK cases.
- Independent real-hook temporary-repository probe — all four repaired findings PASS; malformed
  persisted member shape reproduced the remaining exit-1 failure above.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS, 240 focused checks.
- `npm pack --dry-run --json` — PASS; the observer and exact three-file ccstatusline integration
  boundary are present.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

Reviewer actor: `reviewer-flowstatus-claude-repair`

Review dispatch receipt: `2a610a8a06fd4c1fbc61e4cc477e392e`

Repair predecessor: `ecb63220b31c430cbf860f3f0397d655`
