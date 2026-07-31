---
type: "Review"
title: "Flow Status v2 implementation review"
---

# Flow Status v2 implementation review

Verdict: **CHANGES_REQUESTED**

## Subject and correlation

This independent review covers the approved
[completion-audit repair](../work/completion-audit-repair.md), its
[v2 implementation handoff](../work/handoffs/flow-status-v2-implementation.md), the linked
[PRD](../prd.md), [Design](../design.md), publication/publisher/snapshot interfaces, the
[QbD PASS](../qbd/flow-status-v2-audit-3.md), and the linked
[human approval](../qbd/flow-status-v2-human-decision.md).

- review operation: `84f0332d994c427381649a31b7f4ac3d`
- reviewer actor: `reviewer-flowstatus-v2`
- completed predecessor: `a8cc0dd6c1eb4906ae5a169fb23942a4`
- predecessor actor: `executor-flowstatus-v2`
- predecessor output:
  `.omp-flow/tasks/07-30-omp-flow-tui-control/work/handoffs/flow-status-v2-implementation.md`

The runtime records prove that the predecessor is completed, the actors differ, and this Review
is bound to the supplied output. I inspected the real working tree, canonical and deployed
resources, the pinned patch/build manifest, tests, package contents, and the clean-source
ccstatusline build. I did not modify product code.

## Findings

### High — exact lease-renew retry is not idempotent

The normative publisher interface requires an exact renew retry to return success unchanged.
Production instead compares the renew request ID with the original publication request ID at
`templates/.omp-flow/scripts/common/flow_status.py:3034-3050`. The publication is not updated with
the renew request ID, so an exact retry of a successful renewal returns `replay`.

I reproduced this through the installed portable CLI with the same closed renew document twice:

```text
first: rc 0, state "written", requestId "renew-request-0001",
       leaseRevision "lease-revision-0002"
retry: rc 2, code "replay"
```

This contradicts
`interfaces/flow-status-publisher-v2.md:206-211` and prevents the required retry/long-wait lease
matrix from passing. Repair the production retry relation without adding a history ledger, then
add direct exact-retry, conflicting-reuse, stale-CAS, concurrent-renew, expiry, and repeated
greater-than-900,000 ms fake-clock coverage.

### High — setup/update/remove do not enforce exact ownership and update loses original pre-install state

The approved setup contract requires exact ownership, conservative one-way owned-v1 migration,
and removal that restores the original pre-install state when still safe. The implementation has
four related violations:

1. `classify()` treats any object with `ownership.version === 2` as owned
   (`src/cli/flow-status-setup.ts:440-456`); it does not validate the capability, config path,
   provider/build digest, widget tuple/digests, placements, or managed-post-install digest.
2. `legacyOwned()` accepts any `version: 1` record and any matching-ID object whose type is merely
   `flow-status` (`src/cli/flow-status-setup.ts:552-561`), not the exact prior ownership and exact
   v1 widget required by the interface.
3. An owned v2 position/update rebuilds ownership using the already-managed current config as
   `preInstall` (`src/cli/flow-status-setup.ts:637-646`) instead of preserving the original
   ownership record. A fresh installation therefore changes from `preInstall: absent` to
   `preInstall: existing` after an update and can no longer restore absence on removal.
4. Removal checks only `version` and `capability` (`src/cli/flow-status-setup.ts:934-951`) and does
   not bind `configPath`, provider/build/widget digests, placements, or the owned post-install
   state before deleting canonical-ID nodes.

The focused setup test covers only fresh setup, unchanged setup, doctor, and fresh removal; it
contains no existing-config, v1 migration, position update, foreign/modified/swapped/duplicate,
partial-owned, pending recovery, rollback, or exact-owner removal cases. These gaps can overwrite
or remove content without the exact ownership proof promised by the approved interface.

### High — required executable verification is absent, and the tracked v1 contract test now fails

Two explicitly required acceptance entries do not exist:

```text
node --test tests/flow-status-v2-render.test.mjs
  exit 1: Could not find 'tests/flow-status-v2-render.test.mjs'

python -X utf8 tests/flow-status-v2-detail.test.py
  exit 2: can't open file ... tests/flow-status-v2-detail.test.py
```

The existing `tests/flow-status-v2-publisher.test.ts`,
`tests/flow-status-v2.test.py`, and `tests/flow-status-v2-setup.test.ts` exercise a small happy-path
subset, not the required nine variants, all movements/counter rules, non-current Work
adversaries, renew/expiry/clear sequences, one-winner concurrency, full ownership matrix,
two-view goldens, Wave-only detail, archive-aware navigation, or fixture-relocation scan. A
repository scan found no archive-aware verification entry.

In addition, the tracked inherited test is no longer part of `npm test` and fails against a fresh
deployment of the current canonical templates:

```text
python -X utf8 tests/flow-status.test.py <fresh-deployed-root>
  exit 1: AssertionError: fresh cache is available
```

The v2 cutover intentionally wraps native v1 activity in `nativeActivity`, but the inherited test
still asserts the old top-level v1 inspection shape. The approved Work required v1 native
activity to remain covered, not silently fall out of the full suite. Update this test to the v2
envelope semantics and run it from the normal gate.

### High — benchmark and Windows installed test do not exercise the claimed production ccstatusline path

`tests/flow-status-v2-benchmark.mjs` measures its local `providerFrame()` and a generated
`renderer.js` (`lines 12, 55-64, 76-101`). Neither is the patched production
`FlowStatusProvider`/formatter or the exact pinned ccstatusline executable. Consequently its warm
and 40 cold numbers do not prove the required production open/read/validate/format or complete
supervisor path.

The Windows workflow does build a clean compatible tarball and exports
`OMP_FLOW_CCSTATUSLINE_TARBALL`, but `tests/flow-status-installed.mjs` never reads that variable.
It creates a fake capability-only script at lines 60-76, so the built tarball is not installed,
configured, rendered, supervised, updated, or removed in the installed-artifact test.

The clean-source build itself is healthy: the patch applied to
`83c8ffd551ec700fceeed98fe9ab50de84cb49fa`, 34 tests/258 expects passed, and the capability probe
reported the exact quartet. The missing link is the real artifact-to-installed/runtime evidence.

## Performance calibration

I reran the benchmark serially on this Windows/Node 22 machine, as required:

```text
warm: 200 samples, p95 0.738 ms, max 1.534 ms
cold: 40 samples, p95 359.209 ms, max 385.054 ms
hung child: 20 samples
  kill lateness max 415 ms
  degraded presentation max 511.472 ms
  cleanup max 524.432 ms
```

The hung-child 450/600/1000 ms gates pass when run serially, so I found no terminal stall. The
cold p95 remains above 250 ms, but the human explicitly calibrated this local 255–359 ms range as
non-material and non-blocking unless it accompanies a real stall or correctness regression. I
therefore record the cold result truthfully as an optimization/external idle-run item and do
**not** use it as a finding. The benchmark-production-path mismatch above remains blocking because
the measured program is not the promised product path.

## Independent commands and results

Passed:

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks .claude/hooks`
- `npm run build`
- `npm test` — `PASS: 262 focused checks`
- `python -X utf8 tests/claude-flow-status.test.py`
- canonical and deployed
  `python -X utf8 .../flow-status-task-update-guard.py --self-test`
- `node tests/flow-status-final-repair.test.mjs`
- `node tests/flow-status-installed.mjs` — passes its fake compatible executable fixture
- `npm pack --dry-run --json` — 113 entries; v2 runtime/CLI/hooks/patch present, runtime/cache
  state absent
- `git diff --check` — exit 0, line-ending warnings only
- clean-source
  `node integrations/ccstatusline/build.mjs --source .omp-flow/cache/repos/ccstatusline
  --output <ignored-review-output>` — 34 tests, 258 expects, capability quartet PASS,
  patch SHA-256 `70059e925fae587ecfc8301674892b2f5b71eda58b807f78853c64a7e7f147d8`

Failed or not proved:

- exact renew retry — second identical request returns `replay`
- `node --test tests/flow-status-v2-render.test.mjs` — missing file
- `python -X utf8 tests/flow-status-v2-detail.test.py` — missing file
- `python -X utf8 tests/flow-status.test.py <fresh-deployed-root>` — inherited contract failure
- serial benchmark overall `pass: false` because cold p95 is above 250 ms; cold is
  human-calibrated non-blocking, and the hung-child gates pass
- authenticated Claude native E2E remains truthfully `unproven`
- no external GitHub Windows run was available in this local review

## Scope and preservation

- The in-flight live legacy `.omp-flow/scripts/omp_flow.py` and its common runtime were not
  modified; the v2 portable runtime change is confined to the canonical template until safe
  cutover.
- The unrelated user change in
  `templates/.omp-flow/scripts/common/disposition.py` remains outside the Flow Status
  implementation and is excluded from the packed artifact.
- No lifecycle database, Markdown parser, semantic ledger, daemon, Wave persistent view, Codex
  footer claim, or provider-controlled state transition was added.
- Runtime/cache/build-review artifacts remain ignored and absent from the package.

## Required repair boundary

Return this Work to the executor. Repair the four findings without changing the approved user
experience or cold-p95 human calibration:

1. make renew exact retry genuinely idempotent and add the full lease/CAS matrix;
2. validate and preserve exact v2/v1 ownership across setup/update/recovery/remove;
3. add and wire the required render/detail/archive/fixture/v1 and adversarial verification into
   the normal gates; and
4. benchmark and installed-test the actual clean-built pinned ccstatusline artifact through the
   production provider/supervisor.

A fresh different-actor review is required after the repaired handoff. The current implementation
is not accepted.
