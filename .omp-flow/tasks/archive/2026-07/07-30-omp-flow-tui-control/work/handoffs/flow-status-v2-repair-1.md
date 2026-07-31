---
type: "Handoff"
title: "Flow Status v2 review repair 1"
---

# Flow Status v2 review repair 1

## Correlation

- operation: `4f7dd4551a1a48eabbd62d5450bd3c9c`
- actor: `executor-flowstatus-v2-repair-2`
- predecessor review: `84f0332d994c427381649a31b7f4ac3d`
- source: [Flow Status v2 implementation review](../../review/flow-status-v2-implementation.md)
- repaired implementation: [initial v2 handoff](flow-status-v2-implementation.md)

## Delivered repair

The four requested review findings are repaired without changing the approved two-line user
experience.

1. The portable v2 receiver now treats an exact successful renew retry as `unchanged` without a
   history ledger. Reused renewed revisions with different semantics remain `replay`, stale CAS
   remains `compare-failed`, expiry remains closed, and the scope lock gives concurrent renewals
   exactly one winner.
2. setup/update/doctor/remove now validate exact v2 ownership, provider digest, build revision,
   widget tuple/digests/placements, managed-post digest, supervisor binding and configured
   command. An exact v2 update preserves the original `preInstall`; only the exact owned-v1
   record/node migrates in explicit update mode. Foreign, partial, duplicate, modified and
   swapped state fails closed. Pending recovery validates its exact closed record and staged
   content digests before recovery. Removal requires the exact current owner/provider/binding and
   both canonical views before deleting or rewriting.
3. Required v2 render/detail tests now exist and are wired into `npm test`. The inherited native
   v1 test now asserts the v2 envelope with independently retained `nativeActivity`. The normal
   gate also covers lease/CAS sequences, exact ownership/adversaries, v1 migration, existing and
   absent pre-install removal, Wave-only detail, fixture relocation, and Bundle-local link
   navigation under an archive-path move.
4. The pinned ccstatusline patch now contains a closed production provider/formatter benchmark
   mode. Benchmark and installed-artifact verification require
   `OMP_FLOW_CCSTATUSLINE_TARBALL`; neither uses the former fake provider/renderer. The installed
   test installs the clean-built package and exercises setup, semantic publication, direct
   production rendering, the production supervisor, doctor and removal.

The Windows workflow builds the pinned artifact first, then passes that exact tarball to the
production benchmark and installed test. Cold p95 remains a truthful, human-calibrated
non-blocking result; warm provider correctness and all hung-child kill/presentation/cleanup gates
remain blocking.

## Production artifact evidence

- upstream revision: `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`
- patch SHA-256: `f6ab8b74c0d4efa01a6a1b08564f92ff718e4b59ac1d4b6122508f95b1aa7c7e`
- clean-built package: `@omp-flow/ccstatusline@2.2.27-flowstatus.2`
- local clean-built tarball SHA-256:
  `116f4f9989c38331baa1cb5da27e1d8544ddb4d7f7d1caf0dabe38d445bb2419`
- clean-source checks: 34 tests, 258 expectations, TypeScript and ESLint pass, exact v2
  capability quartet pass
- installed artifact: real provider renders Task/Flow/Work rows through the production
  supervisor and exact removal passes

## Verification

Passed:

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks`
- `npm run build`
- `npm test` — `PASS: 270 focused checks`
- `node --test tests/flow-status-v2-render.test.mjs` — 3 tests
- `python -X utf8 tests/flow-status-v2-detail.test.py <fresh-deployed-root>` through `npm test`
- `python -X utf8 tests/flow-status.test.py <fresh-deployed-root>` through `npm test`
- clean-source `integrations/ccstatusline/build.mjs` — 34 tests / 258 expectations
- `node tests/flow-status-installed.mjs` with the clean-built tarball
- `node tests/flow-status-v2-benchmark.mjs` with strict blocking gates and the clean-built
  tarball
- `npm pack --dry-run --json` — 113 entries; runtime/cache artifacts absent
- `git diff --check`

The serial production benchmark on this busy Windows host reported:

- production provider + both formatters: 200 samples, p95 `4.656 ms`
- clean-built production child cold path: 40/40 rendered; p95 `969.224 ms`
- hanging child: kill request max `414 ms`, degraded presentation max `571.715 ms`, cleanup max
  `581.795 ms`

The cold value is recorded without hiding it and is non-blocking under the linked human
calibration; the warm 50 ms and hung 450/600/1000 ms gates all pass.

## Scope and preservation

- The live deployed legacy `.omp-flow/scripts` runtime was not changed while it coordinates the
  pre-cutover Bundle; the portable receiver repair is in the canonical template.
- The unrelated user change in
  `templates/.omp-flow/scripts/common/disposition.py` was preserved and remains excluded from the
  package.
- Authenticated Claude native end-to-end remains truthfully `unproven`; this repair proves the
  installed local artifact/runtime path and does not manufacture external evidence.
- No lifecycle database, Markdown semantic parser, compatibility cache reader, daemon, persistent
  Wave view, or Codex footer claim was added.

This handoff is ready for a fresh different-actor independent review.
