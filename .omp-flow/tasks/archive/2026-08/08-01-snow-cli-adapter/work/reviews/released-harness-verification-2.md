---
type: "Review"
title: "Released-Harness compatibility verification re-review"
---

# Released-Harness compatibility verification re-review

## Findings

No blocking or non-blocking finding remains in the repaired
[Released-Harness compatibility verification](../released-harness-verification.md), its
[handoff](../handoffs/released-harness-verification.md), or the current
[verification evidence](../verification/released-harness-compatibility.md).

The prior review's two findings are closed:

- The released Snow resume evidence now preserves the exact redacted `node
  <global-npm>/snow-ai/bundle/cli.mjs -c 11111111-2222-4333-8444-555555555555` invocation,
  probe-only `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`, recorder-first `PATH`, handler command, one
  bounded recorder line, derived project/global counts, and explicit timing/termination/cleanup
  facts. The supplied `SNOW_SESSION_ID` is unambiguously labeled synthetic parent input rather
  than a native Snow identity.
- The Snow `package.json` SHA-256 is now the independently reproduced 64-character
  `cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419`. Every other SHA-256
  string in the evidence is also 64 hexadecimal characters.

Carried advisory, not a finding against this Work: the README compatibility clarification remains
owned by [CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md).
It should identify the pinned `snow-ai@0.8.24` target, state that released `0.7.23` is unavailable
for native session orientation, and avoid implying that `0.8.24` has been released-runtime tested.
The current verification Work correctly routes that concern and does not repair README itself.

## Verdict

**PASS — ACCEPTED.** The repaired evidence satisfies the Work's provenance, durable native-capture,
capability-labeling, cleanup, and mutation-boundary done conditions. All independently run tests
passed, no blocking finding remains, and every unavailable native path is visible rather than
manufactured as support.

## Scope and correlation

- Reviewed Work: [Released-Harness compatibility verification](../released-harness-verification.md)
- Reviewed handoff: [Released-Harness verification handoff](../handoffs/released-harness-verification.md)
- Reviewed evidence: [Released Snow and Cursor compatibility evidence](../verification/released-harness-compatibility.md)
- Prior review: [Released-Harness compatibility verification review](released-harness-verification.md)
- Completed predecessor receipt: `369d3d437c6d427ba9b3a93927d71080`
- Predecessor actor: `released_harness_rework`
- Predecessor output:
  `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/released-harness-verification.md`
- Reviewer actor: `released_harness_rereviewer`
- Review dispatch receipt: `2ac3ba84edf549ffb90c06953a1677a1`

The predecessor runtime record is completed, belongs to Bundle
`08-01-snow-cli-adapter`, uses this Work as its entry, and names the linked handoff above as its
exact output. The active review record names that receipt as predecessor. Executor and reviewer
actors differ.

The Bundle is currently untracked, so Git has no content base from which to render a useful patch
for these Concepts. The actual output files were inspected directly. The repaired handoff names
only the verification Concept and itself; the verification directory contains no persisted raw
attachment. A scoped last-write scan over `src/**`, `templates/**`, `tests/**`, and `README.md`
for the predecessor operation window (`2026-08-01T13:03:40Z` through
`2026-08-01T13:30:23Z`) returned zero product or README writes. The repository contains broader
pre-existing implementation changes, but the repair operation did not claim that the whole
worktree was clean.

## Contract assessment

- **Exact Snow resume/profile anchors — PASS.** The evidence gives the exact redacted entry path,
  `-c` UUID, working directory, isolated profile variables, synthetic parent environment marker,
  and recorder-first path. Installed Snow help independently confirms that `-c` resumes with an
  optional `sessionId`.
- **Recorder, timing, and cleanup — PASS.** The one recorder record contains only handler,
  synthetic-ID category, and stdin key names; derived counts are separately recorded as one
  project invocation and zero global invocations. The evidence states that the 15-second ceiling
  was not reached, the process had no natural exit, the captured handle was forcibly stopped at
  8,403 ms with exit `-1`, one detached exact-UUID `node` process was then found and terminated,
  and final process/tree counts were zero. Independent cleanup checks reproduced the final zero
  state.
- **Provenance — PASS.** Repository revision, tool versions, installed Snow version, package size,
  metadata digest, entry-bundle size/digest, template digest, package dry-run counts, and package
  sizes are internally valid and independently reproduced where the current environment remains
  stable.
- **Native evidence versus fixtures — PASS.** Only released Snow resume command execution and
  exercised `onSessionStart` project-over-global precedence are supported native observations.
  Synthetic resolver isolation, static bundle inspection, and handler fixtures are explicitly
  corroboration only. Installed agent cards are not treated as callable exact-identity proof.
- **Unavailable capability inventory — PASS.** Snow native session injection/orientation,
  released `beforeToolCall` write denial, POSIX commands, exact native role/operation correlation,
  pinned `0.8.24`, and other unrun Harness/OS combinations remain unavailable or untested. Cursor
  top-level Hook injection, concurrent conversations, reopen/resume, subagents, native write
  enforcement, exact identity, and all other unexecuted runtime/platform combinations remain
  unavailable. No `session_id` observation is promoted over documented `conversation_id`.
- **Safe failure and mutation boundary — PASS.** No failed probe selected another session, host,
  or task; no actor or receipt was created, aliased, normalized, or rewritten. No product source,
  README, runtime/session record, Harness configuration, or durable probe attachment was changed
  by the repair.

## Independent verification

- `git rev-parse HEAD` — **PASS**:
  `e14b5495830ba9821699898c23ba278680289fcc`, matching the evidence.
- `node --version; npm --version; python --version; pwsh --version; git --version` — **PASS**:
  `v22.22.2`, `10.9.7`, `3.12.7`, `7.6.4`, and `2.55.0.windows.2`.
- `npm list -g snow-ai --depth=0` and
  `node <global-npm>/snow-ai/bundle/cli.mjs --version` — **PASS**: both report `0.7.23`.
- `node <global-npm>/snow-ai/bundle/cli.mjs --help | Select-String
  'resume|conversation|\-c'` — **PASS**: `-c` is documented as resume with an optional
  `sessionId`; no caller-preselected native execution-ID option was exposed.
- `Get-FileHash -Algorithm SHA256` over installed Snow `package.json`, `bundle/cli.mjs`, and
  `templates/snow/hooks/session-start.py` — **PASS**: respectively
  `cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419`,
  `fc611d7d882d63e2e4458cea30b2f692e0de6a90588bde5279b7db4dba612a75`, and
  `4ba6623e7bab4bba82c2dcbd07d58cd15d1e0e8b3f680d958d50dc2f175ce459`;
  installed file sizes were 3,968 and 27,502,376 bytes as recorded.
- A regex scan of every 60-to-70-character hexadecimal token in the verification Concept —
  **PASS**: all 21 SHA-256 values were exactly 64 characters. Parsing the sanitized recorder JSON
  produced the expected handler, synthetic/non-native category, and exactly the keys
  `messageCount,messages`.
- `Test-Path .omp-flow/cache/released-harness-verification-369d3d` plus a scoped
  `Win32_Process` query for the exact synthetic UUID — **PASS**: probe absent, zero matching
  processes after excluding the query process.
- Scoped last-write scan over `src`, `templates`, `tests`, and `README.md` during the predecessor
  operation interval — **PASS**: zero matching files.
- `python -B -X utf8 tests/snow-hooks.test.py` — **PASS**, 8 tests.
- `python -B -X utf8 tests/cursor-hooks.test.py` — **PASS**, 11 tests.
- `npm pack --dry-run --json` — **PASS**, exit 0: `omp-flow@0.2.6`, 137 files, 184,580 packed
  bytes, and 851,930 unpacked bytes.
- `git diff --check` — **PASS**, exit 0 with line-ending notices only.

## Explicitly allowed fix

None performed. This review writes only this assigned Review Concept. The README clarification
remains a separately scoped integration-work return.
