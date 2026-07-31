---
type: "Interface"
title: "Root Flow Publication v2"
---

# Root Flow Publication v2

This interface is the closed semantic boundary between the one main-session omp-flow
orchestrator and Flow Status. It realizes the
the observable-flow direction at
`.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`
without turning authored task knowledge into runtime-owned lifecycle state.

The orchestrator interprets the selected Bundle Concepts and constructs the complete request.
Python validates only the closed envelope, exact scope/selection/caller relationships, local
relational invariants and latest-value compare-and-swap. Python, adapters, cache and providers
must not discover title, Flow position, round, attempt, Work, handoff, verdict or measure by
parsing Markdown, paths, directories, roles, native tasks, receipts, Git, prompts or transcripts.

## Primitive bounds

All objects reject unknown keys. Required nullable members are present with JSON `null`; optional
members are explicitly marked below. Integers are base-10 JSON integers. Strings reject C0/C1
controls and unpaired surrogates.

| Primitive | Bound |
| --- | --- |
| `Host` | exactly `"claude"`, `"codex"`, or `"oh-my-pi"` |
| `Id` | 1–128 UTF-8 bytes |
| `Revision` / request ID | 16–128 ASCII letters, digits, `.`, `_`, `-`, `:` |
| canonical repository root | absolute canonical UTF-8 path, at most 1,024 bytes |
| task title / Work title / Wave title | null or 1–96 display columns |
| focus/detail text | null or 1–160 display columns |
| actor ID | 1–128 UTF-8 bytes |
| timestamp | integer Unix milliseconds, nonnegative and no more than 30 seconds in the future |
| lease duration | integer 600,000–900,000 |
| round/attempt | integer 0–99 where the variant gives the exact lower bound |
| Work/check totals | integer 0–64 |

The complete request is at most 256 KiB. The canonical stored snapshot remains at most 64 KiB.
Arrays have the explicit maxima below.

## Production construction and command surface

The exact managed Skill, typed production builder, installed
`omp-flow flow-status publish|renew|clear` entries, main-session invocation obligations, lease
renewal, clear schema, success/failure JSON streams and exit codes are normative in
[Flow Status semantic publisher v2](flow-status-publisher-v2.md).

The builder constructs this request from explicit orchestrator-authored input. The portable
receiver accepts only its closed output and performs mechanical validation/atomic assembly.
Failure never replaces or refreshes the previous snapshot. Selection/session/disconnect clear and
lease expiry invalidate root authority; an old session cannot be copied into a new one.

## Publish request

```ts
type RootFlowPublishRequestV2 = {
  version: 2;
  capability: "orchestratorFlowPublicationV2";
  requestId: Revision;
  expectedPreviousPublicationRevision: Revision | null;
  scope: {
    repositoryRoot: string;
    host: Host;
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
    detail: FlowDetail;
    measure: BoundedMeasure | null;
  };
  workSetBaseline: WorkSetBaselineV2;
  executeAcceptance: AcceptedWorkAttestationV2[] | null;
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
  lease: RootFlowLeaseV2;
};
```

`workSetBaseline` is required on every request and `executeAcceptance` is non-null only for
Execute. Both are request-scoped source assertion data: the production builder derives
attestations from the baseline, the receiver compares them, and the cache stores only catalog
revision/digest plus accepted count/set revision/digest represented in Execute detail. Both lists
are discarded after the atomic write and are never an Evidence ledger.

The successful command stores this exact canonical form; it is the
`RootFlowPublicationV2` referenced by the snapshot:

```ts
type RootFlowPublicationV2 = {
  version: 2;
  capability: "orchestratorFlowPublicationV2";
  requestId: Revision;
  requestDigest: string;          // exactly 64 lowercase hex
  scope: {
    repositoryRoot: string;
    host: Host;
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
    detail: FlowDetail;
    measure: BoundedMeasure | null;
  };
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
  lease: RootFlowLeaseV2;
};
```

`requestDigest` is SHA-256 over canonical UTF-8 JSON of the full publish request, including the
request-only attestation set. It supports exact retry/conflict detection but cannot reconstruct
discarded attestations.

## Flow vocabulary

```ts
type FlowPosition =
  | "explore"
  | "design"
  | "qbd-1"
  | "decompose"
  | "qbd-2"
  | "execute"
  | "integrate"
  | "wiki"
  | "finish";

type Movement = "initial" | "same" | "forward" | "backtrack" | "resume" | "reopen";

type ResumeFrom = {
  hostSessionId: Id;
  publicationRevision: Revision;
  position: FlowPosition;
};
```

The renderer owns the fixed indexes: Explore 1, Design 2, QbD 1 3, Decompose 4, QbD 2 5,
Execute 6, Integrate 7, Wiki 8 and Finish 9. The index is reversible orientation, never overall
completion.

Movement relations are exact:

- `initial`: `expectedPreviousPublicationRevision`, `fromPosition` and `resumeFrom` are null.
- `same`: a previous revision is required; `fromPosition == position`; `resumeFrom` is null.
- `forward`: a previous revision is required; index(`fromPosition`) < index(`position`);
  `resumeFrom` is null. Skipping indexes is legal and proves no skipped gate complete.
- `backtrack`: a previous revision is required; index(`fromPosition`) > index(`position`);
  `resumeFrom` is null. Skipping indexes is legal.
- `reopen`: a previous revision is required; index(`fromPosition`) >= index(`position`);
  `resumeFrom` is null. It means the publisher is reactivating authored work previously left or
  treated as closed; the runtime does not prove that history.
- `resume`: this scope's expected previous revision is null, `fromPosition == position`, and
  non-null `resumeFrom` names a different prior host session and its final asserted position.
  The runtime validates only shape/different session; it does not read old semantic history.

For non-initial same/forward/backtrack/reopen, `fromPosition` must equal the position in the
currently cached publication selected by CAS. `publicationRevision`, `requestId` and
`sourceRevision` must differ from the current values. The runtime retains only current request
ID/digest and revision. Thus an old write fails CAS; a concurrent pair has one winner; an exact
winner retry is idempotent; a conflicting reuse is `replay`/`conflict`. Arbitrary historical
replay detection is not claimed.

Round, attempt, calibration, reframe and reopen truth are semantic assertions of the sole
orchestrator. The validator checks only the current closed variant and the movement relations
above. Pure publisher tests, driven by authored input fixtures, prove the cross-publication rules;
the latest cache does not retain or compare semantic history.

The sole publisher applies this semantic transition table before constructing the request:

- first entry into Explore is round 1; Brainstorm/Research alternation and ordinary `same` keep
  the round; a material `reframe` reason increments exactly once; resume never increments;
  backtrack/reopen into Explore requires non-`none` reframe and the next authored Explore round;
- the first independent QbD 1, QbD 2 or completion audit is attempt 1 in its own scope; verdict or
  calibration updates keep the attempt; a newly identified independent audit begins at prior
  authored attempt + 1 with verdict `pending`; resume keeps it; reopen for a fresh audit follows
  the same +1 rule;
- initial Work implementation uses review/rework 0; publishing the first review starts review 1;
  changes requested keeps that review number and starts/increments rework; the next independent
  review is prior review + 1; acceptance keeps that review number; resume changes neither;
- accepted Work is recomputed from the complete current attestation input on every Execute
  publication. It may rise, fall or become zero after a new work-set revision/reopen; it is never
  copied from the previous numerator without current attestations;
- for one unchanged work-set revision, Work total and Work identities are stable; authored
  decomposition revision produces a fresh work-set revision and may change both; and
- for one unchanged measure unit-set revision, denominator/unit/label stay fixed. A changed
  denominator requires a fresh unit-set/source revision; attempts, rounds and movement never
  advance the measure.

These are construction rules for the main-session orchestrator and executable pure publisher
tests. The runtime's latest-value validator is deliberately not a transition engine.

## Closed `FlowDetail` union

The `kind` must exactly equal `orientation.position`.

```ts
type ExploreDetail = {
  kind: "explore";
  mode: "brainstorm" | "research";
  round: number;                 // 1..99
  focus: string | null;
  reframe: "none" | "evidence" | "synthesis" | "audit" | "review" | "implementation";
};

type DesignDetail = {
  kind: "design";
  focus: "prd" | "design" | "decision" | "interface";
  detail: string | null;
};

type Qbd1Detail = {
  kind: "qbd-1";
  auditId: Id;
  attempt: number;               // 1..99
  verdict: "pending" | "fail" | "needs-evidence" | "pass";
  calibration: "not-requested" | "awaiting" | "approved" | "rejected";
  sourceRevision: Revision;
};

type DecomposeDetail = {
  kind: "decompose";
  workSetRevision: Revision;
  workTotal: number;             // 0..64
  focus: string | null;
};

type Qbd2Detail = {
  kind: "qbd-2";
  auditId: Id;
  attempt: number;               // 1..99
  verdict: "pending" | "fail" | "needs-evidence" | "pass";
  calibration: "not-requested" | "awaiting" | "approved" | "rejected";
  sourceRevision: Revision;
};

type ExecuteCurrentWork = {
  workId: Id;
  title: string | null;
  workRevision: Revision;
  focus: "implement" | "review" | "rework" | "accepted";
  reviewRound: number;           // 0..99
  reworkRound: number;           // 0..99
  reviewVerdict: "none" | "pending" | "changes-requested" | "accepted";
  handoffRevision: Revision | null;
};

type ExecuteDetail = {
  kind: "execute";
  workSetRevision: Revision;
  workTotal: number;             // 0..64
  workCatalogRevision: Revision;
  workCatalogDigest: string;     // exactly 64 lowercase hex characters
  acceptedWork: number;          // 0..workTotal
  acceptanceSetRevision: Revision;
  acceptanceDigest: string;      // exactly 64 lowercase hex characters
  currentWork: ExecuteCurrentWork | null;
};

type IntegrateDetail = {
  kind: "integrate";
  focus: "checks" | "package" | "cutover";
  detail: string | null;
};

type WikiDetail = {
  kind: "wiki";
  focus: "harvest" | "curate" | "link";
  detail: string | null;
};

type CompletionAudit = {
  auditId: Id;
  attempt: number;               // 1..99
  verdict: "pending" | "fail" | "needs-evidence" | "pass";
  calibration: "not-requested" | "awaiting" | "approved" | "rejected";
  sourceRevision: Revision;
};

type FinishDetail = {
  kind: "finish";
  focus: "completion-audit" | "checks" | "commit" | "archive";
  completionAudit: CompletionAudit | null;
  detail: string | null;
};

type FlowDetail =
  | ExploreDetail
  | DesignDetail
  | Qbd1Detail
  | DecomposeDetail
  | Qbd2Detail
  | ExecuteDetail
  | IntegrateDetail
  | WikiDetail
  | FinishDetail;
```

Additional invariants:

- Explore mode may alternate with the same round. `reframe != "none"` asserts a meaningful
  evidence-driven increment/reopen; messages, tools, files and time are never a reason.
- For QbD and completion audit, `calibration == "approved"` requires verdict `pass`; a model pass
  alone may remain `not-requested` or `awaiting`.
- `Finish.completionAudit` is non-null iff focus is `completion-audit`; otherwise it is null.
  QbD 1, QbD 2 and completion audit never share an attempt counter.
- Execute `currentWork` is null iff `acceptedWork == workTotal`, including the empty set.
- Execute requires an available complete `workSetBaseline`; work-set/catalog revisions, total and
  catalog digest must match it.
- Initial implementation is exactly focus `implement`, round 0, rework 0, verdict `none`,
  handoff null.
- A first or later review is focus `review`, review round 1..99, verdict `pending`, handoff
  non-null. Later review after rework has rework round 1..99.
- Changes requested/rework is focus `rework`, review round 1..99, rework round 1..99, verdict
  `changes-requested`, handoff non-null.
- An accepted current Work is focus `accepted`, review round 1..99, verdict `accepted`, handoff
  non-null, and has one exact matching acceptance attestation. A following publication normally
  selects another Work or uses null when all are accepted.
- `reviewVerdict == "none"` iff the initial implementation combination holds. No other
  focus/verdict combination is legal.

## Complete request-only Work-set baseline

```ts
type WorkSetBaselineV2 =
  | {
      state: "unavailable";
      reason: "not-authored" | "not-required" | "not-supplied";
    }
  | {
      state: "available";
      workSetRevision: Revision;
      catalogRevision: Revision;
      workTotal: number;          // 0..64, equals works.length
      currentExecution:
        | null
        | {
            workId: Id;
            focus: "implement" | "review" | "rework" | "accepted";
            reworkRound: number;  // 0..99
          };
      works: WorkCatalogEntryV2[];
    };

type WorkCatalogEntryV2 = {
  workId: Id;
  title: string | null;
  currentWorkRevision: Revision;
  currentHandoff:
    | null
    | {
        workRevision: Revision;
        handoffRevision: Revision;
        implementerActorId: Id;
      };
  currentIndependentReview:
    | null
    | {
        workRevision: Revision;
        handoffRevision: Revision;
        reviewId: Id;
        reviewRevision: Revision;
        reviewerActorId: Id;
        reviewRound: number;      // 1..99
        independence: "different-actor";
        result: "pending" | "changes-requested" | "accepted";
      };
};
```

Available `works` is the publisher's complete current catalog for that work-set revision, with
unique `workId` and at most 64 entries. Every handoff's work revision equals its entry's current
Work revision. A review is null unless a current handoff exists; otherwise its Work/handoff
revisions equal that exact current handoff. The canonical Work-ID-sorted JSON SHA-256 is the
catalog digest.

`currentExecution`, when non-null, names exactly one catalog Work. The builder combines its focus
and rework round with that Work's current handoff/review to derive `ExecuteCurrentWork` and enforce
the exact legal combinations. It is null iff every catalog Work derives as accepted, including an
empty set.

Execute and any `accepted-work` measure require an available baseline. Execute's Work-set,
catalog revision/digest and total equal it. `currentWork`, when non-null, matches the catalog
entry's ID/title/current Work revision and current handoff/review facts. Decompose requires an
available baseline once it publishes a nonzero Work total; other positions may carry an available
catalog for continuity or one explicit unavailable reason.

The baseline is explicit authored input supplied by the main-session orchestrator. Neither the
production builder nor receiver reads Work/Handoff/Review files to construct it. It is discarded
after validation and one atomic write; only the Execute catalog revision/digest and aggregate
survive.

## Accepted-Work source assertion

```ts
type AcceptedWorkAttestationV2 = {
  workSetRevision: Revision;
  workId: Id;
  workRevision: Revision;
  handoffRevision: Revision;
  implementerActorId: Id;
  reviewId: Id;
  reviewRevision: Revision;
  reviewerActorId: Id;
  reviewRound: number;            // 1..99
  independence: "different-actor";
  result: "accepted";
};
```

For Execute, the list length equals `acceptedWork`, has at most 64 entries and unique `workId`.
The builder derives exactly one entry for every baseline Work whose current handoff has a current
independent review with result `accepted`. Every attestation must exactly equal that baseline
Work/handoff/review, its work-set revision equals Execute's, reviewer differs from the current
handoff implementer, and all revision/identity fields are nonempty. Its canonical sorted JSON SHA-256 equals
`acceptanceDigest`; `acceptanceSetRevision` is the publisher's fresh revision for that exact set.
An accepted current Work matches one entry on work ID/revision/handoff/review round. A previous
revision for **any** catalog Work or handoff, same-actor review, missing/mismatched current review
identity, non-accepted result, duplicate Work, omitted currently accepted catalog Work, extra
attestation or stale work-set/catalog revision is rejected.

An `accepted-work` measure must use `current == acceptedWork`, `total == workTotal`,
`unitSetRevision == workSetRevision`, and `sourceRevision == acceptanceSetRevision`. Conflicting
duplicate ratios are rejected. The runtime checks these local relations without reading a handoff
or Review Concept.

## One bounded measure

```ts
type BoundedMeasure = {
  owner:
    | "explore-local"
    | "design-local"
    | "audit-local"
    | "work-map-local"
    | "accepted-work"
    | "integration-checks"
    | "wiki-harvest"
    | "finish-checks";
  label: string;                  // 1..32 display columns
  current: number;                // 0..total
  total: number;                  // 1..64
  unit: string;                   // 1..24 display columns
  unitSetRevision: Revision;
  sourceRevision: Revision;
};
```

Owner must match the position: Explore `explore-local`, Design `design-local`, QbD 1/2
`audit-local`, Decompose `work-map-local`, Execute `accepted-work`, Integrate
`integration-checks`, Wiki `wiki-harvest`, Finish `finish-checks`. Flow index, round, attempt,
native task/receipt count, tokens, context, cost, Git and elapsed time are invalid. Zero or one
measure is legal. The renderer may turn its bar into the same labelled ratio but never substitute
a denominator.

## Wave drill-down

```ts
type WaveDrilldownV2 = {
  waveId: Id;
  title: string | null;
  revision: Revision;
  workSetRevision: Revision;
  ordinal: number;                // 1..total
  total: number;                  // 1..64
  focusWorkIds: Id[];             // 0..64 unique values
};
```

Wave is non-null only for Decompose, Execute or Integrate, and its work-set revision must equal the
detail's work-set revision where that detail has one. `ordinal/total` is schedule orientation, not
the graphical measure. Both persistent views ignore Wave. Only the explicit read-only detail
surface may render it.

## Authority and degradation

Root authority is valid only while its
[publisher lease](flow-status-publisher-v2.md) is unexpired, active selection revision, canonical
repository, host session, root task and publisher actor still match, and no scoped clear or
disconnect invalidated it. Semantic observation time is provenance, not a 30-second TTL. Only the
main-session production publisher may renew after explicitly asserting unchanged semantics;
native v1 observations, cache reads and render frames never extend the lease.

Missing, expired, stale-selection, mismatched, malformed, unsupported or disconnected publication
yields a closed root-Flow unavailable reason. Consumers do not fall back to v1
role/path/task counts. Native v1 activity may remain independently available under its own
freshness.
