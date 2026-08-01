---
type: "Review"
title: "Released-Harness compatibility verification review"
---

# Released-Harness compatibility verification review

## Findings

### Major — Snow native captures do not preserve the required exact invocation/output anchors

The [verification evidence](../verification/released-harness-compatibility.md) carefully labels
fixture-only behavior separately from released-runtime behavior, but the durable Snow capture is
not independently auditable at the exactness required by the
[Work](../released-harness-verification.md). It records `snow --ask <synthetic>` for the timed-out
new-session path and describes “resuming the synthetic UUID session” for the supported Windows
`onSessionStart`/project-precedence path. It does not preserve the exact resume command, isolated
profile/environment setup, command exit/timeout result, or a bounded sanitized excerpt from the
`python.cmd` recorder that shows the invoked handler, supplied `SNOW_SESSION_ID`, top-level stdin
keys, and project/global invocation counts. There is no sanitized attachment supplying those
missing anchors.

The installed `snow-ai@0.7.23` bundle independently corroborates that its `onSessionStart` call is
constructed from only `messages` and `messageCount`, and the evidence's conservative support and
unavailability labels are plausible. Source corroboration is not the native capture required to
distinguish released behavior from fixtures, however. A later reviewer cannot reproduce or trace
the claimed native project-command execution and project-over-global precedence from this Bundle
artifact alone.

Required correction: rerun or recover the Snow capture and add exact redacted commands plus
bounded sanitized recorder output/results (inline or under the Work's allowed attachments path).
Keep synthetic identities synthetic and continue to label source inspection and portable resolver
fixtures as corroboration rather than native support.

### Moderate — the recorded Snow package metadata SHA-256 is malformed and incorrect

The provenance section records the `snow-ai@0.7.23` package metadata SHA-256 as
`cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937dddb1c419`. That value contains 65
hexadecimal characters and therefore cannot be a SHA-256 digest. Independent hashing of the
installed `package.json` returned
`cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419` (64 characters). The
installed entry-bundle digest does match the evidence.

Required correction: replace only the malformed metadata digest with the independently reproduced
64-character value and recheck all recorded provenance strings. This is an evidence correction,
not a product or README change.

## Verdict

**FAIL.** The released-runtime claims are conservatively bounded and no product defect was
manufactured from unavailable Snow/Cursor paths, but the Work's exact provenance and durable
native-capture done conditions are not fully satisfied. The owning verification Work needs a new
handoff after the two evidence corrections above. No product or documentation code was repaired
during this review.

The routed README concern is accepted and remains owned by
[CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md),
not by this evidence repair. Current README text says Snow uses `SNOW_SESSION_ID` without stating a
minimum compatible Snow release, while the available released `0.7.23` payload cannot orient that
handler. The smallest later documentation correction remains: state the pinned `snow-ai@0.8.24`
target/minimum boundary, identify `0.7.23` as unavailable for native session orientation, and do
not claim `0.8.24` released-runtime verification until it is run.

## Scope and correlation

- Reviewed Work: [Released-Harness compatibility verification](../released-harness-verification.md)
- Reviewed handoff: [Released-Harness verification handoff](../handoffs/released-harness-verification.md)
- Reviewed evidence: [Released Snow and Cursor compatibility evidence](../verification/released-harness-compatibility.md)
- Approved inputs: [PRD](../../prd.md), [Design](../../design.md), and accepted implementation
  handoffs/reviews linked from the Work
- Completed predecessor receipt: `d358647e7cf243dfafe8fcbafbbc5e27`
- Predecessor actor: `released_harness_verifier`
- Reviewer actor: `released_harness_reviewer`
- Review dispatch receipt: `7f104c1582574a1fb5c4f58215dea434`

`operation show d358647e7cf243dfafe8fcbafbbc5e27` resolved a completed executor operation
for this Bundle and Work, with output exactly
`.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/released-harness-verification.md`. The handoff
links back to the same Work, evidence, actor, and receipt. `operation show
7f104c1582574a1fb5c4f58215dea434` resolved this active reviewer operation with that completed
operation as predecessor. Reviewer and executor actors differ.

The implementation-owned repository output is the verification Concept plus handoff; both are
new Bundle files in the current untracked task tree, so there is no tracked Git patch for their
content. Their actual contents were inspected directly. A UTC mtime scan over `src/**`,
`templates/**`, `tests/**`, and `README.md` during the predecessor operation window
(`2026-08-01T12:08:09Z` through `12:46:13Z`) found no product-source file written in that window.
The verification and handoff were written at `12:44:46Z`. This agrees with the handoff's
no-product-source-mutation boundary.

## Contract assessment

- **Installed artifact and native hashes:** PASS except for the metadata typo above. Repacking the
  current accepted source reproduced `omp-flow-0.2.6.tgz`, 184,580 bytes, and SHA-256
  `889fa1c6e67198f0f8c25c126f4f386d8c78ac4529c0fa59fd97425f79842888`. Independent UTF-8
  rendering with `{{PYTHON_CMD}} -> python` reproduced every one of the 17 Snow/Cursor hashes in
  the evidence.
- **Snow supported versus unavailable claims:** BOUNDED CORRECTLY. The globally installed package
  is `snow-ai@0.7.23`; its entry bundle matches
  `fc611d7d882d63e2e4458cea30b2f692e0de6a90588bde5279b7db4dba612a75`. Static inspection shows
  `executeHooks("onSessionStart", { messages, messageCount: messages.length })`, and `snow --help`
  exposes resume/session arguments but no caller-preselected native operation identity. The
  evidence properly does not promote portable resolver fixtures, agent cards, unreached
  `beforeToolCall`, POSIX, or pinned `0.8.24` into native passes. The native capture provenance
  still needs the first finding's durable anchors.
- **Cursor supported versus unavailable claims:** PASS. The registered Cursor install independently
  reports version `3.13.25`, build `31e8d61c448c7472e371505838a0fe34083dad50`, x64, and its
  executable hash matches
  `7c8d34632a703e07e1ce69dea64ce0141a32624e555ec708d5a8015d7ab8371c`. No released Hook payload is
  claimed, `conversation_id` remains the only supported identity, and every unexercised lifecycle,
  enforcement, or exact-dispatch path remains visibly unavailable.
- **Native evidence versus fixtures:** PASS in labeling, FAIL in durable traceability for Snow.
  The prose never substitutes fixture success for a released event and explicitly distinguishes
  portable resolver/source corroboration from native behavior. The missing exact native command
  and sanitized recorder anchors prevent full independent validation.
- **Cleanup:** PASS. The named
  `.omp-flow/cache/released-harness-verification-d358647e/` tree is absent, and a process query
  excluding the query process found zero command lines containing the probe receipt/path marker.
  The independent repack used a new validated OS-temp directory and proved it absent afterward.
- **Documentation routing:** PASS for this Work. The evidence identifies the unqualified README
  compatibility sentence and routes the smallest correction without editing README. The concern
  remains actionable integration work and must not be lost because this review otherwise returns
  to evidence repair.

## Independent verification

- `git rev-parse HEAD` — **PASS**: `e14b5495830ba9821699898c23ba278680289fcc`, matching the
  recorded source revision.
- `node --version`, `npm --version`, `python --version`, `pwsh --version`, and `git --version` —
  **PASS**: `v22.22.2`, `10.9.7`, `3.12.7`, `7.6.4`, and `2.55.0.windows.2`, matching the evidence.
- `npm list -g snow-ai --depth=0`, `snow --version`, and filtered `snow --help` — **PASS**:
  installed `snow-ai@0.7.23`; no caller-selected native execution-ID option was exposed.
- SHA-256 over the installed Snow `bundle/cli.mjs` — **PASS**, matches the evidence. SHA-256 over
  installed Snow `package.json` — **FAIL against the evidence string**: actual 64-character digest
  is `cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419`.
- Read-only inspection of installed Snow `bundle/cli.mjs` — **PASS as corroboration**: the
  `onSessionStart` payload construction contains only `messages` and `messageCount`.
- Registry lookup, SHA-256 over registered `Cursor.exe`, and explicit bundled
  `cursor.cmd --version` — **PASS**, reproducing Cursor version, build, architecture, and executable
  digest.
- Independent rendered-template SHA-256 comparison — **PASS**, 17/17 evidence rows matched.
- `npm pack --pack-destination <validated-os-temp>` plus SHA-256/size check — **PASS**: 137 files,
  184,580 packed bytes, 851,930 unpacked bytes, and the recorded artifact digest; the temp directory
  was removed and proved absent.
- `python -B -X utf8 tests/snow-hooks.test.py` — **PASS**, 8 tests.
- `python -B -X utf8 tests/cursor-hooks.test.py` — **PASS**, 11 tests. The combined shell wrapper
  timed out after both suites reported `OK`, before its trailing diff command ran; the diff command
  was therefore rerun separately.
- `git diff --check` — **PASS**, exit 0 with repository CRLF notices only.
- `Test-Path .omp-flow/cache/released-harness-verification-d358647e` and a scoped
  `Win32_Process` query — **PASS**: cache absent and zero matching processes after excluding the
  query process.

## Explicitly allowed fix

None performed. The next executor may edit only the verification evidence and its handoff under
the existing Work boundary to correct the digest and supply durable sanitized Snow capture
anchors. README repair remains a separate, scoped return to the integration Work.
