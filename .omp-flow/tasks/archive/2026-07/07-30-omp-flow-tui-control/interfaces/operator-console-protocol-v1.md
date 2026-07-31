---
type: "Interface"
title: "Operator console adapter protocol v1"
---

# Operator console adapter protocol v1

> Superseded on 2026-07-30 by the [status snapshot v1](statusline-snapshot-v1.md) and revised
> [status-line design](../design.md). It is not a current implementation contract.

This is the normative first-release stdio protocol required by the
[adapter overview](operator-console-adapter.md), [Design](../design.md), and
[PRD acceptance criterion 12](../prd.md). It defines ephemeral transport messages only. Nothing
here is persisted or interpreted as omp-flow semantic state. MUST and MUST NOT are binding.

## Framing and closed message union

- Transport is UTF-8 newline-delimited JSON over one local child process's stdin/stdout.
- A frame is one JSON object followed by `\n`; embedded raw newlines are invalid.
- Before handshake, the maximum frame is 65,536 bytes. `hello.request.maxMessageBytes` negotiates
  4,096 through 1,048,576 bytes; the smaller peer limit applies afterward.
- Protocol numbers are non-negative safe integers. Strings are non-empty unless stated otherwise.
  IDs are opaque strings of at most 256 Unicode scalar values.
- V1 is strict. An unknown kind or field, missing field, wrong type, duplicate object key,
  non-finite number, invalid UTF-8, or size violation invalidates the frame.
- An invalid pre-handshake frame closes the adapter. After handshake, the receiver sends
  `protocol.error` when possible and closes when `fatal` is true.

The closed v1 union is:

| Kind | Direction |
|---|---|
| `hello.request` | console → adapter |
| `hello.result` | adapter → console |
| `snapshot.request` | console → adapter |
| `snapshot.result` | adapter → console |
| `observation` | adapter → console |
| `action.request` | console → adapter |
| `action.ack` | adapter → console |
| `protocol.error` | either direction |

## Epoch, envelopes, and identifiers

The console creates a random UUID `epoch` and a random `nonce` with at least 128 bits for every
adapter process/connection. Reconnect always creates a new epoch. Every sequence, request ID,
scope generation, target ID, capability revision, and acknowledgement is scoped to one
`(epoch, adapterInstanceId)` and MUST NOT cross epochs.

After handshake, every console frame contains exactly the kind-specific fields plus:

```json
{"v":1,"kind":"...","epoch":"...","nonce":"...","adapterInstanceId":"...","requestId":"..."}
```

Every adapter frame contains exactly the kind-specific fields plus:

```json
{"v":1,"kind":"...","epoch":"...","nonce":"...","adapterInstanceId":"...","seq":1,"observedAt":"..."}
```

- `requestId` is a console-generated UUID unique in the epoch.
- `seq` begins at 1 after `hello.result` and increments by exactly one for every adapter frame.
- `observedAt` is RFC 3339 UTC for display and diagnosis only. It never grants freshness.
- Opaque identifiers are compared only for exact equality.

## Handshake and discovery scopes

The console sends exactly one:

```json
{"v":1,"kind":"hello.request","epoch":"e1","nonce":"n1","maxMessageBytes":262144}
```

The adapter replies before any other frame:

```json
{
  "v":1,
  "kind":"hello.result",
  "epoch":"e1",
  "nonce":"n1",
  "adapterInstanceId":"claude-local-1",
  "harness":{"name":"claude","version":"2.1.139"},
  "maxMessageBytes":262144,
  "schemaEvidence":["claude agents --json"],
  "scopes":[
    {"scopeId":"supervisor","authority":"authoritative","canGrantMutation":true},
    {"scopeId":"hooks","authority":"additive","canGrantMutation":false}
  ]
}
```

`harness.name` is `claude`, `codex`, or `omp`. `schemaEvidence` is a non-empty string array.
`authority` has exact semantics:

- `authoritative`: a complete snapshot replaces that scope and can remove absent targets;
- `additive`: observations can upsert targets, but absence never removes them.

Only a scope with `canGrantMutation: true` may carry mutation capabilities. Duplicate scope IDs,
duplicate live adapter instance IDs, mismatched epoch/nonce, or unsupported v1 fails handshake.
Handshake itself grants no target capability.

An adapter that combines official discovery, hooks, replay, or adapter-owned jobs MUST declare
separate scopes when their completeness or authority differs.

## Target, binding, and capability

A target has exactly:

```json
{
  "targetId":"thr_123",
  "mode":"live",
  "state":{"name":"active","reason":null,"processAlive":true},
  "providerObservedAt":"2026-07-30T12:00:00Z",
  "freshForMs":5000,
  "activity":{"summary":"running tests"},
  "binding":null,
  "capabilities":[]
}
```

- `mode` is `live`, `replay`, `snapshot`, or `heuristic`.
- `state.name` remains provider-native. `reason` is string or null; `processAlive` is boolean or
  null. These never become receipt or workflow state.
- `providerObservedAt` is RFC 3339 UTC or null and display-only.
- `freshForMs` is 250 through 300,000. At receipt the console records its own monotonic instant
  `receivedMono`. The target is fresh only while
  `consoleMonotonicNow < receivedMono + freshForMs`. No peer clock is compared.
- `activity` is null or exactly `{"summary": string}` with at most 2,048 Unicode scalar values.
- `binding` is null or exactly:

```json
{"task":"07-30-omp-flow-tui-control","receipt":"op","actorId":"actor","nativeTargetId":"thr_123","proofKind":"native-dispatch"}
```

The console verifies all binding fields against the current public runtime snapshot. Mismatch
means `unbound`; no cwd, title, prompt, time, filename, or terminal output may repair it.

A capability has exactly:

```json
{"verb":"nativeInterrupt","revision":"cap-7","authority":"codex turn/interrupt","validForMs":4000,"requiresConfirmation":true,"requiresBinding":true}
```

- `verb` is `preview`, `attach`, `focus`, `nativeInterrupt`, or `processStop`.
- `validForMs` is 250 through 60,000 and MUST NOT exceed target `freshForMs`.
- Its validity starts at the console receipt instant, never at a provider timestamp.
- `revision` is unique for `(epoch, scopeId, generation, targetId, verb)`.
- `replay`, `heuristic`, and `canGrantMutation: false` scopes MUST NOT advertise mutation verbs.

## Snapshot replacement

The console requests all or named advertised scopes:

```json
{"v":1,"kind":"snapshot.request","epoch":"e1","nonce":"n1","adapterInstanceId":"claude-local-1","requestId":"r1","scopeIds":[],"reason":"startup","lastAcceptedSeq":0}
```

`reason` is `startup`, `refresh`, `reconnect`, or `sequenceGap`. Empty `scopeIds` means all scopes.
The adapter returns:

```json
{
  "v":1,
  "kind":"snapshot.result",
  "epoch":"e1",
  "nonce":"n1",
  "adapterInstanceId":"claude-local-1",
  "seq":1,
  "observedAt":"2026-07-30T12:00:01Z",
  "requestId":"r1",
  "reconcilesAfterSeq":0,
  "snapshots":[{"scopeId":"supervisor","generation":"g42","completeness":"complete","targets":[]}]
}
```

- `requestId` names one outstanding same-epoch request.
- `reconcilesAfterSeq` equals that request's `lastAcceptedSeq`.
- `completeness` is `complete` or `partial`.
- An authoritative complete snapshot atomically replaces only its scope. Absent targets, binding
  proofs, and capabilities are removed in that scope.
- An authoritative partial or additive snapshot only upserts and never removes.
- Every accepted snapshot changes its scope generation. Old-generation capabilities are revoked
  before new targets install, even if revision strings repeat.
- Same-looking targets in different scopes remain separate sourced observations.

## Incremental observation

An observation contains:

```json
{
  "v":1,
  "kind":"observation",
  "epoch":"e1",
  "nonce":"n1",
  "adapterInstanceId":"claude-local-1",
  "seq":2,
  "observedAt":"2026-07-30T12:00:02Z",
  "scopeId":"supervisor",
  "generation":"g42",
  "operation":"upsert",
  "target":{"targetId":"job-1","mode":"snapshot","state":{"name":"working","reason":null,"processAlive":true},"providerObservedAt":null,"freshForMs":3000,"activity":null,"binding":null,"capabilities":[]},
  "removedTargetId":null
}
```

`operation` is `upsert` or `remove`. Upsert requires non-null `target` and null
`removedTargetId`; remove requires the reverse. Only an authoritative scope may remove.
Generation mismatch rejects the frame and triggers refresh. Upsert replaces the entire target and
capability list; it is not a patch, and receipt time restarts durations.

## Sequence gaps and reconciliation

If a frame's `seq` is not `lastAcceptedSeq + 1`, the console MUST:

1. stop applying that and later observation authority;
2. mark a visible gap and revoke every mutation capability from that adapter;
3. send one `snapshot.request` with `reason: "sequenceGap"` and the last contiguous sequence;
4. keep last values visible only as stale/gapped; and
5. reject actions until reconciliation.

A gap closes only when a `snapshot.result`:

- matches the outstanding reconciliation request and epoch;
- has the exact `reconcilesAfterSeq`; and
- includes a valid `complete` snapshot for every authoritative `canGrantMutation` scope.

The console may accept that correlated result despite skipped intervening sequence numbers, sets
`lastAcceptedSeq` to its `seq`, installs snapshots atomically, and resumes expecting `seq + 1`.
Partial results, ordinary refresh, timers, and later observations cannot close the gap.

Reconnect destroys the old epoch, marks old targets disconnected, and revokes all capabilities
and binding proofs. Controls return only after new handshake and startup snapshot.

## Capability invalidation

The console MUST revoke a capability immediately on:

- target or capability duration expiry using console monotonic time;
- disconnect, epoch change, gap, fatal protocol error, or adapter collision;
- scope generation replacement, target removal, or upsert omitting the capability;
- capability revision change;
- missing/mismatched required binding;
- mutation verb on replay, heuristic, or non-mutation scope; or
- mutation timeout, disconnect, or unknown outcome until reconciliation.

Revocation removes the input binding before the next input event. A stale render MUST NOT leave an
action callable.

## Action and acknowledgement

The console sends:

```json
{"v":1,"kind":"action.request","epoch":"e1","nonce":"n1","adapterInstanceId":"codex-local-1","requestId":"a1","scopeId":"threads","generation":"g9","targetId":"thr_123","verb":"nativeInterrupt","capabilityRevision":"cap-7","confirmation":"user confirmed interrupt"}
```

`confirmation` is string or null and is non-null exactly when required. Immediately before send,
the console revalidates epoch, gap state, freshness, generation, target, revision, mode, binding,
and confirmation. The adapter repeats checks against its native authority. Duplicate request IDs
are rejected; neither side retries mutation automatically.

An acknowledgement contains:

```json
{"v":1,"kind":"action.ack","epoch":"e1","nonce":"n1","adapterInstanceId":"codex-local-1","seq":8,"observedAt":"2026-07-30T12:00:04Z","requestId":"a1","nativeRequestId":"turn_456","phase":1,"outcome":"accepted","terminal":false,"error":null}
```

`outcome` is `accepted`, `rejected`, `completed`, `failed`, `timedOut`, `disconnected`, or
`unknownOutcome`. Phase starts at 1 and increments. Only `accepted` is non-terminal and uses
`terminal: false`; all others use `terminal: true`. Exactly one terminal acknowledgement is
allowed. Unknown request IDs, duplicate phases, or a second terminal acknowledgement are protocol
errors. No acknowledgement changes an omp-flow receipt or records human workflow approval.

## Protocol error

`protocol.error` adds exactly:

```json
{"code":"expiredCapability","message":"capability cap-7 expired","fatal":false,"relatedRequestId":"a1"}
```

`code` is `invalidFrame`, `versionMismatch`, `identityMismatch`, `sequenceGap`, `unknownScope`,
`generationMismatch`, `unknownTarget`, `expiredCapability`, `bindingMismatch`,
`duplicateRequest`, `unknownRequest`, `unsupportedAction`, or `internalAdapterError`.
`relatedRequestId` is string or null. Fatal framing, identity, or version errors close the
connection. Mutation errors reject that action and force refresh when authority is uncertain.

## Executable positive and negative fixtures

Shared contract tests for every provider adapter MUST include:

| Fixture | Expected result |
|---|---|
| Valid hello → complete snapshot → fresh capability → action → accepted/completed | One correlated action; no receipt mutation |
| Same-cwd target missing a required binding | Reject `bindingMismatch` |
| `validForMs` elapsed on console monotonic clock | Remove key binding; send no action |
| Provider wall clock one hour ahead or behind | Display changes; freshness does not |
| Sequence 7 after accepted 5 | Do not apply; revoke mutations; request reconciliation |
| Partial reconciliation or one missing mutation scope | Keep gap and controls disabled |
| Matching complete reconciliation for all mutation scopes | Atomic replacement; new capabilities may enable |
| Old-epoch observation after reconnect | Reject without restoring state |
| Complete scope omits former target | Remove only in that scope and revoke its capabilities |
| Additive, replay, or heuristic target advertises mutation | Invalid frame; install nothing |
| Unknown field/kind, unknown acknowledgement ID, or duplicate phase | Protocol error; no crash or mutation |
| Oversized, invalid UTF-8, or duplicate-key frame | Close safely and restore terminal mode |

Claude- and Codex-specific fixtures MAY add native cases but MUST NOT weaken these rejection rules.
