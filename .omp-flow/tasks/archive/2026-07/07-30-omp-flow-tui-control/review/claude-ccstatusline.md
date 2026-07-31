---
type: "Review"
title: "Claude observations and pinned ccstatusline Flow Status review"
---

# Claude observations and pinned ccstatusline Flow Status review

Verdict: **CHANGES_REQUESTED**

This independently reviews the
[Claude/ccstatusline work](../work/claude-ccstatusline.md) and its linked
[implementation handoff](../work/handoffs/claude-ccstatusline.md) against the approved
[Design](../design.md), [source observation contract](../interfaces/flow-status-source-observation-v1.md),
[snapshot contract](../interfaces/flow-status-snapshot-v1.md), pinned Claude executable fixture
at `tests/fixtures/flow-status/claude-task-events-v2.1.220.json`, its
[provenance](../reference/native-capability-fixtures.md#claude-code), and the accepted
[shared snapshot boundary](shared-snapshot-and-inspect-2.md).

## Findings

### High — stale Claude membership can be revived as fresh by a delta

`templates/claude/hooks/flow-status-observe.py::_load_state()` bounds the observer-state file size
but stores and checks no observation time or other expiry. A `TaskCreate` or `TaskUpdate` therefore
accepts an arbitrarily old complete baseline, increments its local sequence, and submits it with a
new `observedAtUnixMs`.

An independent temporary-repository probe established a baseline, set the observer-state mtime
two days into the past, then submitted one `TaskCreate`. The resulting inspected snapshot was
`available` with total `3`. This revives old membership as current authority and violates the
source contract's stale/gap invalidation rule. The repair must retain and validate bounded source
time/sequence authority and must add a negative stale-baseline fixture; a delta must not refresh
an expired, replayed, or otherwise unprovable baseline.

### High — multiple active members manufacture one current task

`_current_task()` returns the first active member. The contract instead requires
`currentTaskId = null` unless exactly one member is `in_progress`.

An independent probe changed a second member to `in_progress`; inspection reported
`taskSet.active = 2` and `currentTask.taskId = "a"`. That is a false current-task attribution,
not merely a display preference. Return `null` for zero or multiple active members and cover both
cases with tests.

### Medium — the documented delete delta invalidates the whole set

The closed source contract explicitly says `TaskUpdate(status: "deleted")` removes the member.
`_apply_update()` accepts only `STATE_MAP`, which excludes `deleted`; the hook catches the error,
deletes its authoritative baseline, and publishes `unavailable/malformed`.

An independent two-member probe produced:

```text
DELETE 0 '...TaskUpdate has unsupported status' unavailable malformed
```

Implement exact member removal, create a new membership revision, and test deletion without
bootstrapping or retaining the deleted current task.

### Medium — the handoff's exact tarball digest is not reproducible

The tracked clean build successfully verified and applied the pinned patch, ran the upstream
checks, built the package, probed the exact capability, and packed the named artifact. However,
the independently produced tarball SHA-256 was:

```text
9dc36a8cc40796b1ff6eef6c6806e140ba78dc38a95c343c8637c84f20697857
```

The handoff records:

```text
4e7b322605c1f79fd73b6372e6f99963604f727c42c5d7b1f21c28c74076041d
```

The patch digest, package name/version, upstream revision, and runtime capability all matched, so
this finding is about the explicit deterministic-artifact/digest claim rather than patch identity.
Either make the archive byte-reproducible under a pinned build/pack environment and prove a second
matching replay, or narrow the handoff/setup trust claim to the reviewed patch, exact revision,
package identity, and runtime capability with an honestly generated artifact digest.

## Verified implementation portions

- Predecessor `df52be28381041899cb350ab1d73a022` is completed by
  `executor-flowstatus-claude`, names this work and the required handoff, and differs from reviewer
  actor `reviewer-flowstatus-claude`.
- The patch file SHA-256 is
  `e7dcebff8a6a1b8f124b026585affd0d83272758e0c0eeb7f69bf472c680d4f4`,
  matching the tracked build manifest.
- A clean detached clone of
  `83c8ffd551ec700fceeed98fe9ab50de84cb49fa` accepted the patch. TypeScript, focused ESLint,
  upstream build, and the focused provider/widget/catalog suite passed: 35 tests, 259 assertions.
- The Powerline composition test passed, the widget rendered at most one graphical bar and
  compacted it to a ratio, existing widgets remained present, and the adapter-authored fixture
  rejected `OMP`, `omp:`, and a logo.
- The capability probe returned exactly:

```json
{
  "flowStatusWidgetV1": true,
  "upstreamRevision": "83c8ffd551ec700fceeed98fe9ab50de84cb49fa"
}
```

- The acquisition cache remained clean at the pinned revision. The patch does not introduce a
  Custom Command or patch an installed copy.
- `src/cli/init.ts` did not yet register `flow-status-observe.py` during this review. That is
  correctly disclosed by the handoff and belongs to the later
  [setup/integration work](../work/setup-docs-and-integration.md), whose allowed boundary owns
  managed-resource registration and coexistence. It is not an additional hidden blocker in this
  component review, but no installed-Claude claim is valid until that later work is accepted.

## Verification

- `python -X utf8 tests/claude-flow-status.test.py` — PASS. This baseline suite does not cover the
  three failing semantic cases above.
- Independent temporary-repository probe — reproduced:

```text
MULTI_ACTIVE 0 2 a
DELETE 0 '...TaskUpdate has unsupported status' unavailable malformed None
STALE_BASELINE_DELTA 0 available 3
```

- `node integrations/ccstatusline/build.mjs --source
  .omp-flow/cache/repos/ccstatusline --output <ignored-unique-runtime-directory>` — PASS for clean
  revision/patch checks, install, TypeScript, ESLint, 35 focused tests, build, capability probe,
  and pack; produced the non-matching digest reported above.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- A final concurrent `npm test`, `npm pack --dry-run --json`, and `git diff --check` batch was
  intentionally terminated after 30 seconds at the coordinator's request because the reproduced
  blocking findings were already sufficient. It is not recorded as a passing verification.

Reviewer actor: `reviewer-flowstatus-claude`

Review dispatch receipt: `c159e0fcd74d4b01ab89ecfd29e4e010`

Implementation predecessor: `df52be28381041899cb350ab1d73a022`
