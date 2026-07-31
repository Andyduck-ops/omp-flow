---
type: "Interface"
title: "Flow Status snapshot v1"
---

# Flow Status snapshot v1

> Compatibility boundary (2026-07-31): this landed contract describes **native Harness
> activity**, not the selected root task Bundle or its authored Flow orientation. The compatible
> [v2 snapshot](flow-status-snapshot-v2.md) retains this object unchanged as `nativeActivity` and
> adds a separately explicit [root Flow publication](flow-status-publication-v2.md). Consumers
> must not relabel v1 task-set, role, or progress fields as root Task, Flow position, accepted
> Work, or initiative completion.

This is the closed read-only contract shared by the
[Harness-native Flow Status design](../design.md). It is a reconstructable presentation
projection, not workflow state, a task registry, a capability token, or durable history.

## Envelope

```ts
type Host = "claude" | "codex" | "oh-my-pi";

type FlowStatusSnapshotV1 = {
  version: 1;
  generatedAtUnixMs: number;
  maxAgeMs: number;
  scope: {
    repositoryRoot: string;
    host: Host;
    hostSessionId: string | null;
    taskSetId: string | null;
    taskSetRevision: string | null;
  };
  sources: SourceHealth[];
  taskSet: TaskSetState;
  currentTask: CurrentTask | null;
  attention: AttentionObservation[];
};

type TaskSetState =
  | {
      state: "available";
      capability: "claudeTaskListV1" | "ompTaskBatchV1";
      sourceId: string;
      membershipRevision: string;
      membershipDigest: string;
      total: number;
      completed: number;
      active: number;
      pending: number;
      failed: number;
    }
  | {
      state: "unavailable";
      capability: "claudeTaskListV1" | "ompTaskBatchV1";
      sourceId: string;
      reason: "unsupported" | "incomplete" | "stale" | "malformed" | "disconnected";
    };

type CurrentTask = {
  sourceId: string;
  taskId: string;
  label: string;
  membershipRevision: string;
  assignment: CurrentAssignment | null;
  progress: TaskProgress | null;
};

type CurrentAssignmentBase = {
  sourceId: string;
  assignmentId: string;
  actorId: string | null;
  operationReceipt: string | null;
  nativeTargetId: string | null;
  bindingRevision: string;
};

type CurrentAssignment = CurrentAssignmentBase &
  (
    | { role: "executor"; methodologyPosition: "Implement" }
    | { role: "reviewer"; methodologyPosition: "Review" }
    | { role: "researcher"; methodologyPosition: "Research" }
    | { role: "architect"; methodologyPosition: "Design" }
    | { role: "qbd-auditor"; methodologyPosition: "QbD" }
    | { role: "planner"; methodologyPosition: "Plan" }
    | { role: "explore"; methodologyPosition: null }
    | { role: "oracle"; methodologyPosition: null }
    | { role: "orchestrator"; methodologyPosition: null }
  );

type TaskProgress = {
  label: string;
  current: number;
  total: number;
  unit: string;
  unitSetRevision: string;
  sourceId: string;
  sourceRevision: string;
};

type SourceHealth = {
  sourceId: string;
  kind: "hostTaskSet" | "nativeAssignment" | "nativeProgress" | "portableRuntime";
  state: "connected" | "disconnected" | "unsupported" | "malformed";
  revision: string;
  observedAtUnixMs: number;
  maxAgeMs: number;
};

type AttentionObservation = {
  id: string;
  sourceId: string;
  sourceRevision: string;
  severity: "blocking" | "warning" | "info";
  kind: "userInput" | "approval" | "failure" | "disconnected" | "stale" | "unbound";
  reason: string;
  count: number;
  observedAtUnixMs: number;
  maxAgeMs: number;
};
```

Unknown top-level or nested fields are rejected. The serialized value is at most 65,536 UTF-8
bytes. `sources` has at most eight entries and `attention` at most sixteen. Identifiers, revisions,
paths, units, labels, roles, and reasons are length-bounded, reject control characters, and do not
contain raw secrets or prompt/transcript content.

Available counts are safe integers in `0..1_000_000`. `total > 0`, every component is at most
`total`, and:

```text
completed + active + pending + failed = total
```

Task progress requires `total > 0` and `0 <= current <= total`.

## Source and membership rules

Every `sourceId` is unique and every reference resolves to exactly one source with a matching
current revision. A connected source is fresh only while its observed time is within both its own
`maxAgeMs` and the snapshot's `maxAgeMs`. A timestamp more than two seconds in the future, negative
age, or wall-clock rollback yields `clock-uncertain` and removes current/progress authority.

The task-set source owns complete membership and terminal-task semantics through the closed
[source observation](flow-status-source-observation-v1.md). It creates a new
`taskSetRevision` and `membershipRevision` whenever members or their terminal states change.
For an available set, `taskSet.membershipRevision` must equal `scope.taskSetRevision`; the producer
validates current membership from the ephemeral complete member list, stores only its
`membershipDigest`, and discards the list.

`membershipDigest` is deterministic. The producer sorts members by the unsigned lexicographic
order of each `taskId`'s UTF-8 bytes, represents every member as the two-element JSON array
`[taskId,state]`, and serializes the enclosing array as UTF-8 JSON with no insignificant
whitespace. It then computes SHA-256 over those exact bytes and emits 64 lowercase hexadecimal
characters. Labels and `currentTaskId` do not enter this digest; their changes still require a new
membership revision under the source contract.

`currentTask` must be null when `taskSet.state` is unavailable. For an available set,
`currentTask.taskId` must have been an exact member of the source observation and its source and
membership revision must match the task set. The source owns its safe display label. The producer
does not derive the label from Markdown, paths, prompts, branches, or terminal output.

An available task set requires non-null `scope.taskSetId` and `scope.taskSetRevision` matching the
source observation. An unavailable task set requires both scope fields and `currentTask` to be
null while retaining source-attributed reason, health, and attention.

An assignment and progress measure must be bound to that exact current task, repository,
host/session, task-set revision, and current source revisions. Task-set replacement, current-task
change, assignment replacement, disconnect, sequence gap, replay, expiry, or binding mismatch
invalidates affected current facts.

When a current assignment exists, progress must carry the same non-null `assignmentId`; when no
assignment exists, progress must carry null at producer input. `unitSetRevision` is retained in
the snapshot. A unit addition, removal, replacement, reordering that changes unit identity, unit
change, or denominator change must create both a new `unitSetRevision` and a new
`sourceRevision`; otherwise the progress observation is malformed.

## Methodology labels

`methodologyPosition` is a display label for the explicit current assignment role. The producer
uses only the owning Harness's normalized position or this closed presentation mapping:

| Explicit role | Position |
|---|---|
| `executor` | Implement |
| `reviewer` | Review |
| `researcher` | Research |
| `architect` | Design |
| `qbd-auditor` | QbD |
| `planner` | Plan |
| `explore` | null |
| `oracle` | null |
| `orchestrator` | null |

The label does not assert a lifecycle phase, previous completion, next work, gate decision,
acceptance, or approval. The three neutral roles do not establish one unique methodology
position. An unknown role is malformed in v1; no label is guessed from authored Concepts, file
placement, operation age, or role order.

## Measure separation

Task-set counts describe the complete source-owned set. `progress` describes only the exact current
task's source-owned units. Mechanical receipts, context, cost, duration, tokens, Git, elapsed time,
and authored Markdown enter neither denominator.

Portable runtime data may validate repository/task/assignment/actor/receipt correlation. It does
not create membership, liveness, methodology position, progress, attention, review acceptance, or
human approval.

## Cache and display safety

The ignored presentation cache holds one latest snapshot for each of at most eight explicit
repository/host/session scopes, uses atomic replacement and least-recently-used eviction, and
deletes entries older than 24 hours. Reads never extend source freshness. The cache is safe to
delete and cannot authorize any action.

Adapters may render only validated normalized facts. They do not parse Markdown semantics, private
transcripts or todos, account or credential stores, Keychain, private usage APIs, arbitrary
commands, or network responses on the presentation hot path.

Fixtures cover closed-schema rejection, every bound and arithmetic invariant, deterministic
membership digest vectors, task-set membership replacement, current-task mismatch,
assignment/progress conditional binding, unit-set and source-revision replacement, every allowed
role-position pair, every forbidden cross-pair, unknown roles, attention ordering,
stale/future/rollback clocks, cache deletion, and proof that task counts and progress cannot be
manufactured from excluded sources.
