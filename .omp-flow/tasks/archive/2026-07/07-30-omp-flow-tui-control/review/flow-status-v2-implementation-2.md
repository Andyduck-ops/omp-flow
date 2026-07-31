---
type: "Review"
title: "Flow Status v2 repaired implementation review"
---

# Flow Status v2 repaired implementation review

Verdict: **CHANGES_REQUESTED**

## Subject and correlation

This independent repair review covers the approved
[completion-audit repair](../work/completion-audit-repair.md), the
[repair handoff](../work/handoffs/flow-status-v2-repair-1.md), and the four findings in the
[prior Review](flow-status-v2-implementation.md).

- review operation: `28a42a67123a4e70892b95ed79a89ae2`
- reviewer actor: `reviewer-flowstatus-v2-repair-1`
- completed predecessor: `4f7dd4551a1a48eabbd62d5450bd3c9c`
- predecessor actor: `executor-flowstatus-v2-repair-2`
- predecessor output:
  `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/flow-status-v2-repair-1.md`

The runtime records prove that the predecessor is completed, the actors differ, and this Review
is bound to the supplied output. I inspected the repaired implementation and tests, built the
pinned ccstatusline source, ran the normal repository gate, exercised the real installed
artifact, and ran the production benchmark twice. I did not modify product code.

## Findings

### High — renew retries are still not exact

The repaired receiver recognizes an already-current `renewedLeaseRevision` as unchanged when the
requested renewed time and duration equal the current lease and
`expectedLeaseRevision != leaseRevision`
(`templates/.omp-flow/scripts/common/flow_status.py:3034-3049`). It does not prove that
`expectedLeaseRevision` is the actual predecessor revision of that successful renewal.

Consequently, after a legitimate renewal from revision A to revision B, a different request can
submit the same B/time/duration with an arbitrary forged or stale expected revision C and receive
successful `unchanged`. The test conflicts only by changing the renewed timestamp, so this
adversary is not covered. This is effect-shaped replay acceptance, not the exact retry required
by `interfaces/flow-status-publisher-v2.md:206-211` and the approved Work.

Repair the retry correlation so only the exact successful request relation is idempotent while a
changed expected predecessor, request semantics, stale CAS, or conflicting reuse fails closed.
Add the changed-`expectedLeaseRevision` adversary directly to the lease matrix.

### High — exact whole-config ownership rejects legitimate unrelated edits and cannot implement the required removal split

`exactOwnershipV2()` requires the current whole ccstatusline file digest to equal
`managedPostInstallDigest` (`src/cli/flow-status-setup.ts:358-389`). Removal calls that predicate
before removing the two owned nodes (`src/cli/flow-status-setup.ts:1165-1182`). Therefore any
post-install user edit to an unrelated widget, theme, refresh value, or unknown field makes
removal fail as “foreign or modified,” even when both owned views, their placements, the provider,
binding, and ownership record remain exact.

The approved Work requires a fresh managed file to be deleted only while the whole file still
matches `managedPostInstallDigest`; otherwise removal must preserve the file and remove only the
exact owned views (`work/completion-audit-repair.md:205-212`). The current code cannot reach that
decision: after the unconditional whole-file digest check, it sets `restoreAbsent` solely from
`preInstall.state` and deletes the file (`src/cli/flow-status-setup.ts:1191-1193`). The setup
suite covers modified owned state and immediate removal, but not a legitimate unrelated
post-install edit.

Separate exact ownership of managed resources from the whole-file restoration condition. Preserve
unrelated edits, remove only exact owned views when the post-install digest changed, and add both
fresh-absence and existing-config adversaries with unrelated user modifications.

### High — the real production benchmark gate fails cleanup reproducibly

The repair now builds and invokes the real pinned ccstatusline artifact, closing the prior fake
renderer/provider gap. However, the production benchmark failed in two consecutive serial runs:

```text
Error: EBUSY: resource busy or locked, rmdir
  ...\flow-status-v2-benchmark-<id>\项目-基准
  at tests/flow-status-v2-benchmark.mjs:276
```

The unconditional synchronous recursive removal in the `finally` block does not tolerate the
Windows child/file-release race. Because both runs exit 1, the required warm, cold, hung-child,
presentation, and cleanup result is not a passing normal gate on this supported platform. Make
test cleanup bounded and retry-safe, while retaining the blocking warm and hung-child assertions.

Cold-start p95 remains a truthful human-calibrated non-blocking measurement; this finding is about
the benchmark's repeated cleanup failure, not the calibrated cold threshold.

## Closed prior findings and positive evidence

- The required render, detail, v1-envelope, fixture-location, and archive-aware tests now exist
  and are wired into `npm test`.
- Ownership validation is materially stronger: exact v2/v1 records, canonical view tuples,
  provider/build binding, pending recovery, one-way v1 migration, and immutable original
  `preInstall` are now covered. The unrelated-edit removal boundary above remains open.
- A clean build of revision `83c8ffd551ec700fceeed98fe9ab50de84cb49fa` applied patch
  SHA-256 `f6ab8b74c0d4efa01a6a1b08564f92ff718e4b59ac1d4b6122508f95b1aa7c7e`;
  upstream verification passed 34 tests / 258 expectations and reported the exact v2 capability
  quartet.
- The clean-built package passed the installed production flow:
  setup, semantic publication, direct rendering, supervisor, doctor, and exact unchanged-state
  removal.

## Independent commands and results

Passed:

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks`
- `npm run build`
- `npm test` — `PASS: 270 focused checks`
- clean `node integrations/ccstatusline/build.mjs --output <ignored-review-output>` —
  34 tests / 258 expectations and capability quartet PASS
- `node tests/flow-status-installed.mjs` with the clean-built tarball
- `npm pack --dry-run --json` — 113 entries
- `git diff --check` — exit 0 before this Review was added

Failed:

- `node tests/flow-status-v2-benchmark.mjs` with the clean-built tarball — two serial runs,
  both exit 1 at Windows cleanup with `EBUSY`

Not independently proved:

- authenticated Claude native end-to-end remains truthfully `unproven`
- no external GitHub Windows run was available in this local review

## Scope and preservation

- The in-flight deployed legacy `.omp-flow/scripts` runtime was not modified by this reviewer.
- The unrelated user change in
  `templates/.omp-flow/scripts/common/disposition.py` remains outside this Review.
- No lifecycle database, Markdown semantic parser, daemon, persistent Wave view, or Codex footer
  claim was introduced by the repair.

## Required repair boundary

Return this Work to an executor for a bounded repair:

1. make renew idempotency exact with changed-predecessor replay coverage;
2. preserve unrelated ccstatusline edits and apply the required digest-dependent removal split;
3. make the real Windows benchmark cleanup bounded and reliable.

The renderer/detail/v1/archive wiring and real installed-artifact path need no redesign. A fresh
different-actor review is required after the bounded repair.
