---
type: "Handoff"
title: "Released-Harness compatibility verification handoff"
---

# Released-Harness compatibility verification handoff

## Result

Status: **DONE_WITH_CONCERNS** for
[Released-Harness compatibility verification](../released-harness-verification.md).

The review's two evidence defects are repaired in the full sanitized evidence recorded in
[Released Snow and Cursor compatibility evidence](../verification/released-harness-compatibility.md).
The corrected installed Snow metadata digest is a verified 64-character SHA-256, and the native
resume claim now has exact redacted invocation/profile anchors, bounded recorder output, and
exit/timeout facts. The packed `omp-flow@0.2.6` installation and all 17 installed Snow/Cursor
managed hashes remain passed. The available runtimes still do not prove broad lifecycle support:
Snow `0.7.23` has an incompatible resume payload, while Cursor `3.13.25` could not expose an agent
session or Hook capture in this non-interactive environment.

## Environment and results

- Windows `10.0.26200` x64; PowerShell `7.6.4`; Node `22.22.2`; npm `10.9.7`; Python `3.12.7`.
- Source revision `e14b5495830ba9821699898c23ba278680289fcc`.
- Packed `omp-flow@0.2.6` artifact SHA-256:
  `889fa1c6e67198f0f8c25c126f4f386d8c78ac4529c0fa59fd97425f79842888`.
- Snow `0.7.23`: exact
  `node <global-npm>/snow-ai/bundle/cli.mjs -c 11111111-2222-4333-8444-555555555555` resume under
  probe-only `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and recorder-first `PATH` produced one
  project `onSessionStart` invocation and zero same-event global invocations. The recorder retained
  only the invoked `.snow/hooks/session-start.py`, the parent-supplied synthetic/non-native
  `SNOW_SESSION_ID=synthetic-parent-env-369d3d`, and stdin keys `messageCount,messages`. The
  15-second ceiling was not reached; the supervisor-owned process handle was forcibly stopped
  after capture at 8,403 ms with exit code `-1`. Cleanup subsequently found and terminated one
  detached `node` process uniquely identified by the exact synthetic resume UUID. Native
  orientation, native session injection, released write denial, and exact operation correlation
  remain unavailable. Portable resolver fixtures remain separate corroboration and are not
  counted as native evidence.
- Cursor `3.13.25` build `31e8d61c448c7472e371505838a0fe34083dad50`: version/help were
  callable from its non-`PATH` bundled CLI. `agent` detached into an isolated desktop process tree
  and yielded no Hook payload. Top-level, concurrency, resume, subagent, write enforcement, and
  exact identity paths remain unavailable.
- Snow `0.8.24`, all POSIX paths, and every unexecuted Harness/OS combination remain explicitly
  untested.

## Verification

- Built, packed, installed, and initialized the accepted artifact — **PASS**.
- Installed hash comparison — **PASS**, 17/17 native resources, zero mismatches against both the
  installed manifest and rendered packed templates.
- Installed Snow package provenance — **PASS**: package, CLI, and metadata reported `0.7.23`;
  `package.json` SHA-256 is the corrected 64-character
  `cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419`; the entry digest remains
  `fc611d7d882d63e2e4458cea30b2f692e0de6a90588bde5279b7db4dba612a75`.
- Released Snow native resume evidence repair — **PASS** for durable invocation/profile,
  handler, supplied environment category, stdin-key, project/global count, and forced-exit
  anchors; capability result remains partial because native session orientation is unavailable.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — **PASS**.
- `npm run build` — **PASS**.
- `npm test` — **PASS**: 511 focused checks; 12 Flow Status tests; 8 Snow tests; 11 Cursor tests;
  3 TAP tests.
- `npm pack --dry-run --json` — **PASS**: 137 files, 184,580 packed bytes, 851,930 unpacked bytes.
- `git diff --check` — **PASS** with line-ending notices only.

## Documentation truthfulness and next route

README's negative capability claims remain truthful: Snow project Hook precedence, bounded
protection, unavailable exact dispatch, and unavailable Cursor released lifecycle/identity paths
all agree with the captures.

The one routed concern belongs to
[CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md):
README should state the pinned `snow-ai@0.8.24` target/minimum compatibility boundary and label
`0.7.23` unavailable for native session orientation. The current unqualified `SNOW_SESSION_ID`
sentence overstates compatibility for the released Snow version actually present. No code repair
is authorized or recommended from this evidence alone, because `0.8.24` was unavailable and not
run.

Recommended next step: a new independent review of this repaired verification Work and evidence,
followed by the already-routed smallest README-only return to the integration Work.

## Files changed

- `.omp-flow/tasks/08-01-snow-cli-adapter/work/verification/released-harness-compatibility.md`
- `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/released-harness-verification.md`

No product source, runtime/session record, Harness configuration, or persisted verification
attachment was changed.

All probe-owned processes and the temporary repair probe tree were removed after capture. Final
checks found zero exact synthetic-UUID Snow processes and no probe tree. The final scoped status
contains only the two promised Concepts from this Work.

## Correlation

- Actor ID: `released_harness_rework`
- Dispatch receipt: `369d3d437c6d427ba9b3a93927d71080`
- Completed predecessor receipt: `7f104c1582574a1fb5c4f58215dea434`
- Predecessor output:
  [Released-Harness compatibility verification review](../reviews/released-harness-verification.md)
- Output Concept:
  `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/released-harness-verification.md`

## Unproven done conditions

No documentation-visible evidence category is omitted: every requested Cursor and Snow path is
either captured or explicitly unavailable with its observed reason. Native support itself remains
unproven for Snow `0.8.24`, Snow released write events and exact identity, and all Cursor lifecycle,
enforcement, and exact identity paths listed above. These are capability limits, not manufactured
passes.
