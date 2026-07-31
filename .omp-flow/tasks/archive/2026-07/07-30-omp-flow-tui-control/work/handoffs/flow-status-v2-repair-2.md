---
type: "Handoff"
title: "Flow Status v2 review repair 2"
---

# Flow Status v2 review repair 2

Status: `DONE`

## Correlation

- operation: `22fe32aff8984361bbdfc1a795c2d66b`
- actor: `executor-flowstatus-v2-repair-3`
- predecessor review: `28a42a67123a4e70892b95ed79a89ae2`
- source: [second independent v2 Review](../../review/flow-status-v2-implementation-2.md)
- prior handoff: [Flow Status v2 review repair 1](flow-status-v2-repair-1.md)

## Bounded repair

Only the three findings in the source Review were changed.

### Exact renew retry relation

The enclosing `snapshotRevision`, which the approved interface already permits renewal to
change, is now the content-addressed digest of the complete validated renew request. An
idempotent retry succeeds only when that exact request produced the currently stored renewal.
Changing `requestId`, the expected predecessor lease revision, time, duration, scope, actor or
any other closed request field produces a different correlation and fails as replay/CAS instead
of being accepted merely because it describes the same current lease effect.

This retains one latest projection and adds no history ledger or extra cache/schema field.
The lease matrix now includes the previously missing forged-`expectedLeaseRevision` adversary.

### Owned resources versus whole-file restoration

Exact v2 ownership now proves the manifest shape, provider/build digest, binding, both canonical
view objects, their tuple order and their placements independently of unrelated ccstatusline
content. `managedPostInstallDigest` remains a closed SHA-256 restoration condition, not an
ownership precondition.

Removal now behaves as follows:

- a fresh file is deleted only when `preInstall` is `absent` and the current whole file still
  matches `managedPostInstallDigest`;
- if a fresh file has unrelated user edits, only the two exact owned views are removed and the
  edited file is rewritten;
- an existing configuration is always preserved while the two exact owned views are removed;
- modified/missing/duplicate/swapped owned views, provider/binding changes and malformed
  ownership still fail closed; and
- the original `preInstall` value remains immutable across v2 updates.

Focused setup coverage now exercises both fresh-absence and existing-config post-install edits,
including unrelated root fields, theme data and user widgets.

### Bounded Windows cleanup

The production benchmark teardown now retries only `EBUSY`, `EPERM` and `ENOTEMPTY` with a hard
10-second deadline and 250 ms intervals. Other errors fail immediately. The focused supervisor
test uses Node's bounded native recursive-removal retry for the same just-closed-child release
race.

Repeated real-artifact benchmark runs completed teardown without another `EBUSY`. Warm provider
and hung-child kill/presentation/cleanup gates remain blocking; cold p95 remains truthful and
human-calibrated non-blocking.

## Changed files

- `templates/.omp-flow/scripts/common/flow_status.py`
- `src/cli/flow-status-setup.ts`
- `tests/flow-status-v2.test.py`
- `tests/flow-status-v2-setup.test.ts`
- `tests/flow-status-v2-benchmark.mjs`
- `tests/flow-status-v2-supervisor.test.ts`

The live deployed legacy `.omp-flow/scripts` runtime was not modified during the pre-cutover
Bundle.

## Verification

Passed:

- `npm run build`
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks`
- `npm test` — `PASS: 271 focused checks`
- `node tests/flow-status-installed.mjs` with the clean-built pinned tarball
- repeated strict `node tests/flow-status-v2-benchmark.mjs` runs with the clean-built pinned
  tarball; teardown completed without `EBUSY`
- `npm pack --dry-run --json` — 113 entries
- `git diff --check`

Latest passing strict production benchmark:

- provider plus both formatters: 200 samples, warm p95 `3.7255 ms`
- production cold child: 40/40 rendered, p95 `758.7415 ms` (truthful non-blocking calibration)
- hanging child: kill request max `416 ms`, degraded presentation max `504.8702 ms`, cleanup max
  `518.5059 ms`
- blocking warm and 450/600/1000 ms hung gates: PASS

One intentionally back-to-back loaded run completed cleanup successfully but was correctly
rejected by the unchanged blocking presentation gate when one hung sample reached about 610 ms.
Subsequent isolated strict verification passed. No threshold was relaxed and no cleanup failure
was hidden.

## Preservation and caveats

- Renderer/detail/v1/archive behavior and the pinned ccstatusline patch were not redesigned.
- Patch SHA-256 remains
  `f6ab8b74c0d4efa01a6a1b08564f92ff718e4b59ac1d4b6122508f95b1aa7c7e`.
- The unrelated user change in
  `templates/.omp-flow/scripts/common/disposition.py` remains untouched and excluded from the
  package.
- Authenticated Claude native end-to-end remains truthfully `unproven`.

This repair is ready for a fresh different-actor independent review.
