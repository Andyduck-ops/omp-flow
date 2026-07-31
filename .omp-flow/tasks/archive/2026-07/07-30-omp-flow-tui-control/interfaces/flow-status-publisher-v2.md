---
type: "Interface"
title: "Flow Status semantic publisher v2"
---

# Flow Status semantic publisher v2

This is the production construction and liveness boundary for
[Root Flow Publication v2](flow-status-publication-v2.md). It keeps authored interpretation in the
main-session omp-flow orchestrator while making construction, invocation, renewal, clearing and
failure behavior executable.

## Production owner and canonical resources

The canonical coordination owner is:

```text
templates/common/skills/omp-flow/SKILL.md
```

The existing installer deploys that same revision to universal `.agents/skills/omp-flow/` and,
when selected, exact native roots `.omp/skills/omp-flow/`, `.codex/skills/omp-flow/`, and
`.claude/skills/omp-flow/`. Claude, Codex and Oh My Pi main sessions enter omp-flow through their
deployed copy. The Skill is extended with the invocation obligations below.
`templates/common/skills/flow-status/SKILL.md` and `$flow-status` remain read-only inspection
surfaces and never publish, renew or clear.

The one production typed constructor is:

```text
src/cli/flow-status-semantic-publisher.ts
  buildRootFlowPublishRequestV2(previous, semanticInput)
```

It is a pure function over already-explicit typed values. It performs no filesystem, Markdown,
directory, Git, operation-receipt, handoff, Review-Concept, verdict, prompt or transcript read.
The main-session orchestrator reads and reasons about authored Concepts, then supplies the closed
`RootFlowSemanticInputV2`. Tests import this exact exported function; no test-only transition
table is allowed.

The installed CLI entry is:

```text
omp-flow flow-status publish --host <host> --session <id> --actor-id <id> < semantic-input.json
omp-flow flow-status renew   --host <host> --session <id> --actor-id <id> < renew-input.json
omp-flow flow-status clear   --host <host> --session <id> --actor-id <id> < clear-input.json
```

`publish` loads the current validated v2 projection, calls the exact builder, and sends its
`RootFlowPublishRequestV2` to the portable receiver under the same process scope. `renew` and
`clear` use the exact mechanical lease/clear validators below. The installed entry never accepts
semantic fields from argv or environment.

## Explicit semantic builder input

```ts
type RootFlowSemanticInputV2 = {
  version: 2;
  capability: "rootFlowSemanticInputV2";
  requestId: Revision;
  expectedPreviousPublicationRevision: Revision | null;
  scope: {
    repositoryRoot: string;
    host: "claude" | "codex" | "oh-my-pi";
    hostSessionId: Id;
  };
  rootTask: {
    taskId: Id;
    title: string | null;
    selectionRevision: Revision;
  };
  orientation: {
    position: FlowPosition;
    movement: Movement;
    fromPosition: FlowPosition | null;
    resumeFrom: ResumeFrom | null;
    detailInput: FlowDetailInput;
    measureInput: BoundedMeasure | null;
  };
  workSetBaseline: WorkSetBaselineV2;
  drilldown: {
    wave: WaveDrilldownV2 | null;
  };
  publisher: {
    publisherId: Id;
    actorId: Id;
    sourceRevision: Revision;
    publicationRevision: Revision;
  };
  semanticObservedAtUnixMs: number;
  lease: {
    leaseId: Revision;
    leaseRevision: Revision;
    durationMs: number;
  };
};
```

```ts
type FlowDetailInput =
  | ExploreDetail
  | DesignDetail
  | Qbd1Detail
  | DecomposeDetail
  | Qbd2Detail
  | { kind: "execute" }
  | IntegrateDetail
  | WikiDetail
  | FinishDetail;
```

Execute aggregate/current detail is derived entirely from the complete Work-set baseline rather
than accepted as duplicate semantic input. Other variants already contain no derived Work
aggregate and retain their publication shape.

The builder applies the normative movement/counter/Execute rules from the publication interface,
derives the complete accepted attestation set/count/digest from `workSetBaseline`, verifies
position/measure/Wave relationships, and returns either the closed publish request or the common
failure envelope below. `previous` is the current same-scope stored publication or null; it is
used only for the reviewed latest-value transition table and never as semantic history.

## Main-session invocation obligations

The deployed `omp-flow` coordination Skill requires the main-session orchestrator to call the
production entry:

1. **Initial selection:** after explicit Bundle selection and initial authored orientation are
   known, call `publish` with `movement: initial` before claiming Flow Status available.
2. **Semantic transition:** call `publish` before displaying or waiting on every position/focus,
   meaningful Explore reframe, new independent audit attempt/calibration, work-set revision,
   current Work, review/rework round, integration, Wiki-harvest or Finish change.
3. **Accepted review:** after the orchestrator has explicitly read the linked current handoff and
   different-actor Review Concept, it supplies the complete current Work-set baseline and calls
   `publish`. The builder does not read those Concepts or accept a verdict path.
4. **Backtrack/reopen/resume:** call `publish` with the exact movement input before work continues.
   Resume uses a new host session and fresh lease; no old cache is copied.
5. **Wait/control turn:** at the beginning and end of every main-session control turn, and before
   each native wait, inspect remaining lease time. When no semantic change is pending and
   remaining time is at most 300,000 ms, explicitly revalidate selected task/session and the
   current publication source revision, then call `renew`. Native wait polling is capped so the
   main session regains control at least once per 300,000 ms while work remains active.
6. **Finish:** publish the Finish detail before completion audit/check/commit/archive work. Clear
   immediately after archive/selection clear.
7. **Invalidation:** selection change, explicit task clear, session end, Harness disconnect,
   publisher shutdown or user removal invokes `clear`. The main-session Harness integration may
   issue this mechanical callback with the already-bound scope/actor/lease; it supplies no Flow
   meaning. A publisher crash that cannot clear is handled by lease expiry.

Oh My Pi/Claude/Codex native task observations, provider/cache reads and footer renders are never
renew triggers and possess no lease token.

## Lease model

Every published root Flow carries a lease bound to canonical repository, host session, selected
root task, publisher actor, publication revision and source revision:

```ts
type RootFlowLeaseV2 = {
  leaseId: Revision;
  leaseRevision: Revision;
  ownerActorId: Id;
  selectionRevision: Revision;
  issuedAtUnixMs: number;
  expiresAtUnixMs: number;
  durationMs: number;             // 600,000..900,000
};
```

`expiresAtUnixMs == issuedAtUnixMs + durationMs`. A valid projection requires unexpired lease,
unchanged active selection revision, matching host session and no clear/disconnect tombstone.
For publish, the builder sets owner/selection from the explicit input,
`issuedAtUnixMs == semanticObservedAtUnixMs`, and derives expiry. Semantic observation time
remains unchanged across renewal.

The 10–15 minute lease is long enough for normal control-turn scheduling; renewal at a five-minute
threshold allows total Implement/Review waits far longer than the maximum single lease without a
daemon. If the main orchestrator/Harness cannot regain control, cannot revalidate unchanged
semantic source, crashes or disconnects, renewal fails and the root branch expires visibly.

## Renew request

```ts
type RootFlowRenewInputV2 = {
  version: 2;
  capability: "rootFlowLeaseRenewV2";
  requestId: Revision;
  scope: {
    repositoryRoot: string;
    host: "claude" | "codex" | "oh-my-pi";
    hostSessionId: Id;
  };
  rootTaskId: Id;
  expectedSelectionRevision: Revision;
  publisherActorId: Id;
  expectedPublicationRevision: Revision;
  expectedSourceRevision: Revision;
  expectedLeaseId: Revision;
  expectedLeaseRevision: Revision;
  renewedLeaseRevision: Revision;
  renewedAtUnixMs: number;
  durationMs: number;             // 600,000..900,000
  semanticAssertion: "unchanged";
};
```

Renew requires exact CLI/scope/actor/selection/session equality, current publication/source/lease
CAS, a live unexpired lease and no pending semantic transition known to the main orchestrator. It
changes only `leaseRevision`, `issuedAtUnixMs`, `expiresAtUnixMs`, `durationMs` and the enclosing
snapshot revision. It does not change semantic observation/source/publication revisions, counters,
details, baseline digest or native activity freshness. Exact retry is idempotent; stale,
concurrent or post-expiry renewal fails closed and requires a fresh semantic publish.

## Clear request

```ts
type RootFlowClearInputV2 = {
  version: 2;
  capability: "rootFlowClearV2";
  requestId: Revision;
  scope: {
    repositoryRoot: string;
    host: "claude" | "codex" | "oh-my-pi";
    hostSessionId: Id;
  };
  rootTaskId: Id;
  publisherActorId: Id;
  expectedPublicationRevision: Revision | null;
  expectedLeaseId: Revision | null;
  selectionRevision: Revision;
  reason:
    | "selection-changed"
    | "task-cleared"
    | "session-ended"
    | "disconnected"
    | "publisher-shutdown"
    | "archived"
    | "user-requested"
    | "removed";
  clearedAtUnixMs: number;
};
```

Clear validates canonical repository and exact bound scope. For selection/session callbacks it
may run after active selection disappeared, but the supplied `selectionRevision`,
publication/lease IDs and actor must match the cached scope. It atomically replaces `rootFlow`
with unavailable reason determined only by this closed mapping:

| Clear reason | Snapshot unavailable reason |
| --- | --- |
| `selection-changed`, `task-cleared`, `archived` | `selection-mismatch` |
| `session-ended` | `session-replaced` |
| `disconnected`, `publisher-shutdown` | `disconnected` |
| `user-requested`, `removed` | `cleared` |

It preserves independently valid native activity, rotates snapshot revision and invalidates the
lease. A missing scope is idempotent `already-clear`; mismatched scope/IDs fail and do not clear
another session.

## Common command result

Every command writes exactly one compact JSON line to stdout on success, writes nothing to stderr
and exits 0:

```ts
type RootFlowCommandSuccessV2 = {
  version: 2;
  command: "publish" | "renew" | "clear";
  state: "written" | "unchanged" | "cleared" | "already-clear";
  requestId: Revision;
  scope: {
    repositoryRoot: string;
    host: "claude" | "codex" | "oh-my-pi";
    hostSessionId: Id;
  };
  rootTaskId: Id;
  publicationRevision: Revision | null;
  sourceRevision: Revision | null;
  leaseId: Revision | null;
  leaseRevision: Revision | null;
  snapshotRevision: Revision | null;
  cacheKey: string | null;
};
```

Legal states are publish `written|unchanged`, renew `written|unchanged`, and clear
`cleared|already-clear`.

Validation/conflict failures write exactly one compact JSON line to stderr, nothing to stdout and
exit 2. Internal I/O/lock/serialization failures use the same envelope and exit 3:

```ts
type RootFlowCommandFailureV2 = {
  version: 2;
  command: "publish" | "renew" | "clear";
  state: "error";
  requestId: Revision | null;
  code:
    | "malformed"
    | "too-large"
    | "unsupported-version"
    | "invalid-relation"
    | "repository-mismatch"
    | "selection-mismatch"
    | "host-mismatch"
    | "session-mismatch"
    | "actor-mismatch"
    | "stale"
    | "expired"
    | "future"
    | "compare-failed"
    | "replay"
    | "conflict"
    | "not-published"
    | "io-failure";
  retryable: boolean;
};
```

Only `compare-failed`, `conflict` and `io-failure` may set `retryable: true`. No exception,
filesystem path, raw input or semantic prose is emitted. Builder-local schema/transition failures
use `command: publish`, exit 2 and the same envelope, so production and tests share one result
contract.
