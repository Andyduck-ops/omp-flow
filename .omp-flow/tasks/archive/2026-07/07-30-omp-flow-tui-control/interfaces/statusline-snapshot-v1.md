---
type: "Interface"
title: "Status-line snapshot v1"
---

# Status-line snapshot v1

This is the closed, read-only input to the [status-line renderer](../design.md). It is a
reconstructable presentation snapshot, not workflow state, a capability token, or durable history.

## Framing and global limits

- Encoding is UTF-8 JSON. Maximum serialized snapshot size is 65,536 bytes.
- `version` must equal `1`; unknown top-level or nested fields are rejected.
- Arrays are bounded: `progress <= 4`, `activity <= 16`, `attention <= 16`, `sources <= 8`.
- Identifiers and normalized paths are 1–512 UTF-8 bytes. Display labels/reasons are 1–256 UTF-8
  bytes with control characters removed.
- Counts are integers from `0` through `1_000_000`; attention detail counts are `1` through `999`.
- Timestamps are Unix milliseconds. `maxAgeMs` is `1_000` through `30_000`.
- A timestamp more than 2,000 ms in the future, a negative computed age, or a wall-clock rollback
  observed within one renderer invocation yields `clockUncertain`.

The separate Claude host stdin is capped at 262,144 bytes. Rendered output is at most two lines and
4,096 UTF-8 bytes.

## Closed envelope

```ts
type Host = "claude" | "codex" | "omp";

type StatusSnapshotV1 = {
  version: 1;
  generatedAtUnixMs: number;
  maxAgeMs: number;
  renderScope: RenderScope;
  task: null | { id: string };
  operations: { completed: number; active: number; failed: number };
  progress: ProgressMeasure[];
  activity: ActivityObservation[];
  attention: AttentionObservation[];
  sources: SourceHealth[];
};

type RenderScope = {
  repositoryRoot: string;
  host: Host;
  hostSessionId: string | null;
  nativeScope: NativeScope | null;
  selectedTaskId: string | null;
  receiptSetDigest: string;
};

type NativeScope = {
  kind: "codexTurn";
  threadId: string;
  turnId: string;
};
```

`repositoryRoot` is the path-confined canonical root resolved by the current invocation.
`selectedTaskId` and `receiptSetDigest` are derived from one public Python CLI snapshot; the digest
is mechanical correlation over that structured response, not task meaning. `task` is null exactly
when `selectedTaskId` is null; otherwise `task.id` must equal `selectedTaskId`.

`nativeScope` is supplied by the current live host adapter, not recovered from a cached plan. It is
non-null only when Codex establishes the exact current thread and turn. Missing or uncertain
current-turn identity sets it to null and makes every `codexPlan` ineligible. A cached snapshot is
eligible only when its repository, host, host session when supplied, native scope, selected task,
and receipt digest equal the current invocation.

## Source health

```ts
type SourceKind =
  | "claudeHostInput"
  | "codexAppServer"
  | "portableRuntime"
  | "git";

type SourceState =
  | "connected"
  | "disconnected"
  | "unsupported"
  | "malformed";

type SourceHealth = {
  sourceId: string;
  kind: SourceKind;
  state: SourceState;
  repositoryRoot: string;
  host: Host;
  hostSessionId: string | null;
  nativeScope: NativeScope | null;
  connectionEpoch: string;
  revision: string;
  observedAtUnixMs: number;
  maxAgeMs: number;
};
```

Within a snapshot, `sourceId` is unique. The assembler accepts a source only from its configured
producer and exact repository/host/session/native scope. The latest successful producer handshake creates
`connectionEpoch`; monotonically advancing provider events create `revision`. A reconnect creates a
new epoch. The renderer derives `fresh`, `stale`, or `clockUncertain` from state and time. Only
`connected` plus a valid age is fresh.

A connected `codexAppServer` source that supplies plan progress must carry a non-null
`nativeScope`. Its thread and turn must equal `renderScope.nativeScope`; a session ID alone is not
sufficient because one session can contain multiple turns.

## Progress measures

```ts
type ProgressMeasure =
  | {
      kind: "codexPlan";
      label: "plan";
      current: number;
      total: number;
      unit: "items";
      sourceId: string;
      connectionEpoch: string;
      sourceRevision: string;
      threadId: string;
      turnId: string;
      observedAtUnixMs: number;
      maxAgeMs: number;
      binding: {
        taskId: string;
        operationReceipt: string;
        actorId: string;
      };
    }
  | {
      kind: "contextBudget";
      label: "ctx";
      current: number;
      total: 100;
      unit: "percent";
      sourceId: string;
      connectionEpoch: string;
      sourceRevision: string;
      observedAtUnixMs: number;
      maxAgeMs: number;
    };
```

For every measure, `0 <= current <= total` and `total > 0`. Its source record must have the same
`sourceId`, epoch, revision, repository, host, and session scope and must be fresh.

`codexPlan` is accepted only from a live `codexAppServer` source bound to the current Codex
thread/turn. Its `threadId` and `turnId` must exactly equal both `renderScope.nativeScope` and the
referenced source's `nativeScope`; all three scopes must be `codexTurn`. One
`turn/plan/updated` replaces the complete current plan: `total` is the number of items in that
event and `current` is the number carrying the installed schema's provider-completed status.

Its binding is mandatory for omp-flow-zone eligibility. `taskId` must equal both
`renderScope.selectedTaskId` and `task.id`; `operationReceipt` and `actorId` must exactly match one
current public runtime receipt binding in the snapshot's `receiptSetDigest`. A missing, wrong,
stale, or replaced binding makes the plan ineligible rather than displaying an unbound plan beside
a Bundle label. An empty plan, missing current native scope, unknown item status, replay, partial
event, sequence gap, new plan update, turn termination, thread/turn mismatch, disconnect, epoch
change, receipt-set replacement, or expiry invalidates the prior measure.

`contextBudget.current` is the normalized whole percentage of the context window **used**, not
remaining. `0` means empty and `100` means full; graphical fill grows from left to right as use
increases. The host adapter uses `used_percentage` when valid; if only
`remaining_percentage` is supplied it computes `100 - remaining_percentage`. If both are supplied
they must sum to `100 ± 1` before rounding or the measure is malformed. The adapter clamps only
floating-point noise within `0.001`, rounds half upward to the nearest integer, and otherwise
rejects out-of-range data. It is always rendered as `ctx`, never work completion. There is no
first-release Claude work bar and operation receipt counts never enter this union.

## Activity and binding

```ts
type ActivityState =
  | "working"
  | "waiting"
  | "idle"
  | "completed"
  | "failed"
  | "interrupted"
  | "unknown";

type ReceiptBinding = {
  taskId: string;
  operationReceipt: string;
  actorId: string;
};

type ActivityObservation = {
  sourceId: string;
  connectionEpoch: string;
  sourceRevision: string;
  nativeTargetId: string;
  state: ActivityState;
  label: string;
  observedAtUnixMs: number;
  maxAgeMs: number;
  binding: ReceiptBinding | null;
};
```

A non-null binding must exactly match the current public receipt snapshot and selected task.
Otherwise the assembler replaces it with `null` and the renderer labels the activity `unbound`.
Activity never changes a receipt state.

## Attention

```ts
type AttentionSeverity = "blocking" | "warning" | "info";
type AttentionKind =
  | "approval"
  | "userInput"
  | "nativeFailure"
  | "disconnected"
  | "stale"
  | "unbound"
  | "unknownOutcome";

type AttentionObservation = {
  id: string;
  sourceId: string;
  connectionEpoch: string;
  sourceRevision: string;
  severity: AttentionSeverity;
  kind: AttentionKind;
  reason: string;
  nativeTargetId: string | null;
  count: number;
  observedAtUnixMs: number;
  maxAgeMs: number;
};
```

The source/epoch/revision must resolve to exactly one source record. Ordering is severity
`blocking`, `warning`, `info`, then newest observation, then opaque `id`. The renderer shows at
most one reason inline and uses `+N` for hidden detail. A stale/disconnected source may create a
derived degradation marker but cannot preserve an old approval or progress claim.

## Cache and action safety

- A producer writes atomically. Partial, oversized, duplicate-ID, wrong-version, unknown-field,
  scope-mismatched, or bound-violation input fails closed.
- Fixtures cover wrong/missing thread and turn, reused host sessions, native-scope changes,
  `task.id`/`selectedTaskId` mismatch, correct turn with wrong/missing task/receipt/actor binding,
  receipt-set replacement, used-only and remaining-only context, inconsistent paired percentages,
  rounding boundaries, and fill direction.
- Cache capacity is one latest 65,536-byte snapshot for each of at most eight explicit
  repository/session scopes. Least-recently-used entries are evicted; entries older than 24 hours
  are deleted. Cache reads never refresh observation age.
- The renderer completes within 500 ms, with no network or private-store reads. It may emit the
  safest already-built prefix or nothing on deadline.
- Snapshot data is display-only. `omp-flow status inspect`, whether reached directly or through the
  installed Skill, must re-query the owning live adapter before preview, attach/focus, native
  interrupt, or process stop. It must not mutate an omp-flow receipt as a proxy.
- Display truncation never changes source, denominator, unit, or status meaning.
