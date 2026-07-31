---
type: "Interface"
title: "Operator console adapter contract"
---

# Operator console adapter contract

> Superseded on 2026-07-30 by the [status snapshot v1](statusline-snapshot-v1.md) and revised
> [status-line design](../design.md). Retained only as operator-console design history.

This is the in-process/stdio boundary between the shared console and a thin Harness adapter. It is
linked from the [Design](../design.md). The objects are ephemeral messages, not a persisted schema,
workflow state, or universal normalization of provider semantics.

The [adapter protocol v1](operator-console-protocol-v1.md) is normative for message syntax,
direction, identifier scope, freshness, snapshot replacement, reconciliation, capability
invalidation, and action acknowledgement. If this descriptive overview conflicts with that
protocol, protocol v1 wins.

## Session and transport

Each adapter instance is started or connected through local child-process stdio for the first
release. Messages are newline-delimited JSON in UTF-8. Both sides begin with `hello`:

- console: contract version and a random connection nonce;
- adapter: contract version, adapter instance ID, Harness and installed version, supported
  observation modes, current capabilities, and provider schema/version evidence.

A version mismatch or invalid `hello` closes only that adapter connection. Protocol v1 is strict:
unknown fields or message kinds, missing required fields, duplicate instance IDs, invalid UTF-8,
and messages above the negotiated size limit fail the connection visibly. There is no
compatibility reader for retired contract versions.

Every post-handshake message carries the connection nonce, adapter instance ID, monotonically
increasing connection-local sequence, and `observedAt`. A sequence gap marks the projection
incomplete and triggers snapshot reconciliation. Sequence numbers are not durable event IDs.

## Snapshot and observation

A snapshot contains zero or more native targets plus the adapter's connectivity and freshness
policy. A target observation contains:

- Harness and opaque native target identity;
- provider-native state and reason without semantic reinterpretation;
- mode: `live`, `replay`, `snapshot`, or `heuristic`;
- `observedAt`, optional provider timestamp, and freshness deadline;
- exact verified actor/binding claim when available;
- measured activity such as current item, plan, diff, waiting request, or process liveness;
- current target-scoped capabilities, each with an expiry or snapshot revision; and
- optional preview/attach locator that remains owned by the adapter.

The console derives display-only `fresh` or `stale` from a supplied duration measured from receipt
with the console's monotonic clock. Provider wall time is display-only. It never upgrades
`heuristic`, `replay`, or `snapshot` to `live`. A complete authoritative snapshot replaces only its
declared scope; additive or partial scopes never remove targets. No snapshot mutates a receipt or
another adapter's target.

## Binding proof

A binding claim names the omp-flow task path, opaque operation receipt, actor ID, native target ID,
and adapter-specific proof kind. The adapter emits it only when that mapping was established by a
native dispatch or identity channel it owns. The console verifies all named receipt fields against
the current portable snapshot. Any mismatch, changed native ID, missing receipt, or adapter
reconnect without renewed proof produces `unbound`; the console cannot repair it.

## Capabilities

Capabilities are exact verbs, not implications:

- `preview`
- `attach`
- `focus`
- `nativeInterrupt`
- `processStop`

Each capability is target-scoped and names its native authority, constraints, duration,
scope-generation/revision, and whether confirmation or an exact binding is required.
`nativeInterrupt` and `processStop` are never substitutable. Reconnect, sequence gap, target
replacement/removal, stale target, binding mismatch, generation change, or capability expiry
revokes mutation authority immediately. Read capability does not imply control capability.
Approval and steering verbs are outside the first contract.

## Action request and acknowledgement

An action request contains a console-generated request ID, adapter instance, exact native target,
capability verb, capability revision, and confirmation evidence when required. The adapter shall
reject a target mismatch, expired/revoked capability, duplicate request ID, lost native request,
or unsupported verb without best-effort guessing.

An acknowledgement retains request ID, provider, native target/request ID, action, outcome,
acknowledgement time, and optional error. Outcomes are:

- `accepted`: the native authority accepted the request, not proof of completion;
- `rejected`: the native authority refused it;
- `completed`: native completion was explicitly observed;
- `failed`: native execution returned a terminal error;
- `timedOut`: no acknowledgement arrived before the adapter deadline;
- `disconnected`: the connection ended before acknowledgement; and
- `unknownOutcome`: submission may have occurred but cannot be reconciled.

The console never retries a mutating request automatically. After timeout, disconnect, or unknown
outcome, it disables further control until an authoritative snapshot is reconciled. Acknowledgement
records remain only in the bounded screen-local timeline and are not workflow approval evidence.

## Provider mappings

- Claude: official agent-view commands/snapshots are preferred for discoverable supervised
  sessions; hooks may add observation-only targets. `stop` maps to `processStop` unless the probed
  native surface documents exact interrupt semantics. Logs/attach map only when the command exists
  in the probed version.
- Codex: a subscribed app-server thread/turn maps typed live observations and correlated
  `turn/interrupt` to `nativeInterrupt`. `thread/read` is `replay`. Adapter-owned `exec --json`
  runs are structured observations but do not gain interactive capabilities not present in that
  mode.
- PTY/tmux: captured output is `heuristic`; attach/preview may be advertised, but guessed input,
  approval, and native interrupt are forbidden.
