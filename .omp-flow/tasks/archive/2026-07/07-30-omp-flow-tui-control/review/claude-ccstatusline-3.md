---
type: "Review"
title: "Claude persisted-member final repair review"
---

# Claude persisted-member final repair review

Verdict: **ACCEPTED**

This independently final-reviews the
[Claude/ccstatusline work](../work/claude-ccstatusline.md), the prior
[authority repair review](claude-ccstatusline-2.md), and the linked
[final repair handoff](../work/handoffs/claude-ccstatusline-repair-2.md) against the approved
[source observation contract](../interfaces/flow-status-source-observation-v1.md) and accepted
[shared snapshot boundary](shared-snapshot-and-inspect-2.md).

## Findings

No blocking, high, medium, or low finding remains in the repaired Claude/ccstatusline work scope.

## Persisted-member finding closure

The observer-state decoder now rejects every member that is not a closed object containing exactly
bounded non-empty `taskId` and `label` strings plus one normalized state. It also rejects duplicate
IDs, non-object members, unsupported states, extra fields, and lists over the task bound.

Independent temporary-repository probes replaced a valid persisted baseline with four distinct
corrupt shapes. Every subsequent delta produced:

```text
empty-object 0 traceback=False state=unavailable reason=malformed current=None file=False
duplicate    0 traceback=False state=unavailable reason=malformed current=None file=False
non-object   0 traceback=False state=unavailable reason=malformed current=None file=False
extra        0 traceback=False state=unavailable reason=malformed current=None file=False
```

This proves the exact repository/session receives the closed `unavailable/malformed` observation,
no current task survives, the local observer baseline is deleted, the hook remains non-blocking,
and no traceback escapes. A second delta after revocation produced:

```text
FOLLOWUP 0 unavailable incomplete None False
```

It cannot bootstrap membership; only a new complete successful `TaskList` can restore authority.
The expanded tracked test additionally covers missing/empty IDs, bad state, non-string label, and
all the same deletion and publication conditions.

## Prior closure regression

- Stored-time expiry remains `unavailable/stale`, and a replayed tool-use result remains
  `unavailable/malformed`; neither refreshes membership authority.
- Exactly one active member is still required for `currentTask`; zero or multiple active members
  produce null.
- A known `deleted` update removes exactly that member. Unknown deletion fails closed, and deleting
  the last member cannot create an available empty set.
- Distribution trust remains accurately separated: pinned revision, reviewed patch digest,
  package identity, checks, and runtime capability are stable; each packed artifact carries only
  its own build-reported digest, with no byte-reproducibility claim.

The tracked patch SHA-256 remains
`e7dcebff8a6a1b8f124b026585affd0d83272758e0c0eeb7f69bf472c680d4f4`.
It still applies cleanly to the clean acquisition at
`83c8ffd551ec700fceeed98fe9ab50de84cb49fa`. The patch, manifest, build program, capability,
Powerline behavior, no-branding fixtures, and acquisition cache were unchanged by this repair, so
the prior independent clean-replay evidence remains valid.

## Verification

- Repair predecessor `dcc48a378ff74e54a13e342252e0d545` is completed by
  `executor-flowstatus-claude-repair2`, links the required final repair handoff, and differs from
  reviewer actor `reviewer-flowstatus-claude-final`.
- Independent real-hook malformed-state and post-revocation probes — PASS with the exact results
  above.
- `python -X utf8 tests/claude-flow-status.test.py` — PASS, including all corrupt-state cases and
  every prior baseline/delta/stale/replay/current/delete/invalidation regression.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm test` — PASS, 240 focused checks.
- `git apply --check` against the pinned clean ccstatusline acquisition — PASS.
- `git diff --check` — PASS; only existing Windows LF-to-CRLF warnings were emitted.

Reviewer actor: `reviewer-flowstatus-claude-final`

Review dispatch receipt: `00a759acd7ea45a099c7149c30e25023`

Repair predecessor: `dcc48a378ff74e54a13e342252e0d545`
