---
type: "Review"
title: "Flow Status host parity re-review"
---

# Flow Status host parity re-review

## Findings

No blocking, major, or advisory findings.

The two findings in the [prior review](flow-status-host-parity.md) are closed. The read-only Skill
again has usable native/runtime evidence paths for Claude, Codex, and Oh My Pi, while adding Snow
and Cursor without consulting configured Harness order. The canonical publisher guidance and all
owned tracked copies now name the same exact five-host set.

## Verdict

**PASS.** The current revision satisfies the [Flow Status host-parity Work](../flow-status-host-parity.md)
and its linked Design. The closed executable host set is exactly `claude`, `codex`, `oh-my-pi`,
`snow`, and `cursor`; unknown hosts fail before mutation. The runtime-evidence rules provide one
valid exact host/session path for each of the five hosts, reject missing or invalid evidence, and
fail closed on competing host claims or disagreeing same-host session identifiers. Cursor still
requires its explicit Hook-injected host and context. No v2 field, cache layout, semantic inference
path, CAS rule, or lease behavior was added or changed beyond accepting the two new host values.

## Scope and correlation

- Reviewed Work: [Flow Status host parity for Snow and Cursor](../flow-status-host-parity.md)
- Reviewed handoff: [Flow Status host parity rework](../handoffs/flow-status-host-parity.md)
- Prior Review: [Flow Status host parity review](flow-status-host-parity.md)
- Approved Design: [Flow Status](../../design.md#flow-status)
- Completed predecessor receipt: `7070540d42f340a1b4c26f669a52d591`
- Predecessor actor: `flow_status_host_rework`
- Reviewer actor: `flow_status_host_rereviewer`
- Review dispatch receipt: `2c0c4e6432d145f987f721340b344614`

The predecessor runtime record is `completed`, belongs to Bundle
`.omp-flow/tasks/08-01-snow-cli-adapter`, names `work/flow-status-host-parity.md`, and resolves its
output to the reviewed handoff. The handoff links back to the same Work and records the matching
receipt and actor. Reviewer and implementation actors differ. Because this reviewer process has no
active-task pointer, the session-scoped `operation show` surface refused the lookup; the two
read-only operation JSON records were inspected directly without changing a session or operation
record.

The implementation-owned diff comprises the twelve host-contract, Skill, and focused-test files
listed in the handoff. Concurrent worktree changes outside that list were not attributed to this
Work. The widened Work boundary explicitly owns the canonical `omp-flow` Skill plus its `.agents`,
`.omp`, and `.claude` deployments. No implementation code was repaired during this review.

## Contract assessment

- **Five-host executable contract:** PASS. TypeScript publisher validation, CLI validation/help,
  portable Python host validation, and Python CLI choices use the exact five-host set. Unknown
  TypeScript input returns `malformed`; unknown Python CLI input is rejected before cache mutation.
- **Five-host runtime-evidence matrix:** PASS. Claude uses native execution plus its bridged
  `OMP_FLOW_CONTEXT_ID`; Codex uses `CODEX_THREAD_ID`; Oh My Pi uses native execution and/or its
  `OMP_SESSION_ID`/`PI_SESSION_ID`; Snow uses `SNOW_SESSION_ID`; Cursor requires
  `OMP_FLOW_HOST=cursor` plus its matching Hook-injected context. Empty evidence is absent, and
  `OMP_FLOW_CONTEXT_ID` alone never identifies a host.
- **Conflict precedence:** PASS. A valid explicit host is authoritative only within an
  unambiguous evidence set. A competing native or host-specific claim makes the scope unavailable,
  and every session identifier applicable to the selected host must agree. Invalid explicit host
  evidence fails closed. Config files, configured Harness order, cache recency, task counts, and
  Markdown are prohibited selection inputs.
- **V2/CAS/lease behavior:** PASS. Production code changes only the host union/allowlists and CLI
  choices. Exact publication/snapshot shapes, publish, inspect, renew, stale-CAS rejection, clear,
  and same-session cross-host isolation pass executable tests for Snow and Cursor alongside the
  existing-host regressions.
- **Skill parity and publisher guidance:** PASS. The canonical/deployed Flow Status pair is
  byte-identical with SHA-256
  `CEC4319FC8B297DE98075343424EE5D9AA8AB385C0ABE55C4B102D60B5BA9E6C`. The canonical `omp-flow`
  Skill and all three owned tracked deployments are byte-identical with SHA-256
  `7B2198319C16D4DC2C1FE5E8B9598618692D88ED6218A65509137BF0D4D326CA`.
- **Live runtime boundary:** PASS. `.omp-flow/scripts/**` has neither a tracked diff nor an
  untracked status entry. Only the canonical runtime under `templates/.omp-flow/scripts/**` was
  changed.

## Independent verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — **PASS**,
  exit 0.
- `npm run build` — **PASS**, `tsc` completed.
- `npm test` — **PASS**: 439 focused checks, 12 Python `unittest` cases, and 3 TAP tests. The
  integrated Flow Status contracts reported PASS for v2 publication/cache plus Snow/Cursor host
  parity, v2 detail/Wave-only inspection, and v1 native-activity regression.
- `npm pack --dry-run` — **PASS**: package `omp-flow@0.2.6`, 137 files, 182.8 kB packed and
  844.0 kB unpacked; no tarball was written.
- `git diff --check` — **PASS**, exit 0; only repository line-ending notices were emitted.
- `node bin/omp-flow.js help | Select-String 'flow-status publish'` — **PASS**; executable help
  displays `<claude|codex|oh-my-pi|snow|cursor>`.
- SHA-256 comparison over both Flow Status Skill copies and all four `omp-flow` Skill copies —
  **PASS**, with the hashes recorded above.
- `git status --short -- .omp-flow/scripts` and `git diff --quiet -- .omp-flow/scripts` — **PASS**;
  no live runtime change and quiet-diff exit 0.
- Read-only source audit of Claude, Codex, Oh My Pi, Snow, and Cursor adapter/session surfaces —
  **PASS**; the Skill matrix matches the concrete tracked evidence each Harness supplies, and
  Cursor remains the sole path requiring explicit `OMP_FLOW_HOST` injection.
