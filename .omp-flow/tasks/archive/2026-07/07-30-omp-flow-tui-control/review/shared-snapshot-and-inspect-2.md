---
type: "Review"
title: "Shared Flow Status snapshot and inspect repair review"
---

# Shared Flow Status snapshot and inspect repair review

Verdict: **ACCEPTED**

This independently re-reviews the
[shared snapshot and inspect work](../work/shared-snapshot-and-inspect.md), the prior
[CHANGES_REQUESTED review](shared-snapshot-and-inspect.md), and the linked
[repair handoff](../work/handoffs/shared-snapshot-and-inspect-repair.md) against the approved
[snapshot](../interfaces/flow-status-snapshot-v1.md),
[source observation](../interfaces/flow-status-source-observation-v1.md), and
[detail surface](../interfaces/flow-status-detail-surface.md) contracts.

## Findings

No blocking, high, medium, or low finding remains in the repaired shared-work scope.

## Prior finding closure

### Public observation/write boundary — closed

The stable runtime now exposes:

```text
omp-flow status observe --host <claude|codex|oh-my-pi> --session <id>
```

It reads one UTF-8 JSON object from stdin with a hard 256 KiB input cap. The closed v1 envelope
contains `taskSet`, optional `assignment`, optional `progress`, and bounded `attention`; unknown
fields fail closed. `observe_and_cache()` delegates to the single shared `build_snapshot()`
validator, verifies the explicit host/session and repository scope, and uses the existing confined
atomic cache writer. It returns a bounded structured result and does not accept command-line JSON
or use shell interpolation.

The installed-template tests exercise a Claude caller and a TypeScript Oh My Pi caller through the
real process boundary. The TypeScript caller supplies only the documented observation over stdin;
it neither duplicates snapshot/cache validation nor implements a second cache format.

### Closed cached-snapshot discrimination — closed

`validate_snapshot()` now applies the exact host/capability discriminator on both available and
unavailable task-set unions. An available set requires a connected `hostTaskSet` source and exact
membership/source/scope revision binding. Unavailable reasons require the corresponding
source-state mapping. Assignment and progress references likewise require connected sources of
the correct kind and revision.

The previous mutation probes now report:

```text
cross-host:REJECTED
available-unsupported:REJECTED
```

Focused tests also reject wrong source kind/revision and inconsistent unavailable-source state.

### Exact or unambiguous inspection scope — closed

`status inspect` accepts explicit `--host` and `--session` filters, with the documented environment
variables as fallback. The cache reader no longer selects the newest matching entry: zero matches
return `scope-mismatch`, more than one returns `ambiguous`, and exactly one validated scope is
required for success.

Tests cover multiple Claude sessions and a Codex request in a repository containing a newer
Claude entry. The managed Codex Skill now always supplies `--host codex`, adds the session when the
Harness provides one, and explicitly forbids fallback to another Harness.

### Versioned JSON failures — closed

`status inspect --json` and `status observe` convert bounded Flow Status errors into the closed v1
unavailable envelope on stdout while preserving exit status 2. A direct no-cache probe returned:

```json
{
  "version": 1,
  "state": "unavailable",
  "freshness": "unknown",
  "reason": "missing",
  "snapshot": null,
  "error": {
    "code": "missing",
    "message": "Flow Status is unavailable: no cached snapshot"
  }
}
```

The error message is capped at 512 characters. Tests cover missing, corrupt, scope-mismatch,
unsupported, stale, malformed, disconnected, malformed stdin, and observation/session mismatch
responses.

## Verification

- Repair predecessor `3639cbd2318b40f5a198e3bbe8fba2a6` is completed by
  `executor-flowstatus-core-repair`, links the required repair handoff, and differs from reviewer
  actor `reviewer-flowstatus-core-repair`.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS, including `PASS: flow-status Python contract checks` and
  `PASS: 216 focused checks`.
- Manual `status inspect --host codex --json` with no cache — versioned `missing` JSON on stdout,
  exit 2.
- Manual forged-cache probes — cross-host capability and available/unsupported-source combinations
  both rejected.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.
- The live deployed `.omp-flow/scripts/` runtime remains unmodified, and the unrelated
  user-modified `templates/.omp-flow/scripts/common/disposition.py` remains outside this work.

Reviewer actor: `reviewer-flowstatus-core-repair`

Review dispatch receipt: `a6be1da7fc854a2295c073a2d5d7f309`

Repair predecessor: `3639cbd2318b40f5a198e3bbe8fba2a6`
