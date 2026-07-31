---
type: "Design"
title: "Shared flow-status snapshot and native presentation adapters"
---

# Shared flow-status snapshot and native presentation adapters

This revision realizes the user-selected
[Harness-native FlowStatus synthesis](research/flowstatus-synthesis.md), informed by the
[ccstatusline research](research/ccstatusline.md) and distilled in the project Wiki at
`.omp-flow/wiki/architecture/harness-flow-statusline.md`. It supersedes the prior branded
segment and standalone-renderer-first design. The earlier
[status snapshot](interfaces/statusline-snapshot-v1.md),
[composable segment](interfaces/statusline-segment-v1.md), and
[standalone host presentation](interfaces/host-presentation-v1.md) contracts remain historical
evidence; they are not the implementation contracts for this direction.

The 2026-07-31 completion audit reopened this delivery. The prior implementation is evidence, not
proof of the repaired outcome: Claude had no positive production path for assignment role,
current-task-local progress, or attention; fresh setup emitted a non-Powerline default; tests
loaded payloads from the movable Bundle; archive links disagreed; and the latency claims lacked a
measurement boundary. This revision defines those missing contracts. It does not authorize product
code changes without a new bounded work dispatch and independent review.

## Root Task/Flow v2 compatible revision

The user-approved
the observable-flow direction at
`.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`
changes the primary projection while preserving the repaired v1 native fact graph. This section
is authoritative where the retained v1 design describes native task sets, assignments, or a
single installed instance.

```text
authored root Bundle Concepts
          |
          | interpreted and explicitly asserted by orchestrator/Harness
          v
RootFlowPublishRequestV2 --> closed command validation --\
                                                          +--> one scope lock/assembler
live v1 source observation --> v1 nativeActivity --------/          |
                                                          one atomic v2 cache envelope
                                                                      |
                                                     one frame-scoped provider read
                                                +---------------------+-------------------+
                                                |                                         |
                                     root-task widget instance                 flow widget instance
                                     first native ccstatusline row             second Powerline row
                                     beside model/context/Git                  orientation/detail/bar
```

The **main-session omp-flow orchestrator** is the sole semantic publication/transition authority.
Its implementation may read
the selected Bundle's Markdown Concepts because interpreting authored knowledge is already its
job. It then submits the complete
[Root Flow Publication v2](interfaces/flow-status-publication-v2.md); it does not ask the runtime
to discover the facts. The portable runtime is limited to active-task equality, closed JSON
validation, repository confinement, actor/session correlation, freshness and current-revision CAS
before one atomic replacement of the latest ignored cache value.

No Python runtime, platform adapter, cache or status provider may parse authored Markdown or
directory placement, count Work files or operation receipts, infer Flow from roles/native tasks,
or retain a semantic history. The v2 snapshot is a display projection, not a lifecycle database
or ledger. Its cache remains safe to delete.

The assembled
[Flow Status Snapshot v2](interfaces/flow-status-snapshot-v2.md) has two independent branches:

- `rootFlow` is an available explicit v2 publication or one closed unavailable reason; and
- `nativeActivity` is the existing v1 snapshot or null.

Scope equality is required, but neither branch can populate the other. In particular, v1 native
task-set counts, assignment role and task-local progress retain their existing facts and labels;
they cannot identify the root Bundle, authored Work, Flow position, review acceptance, audit
attempt or v2 bar. This reconciles the landed v1 work without mislabelling it.

The production construction/invocation surface is
[Flow Status semantic publisher v2](interfaces/flow-status-publisher-v2.md). The canonical shared
`omp-flow` coordination Skill owns main-session invocation in every Harness. It passes explicit
authored `RootFlowSemanticInputV2` to the one pure production TypeScript builder, then the
installed `omp-flow flow-status publish|renew|clear` entry reaches the portable receiver. The
builder performs no filesystem/Concept/receipt/verdict read; tests import that exact builder.
`$flow-status` stays read-only.

CLI scope, canonical repository, selected root task, publisher actor and optional
`OMP_FLOW_CONTEXT_ID` must agree. A child operation never becomes publisher merely because its
role is `orchestrator`. Selection/session invalidation removes current authority. All three
commands share exact versioned success/failure JSON, stdout/stderr and exit 0/2/3 behavior.

The request carries `expectedPreviousPublicationRevision`. Initial publication, ordinary
same/forward/backtrack/reopen changes and cross-session resume have exact `fromPosition`/
`resumeFrom` relations. One scope-lock CAS makes a single concurrent publisher win; exact retry
is idempotent; conflicting request/revision reuse fails. Only the current request digest and
revision are retained, so the runtime does not claim arbitrary historical replay detection.
Cross-publication claims that an Explore reframe, audit attempt or reopen is meaningful remain
publisher assertions verified by pure semantic-publisher fixtures over authored inputs.

### Flow orientation and detail

The closed position mapping is:

```text
1 Explore   2 Design   3 QbD 1   4 Decompose   5 QbD 2
6 Execute   7 Integrate   8 Wiki   9 Finish
```

The publisher sends the position enum, not an ordinal or percentage; the renderer owns the fixed
label/index mapping. `movement` explicitly distinguishes initial, same, forward, backtrack,
resume and reopen. It describes the latest orientation only. No consumer marks earlier positions complete,
later positions pending, or the initiative 6/9 complete.

The discriminated position detail and validation semantics are normative in the v2 publication
interface. In summary:

- Explore alternates Brainstorm and Research within one meaningful round. Only a material
  evidence-driven reframing/reopen increments it.
- QbD 1 and QbD 2 have separate fresh independent audit attempts and separate linked human
  calibration. Finish owns completion-audit attempts separately. PASS is not human approval.
- Execute identifies the authored work-set revision and current Work, then distinguishes
  Implement, Review and Rework with per-Work review/rework rounds. Accepted Work advances only
  after a handoff for the current revision receives a different-actor independent accepted
  review. A new revision/reopen may reduce accepted count.
- Resume requires fresh session publication and changes no counter by itself. Backtrack/reopen is
  allowed and erases no authored history.
- Wiki remains usable throughout the workflow; position 8 specifically means deliberate durable
  knowledge harvest is the present orientation.

The publication interface is the complete schema, not explanatory prose: all nine detail variants
declare exact keys, nullability, enum values, field bounds and relational combinations. Initial
implementation uses review/rework round zero and no handoff; a first review starts review round
one. Every request also carries a complete current Work-set baseline with work-set/catalog
revisions and every Work's current revision, handoff/implementer and independent
review/reviewer/result. The production builder derives bounded `AcceptedWorkAttestationV2`
entries for the full numerator; the receiver compares every entry, including non-displayed Work,
and proves different actors/current Work/handoff revisions and accepted-measure equality.
Baseline and attestations are discarded after the write; only catalog/acceptance revisions,
digests and aggregate remain. Neither layer reads a handoff or Review Concept or builds an
Evidence ledger.

The position may own zero or one `BoundedMeasure`. It has one explicit stable denominator,
unit-set revision, source revision and position-compatible owner. Execute normally selects
accepted Work. Other positions may select only the phase-local owners enumerated by the
publication interface. Flow index, attempts, rounds, native tasks, receipts, context, tokens,
cost, Git and elapsed time are invalid measures. QbD attempts may be shown as detail, never as the
bar. The provider renders at most one graphical bar; width compaction first replaces it with the
same atomic labelled ratio and never substitutes a different denominator.

Wave is optional authored drill-down with exact ID/title, revision, work-set revision,
ordinal/total and focus Work bounds. Persistent `root-task` and `flow` views ignore it. The
read-only detail surface may show it; it never becomes a required workflow tier or bar.

### Canonical assembly and cutover

Both versions use the literal hosts `claude`, `codex`, and `oh-my-pi`. Under one scope lock, live
v1 `status observe` and v2 root publication each update its independently fresh branch and perform
one atomic write of the complete v2 envelope at the existing scope-hash path. There is no root
side cache, v1 cache writer, provider assembly or dual authoritative write.

Cutover deletes/ignores existing version-1 cache envelopes and enables the v2 command only after
runtime, provider, config and ownership v2 agree. Product code never reads an old v1 cache as
compatibility input; new live v1 observations repopulate native activity. Rollback restores the
v1 executable/config and deletes v2 envelopes rather than converting them. The latest-only v2
cache remains bounded, reconstructable and non-semantic.

### Main-session publication and liveness

The deployed canonical `omp-flow` coordination Skill invokes the production publisher at initial
selection, every semantic transition/reframe/audit/work/review/integration/Wiki/Finish change,
accepted review, backtrack/reopen/resume, and before claiming new display truth. It supplies
explicit values after the main orchestrator reasons about Concepts; the Skill/builder does not
turn Markdown into a schema parser.

Each root publication carries a 10–15 minute lease bound to selection revision, canonical scope,
host session, root Task, publisher actor, publication and source revision. Semantic observation
time is provenance, not expiry. At the beginning/end of each main-session control turn and before
native wait, the Skill checks remaining time. At five minutes or less, the orchestrator explicitly
revalidates unchanged selection/session/source and calls `renew`; native wait polling returns
control at least every five minutes. Consecutive event-driven renewals therefore preserve an
Implement/Review wait longer than the maximum single lease without daemon/timer ownership.

Renew changes only lease and snapshot revisions. Native v1 observations, cache/provider reads and
render frames never renew or trigger renew. Selection change/task clear/session end/disconnect/
publisher shutdown/archive/removal invokes the closed scoped clear request. If the publisher
crashes or the Harness cannot restore a control turn, the lease expires and root Flow degrades;
resume requires fresh semantic publication in the new session.

The single assembler handles live native observation, semantic publish, lease renew and clear
under the same scope lock with at most one atomic v2 write each. The common command envelope makes
written/unchanged/cleared/already-clear and every validation/internal failure executable.

### Two managed ccstatusline views

The integration still adds exactly one widget **kind** and one bounded read-only provider. It now
owns two configuration instances distinguished by the closed `view` enum:

```json
{ "id": "omp-flow-root-task-v2", "type": "flow-status", "view": "root-task" }
{ "id": "omp-flow-flow-v2", "type": "flow-status", "view": "flow" }
```

`root-task` renders the selected root Task ID and optional explicitly published title on the first
row alongside the existing native model/context/Git widgets. It neither reproduces nor owns those
native widgets. `flow` renders Flow position, current phase detail and at most one measure on the
second row. The normal full render is:

```text
 Task · 07-30-omp-flow-tui-control · TUI control  Sonnet 4  ctx 38%  main +5 
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

Compact and minimum forms are:

```text
Task · TUI control | Sonnet 4 | ctx 38% | main +5
Flow 6/9 Execute | Work 4/13 | Review R2

Task · TUI…
Flow 6/9 Execute | Work 4/13
```

Full width shows ID plus optional title; compact width may use the explicit title instead of ID,
matching the Wiki, and an absent title falls back to middle-ellipsized ID. Native widgets keep
ccstatusline's own compaction. On row two the atomic priority is: blocking attention, Flow index/position, labelled
measure, current Work/review detail, movement, freshness/prose. The graphical fill becomes a
labelled ratio before it drops. Invalid root Flow yields `Task · unavailable`/`Task ?` only from
the first view and semantic-empty second view; below six columns both are empty. It never restores
root facts from nativeActivity.

Fresh confirmed setup enables the existing Powerline mode and creates line one with `root-task`
first, then native `model`, `context-length`, `git-branch`, `git-changes`, and line two with `flow`.
Existing configuration setup previews and inserts or moves only the two exact owned instances,
preserving every foreign node, line, order, unknown field, theme and Powerline choice. Removal
does the inverse; managed-absence restoration keeps the existing digest rule. A conflict that
prevents both views is reported as conflict/partial/unconfigured, not silently advertised as
root-Flow support. No third line is created.

Setup requires `flowStatusWidgetV2`, `flowStatusSnapshotV2`, exact
`flowStatusViewsV2`, and `flowStatusSharedFrameReadV2`; v1-only builds fail readiness. One
frame-scoped source reads and freezes the v2 snapshot once before rendering either instance.
Four explicit CLI arguments report fixed line one/two and independently configurable positions.
The v2 ownership manifest binds both IDs/views/placements/digests.

The one-way setup update recognizes an exact owned v1 record only for migration, atomically
replaces its single node with both v2 nodes, then commits ownership v2 before enabling the v2
command. A bounded pending digest record enables deterministic forward completion or rollback.
Foreign, duplicate, modified, swapped, occupied-slot and inconsistent partial states fail
visibly; exact partial-owned state is repairable only after preview/confirmation. Removal is
atomic over both owned nodes and never deletes modified/foreign content.

Claude remains the first rich persistent surface. Codex uses `$flow-status` until a verified
public third-party footer exists. Oh My Pi may display the root/Flow projection only after an
explicit scoped v2 publication reaches its verified native status surface; its v1 native batch
progress remains separately labelled native activity. Neither adapter may synthesize v2 from
what the Harness happens to expose.

All previously accepted Claude binding guard, direct conformance, doctor
`configured`/`guardConformant`/`nativeE2E` separation, safe commit ordering, 400 ms supervisor
trigger, 600 ms degraded-return budget, 1,000 ms close/PID cleanup, 1,200 ms watchdog, movable
fixtures, Powerline fallback, Windows/CJK width and post-archive link contracts remain release
gates. The v2 implementation extends their fixture matrices; it does not weaken them.

The following sections retain the landed **v1 native-activity fact design** as a compatibility
and regression contract. Any old installation/cache language is superseded by the current v2
sections above and must not be implemented as a second path.

The landed v1 core is the closed, read-only
[Flow Status snapshot v1](interfaces/flow-status-snapshot-v1.md). Claude Code presents it through
one small Flow Status widget/provider added to ccstatusline. Codex and Oh My Pi use thin native
presentation adapters over the same snapshot when their installed public surfaces support one.
There is no parallel terminal renderer, branded status prefix, or second workflow model.

## Product shape

```text
explicit host task set -----\
current native assignment ---+--> FlowStatusSnapshot producer --> atomic bounded snapshot
bounded task progress -------+
fresh attention/source health/
                                      |
                     +----------------+----------------+
                     |                |                |
              ccstatusline       Codex adapter    Oh My Pi adapter
              Flow Status        native surface   native surface
              widget/provider    or detail only   or detail only
```

Claude Code keeps ccstatusline as the presentation owner: its existing Powerline renderer,
width/flex behavior, themes, model/context/Git/resource widgets, line editor, and configuration TUI
remain intact. The integration adds exactly one widget kind and its read-only provider. It does not
fork those presentation responsibilities. The configured Claude command is a short-lived
supervisor that starts the one pinned ccstatusline renderer as its child so process execution has
an enforceable deadline; the provider itself starts no child and no accessory remains resident.

The useful flow facts are:

- completed and total tasks in one explicitly sourced task set;
- the current bounded task's source label;
- the current assignment's explicit role and methodology position;
- one source-owned progress measure for that bounded task;
- fresh attention; and
- provenance/freshness sufficient to distinguish current, stale, unsupported, and unbound data.

The v2 Claude layout is the exact two-line profile above. The landed native-activity formatter is
retained only inside the v2 provider/detail path; it is not installed as a separate v1 widget.

## FlowStatusSnapshot v1

The snapshot is a reconstructable presentation projection, not workflow state, a capability token,
or durable history. The linked interface is normative; the following equivalent shape summarizes
it for architecture:

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
  taskSet:
    | {
        state: "available";
        capability: "claudeTaskListV1" | "ompTaskBatchV1";
        sourceId: string;
        membershipRevision: string;
        membershipDigest: string;
        completed: number;
        total: number;
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
  currentTask: null | {
    sourceId: string;
    taskId: string;
    label: string;
    membershipRevision: string;
    assignment: null | (
      {
        sourceId: string;
        assignmentId: string;
        actorId: string | null;
        operationReceipt: string | null;
        nativeTargetId: string | null;
        bindingRevision: string;
      } & (
        | { role: "executor"; methodologyPosition: "Implement" }
        | { role: "reviewer"; methodologyPosition: "Review" }
        | { role: "researcher"; methodologyPosition: "Research" }
        | { role: "architect"; methodologyPosition: "Design" }
        | { role: "qbd-auditor"; methodologyPosition: "QbD" }
        | { role: "planner"; methodologyPosition: "Plan" }
        | { role: "explore"; methodologyPosition: null }
        | { role: "oracle"; methodologyPosition: null }
        | { role: "orchestrator"; methodologyPosition: null }
      )
    );
    progress: null | {
      label: string;
      current: number;
      total: number;
      unit: string;
      unitSetRevision: string;
      sourceId: string;
      sourceRevision: string;
    };
  };
  attention: AttentionObservation[];
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

The serialized snapshot is at most 64 KiB. `sources` is limited to eight and `attention` to
sixteen. Identifiers and display strings are length-bounded and control characters are rejected.
Counts are non-negative safe integers; `total > 0`, `completed <= total`,
`completed + active + pending + failed = total`. Progress requires
`0 <= current <= total` and `total > 0`.

`sourceId` is unique within a snapshot and every reference must resolve. Task-set
`membershipRevision`, assignment `bindingRevision`, progress `sourceRevision`, and attention
`sourceRevision` must match their owning current source records. A current task is eligible only
when its `membershipRevision` equals the task set's current membership revision.

### Source ownership and binding

The host task-set source owns membership, terminal-task semantics, and the denominator through the
closed [source observation contract](interfaces/flow-status-source-observation-v1.md). A snapshot
may show `tasks 3/7` only after the producer validates one complete ephemeral member list and its
current-task membership, then stores only aggregate counts and `membershipDigest`. Adding,
removing, replacing, or changing a member creates a new revision; the old ratio is not carried
forward as if its denominator were unchanged. Incomplete, unsupported, stale, malformed, and
disconnected observations use the unavailable union and cannot retain current task or progress.

`currentTask.taskId` must be an exact member of that revision. Its label is supplied by that source
and bounded for display; it is not derived from a filename, prompt, branch, or Markdown heading.
The normative snapshot contract fixes membership digest ordering, serialization, UTF-8 encoding,
SHA-256 algorithm, and lowercase hexadecimal shape so independent producers agree.

The current assignment source owns `assignmentId`, literal native `role`, actor binding, and
binding revision. The exact v1 presentation mapping is: `executor` to Implement, `reviewer` to
Review, `researcher` to Research, `architect` to Design, `qbd-auditor` to QbD, and `planner` to
Plan. `explore`, `oracle`, and `orchestrator` map to null because none establishes one unique
methodology position. Unknown roles are malformed until a reviewed contract version adds them.

This label describes current work only. It does not assert that a prior position completed, a next
position is pending, a gate passed, or the Bundle has a machine lifecycle. No role or position is
inferred from task placement, conventional Concept names, operation age, Git, or Markdown.

Task progress is eligible only when its source explicitly owns a stable set of units for the
current task and its source revision matches the snapshot. It is invalidated by task, assignment,
task-set revision, source revision, session, or repository mismatch; disconnect; an observed
identity/revision contradiction; expiry; replay; or an invalid denominator. A local adapter
counter orders accepted events only; it cannot prove that a native Hook invocation was skipped.

If a current assignment exists, progress must bind to that exact non-null assignment ID; progress
may be assignment-neutral only when no current assignment exists. The snapshot retains the
unit-set revision, and both it and the progress source revision must change whenever unit identity,
the unit label, or the denominator changes.

Attention retains its exact source and source revision. A stale/disconnected source may yield one
degradation marker, but it cannot preserve an old approval request, progress claim, or active role
as current.

Portable runtime data may prove repository/task/assignment binding and provide mechanical
correlation. It does not invent task-set membership, methodology position, native liveness,
progress, acceptance, or human approval.

## Producer and cache

Each Harness adapter has a producer that translates only documented native task-set, assignment,
and progress facts into the shared snapshot. Translation is explicit per supported Harness/version;
there is no universal session scraper or heuristic text parser.

The producer:

1. resolves the canonical repository and exact host/session scope;
2. obtains a complete explicit task-set snapshot from the owning Harness;
3. correlates the current task and assignment by opaque IDs;
4. accepts progress and attention only from current source revisions;
5. validates the closed schema and bounds; and
6. atomically replaces the latest cache entry for that scope.

Positive task-set sources are deliberately asymmetric:

- Claude Code 2.1.142+ remains unavailable until a successful synchronous `PostToolUse` result for
  `TaskList` supplies the complete baseline. Successful correlated `TaskCreate` and `TaskUpdate`
  results may maintain it. An observed replay, unknown member, conflicting owner/task binding,
  malformed payload, resume, compact, fork, or expiry invalidates it until the next full list.
  A Hook that never executes is not directly observable; bounded maximum age is the fail-closed
  limit for that loss.
- Oh My Pi is pinned to `@oh-my-pi/pi-coding-agent` 17.2.1 at
  `7a2ced50bea8b97dbab7d9bd579329c4ea704de0`. For one explicitly selected native `task` call,
  complete input arguments plus full indexed `TaskToolDetails.progress[]` snapshots from
  `tool_execution_start/update/end` own membership and state.
- Codex app-server plan snapshots remain future/programmatic research and are not a v1
  `TaskSetCapability`. The first-release stock CLI adapter supplies only read-only detail.

### Claude production fact graph

Claude does not supply one payload that owns every visible fact, and it does not document
automatic equality between `TaskList.owner` and `SubagentStart.agent_id`. The adapter therefore
uses an explicit native binding handshake. All state below is ignored, ephemeral, revisioned, and
safe to lose:

```text
complete main-session TaskList
  owns membership + sole current task
             │
managed SubagentStart(agent_id, agent_type)
  + identity Hook selects that exact current revision/task
  + Hook generates one-time binding nonce
             │ additionalContext: identity + taskId + revision + nonce
             ▼
PreToolUse(TaskUpdate) fail-closed guard
  + validates complete bind/progress parameters
  + atomically reserves exact tool_use_id
             │ allow only closed native mutation
             ▼
same managed agent TaskUpdate(
  taskId,
  owner = agent_id,
  metadata.flowStatusBindingV1 = exact nonce/identity
)
  + successful result proves owner + metadata accepted
             │
             ├─ owns literal assignment role/position
             └─ later same-agent TaskUpdate(flowStatusProgressV1)
                owns task-local numerator/denominator

AskUserQuestion / Elicitation exact start-terminal pairs
  own blocking input attention
PermissionDenied / PostToolUseFailure
  own terminal warnings only
```

The main-session `TaskList` remains the only positive task-set source. Its optional `owner` is
retained as task-set data but never establishes assignment authority by itself. When a managed
`SubagentStart` arrives and the observer has exactly one fresh current task, the existing managed
identity Hook generates a cryptographically random bounded nonce and atomically stores a pending
binding containing canonical repository, session, task-set ID/revision, task ID, `agent_id`, exact
`agent_type`, nonce, issue time, and maximum age. The Hook injects the existing identity marker
plus a closed `flowStatusBindingRequestV1` object through documented `additionalContext`. It does
not parse or rewrite the operation assignment.

Each managed Claude agent definition is expanded to allow the native `TaskUpdate` tool while
continuing to forbid the `Agent` dispatch tool. Its startup contract requires its first native
mutation to target only the injected task ID and set:

```ts
type ClaudeFlowStatusBindingV1 = {
  owner: string; // exact injected agent_id
  metadata: {
    flowStatusBindingV1: {
      version: 1;
      taskSetRevision: string;
      agentId: string;
      agentType: string;
      nonce: string;
    };
  };
};
```

#### Fail-closed managed TaskUpdate authorization

The same managed installation registers one synchronous command Hook at
`PreToolUse(TaskUpdate)`. Claude's common tool-Hook input carries `agent_id` and `agent_type` for
subagent calls, plus `tool_use_id`, repository/session context, `tool_name`, and `tool_input`.
Main-thread and non-managed agent calls receive no decision from this Flow Status guard; for any
of the exact five managed types, absence or mismatch of a required field is a denial.

The guard reads the same ignored, locked binding record created by `SubagentStart` and accepts
exactly one of these complete input shapes:

| Intent | Exact top-level `tool_input` keys | Exact metadata keys | State transition |
|---|---|---|---|
| Bind | `taskId`, `owner`, `metadata` | `flowStatusBindingV1` | Pending nonce and old membership revision → one in-flight bind reservation |
| Progress | `taskId`, `metadata` | `flowStatusBindingV1`, `flowStatusProgressV1` | Consumed binding and last accepted progress → one in-flight progress reservation |

For both shapes, canonical repository, session, common `agent_id`/`agent_type`, exact current task,
task-set and membership revisions, nonce, and binding object must equal the stored record.
`taskId` is that task. Bind `owner` is that `agent_id`. The guard compares the complete key sets,
not a subset, so `status`, deletion, dependency/blocking fields, `subject`, `description`,
`activeForm`, foreign owner/task, extra metadata, and every other native mutation are denied
before the tool executes.

The first accepted progress publication has integer `total` from 1 through 32, integer
`0 <= current <= total`, bounded non-empty `label`/`unit`, and fresh bounded
`unitSetRevision`/`sourceRevision`. While one binding remains current, later publications must
repeat `label`, `unit`, `total`, and `unitSetRevision` exactly, strictly increase `current`, and
use a previously unseen `sourceRevision`. A unit-set, label, unit, or denominator change requires
a new assignment/binding; it is not an allowed in-binding transition.

Before returning allow, the guard atomically records the normalized authorized intent under the
exact `tool_use_id`; a second or replayed call cannot reserve the same nonce or next progress
revision. A valid call returns only:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow"
  }
}
```

Every invalid call returns the same closed envelope with `permissionDecision: "deny"` and a
bounded fixed reason. Any parse, path, state, lock, I/O, or internal-validation exception takes
that deny path; if stdout cannot carry valid JSON, the command writes a bounded reason to stderr
and exits **2**, which the pinned Claude version must prove blocks `PreToolUse`. Exit 0 without a
decision and exit 1 are forbidden for a managed TaskUpdate. The Hook is synchronous and performs
only one confined state read/reservation; it does not use network, transcript, Markdown, or a
model.

Setup treats the agent tool allowlist and guard as one capability, without claiming a public
no-model native TaskUpdate simulator exists. Normal readiness has three evidence layers:

1. **Contract provenance.** Pin Claude 2.1.220 or a separately reviewed compatible version and the
   official facts that project Hooks propagate into subagents, common inputs carry
   `agent_id`/`agent_type`, PreToolUse carries complete `tool_input`/`tool_use_id`, and exit 2
   blocks the call.
2. **Guard conformance.** Execute the exact staged command directly against deterministic pending/
   consumed state fixtures. Require every allowed binding/progress envelope, every forbidden
   native mutation, reservation concurrency/replay, malformed payload, injected state/I/O/lock
   error, JSON deny, and exit-2 fallback to match the closed contract.
3. **Installed configuration.** Byte/digest-check the installed guard, exact synchronous
   `PreToolUse` matcher/argv, and five exact agent definitions. Installation stages every file,
   commits the guard executable first, then the matcher, verifies both, and only then replaces the
   five agent definitions with `TaskUpdate`-enabled versions. Any failure restores all five
   no-TaskUpdate definitions before removing or rolling back the matcher/guard. Removal uses the
   reverse safe order. Doctor reruns the bounded conformance matrix against the exact installed
   guard/digest using an isolated temporary authorization-state root; it never reads or mutates a
   live binding while establishing `guardConformant`.

Doctor reports orthogonal fields rather than one inflated claim:

```json
{
  "configured": true,
  "guardConformant": true,
  "nativeE2E": "unproven"
}
```

`configured && guardConformant` is sufficient for normal local setup because it is grounded in
the official native contract and exact installed boundary. It is never labelled native E2E.
A separate controlled, authenticated Claude session may record `nativeE2E: "proven"` only after
the real Hook merger observes an allowed managed binding/progress call and denies a forbidden
mutation whose native task remains unchanged. That run owns its temporary task/agent cleanup,
timeout, credentials, billing, and evidence artifact; it is a conditional release/integration
proof when credentials are available, not a normal setup dependency. Missing authentication
stays explicitly `unproven`. The evidence is valid only for the exact Claude version, guard/
matcher/agent-definition digests, and platform it records; any mismatch returns doctor to
`unproven`. Prompt instructions remain defense-in-depth, never the authorization boundary.

`PostToolUse(TaskUpdate)` accepts a binding or progress observation only when its exact
`tool_use_id` has the matching pre-authorized reservation, its common identity and input still
match, and `tool_response.success`, `taskId`, and `updatedFields` prove the reserved fields were
accepted. Success atomically commits the reservation; `PostToolUseFailure`, conflicting result,
stop, or expiry removes it without creating authority. The binding nonce is single-use and is
consumed on successful commit or a conflicting attempted use. A later full TaskList may confirm
the owner but cannot bootstrap the binding because it omits metadata.

After this handshake the adapter maps the exact native `agent_type` through this compiled,
reviewed table:

| Claude `agent_type` | Snapshot role | Position |
|---|---|---|
| `omp-flow-architect` | `architect` | Design |
| `omp-flow-check` | `reviewer` | Review |
| `omp-flow-implement` | `executor` | Implement |
| `omp-flow-qbd` | `qbd-auditor` | QbD |
| `omp-flow-research` | `researcher` | Research |

The value is the native `agent_type` carried by Claude's structured hook. The observer never opens
an agent definition, treats a filename as a role, parses frontmatter, scans a prompt/dispatch
descriptor, or searches operation records. Built-in agents, unknown/plugin-renamed agents, the
main thread, and missing/expired/conflicting handshakes yield `assignment: null`.

Claude task-local progress is authored by that explicitly bound managed agent. Before substantive
work, the agent defines 1–32 stable units appropriate to its bounded objective, chooses bounded
opaque `unitSetRevision` and `sourceRevision` values, and publishes `current = 0`. It then updates
only the completed-unit numerator. The common Hook input must carry the bound `agent_id`;
`tool_input.taskId` must equal the bound current task; and `tool_response.success`, `taskId`, and
`updatedFields` must prove metadata was accepted. The only recognized progress member is:

```ts
type ClaudeFlowStatusProgressV1 = {
  flowStatusProgressV1: {
    version: 1;
    label: string;              // bounded display label, for example "checks"
    unit: string;               // stable unit kind, for example "check"
    current: number;
    total: number;              // nonzero and stable for unitSetRevision
    unitSetRevision: string;
    sourceRevision: string;
  };
};
```

Every progress update repeats the immutable accepted `flowStatusBindingV1` object alongside
`flowStatusProgressV1`; this avoids relying on undocumented metadata merge semantics and lets the
observer revalidate nonce, agent, task, and membership binding on every update.

The installed PreToolUse guard, not the managed agent prose, permits `TaskUpdate` only for the
injected bound task's binding and progress metadata. The agent cannot claim another task, change a
native lifecycle status, synthesize a task ID, mutate dependencies/details, or dispatch through
this allowlist. The adapter copies the closed progress fields into `ProgressObservation`; it does
not interpret any other metadata.
Claude's published `TaskList` result does not return metadata, so a full baseline can never invent
or restore task-local progress. A fresh handshake and progress update are required after every
baseline/session/agent invalidation. Unit identity, label, ordering, or denominator changes inside
one binding are denied; a new assignment/binding is required.

Claude attention uses only native events with resolvable completion:

| Start | Resolution | Observation |
|---|---|---|
| `PreToolUse` for `AskUserQuestion` | same `tool_use_id` `PostToolUse` or `PostToolUseFailure` | blocking `userInput` until resolution |
| `Elicitation` | same `elicitation_id` `ElicitationResult` | blocking `userInput` until resolution |
| `PermissionDenied` | its own native `tool_use_id` | bounded terminal warning, never waiting approval |
| `PostToolUseFailure` not paired above | its exact tool/agent source revision | bounded `failure` warning |

`PermissionRequest` and `Notification(permission_prompt)` are deliberately ignored as blocking
sources because neither supplies a documented start/terminal identity that can be joined without
guessing. Reasons are fixed adapter labels such as `input required`, `permission denied`, and
`tool failed`; raw `message`, `error`, prompt, command, transcript,
`last_assistant_message`, and elapsed silence are not parsed. Main-session attention binds to the
current task-set source revision. Agent-scoped attention additionally requires the exact current
assignment source. Missing correlation is ignored or degraded, never kept as a current blocking
claim.

An observed owner/binding/revision mismatch, conflicting concurrent event, replayed native ID,
replacement TaskList revision, `SubagentStop`, session start/resume/clear/compact/fork,
disconnect, scope mismatch, or expiry revokes dependent claims in one atomic snapshot
replacement. `adapterSequence` is only a revision for accepted local writes. It does not claim to
detect a Hook invocation that never ran, timed out, was disabled, or was lost; maximum age is the
only fail-closed bound for such an unobserved loss. The adapter may preserve the independent
task-set ratio if and only if the task-set observation itself remains complete and fresh.

The cache is ignored, reconstructable, and safe to delete. It stores at most one 64 KiB snapshot
for each of eight repository/host/session scopes, evicts least-recently-used entries, and deletes
entries older than 24 hours. A read never extends source or snapshot freshness. For the retained
native v1 observation branch only, `maxAgeMs` is 1–30 seconds; a timestamp over two seconds in the
future, clock rollback, or negative computed age yields `clock-uncertain` and removes native
progress authority. Root Flow uses the independent publisher lease above.

The producer and presentation adapters do not parse authored Markdown, private transcripts, todo
files, account files, credentials, Keychain data, or private usage APIs. They perform no network
request on the presentation hot path and do not create a lifecycle database, event ledger,
transcript index, task registry, or compatibility reader.

## Claude Code: one ccstatusline extension

### Flow Status provider

`FlowStatusProvider` is a bounded read-only frame source inside the supported ccstatusline build. From
ccstatusline's documented current status input it uses only the repository/workspace path,
session ID when available, and terminal-width context needed to select the exact snapshot. It
reads and validates one v2 cache entry once at frame start, derives freshness, freezes the value,
and returns the two view models or typed absence/degradation results. View renderers receive that
frozen value and perform no cache read.

The provider never receives task meaning from other ccstatusline widgets and never uses
ccstatusline transcript, account, OAuth, arbitrary-command, or global session-scan facilities.
User-configured ccstatusline widgets remain the user's independent choice; the Flow Status
integration does not enable or depend on those private data paths.

The pinned provider uses synchronous regular-file metadata/read calls because ccstatusline's widget
contract is synchronous. It can check elapsed time before and after the call and can reject slow
or oversized results after return, but it cannot interrupt an operating-system read that never
returns. Therefore provider timing owns the warm p95 gate only; it makes no in-process stalled-I/O
hard-deadline claim.

### Bounded Claude status supervisor

Setup configures one omp-flow-owned status supervisor as Claude's command instead of pointing
Claude directly at ccstatusline. The supervisor is a small Node entry point with this closed
behavior:

1. receive at most 1 MiB of Claude status JSON on stdin and fail semantic empty above that bound;
2. spawn exactly the explicitly probed pinned ccstatusline executable with the explicit config
   path, `shell: false`, hidden window on Windows, closed environment additions, and piped stdio;
3. schedule the hung-child transition for 400 ms after the child's successful `spawn` event;
4. forward at most 64 KiB stdout only after normal zero exit;
5. on the hung-child transition, atomically stop accepting data, destroy child stdin, invoke
   `child.kill()` with Node's default signal, destroy child stdout/stderr, unref the child, close
   presentation output as semantic empty, and let OS/process cleanup continue independently; and
6. redact bounded diagnostics and never retry, discover another executable, or remain resident.

The supervisor is not a renderer and never interprets Flow Status or ccstatusline output.
ccstatusline remains the one presentation owner. On Windows/Node 22, the selected termination
primitive is `ChildProcess.kill()` with the default signal; Node uses forceful process termination
there. The boolean return or thrown error is recorded but never converted into stale status
output. `runSupervisedChild` exposes two receipts: presentation resolution and later cleanup. The
production wrapper awaits presentation only, closes stdout, and can exit after the child and all
pipes are unreferenced; an external test/doctor may await the child's `close` event and probe PID
liveness separately.

The supported-environment service contract is:

- request kill at the 400 ms scheduled threshold, with at most 50 ms measured timer lateness on
  the pinned idle Windows/Node CI job;
- close the supervisor's presentation path with semantic empty and exit by 600 ms from child
  spawn on that job; and
- observe child `close` and failed external PID-liveness probe by 1000 ms, independent of the
  already returned presentation.

The 600 ms value is the user-facing degraded-return budget; 1000 ms is the asynchronous cleanup
budget. A 1200 ms parent cleanup watchdog classifies failure and is never product timing evidence.
Cold p95 still measures the entire healthy configured command from before parent spawn through
exit. Node timers and Windows scheduling are not hard real-time: CPU starvation, VM suspension,
process creation stalls, or an overloaded runner may exceed these figures. When scheduled again,
the supervisor still chooses semantic empty and requests termination; it never claims a universal
deadline.

The production CLI constructs a closed child specification from only the setup-owned pinned
executable and config; status JSON, environment, stdin, and user config cannot select a child
command. The timer, output bounds, pipe cleanup, Windows termination, and exit logic live in one
exported `runSupervisedChild(closedSpec)` function. Production passes only the pinned spec.
Timeout-service tests call that same function with a test-owned child that writes one fixed `READY`
marker and then intentionally remains alive. This is a deterministic process-lifetime test of the
production supervisor and kill path, not a provider or regular-file-read test.

### Flow Status widget

`FlowStatus` is the single new ccstatusline widget kind. It is registered in ccstatusline's existing
manifest and edited through its existing configuration TUI. It returns ordinary semantic widget
content to ccstatusline; ccstatusline remains solely responsible for Powerline wrappers,
separators, flex placement, ANSI themes, whole-line width, truncation, and empty-line suppression.

Its only required discriminator is the closed `view` enum `root-task | flow`; the exact owned
objects, rendering priorities, graphical-measure rule, unavailable behavior and display-column
bounds are normative in the v2 snapshot interface. It exposes no bar target fallback, arbitrary
command, custom query, workflow control, user role mapping or Concept parsing. Native v1 task-set
facts are available only as explicitly labelled detail, not as a substitute persistent bar.

One frame source reads and validates one snapshot, then supplies both render calls. The
`root-task` view owns Task/full-title/compact-title behavior and the single unavailable marker;
the `flow` view owns orientation/detail and zero or one publisher-selected phase measure. Both
return ordinary semantic content to ccstatusline, which retains wrapper/separator/theme/layout
ownership.

### Two-line configuration and distribution boundary

The current configuration contract is exactly the two-ID/two-view profile in
[Flow Status snapshot v2](interfaces/flow-status-snapshot-v2.md): Task first and native widgets in
their original relative order on line one, Flow on line two, and no third line. Fresh setup
enables the accepted Powerline separators/caps. Existing setup preserves the user's Powerline,
theme, lines, unknown fields and foreign relative order while atomically placing both owned
views.

The implementation target remains a small upstreamable ccstatusline change containing one
provider/frame source, one widget kind, two closed views, manifest entries, editor options, and
tests. Until upstream release, support requires a pinned reviewed build advertising the complete
v2 capability quartet. Setup discloses exact package/revision and never hot-patches an arbitrary
global installation.

No general plugin ABI, parallel renderer, custom-command wrapper, or maintained clone of
ccstatusline's widget/editor/theme system is introduced.

## Codex and Oh My Pi adapters

All non-Claude presentation adapters consume the same validated `FlowStatusSnapshotV2` and create
only native view models. They keep its optional v1 branch labelled native activity and do not
reinterpret methodology, re-count tasks, recalculate progress, or synthesize a missing root Flow.

### Codex

The adapter probes the installed public Codex surface. Current Codex supports configurable built-in
footer items but does not document an arbitrary third-party footer provider. Therefore the first
release must not claim a persistent Flow Status footer, edit `tui.status_line` as if it did, inject
cursor overlays, scrape the screen, or wrap Codex in a PTY.

Until a supported provider extension is detected, Codex exposes read-only detail through the
canonical managed `$flow-status` Skill defined by the
[detail-surface contract](interfaces/flow-status-detail-surface.md). The Skill runs only direct
`omp-flow status inspect`, is deployed through the existing common-Skill resource path, and has
explicit discovery, idempotence, conflict, and exact-owner removal behavior. A future supported
footer provider may render a compact native view from the same snapshot. Capability discovery, not
version guessing, decides which surface is enabled.

### Oh My Pi

Upstream `@oh-my-pi/pi-coding-agent` 17.2.1, pinned at
`7a2ced50bea8b97dbab7d9bd579329c4ea704de0`, exposes
`ctx.ui.setStatus(key, text)`, `pi.registerCommand`, structured
`tool_execution_start/update/end`, and full `TaskToolDetails.progress[]` snapshots. The current
handwritten `ExtensionAPI` in `src/omp/extension-entry.ts` is narrower than that public contract;
implementation widens the local adapter to the pinned fields instead of treating the local type as
negative upstream evidence.

The first-release adapter contributes compact validated text under the unique native footer key
`flow-status` and registers one read-only `/flow-status` detail command. Oh My Pi sanitizes and
width-truncates status entries, so this is native compact text rather than a Powerline clone. The
adapter selects one exact `task` call by session and `toolCallId`, replaces the full batch state
only from complete indexed progress snapshots, and never merges concurrent unselected calls.
Failed and aborted members become failed counts plus attention. It clears its exact key and
registration on invalidation, session switch, shutdown, or removal.

The adapter does not replace the footer with `setFooter`, inject a persistent widget, or take
ownership of native task dispatch, concurrency, cancellation, result delivery, or UI lifecycle.
Older or unverified versions expose only direct `omp-flow status inspect`.

## Read-only core and drill-down safety

`FlowStatusSnapshot`, its provider, and every persistent status surface are read-only. The snapshot
contains no action capability, approval token, or executable command.

The direct CLI or managed Codex `$flow-status` detail surface may show provenance, freshness,
task-set membership proof, assignment binding, and active entry/output paths according to the
[detail-surface contract](interfaces/flow-status-detail-surface.md). If a later accepted design exposes
preview, attach/focus, native interrupt, or process stop, it must re-query the owning live adapter
at action time and verify exact target, assignment, actor, task-set revision, capability revision,
freshness, and confirmation. Cached status never authorizes mutation. Native interrupt and process
stop remain distinct, and neither mutates a portable receipt as a proxy.

## Installation, coexistence, and removal

Setup is explicit and non-overwriting:

1. detect the Harness, configuration scope, current status owner, ccstatusline build capability,
   and native adapter capability;
2. preview the exact package revision, supervisor-to-child argv, and configuration changes;
3. preserve existing status lines, widgets, themes, ordering, refresh settings, and unrelated
   fields;
4. atomically add both exact Flow Status view instances only after confirmation;
5. verify with a bounded mock snapshot and Powerline preview; and
6. record only the exact two-view/provider/supervisor identity needed for reversible
   removal.

If Claude already uses a compatible ccstatusline build, setup adds both views at the four
explicitly reported fixed-line/configurable-position placements. If ccstatusline is absent, setup may offer installation of the disclosed
compatible build; declining leaves configuration unchanged. If another renderer owns the Claude
slot, or the ccstatusline build lacks the complete v2 capability quartet, setup reports
`unsupported` and does not
replace, wrap, or patch it.

The owned Claude command points to the packaged supervisor and passes the explicit compatible
ccstatusline executable/config as argv data. Doctor re-probes the exact child capability and
verifies the command shape without executing an arbitrary configured command. A direct legacy
ccstatusline command may be migrated only through the same explicit preview/confirmation; a
foreign renderer or supervisor is a conflict.

Absence and existing configuration have different ownership receipts:

- `fresh-managed-default` records that the config did not exist, the exact created document hash,
  the exact Claude `statusLine` registration added, and both owned view identities. Removal restores
  pre-install absence only while the entire managed documents still match those hashes. If the
  user changed either document, removal becomes the conservative exact-view/registration path
  and never deletes the file.
- `existing-config-insertion` records the pre-existing config identity and only the two inserted
  view identities/positions. Setup/update/removal deep-compare every pre-existing decoded node and preserve
  unknown fields and ordering. It never applies the fresh Powerline/default-widget profile.

Codex configuration remains unchanged while third-party footer support is absent; setup manages
only the canonical project Skill files and preserves modified/user-owned copies. Verified Oh My Pi
setup activates the existing omp-flow extension's exact `flow-status` key and `/flow-status`
registration; an existing foreign command name is a visible conflict, not a numeric alias.
Repeated setup is idempotent. Removal deletes only the exact two managed Flow Status views/provider,
Codex Skill files, Oh My Pi status key, or command registration it owns; it does not uninstall
ccstatusline, remove host widgets, rewrite user lines, or delete user-owned task data.

### Stable fixtures and archive-safe links

Executable payloads live under the repository-stable test boundary, never under a movable Bundle:

```text
tests/fixtures/flow-status/
├── claude-task-events-v2.1.220.json
└── oh-my-pi-task-events-v17.2.1.json
```

The Bundle's `reference/native-capability-fixtures.md` remains provenance and interpretation. It
refers to those files using code-form repository paths, not depth-sensitive Markdown links. The
migration copies and expands each payload into its stable destination, verifies its expected
revision/scenarios, updates every historical reference, and deletes both
`reference/fixtures/*.json` sources in the same change. The provenance Concept remains; the old
JSON directory does not remain as a second executable or evidentiary tier. The source check
targets JSON fixture imports/read paths from Flow Status tests; it rejects a path rooted at
`.omp-flow/tasks/` or `.omp-flow/tasks/archive/` without rejecting legitimate runtime tests that
intentionally create or inspect task Bundles.

Internal links between Bundle Concepts remain ordinary relative links because the whole Bundle
moves together. Links from a Bundle Concept to stable repository knowledge such as the Wiki are
written as code-form repository paths. README/Wiki backlinks are updated after the actual archive
move and are checked against that final path; they never claim both the active and archived
location. Completion cannot be restored until a link checker resolves every internal Bundle link
and the final README/Wiki backlink.

The prior archive simulation identified 13 depth-sensitive links in exactly:

- `research/flowstatus-synthesis.md`;
- `research/native-harness-flow-capabilities.md`;
- `qbd/qbd-1/flowstatus-audit.md`;
- `qbd/qbd-1/flowstatus-audit-2.md`;
- `qbd/qbd-2/flowstatus-workmap-audit.md`; and
- `work/handoffs/setup-docs-and-integration.md`.

Fixture relocation adds five historical references owned by the same repair:

- `work/claude-ccstatusline.md`;
- `review/claude-ccstatusline.md`;
- `qbd/qbd-1/flowstatus-audit-4.md`;
- `qbd/qbd-1/flowstatus-audit-5.md`; and
- `work/oh-my-pi-native-status.md`.

The first 13 repository-external relative links and all five movable-fixture links become
code-form repository-root paths. The archive-aware command accepts the current Bundle and exact
intended dated destination, simulates the moved path without changing task state, validates file
targets and heading anchors, asserts that all historical fixture references name the canonical
stable destinations, and asserts that no `reference/fixtures/*.json` payload remains. It then
runs again after the actual atomic archive. Its final mode also checks README,
`.omp-flow/wiki/architecture/harness-flow-statusline.md`, completion, repair handoff, and repair
review; it requires exactly one Wiki backlink to the actual archived Bundle and rejects an
active-task backlink.

## Failure and degraded behavior

| Condition | Persistent presentation | Detail/setup behavior |
|---|---|---|
| No explicit task set | Flow Status widget is semantically empty | Explains which source is absent |
| No current task | Shows task-set totals only | Shows membership/provenance |
| No successful Claude bind handshake | Shows task-set totals/current label only | Identifies binding as unavailable without guessing |
| No bounded progress | Shows no bar or percentage | Shows progress source as unavailable |
| Stale/clock-uncertain snapshot | Removes progress authority; shows `stale`/`time?` | Re-queries producer |
| Binding or revision mismatch | Shows `unbound`; suppresses affected role/progress | Shows exact mismatched identities |
| Ordinary provider/cache failure | Returns degraded or semantic empty after the read returns | Reports bounded error and retry |
| Hung ccstatusline child | Schedules kill at 400 ms and returns semantic empty within the 600 ms supported-environment service budget | Reports presentation and <= 1000 ms asynchronous cleanup receipts separately |
| Claude PermissionRequest notification | No waiting-approval claim | Unsupported correlation; terminal warning only when independently identified |
| Unsupported ccstatusline build | Makes no configuration change | Identifies required capability/revision |
| Current Codex footer limitation | No persistent Flow Status claim | Managed `$flow-status` only when installed/discoverable; otherwise unsupported |
| Oh My Pi 17.2.1 positive capability | Compact native status contribution | Read-only `/flow-status` and direct CLI |
| Older/unverified Oh My Pi | No injected status or command | Direct `omp-flow status inspect` only |
| Glyph/width uncertainty | Compact ASCII-safe content | Full provenance remains available |

Provider stderr/logging is bounded and debug-only. Secrets, raw host payloads, native IDs, and
attention detail are redacted by default.

## Performance and Windows behavior

The Flow Status frame source performs one bounded regular-file cache lookup and renders both views
from that one frozen value. It
starts no network request, further child, Git scan, transcript read, or Harness-wide discovery.
Its synchronous read is measured but is not interruptible in-process. The configured supervisor,
not a timestamp around `readFileSync`, owns a supported-environment child-process service budget.

The release benchmark has three non-overlapping measurements:

1. **Warm provider p95.** After 20 discarded warm-ups, run 200 measured provider calls in one
   process. Before each sample, atomically replace the bounded valid cache fixture so every call
   performs an actual open, read, UTF-8 decode, closed validation, freshness calculation, and
   format. Use a monotonic high-resolution clock and nearest-rank p95
   `sorted[ceil(0.95 * 200) - 1]`. The gate is p95 <= 50 ms.
2. **Cold configured statusline p95.** Run 40 sequential newly spawned **supervisor** commands.
   Each supervisor starts a new pinned ccstatusline child and receives a distinct temporary
   repository, status input, config, and snapshot path; no Node module/provider state is shared.
   Measure parent wall time from immediately before supervisor spawn through stdout capture and
   exit. Use the same nearest-rank rule. The gate is p95 <= 250 ms.
3. **Hung-child service budget.** Run 20 cases through the exact exported production
   `runSupervisedChild` function using the deterministic hanging test child. Each child records its
   PID, emits fixed `READY` only after successful spawn, and then stays alive without producing
   status output. The same production 400 ms timer callback performs the exact stop-accepting,
   stdin-destroy, default `child.kill()`, stdout/stderr-destroy, child-unref, semantic-empty, and
   presentation-exit path. Every case on the pinned idle Windows/Node job must record timer
   lateness <= 50 ms, degraded return <= 600 ms, and later child `close` plus PID absence
   <= 1000 ms. A 1200 ms external cleanup watchdog is always failure. The fixture is deliberately
   not described as a cache-reader stall, and production never accepts its path as a configured
   command.

The benchmark writes JSON containing boundary name, all raw durations, discarded warm-up count,
sample count, nearest-rank index/value, maximum, fixture byte size, result classification, and
Node/Python/OS versions. Timeout-service JSON additionally records supervisor-parent start/exit,
child-spawn time, scheduled threshold, callback/timer lateness, kill request and boolean/error,
each pipe detach, presentation close/exit, child `close`, PID-probe result, and watchdog use. The
normative CI run is serial on `windows-latest`, Node 22, Python 3.12, with no concurrent repository
test process; the same command also runs in a real CJK temporary path. Results from a narrower unit
timer cannot be used to claim the cold or hung-child service gate. The benchmark reports all 20
samples and requires every supported-environment maximum above; p95 is reported for diagnosis but
cannot hide one cleanup failure. The design makes no absolute claim about synchronous I/O
interruption, scheduler latency, or an operating-system stall before child spawn.

Separate provider semantic tests use actual regular files and the production
`statSync`/`isFile`/`readFileSync` path for valid, missing, stale, oversized, malformed, partial,
future-clock, CJK, and non-regular inputs. They assert the closed valid/degraded/semantic-empty
result only after the synchronous call returns. Warm and normal cold samples exercise that
production reader; no regular-file fixture is required or claimed to hang reproducibly on
Windows.

All snapshot and configuration I/O is UTF-8. Windows paths round-trip without shell interpolation;
writes are atomic and confined to explicit settings/cache paths. Width is supplied by ccstatusline
or the native Harness. Unknown Windows width selects compact ASCII output rather than Unix
process-tree, `stty`, or `tput` probing. Display truncation counts terminal columns rather than
bytes or UTF-16 code units.

## Verification strategy

- `tests/flow-status-v2-publisher.test.ts` imports the exact production
  `buildRootFlowPublishRequestV2` and exercises every Skill invocation point, movement/counter
  transition, common command envelope, complete Work-catalog derivation and non-current stale
  Work/handoff negatives. Dependency denial proves the builder performs no authored-file read.
- Fake-clock publisher/receiver tests run active Implement and Review waits beyond 900,000 ms by
  issuing main-session renewals at the defined control turns, then prove publisher crash, lease
  expiry, selection/session replacement, disconnect, clear and resume degrade without v1/native
  renewal or a daemon.
- Snapshot contract tests cover closed-schema rejection, bounds, task-set revision changes,
  membership/current-task mismatch, assignment binding, explicit role/position, progress
  denominators, attention ordering, stale/future clocks, and source disconnection. The stable
  payloads at `tests/fixtures/flow-status/` are replayed through the real producer boundary rather
  than rebuilding normalized observations by hand.
- Claude producer tests cover a complete sole-current baseline, exact managed `agent_type` table,
  identity/binding-request injection, nonce single use, same-agent successful owner+metadata
  TaskUpdate, managed-agent tool availability/constraints, closed progress publication,
  AskUserQuestion/elicitation pairs, PermissionRequest negative capability, terminal denial/
  failure warnings, owner replacement, stop, observed replay/conflict, expiry, and every session
  invalidation. A lost-Hook test advances time and proves TTL degradation without claiming a local
  counter detected the loss. A source scan rejects prompt/error/final-message/Markdown/filename/
  operation-history parsing.
- Progress tests prove task-set totals and current-task progress keep distinct labels, sources,
  revisions, and denominators; either configured target can receive the sole graphical bar;
  fallback never relabels a measure; and receipt counts, context, cost, tokens, duration, Git,
  filenames, Markdown, and age cannot move either measure.
- ccstatusline tests pin each supported revision and prove exactly one new widget kind/provider,
  manifest and editor integration, Powerline/theme behavior, semantic empty/separator repair,
  the exact two-line/two-view configuration, width compaction, at most one task bar, and no injected
  OMP/omp branding.
- Security tests prove the provider/supervisor does not use transcripts, todo/account/credential
  files, Keychain, private APIs, arbitrary commands, inherited-environment shell execution, or
  network access. Supervisor tests prove exact executable/config argv, 1 MiB stdin and 64 KiB
  stdout bounds, `shell: false`, exact default `child.kill()` Windows path, pipe detach order,
  presentation/cleanup receipt separation, and the supported-environment service/cleanup gates.
- Codex tests prove current third-party footer capability is absent, `tui.status_line` remains
  unchanged, `$flow-status` is explicit and read-only, and a future adapter enables only after a
  positive public capability probe.
- Oh My Pi tests pin 17.2.1/revision
  `7a2ced50bea8b97dbab7d9bd579329c4ea704de0`; probe API capability; validate complete indexed
  flat/batch/background progress; handle failed, aborted, concurrent, stale, and disconnected
  calls; register/clear only `flow-status` and read-only `/flow-status`; retain older-version
  direct CLI fallback; and prove absence of dispatch/cancellation ownership.
- Installation tests cover compatible, absent, incompatible, already-configured, corrupt,
  user/project, repeated setup, exact managed removal, declined installation, the exact
  Powerline-enabled fresh golden config/final render, and existing-config preservation of every
  original decoded node/order and unrelated file.
- Setup/doctor tests separately prove official contract provenance, direct exact-guard
  conformance, installed matcher/command/digest equality, guard-first atomic commit and reverse
  removal/rollback, and truthful `configured`/`guardConformant`/`nativeE2E` reporting. Fixture
  conformance never produces an E2E claim. A controlled authenticated native E2E is attached only
  when that external environment is available.
- Cache/performance tests cover the exact 200-after-20 production-reader warm, 40 normal
  whole-supervisor cold, and 20 deterministic hanging-child measurements above. Provider semantic
  cases use real regular files but make no interruption claim. Timeout-service cases use the exact
  exported production supervisor/timeout/kill path and record readiness, timer lateness, kill
  result, pipe detach, degraded return, later child close/PID cleanup, all supported-environment
  maxima, and watchdog use. Scope mismatch, expiry, LRU/24-hour eviction, corrupt/partial write
  recovery, and deletion/reconstruction remain covered.
- Real Windows CI covers UTF-8/CJK paths, atomic snapshot/settings writes, display columns, ASCII
  fallback, process exit, and unknown-width behavior.
- Filesystem tests prove no lifecycle database, semantic event history, duplicate task registry,
  or durable session projection remains after cache deletion; a targeted source scan proves Flow
  Status JSON fixture imports do not depend on a current or archived task Bundle while ordinary
  task-runtime tests remain allowed.
- The archive-aware checker first resolves the simulated exact dated move, including anchors and
  the 13 repaired repository-external links and five stable-fixture references, and rejects the
  old Bundle JSON payload tier. After the real move it verifies README, exactly one Wiki archived
  backlink, Bundle index, completion, repair handoff, and repair review from their final locations
  and emits machine-readable zero-broken output.

Normal compile, build, focused tests, package dry-run, and diff checks remain integration gates.
These checks do not constitute independent QbD or human approval.

## Rejected alternatives

- A branded standalone or composable renderer duplicates ccstatusline and fragments configuration.
- A general widget/plugin framework is unnecessary for one bounded Flow Status provider.
- Reconstructing methodology transitions, completion, or gates from Markdown, file placement,
  timing, or role order creates hidden lifecycle state; a closed display label for the explicit
  current role does not.
- An overall workflow percentage has no honest denominator across task sets, decisions, review, and
  human approval.
- Private transcript/session/account mining weakens the source and security boundary.
- Treating `TaskList.owner` as an automatically populated native agent ID is unsupported; the
  explicit nonce-bound successful TaskUpdate is the positive producer.
- `PermissionRequest` has no native tool-use ID and cannot represent waiting approval without
  ambiguous correlation; v1 omits that claim.
- A local adapter counter cannot reveal a Hook that never ran; native v1 expiry and root v2 lease
  expiry are their separate honest fail-closed bounds.
- Checking a monotonic clock around synchronous `readFileSync` cannot interrupt it. The bounded
  short-lived supervisor owns child-process execution time instead; its deterministic hanging
  child verifies only that process boundary and is not represented as a production-reader stall.
- A normal setup-time native TaskUpdate sentinel is unavailable without an authenticated,
  model-driven session. Official contract provenance, direct guard conformance, and exact
  installed configuration establish normal readiness; doctor preserves native E2E as a separate
  proven/unproven fact.
- A timer scheduled for 500 ms cannot also complete kill, pipe closure, PID proof, and return by
  500 ms. The design triggers at 400 ms and separates the 600 ms presentation service budget from
  the 1000 ms asynchronous cleanup gate, with explicit scheduler limits.
- Cursor overlays, screen scraping, and PTY wrappers are not native presentation adapters.
- Claiming Codex footer parity before a public third-party provider exists is misleading.
