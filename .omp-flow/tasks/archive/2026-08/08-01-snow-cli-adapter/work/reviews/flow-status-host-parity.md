---
type: "Review"
title: "Flow Status host parity review"
---

# Flow Status host parity review

## Findings

### HIGH — The read-only Skill removes the usable evidence path for every existing host

The updated [canonical Flow Status Skill](../../../../../templates/common/skills/flow-status/SKILL.md)
requires a non-empty `OMP_FLOW_HOST` to select every non-Snow host. The tracked existing adapters
do not provide that variable:

- `templates/claude/hooks/session-start.py` exports only `OMP_FLOW_CONTEXT_ID`;
- `templates/codex/hooks/session-start.py` invokes runtime status with `CODEX_THREAD_ID` and
  explicitly removes `OMP_FLOW_CONTEXT_ID`, but it neither exports nor returns `OMP_FLOW_HOST`;
- `src/omp/extension.ts` passes `OMP_FLOW_CONTEXT_ID`, while `src/omp/flow-status.ts` owns the
  literal `oh-my-pi` scope internally; neither provides `OMP_FLOW_HOST` to the Skill.

The current Codex reviewer process demonstrates the resulting ordinary case: it has a valid
`CODEX_THREAD_ID` and no `OMP_FLOW_HOST` or `OMP_FLOW_CONTEXT_ID`. Under the new Skill rules, Flow
Status is therefore unavailable even though exact current-Harness and session evidence exists.
Claude and Oh My Pi have the analogous tracked-adapter gap. The test added in
`tests/flow-status-v2-publisher.test.ts` only asserts that selected prose fragments exist; it does
not exercise the runtime-evidence matrices for the three existing hosts.

This violates the Work done condition that existing Claude, Codex, and Oh My Pi behavior remains
covered. It also means the new fail-closed guidance regresses the read-only inspection surface for
all pre-existing Harnesses. Required fix: either define unambiguous native evidence and exact
session selection for each existing host in the Skill, with explicit conflict precedence, or
inject `OMP_FLOW_HOST` through each existing adapter's supported session surface. Add focused
tests for valid, absent, invalid, and conflicting evidence for all five hosts. Mixed/inherited
Harness variables must remain fail-closed or follow an explicitly justified authoritative signal.

### MEDIUM — The packaged main publisher guidance still declares the old three-host contract

`templates/common/skills/omp-flow/SKILL.md:152-154` and the tracked deployed copy
`.agents/skills/omp-flow/SKILL.md:152-154` still describe the installed closed publish, renew, and
clear commands as accepting only `<claude|codex|oh-my-pi>`. Those are the authoritative main-session
instructions for semantic publication, so Snow and Cursor main sessions receive guidance that
contradicts the five-host TypeScript/Python contract implemented by this Work.

This file was not included in the Work's allowed implementation boundary, but no other Work in the
authored map owns this Flow Status host contract. Required fix: widen the bounded repair scope to
update the canonical and tracked deployed `omp-flow` Skill copies to the same exact five-host set,
keep them in parity, and pin that publication guidance in focused coverage.

## Verdict

**FAIL.** The executable TypeScript and portable Python changes correctly extend the closed host
set to exactly `claude`, `codex`, `oh-my-pi`, `snow`, and `cursor`; preserve v2 shapes and the
existing scope-key/CAS/lease paths; reject unknown hosts before mutation; and isolate Snow and
Cursor scopes sharing one session label. The canonical/deployed read-only Skill copies are
byte-identical, and no live `.omp-flow/scripts/**` file was edited. However, the unresolved
high-severity existing-host inspection regression fails an explicit done condition, and the stale
main publisher guidance leaves Snow/Cursor parity incomplete. No implementation code was repaired
during this review.

## Scope and correlation

- Reviewed Work: [Flow Status host parity for Snow and Cursor](../flow-status-host-parity.md)
- Reviewed handoff: [Flow Status host parity implementation](../handoffs/flow-status-host-parity.md)
- Approved Design: [Flow Status](../../design.md#flow-status)
- Completed predecessor receipt: `371db6a2117d49c387aab919c89eb598`
- Predecessor actor: `flow_status_host_implementer`
- Reviewer actor: `flow_status_host_reviewer`
- Review dispatch receipt: `eb9e58fd1362426ea3b20ca81176356d`

The predecessor runtime record is `completed`, belongs to this Bundle, names the assigned Work
entry, and resolves its output to the reviewed handoff. The handoff links back to that Work.
Reviewer and implementation actors differ. Because this reviewer session has no active-task
pointer, the CLI correctly refused `operation show`; the same read-only operation JSON records
were inspected directly without creating or changing a session record.

The actual bounded diff contains exactly the eight host-contract, Skill, and focused-test files
listed by the handoff. Other concurrent worktree changes were not attributed to this Work. Scoped
`git diff --quiet -- .omp-flow/scripts` returned zero, confirming no tracked live runtime edit.

## Contract assessment

- **Closed executable host set:** PASS. TypeScript and portable Python contain exactly the three
  existing and two new values. Unknown TypeScript publisher input returns `malformed`; CLI
  validation rejects `unknown` before portable-runtime/cache mutation.
- **V2 shape and semantics:** PASS. The implementation changes only host unions/allowlists and
  parser choices. Independent full tests exercise exact top-level publication/snapshot key sets,
  publish, inspect, renew, stale CAS rejection, clear, and prior v1/v2 regressions.
- **Cross-host isolation:** PASS. The same `shared-host-session` produces distinct Snow and Cursor
  cache keys; clearing Cursor leaves Snow inspectable.
- **Read-only runtime evidence:** FAIL for existing hosts as described above. Snow/Cursor rules are
  otherwise explicit and fail closed on invalid, absent, or conflicting evidence and prohibit
  config-order/cache/Markdown inference.
- **Canonical/deployed Flow Status Skill parity:** PASS. Both files have SHA-256
  `D8D4F644EDB6AA8114B9F10E8CAC89F7D374298EB761249F95FD4C1C053D9778`.
- **Live runtime boundary:** PASS. No tracked `.omp-flow/scripts/**` diff exists, and read-only CLI
  probes did not change the number of live Flow Status cache files.

## Independent verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts` — **PASS**, exit 0.
- `npm run build` — **PASS**, `tsc` completed.
- `npm test` — **PASS**: 412 focused checks, 12 Python unittest cases, and 3 TAP tests. The invoked
  installed-project contracts reported `PASS: Flow Status v2 publication/cache and Snow/Cursor
  host-parity checks`, `PASS: Flow Status v2 detail and Wave-only inspection checks`, and
  `PASS: v1 native activity remains covered inside the v2 snapshot envelope`.
- `npm pack --dry-run` — **PASS**, 137 files, package `omp-flow@0.2.6`; no tarball was written.
- `git diff --check` — **PASS**, exit 0; only Windows line-ending notices were emitted.
- SHA-256 comparison of `templates/common/skills/flow-status/SKILL.md` and
  `.agents/skills/flow-status/SKILL.md` — **PASS**, hashes identical as recorded above.
- `git diff --quiet -- .omp-flow/scripts` — **PASS**, exit 0.
- `node bin/omp-flow.js help | Select-String 'flow-status publish'` — **PASS**, executable help
  displays `<claude|codex|oh-my-pi|snow|cursor>`.
- Empty-input Snow and Cursor publish probes — **PASS as closed failures**, both returned v2
  `malformed` with exit 2 after accepting the host argument. The equivalent `unknown` probe was
  rejected by TypeScript validation with exit 1. Flow Status cache-file count remained 1 before
  and after all three probes.
- Read-only environment/source audit — **FAIL as expected for the finding**: the current process
  exposes `CODEX_THREAD_ID` only, while repository search shows no existing Claude, Codex, or Oh
  My Pi adapter injection of `OMP_FLOW_HOST`. The updated Skill therefore directs this valid Codex
  session to unavailable.
- `Select-String` over the canonical and deployed `omp-flow` Skills — **FAIL as expected for the
  finding**: lines 152-154 retain `<claude|codex|oh-my-pi>` for publish, renew, and clear.
