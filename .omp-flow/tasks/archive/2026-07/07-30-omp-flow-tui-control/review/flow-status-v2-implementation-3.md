---
type: "Review"
title: "Flow Status v2 second bounded repair review"
---

# Flow Status v2 second bounded repair review

Verdict: **ACCEPTED**

## Subject and correlation

This independent review is limited to the three findings in the
[second v2 Review](flow-status-v2-implementation-2.md), the approved
[completion-audit repair](../work/completion-audit-repair.md), and the
[second repair handoff](../work/handoffs/flow-status-v2-repair-2.md).

- review operation: `f6a106cab791450c8939dd5f37cdfba7`
- reviewer actor: `reviewer-flowstatus-v2-repair-2`
- completed predecessor: `22fe32aff8984361bbdfc1a795c2d66b`
- predecessor actor: `executor-flowstatus-v2-repair-3`
- predecessor output:
  `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/flow-status-v2-repair-2.md`

The runtime records prove that the predecessor is completed, the actors differ, and this Review
is bound to the supplied output. I inspected the six bounded changed files and their real tests,
then ran the full and production-artifact gates. I did not modify product code.

## Findings

No blocking or non-blocking implementation finding remains in the bounded repair.

## Accepted repair evidence

### Exact renew retry

`_v2_renew_snapshot_revision()` content-addresses the complete validated closed renew request,
including `requestId`, scope, actor, publication/source/selection CAS, lease identity,
`expectedLeaseRevision`, renewed revision/time/duration, and semantic assertion
(`templates/.omp-flow/scripts/common/flow_status.py:2510-2515`).

The receiver returns `unchanged` only when the already-current renewed lease revision and the
stored enclosing snapshot correlation both match that exact request
(`templates/.omp-flow/scripts/common/flow_status.py:3041-3052`). A changed predecessor therefore
cannot be accepted merely because it describes the same current lease effect. The focused matrix
now submits `lease-revision-forged-predecessor` and requires `replay`
(`tests/flow-status-v2.test.py:184-194`). This closes exact retry without a history ledger or a
new cache/schema field.

### Owned resources and restoration condition

`exactOwnershipV2()` now validates the closed ownership manifest, provider/build binding, both
canonical widgets, tuple order, and recorded placements without requiring the whole current
ccstatusline document to equal `managedPostInstallDigest`
(`src/cli/flow-status-setup.ts:358-391`). The digest remains validated closed data but is used as
the separate restoration condition.

Removal first proves the binding and exact owned resources, removes only those two exact views,
and deletes a fresh file only when `preInstall.state === "absent"` and the unmodified current
document still equals `managedPostInstallDigest`
(`src/cli/flow-status-setup.ts:1150-1193`). Otherwise it rewrites the remaining user-owned
configuration. Focused cases prove:

- exact fresh state restores absence;
- fresh state with an unrelated refresh field and user widget preserves the file and removes
  only the two managed views;
- an existing configuration preserves its original widgets plus unrelated post-install theme
  and widget edits; and
- modified owned views still fail closed
  (`tests/flow-status-v2-setup.test.ts:115-202`).

### Bounded Windows cleanup

The production benchmark teardown retries only `EBUSY`, `EPERM`, and `ENOTEMPTY`, at 250 ms
intervals under a 10-second deadline; every other error is rethrown immediately
(`tests/flow-status-v2-benchmark.mjs:57-71`). The focused supervisor test also gives
just-closed-child recursive removal a finite native retry bound
(`tests/flow-status-v2-supervisor.test.ts:64-69`). Production warm and hung-child thresholds were
not relaxed, and cold p95 remains explicitly reported but human-calibrated non-blocking.

I ran the strict real-artifact benchmark twice serially on Windows. Both runs exited 0, emitted
`pass: true`, and removed their UTF-8/CJK temporary roots without `EBUSY`:

| Gate | Run 1 | Run 2 | Result |
|---|---:|---:|---|
| warm p95 | 4.3334 ms | 4.2828 ms | blocking PASS, <= 50 ms |
| cold p95 | 872.2217 ms | 913.2971 ms | recorded, calibrated non-blocking |
| kill request max | 415 ms | 415 ms | blocking PASS, <= 450 ms |
| degraded presentation max | 572.5996 ms | 588.0394 ms | blocking PASS, <= 600 ms |
| cleanup max | 582.4813 ms | 599.4932 ms | blocking PASS, <= 1000 ms |

## Independent commands and results

Passed:

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks`
- `npm run build`
- `npm test` — `PASS: 271 focused checks`
- two serial strict `node tests/flow-status-v2-benchmark.mjs` runs with reviewer-built
  `@omp-flow/ccstatusline@2.2.27-flowstatus.2`
- `node tests/flow-status-installed.mjs` with that clean-built tarball —
  packed setup/publication/render/supervisor/doctor/removal path PASS
- `npx tsx tests/flow-status-v2-supervisor.test.ts`
- `npm pack --dry-run --json` — 113 entries
- `git diff --check` — exit 0, line-ending warnings only

The reused review artifact was clean-built from the unchanged pinned patch during the immediately
preceding independent review:

- upstream revision: `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`
- patch SHA-256: `f6ab8b74c0d4efa01a6a1b08564f92ff718e4b59ac1d4b6122508f95b1aa7c7e`
- tarball SHA-256:
  `a76964cdeb27ebe63002fc8e5aac1ab849b35e3979a9e15ea0bc7eff3ce60f72`
- clean-source verification: 34 tests / 258 expectations and exact v2 capability quartet PASS

## Scope and caveats

- The repair stayed within its six declared files and did not redesign renderer/detail/v1/archive
  behavior or the pinned ccstatusline patch.
- The in-flight deployed legacy `.omp-flow/scripts` runtime remains untouched.
- The unrelated user change in
  `templates/.omp-flow/scripts/common/disposition.py` remains outside this review and outside the
  package.
- Authenticated Claude native end-to-end remains truthfully `unproven`; this does not invalidate
  the independently proven local installed artifact/runtime path.
- Cold-start p95 remains above the historical target but is not a finding under the linked human
  calibration; warm correctness and all hung-child service gates remain blocking and passed.

The second bounded repair is accepted. It may proceed to the fresh completion audit required by
the Work; this Review does not itself claim final task completion or archive readiness.
