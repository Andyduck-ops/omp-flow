---
type: "Interface"
title: "Flow Status source observation v1"
---

# Flow Status source observation v1

> Compatibility boundary (2026-07-31): these observations remain authoritative only for native
> Harness activity. They do not identify the selected root Bundle and cannot be translated into
> authored Flow position, audit attempt, review round, accepted Work, or phase progress. Those
> facts require the explicit
> [Root Flow Publication v2](flow-status-publication-v2.md); absence must degrade rather than
> trigger inference.

This is the closed producer-input boundary for
[Flow Status snapshot v1](flow-status-snapshot-v1.md). Harness adapters translate documented
native facts into this bounded observation; the producer validates it and stores only the
aggregate presentation snapshot. The observation is ephemeral and is not a duplicate durable task
registry. Provenance remains in
[pinned capability fixtures](../reference/native-capability-fixtures.md); executable payloads
live at the archive-stable repository path `tests/fixtures/flow-status/`.

## Task-set union

```ts
type TaskSetCapability =
  | "claudeTaskListV1"
  | "ompTaskBatchV1";

type PositiveCapabilityEvidence =
  | {
      capability: "claudeTaskListV1";
      claudeCodeVersion: string;
      sessionStartKind: "startup" | "resume" | "clear" | "compact" | "fork";
      adapterSequence: number;
      confirmedByToolUseId: string;
    }
  | {
      capability: "ompTaskBatchV1";
      piVersion: string;
      upstreamRevision: string;
      toolCallId: string;
      adapterSequence: number;
    };

type TaskSetObservation =
  | {
      state: "available";
      evidence: PositiveCapabilityEvidence;
      sourceId: string;
      repositoryRoot: string;
      hostSessionId: string;
      taskSetId: string;
      membershipRevision: string;
      completeness: "complete";
      observedAtUnixMs: number;
      maxAgeMs: number;
      members: Array<{
        taskId: string;
        label: string;
        state: "completed" | "active" | "pending" | "failed";
        owner: string | null;
      }>;
      currentTaskId: string | null;
    }
  | {
      state: "unavailable";
      capability: TaskSetCapability;
      sourceId: string;
      repositoryRoot: string;
      hostSessionId: string;
      reason: "unsupported" | "incomplete" | "stale" | "malformed" | "disconnected";
      observedAtUnixMs: number;
      maxAgeMs: number;
    };
```

An available observation contains 1–128 unique members. The adapter must obtain the entire current
native set in one revision; partial pages, event gaps, replay, unknown member states, or a missing
completion signal produce `state: "unavailable"` with no counts.

The producer validates `currentTaskId` against `members`, computes counts, and derives
`membershipDigest` by sorting members by unsigned lexicographic UTF-8 bytes of `taskId`,
serializing the exact pairs as a JSON array of `[taskId,state]` arrays with no insignificant
whitespace, encoding that JSON as UTF-8, and computing SHA-256. The output is exactly 64 lowercase
hexadecimal characters. Labels, owners, and `currentTaskId` are excluded from the digest, although
their changes still create a new `membershipRevision`. The producer does not persist `members`;
the Claude adapter may retain only the current member's bounded owner long enough to validate a
same-revision assignment. A task addition, removal, replacement, state change, owner change,
current-task change, or native revision change invalidates the previous projection. Non-Claude
capabilities set `owner: null` unless their reviewed contract defines an equivalent exact native
identity.

Capability meanings are versioned and positive evidence is discriminated with the capability, so
fields from one Harness cannot validate another:

- `claudeTaskListV1` requires Claude Code 2.1.142 or later and the documented structured task-tool
  schemas. A successful synchronous `PostToolUse` observation for `TaskList` supplies the complete
  current `tool_response.tasks` array: `id` becomes `taskId`, `subject` becomes `label`,
  `pending`, `in_progress`, and `completed` map to pending, active, and completed, and failed is
  zero. Optional `owner` becomes the bounded member owner or null; it is not a role. No startup
  assumption establishes completeness: availability begins only after that
  successful full-list result. Successful correlated `PostToolUse` results for `TaskCreate` and
  `TaskUpdate` may then maintain the baseline until an observed replay, malformed/conflicting
  payload, resume/compact/fork, or expiry makes it unavailable. A local `adapterSequence` orders
  accepted writes but cannot prove a native Hook invocation was skipped; an unobserved loss is
  bounded only by `maxAgeMs`.
  `TaskUpdate(status: "deleted")` removes the member. An owner update creates a new membership
  revision even when task states do not change. Pre-action `TaskCreated` and `TaskCompleted`
  events do not establish terminal state because another hook can still block the action. After
  resume, compact, or fork, availability requires a new successful `TaskList`.
  `confirmedByToolUseId` is the last successful mutation or full-list tool use and
  `adapterSequence` increases by one for each accepted event. Exactly one `in_progress` member is
  current; zero or multiple in-progress members make `currentTaskId` null. Status-line stdin and
  subagent start/stop events alone do not satisfy this task-set capability.
- `ompTaskBatchV1` is pinned to `@oh-my-pi/pi-coding-agent` 17.2.1 at upstream revision
  `7a2ced50bea8b97dbab7d9bd579329c4ea704de0`. Its `tool_execution_start` event supplies
  `toolName`, `toolCallId`, and the complete executed task arguments. Its
  `tool_execution_update.partialResult.details` and final
  `tool_execution_end.result.details` carry `TaskToolDetails.progress[]`, a full input-indexed
  snapshot for that call. Availability requires one explicitly selected `task` call, progress
  length equal to submitted member count, and unique exact indexes `0..n-1`. Stable native
  allocated ID becomes `taskId`; task/assignment text is the label; `owner` is null; `pending`,
  `running`, and `completed` map to pending, active, and completed; `failed` and `aborted` map to
  failed and emit attention. Exactly one running member is current; zero or multiple running members make
  `currentTaskId` null. Each accepted full progress snapshot replaces the complete state and
  increments `adapterSequence`. Scope is the exact repository, session, and `toolCallId`;
  concurrent unselected task calls are never merged. A version/revision mismatch, partial
  progress array, invalid or duplicate index/ID, observed lifecycle contradiction, task-call
  replacement, disconnect, or session change makes the source unavailable. The unchanged strict dispatch descriptors may
  validate assignment binding; opaque operation receipts provide only mechanical correlation and
  cannot add members or manufacture states.

If an installed Harness/version cannot prove those requirements, the capability is unsupported;
the adapter must not substitute runtime receipt history or authored work files.

Codex app-server `turn/plan/updated` remains evidenced future/programmatic research, but it is not
a v1 `TaskSetCapability`. Adding it requires a later interface version with exact
connection/thread/turn fixtures and a newly accepted design.

## Assignment and progress

```ts
type AssignmentObservation = {
  sourceId: string;
  capability: "nativeAssignmentV1";
  repositoryRoot: string;
  hostSessionId: string;
  taskSetId: string;
  membershipRevision: string;
  taskId: string;
  assignmentId: string;
  nativeRole:
    | "executor"
    | "reviewer"
    | "researcher"
    | "architect"
    | "qbd-auditor"
    | "planner"
    | "explore"
    | "oracle"
    | "orchestrator";
  actorId: string | null;
  operationReceipt: string | null;
  nativeTargetId: string | null;
  bindingRevision: string;
  observedAtUnixMs: number;
  maxAgeMs: number;
};

type ProgressObservation = {
  sourceId: string;
  capability: "nativeTaskProgressV1";
  repositoryRoot: string;
  hostSessionId: string;
  taskSetId: string;
  membershipRevision: string;
  taskId: string;
  assignmentId: string | null;
  label: string;
  unit: string;
  current: number;
  total: number;
  unitSetRevision: string;
  sourceRevision: string;
  observedAtUnixMs: number;
  maxAgeMs: number;
};
```

### Claude assignment production

`claudeManagedAgentV1` is the only positive Claude assignment producer in v1. A `TaskList.owner`
value and a `SubagentStart.agent_id` value are independent native observations; equality between
them is not assumed. Positive assignment requires this explicit handshake:

1. an available `claudeTaskListV1` observation with exactly one current member;
2. one live structured `SubagentStart` with the same repository and `session_id`, plus an exact
   `agent_type` in the closed table below;
3. the identity hook creates one short-lived, single-use pending binding containing the canonical
   repository, session, task-set and membership revisions, exact task ID, `agent_id`, exact
   `agent_type`, a random nonce, issue time, and expiry;
4. that hook returns the complete pending binding to the managed agent as structured
   `additionalContext.flowStatusBindingRequestV1`; it does not alter or reconstruct the native
   assignment;
5. the same agent's first successful `TaskUpdate` for the exact task sets `owner = agent_id` and
   repeats this closed metadata member:

```ts
type ClaudeFlowStatusBindingMetadataV1 = {
  flowStatusBindingV1: {
    version: 1;
    taskSetRevision: string;
    agentId: string;
    agentType: string;
    nonce: string;
  };
};
```

Before native execution, the installed synchronous `PreToolUse(TaskUpdate)` guard must authorize
that bind call. For an exact managed `agent_type`, it validates common `agent_id`, `tool_use_id`,
canonical repository/session, the complete pending binding and revisions, and the complete input.
The only bind top-level keys are `taskId`, `owner`, and `metadata`; metadata's only key is
`flowStatusBindingV1`. It atomically reserves that exact intent under `tool_use_id`, then returns
the documented `PreToolUse` `permissionDecision: "allow"`.

The guard returns `permissionDecision: "deny"` before side effects for every missing, expired,
replayed, concurrent, or mismatched record; foreign task/owner; extra input or metadata key;
status, deletion, dependency, subject, description, or unrelated native mutation. Internal parse,
path, state, lock, I/O, or serialization failure is also denial; if a JSON denial cannot be
emitted, the command exits 2. Exit 0 without a decision and exit 1 are invalid managed-call
results.

Setup does not claim to create or force a native `TaskUpdate`. It may expose `TaskUpdate` to the
five managed definitions after pinned official Hook-contract provenance, deterministic direct
guard conformance, exact installed executable/matcher/digest verification, and guard-first atomic
commit/rollback all pass. Doctor reports configuration, conformance, and controlled authenticated
native E2E evidence independently; direct fixtures never set `nativeE2E = proven`. A native E2E
claim requires a separately controlled authenticated model session that observes the real
PreToolUse/native mutation boundary. Its absence is `unproven`, not setup failure and not positive
E2E evidence.

6. a structured same-agent `PostToolUse` with the same pre-authorized `tool_use_id` must prove
   `TaskUpdate` succeeded for the exact task and
   that both `owner` and `metadata` were accepted. Only then does the adapter consume the nonce,
   replace the task-set membership revision with the newly observed owner state, and emit the
   assignment.

| Exact structured `agent_type` | `nativeRole` |
|---|---|
| `omp-flow-architect` | `architect` |
| `omp-flow-check` | `reviewer` |
| `omp-flow-implement` | `executor` |
| `omp-flow-qbd` | `qbd-auditor` |
| `omp-flow-research` | `researcher` |

The adapter emits:

- `assignmentId = "claude-agent:" + agent_id`;
- `nativeTargetId = agent_id`;
- `actorId = agent_id`;
- `operationReceipt = null`; and
- a `bindingRevision` over the post-update membership revision, exact binding metadata, and
  adapter sequence.

The adapter table is compiled code. It is not populated by enumerating filenames or reading agent
frontmatter. The five managed agent definitions in that table must expose native `TaskUpdate`, but
may use it only for the exact binding and progress publications defined here; they do not gain
Agent dispatch or authority to change another task or task status. An unavailable tool, unknown,
built-in, or plugin-renamed `agent_type`, malformed response, task/revision mismatch, replayed or
expired nonce, competing candidate, binding conflict, owner change, `SubagentStop`, or session
invalidation produces no assignment observation. A consumed or rejected nonce is never retried.
Prompt text, the strict dispatch descriptor, transcript, Bundle placement, Markdown, Git, and
operation history are not fallback assignment sources.

### Claude task-local progress production

The exactly bound current agent may explicitly publish progress by successfully updating the
exact current task. Every update repeats the immutable `flowStatusBindingV1` member above and adds
this closed metadata member:

```ts
type ClaudeFlowStatusProgressMetadataV1 = {
  flowStatusProgressV1: {
    version: 1;
    label: string;
    unit: string;
    current: number;
    total: number;
    unitSetRevision: string;
    sourceRevision: string;
  };
};
```

The positive input is a structured `PostToolUse` for `TaskUpdate` whose common hook input carries
the bound `agent_id`, whose `tool_input.taskId` equals the current task, whose
`tool_response.success` is true, and whose `updatedFields` proves metadata was accepted. The
binding object must exactly equal the current consumed binding. The adapter rejects owner or
status mutation after binding, extra metadata members or controls, empty revisions,
`total <= 0`, and values outside `0 <= current <= total`, then emits `ProgressObservation` bound to
the Claude assignment ID. A managed agent authors between 1 and 32 stable work units for its
bounded objective and advances only its own exact task.

Every progress call first passes the same `PreToolUse` guard. Its complete top-level key set is
exactly `taskId` and `metadata`; metadata is exactly the immutable accepted
`flowStatusBindingV1` plus `flowStatusProgressV1`. The first progress transition permits integer
`total` from 1 through 32 and integer `0 <= current <= total`. Within one consumed binding,
`label`, `unit`, `total`, and `unitSetRevision` remain byte-equal, `current` strictly increases
without exceeding `total`, and `sourceRevision` is fresh. The guard atomically reserves the
normalized next transition under `tool_use_id`. A unit-set/label/unit/denominator change requires
a new assignment and binding. The positive PostToolUse input must match that exact reservation;
post-use rejection is observation fail-closed behavior, not the native mutation authority
boundary.

The published `TaskList` output does not return task metadata. Consequently TaskList baseline,
TaskCreate, task-state updates, or persisted observer state cannot create or restore local
progress. A new binding handshake and then a valid metadata update are required after a baseline
replacement, owner or agent change, `SubagentStop`, resume/clear/compact/fork, observed replay or
identity/revision contradiction, disconnect, or expiry. The adapter-local sequence orders only
accepted observations; it cannot prove that a native hook was skipped. Unobserved loss therefore
degrades only through `maxAgeMs`. Changing the unit identity, label, ordering, or denominator
without changing both revisions is malformed.

### Claude attention production

Claude attention is a bounded side observation tied to an already present task-set or assignment
source:

- `PreToolUse` for `AskUserQuestion` opens blocking `userInput` under its exact `tool_use_id`;
  matching `PostToolUse` or `PostToolUseFailure` closes it.
- `Elicitation` opens blocking `userInput` under its exact `elicitation_id`; matching
  `ElicitationResult` closes it.
- A structured terminal `PermissionDenied` may emit one bounded `approval` warning, but cannot
  create a blocking interval because the native event has no documented start correlation ID.
- An otherwise unpaired structured `PostToolUseFailure` with `is_interrupt != true` may emit one
  bounded `failure` warning.

Correlation includes canonical repository, session, native ID, adapter sequence, and `agent_id`
when present. Reasons are fixed adapter labels; the observer does not copy or parse raw
notification messages, prompt/tool input, error strings, commands, transcripts, or final
assistant messages. `PermissionRequest` and notification-only events without a documented,
resolvable start/terminal ID cannot create blocking attention. Source replacement, stop,
mismatch, disconnect, replay, or expiry removes the observation.

The producer accepts assignment or progress only when every repository, host session, task-set,
membership, task, and applicable assignment identity equals the available task-set observation.
Progress also requires an explicit stable unit-set revision, `total > 0`, and
`0 <= current <= total`. Replacement, disconnect, expiry, or mismatch rejects the observation
rather than carrying it forward.

If a current assignment observation is accepted, `ProgressObservation.assignmentId` must be
non-null and exactly equal its `assignmentId`. It may be null only when no current assignment
observation exists. Adding, removing, replacing, or re-identifying a unit, changing `unit`,
reordering units when order participates in identity, or changing `total` must change both
`unitSetRevision` and `sourceRevision`. The producer retains `unitSetRevision` in the snapshot;
reusing either revision across such a change is malformed.

## Exact methodology labels

The only v1 mapping is:

| Literal native role | Visible position |
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

`explore`, `oracle`, and `orchestrator` are presentation-neutral because the literal role does not
establish one unique methodology position. Unknown native roles make the assignment observation
malformed until a reviewed contract version adds them. A label never implies phase transitions,
gate outcomes, previous completion, or next work.

## Bounds and verification

The serialized observation is at most 256 KiB. IDs, paths, labels, revisions, roles, and units are
length-bounded and reject controls. Timestamps and maximum ages use the snapshot clock rules.

Fixtures cover every capability, available/unavailable reason, positive-evidence discriminator
cross-pairs, Claude full-list replacement and clean-start mutation sequence, resume/compact/fork
invalidation, duplicate and deleted members, partial sets, event gaps, unknown states and roles,
task addition/removal/state change, zero/one/multiple active members, current-task mismatch,
assignment and progress binding replacement, unit-set
denominator changes, replay, scope mismatch, expiry, and proof that the producer caches no
membership list.
