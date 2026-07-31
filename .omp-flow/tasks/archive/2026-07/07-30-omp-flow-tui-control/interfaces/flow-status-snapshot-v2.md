---
type: "Interface"
title: "Flow Status Snapshot v2"
---

# Flow Status Snapshot v2

`FlowStatusSnapshotV2` is the sole canonical cache and presentation input after v2 cutover. It
assembles, but never conflates, the explicit selected root Task/Flow assertion and landed v1
native activity.

```ts
type FlowStatusSnapshotV2 = {
  version: 2;
  snapshotRevision: Revision;
  generatedAtUnixMs: number;
  scope: {
    repositoryRoot: string;
    host: "claude" | "codex" | "oh-my-pi";
    hostSessionId: Id;
  };
  rootFlow:
    | {
        state: "available";
        publication: RootFlowPublicationV2;
      }
    | {
        state: "unavailable";
        reason:
          | "unsupported"
          | "missing"
          | "expired"
          | "malformed"
          | "scope-mismatch"
          | "selection-mismatch"
          | "session-replaced"
          | "disconnected"
          | "cleared";
      };
  nativeActivity: FlowStatusSnapshotV1 | null;
};
```

Both versions use the exact host literals `claude`, `codex`, and `oh-my-pi`. The v2 implementation
revises any draft `"omp"` literal; there is no host-name normalization or compatibility guess.
An attached v1 snapshot must exactly match canonical repository root, host and host session and
remain independently fresh. Root publication freshness never refreshes native activity, and a
native observation never refreshes root Flow.

## One cache and one assembler

The canonical cache key remains SHA-256 of the JSON tuple
`[canonicalRepositoryRoot, host, hostSessionId]`. The sole path is:

```text
.omp-flow/.runtime/flow-status/<scope-sha256>.json
```

Its only accepted post-cutover envelope is:

```json
{
  "version": 2,
  "cachedAtUnixMs": 0,
  "snapshot": { "version": 2 }
}
```

The portable runtime owns one scope lock and one assembler:

- `status observe --host ... --session ...` continues accepting the reviewed **live v1 source
  observation**. Under the scope lock it validates the observation, constructs a v1
  `nativeActivity`, retains a currently fresh same-scope root branch if present, and atomically
  writes one complete v2 envelope.
- `flow-status publish` calls the production semantic builder and passes its explicit request to
  the portable receiver. Under the same lock and request CAS the receiver constructs the root
  branch, retains a currently fresh same-scope native branch if present, and atomically writes one
  complete v2 envelope.
- `flow-status renew` validates the current publication/source/lease CAS and selection/session
  binding, changes only lease and snapshot revisions, preserves independently fresh native
  activity, and performs one atomic v2 write.
- `flow-status clear` validates the closed scope/actor/selection/publication/lease input and
  performs one atomic v2 invalidation; a missing scope is idempotent and a mismatched scope cannot
  clear another session.
- selection clear/change, session replacement, disconnect or explicit clear performs one atomic
  v2 replacement/removal for that scope. It does not mutate the other session's scope.

Each command performs at most one authoritative cache write. There is no separate root-flow
cache, no v1 snapshot cache after cutover, no dual write, and no provider-side assembly. The
assembler may preserve only a valid same-scope branch from the current v2 envelope; otherwise it
stores null/unavailable. `snapshotRevision` is fresh on every successful replacement.

At package cutover, setup acquires the Flow Status scope locks, installs the v2 runtime/provider,
deletes or ignores all version-1 cache envelopes, and then enables the v2 status command. Product
code never reads a v1 cache envelope as compatibility input. New live v1 observations repopulate
`nativeActivity`; a new explicit publication populates `rootFlow`. Until each arrives it remains
independently unavailable. Rollback restores the v1 executable/config ownership and deletes v2
cache envelopes; it does not convert v2 data back to v1.

The cache remains ignored, reconstructable, safe to delete, at most 64 KiB per envelope, at most
eight scopes, and evicted after 24 hours. It stores latest projection only, not attestations,
semantic history, transitions or a lifecycle ledger.

Root validity uses the
[publisher lease](flow-status-publisher-v2.md), not native activity timestamps. A render may mark
an expired lease unavailable but cannot renew it. Long Implement/Review waits remain visible only
through explicit main-session renew calls; publisher crash/no control turn expires fail closed.

## ccstatusline v2 capability

Setup and doctor require a pinned reviewed build manifest containing all of:

```json
{
  "flowStatusWidgetV2": true,
  "flowStatusSnapshotV2": true,
  "flowStatusViewsV2": ["root-task", "flow"],
  "flowStatusSharedFrameReadV2": true
}
```

`flowStatusWidgetV1` alone is insufficient and must report v2 readiness unavailable. The v2 build
registers one widget kind and one provider/frame source. At the beginning of one ccstatusline
render frame, that source performs exactly one bounded regular-file read and validation, freezes
one immutable `FlowStatusSnapshotV2`, and passes it to both view instances. Neither instance calls
the cache. Thus one frame cannot combine Task from one snapshot revision with Flow from another.
The accepted supervisor and performance boundaries apply to this single read.

## Exact managed views and placement

The canonical objects are:

```json
{ "id": "omp-flow-root-task-v2", "type": "flow-status", "view": "root-task" }
{ "id": "omp-flow-flow-v2", "type": "flow-status", "view": "flow" }
```

IDs and views are inseparable. Unknown views, swapped views, duplicate IDs, another object using
either owned ID, or a modified owned object are conflicts.

The setup CLI exposes four independent placement arguments:

```text
--root-task-line <1>          default 1
--root-task-position <1..64> default 1
--flow-line <2>               default 2
--flow-position <1..64>       default 1
```

Line and position are one-based insertion points. The line arguments are explicit so preview,
automation and doctor can prove both placements, but v2 readiness requires root Task on line one
and Flow on line two. A position after the line's last node appends. Preview and machine-readable
result report both requested and resolved placements.

Fresh confirmed setup creates exactly:

```json
{
  "version": 3,
  "lines": [
    [
      { "id": "omp-flow-root-task-v2", "type": "flow-status", "view": "root-task" },
      { "id": "1", "type": "separator" },
      { "id": "2", "type": "model", "color": "cyan" },
      { "id": "3", "type": "separator" },
      { "id": "4", "type": "context-length", "color": "brightBlack" },
      { "id": "5", "type": "separator" },
      { "id": "6", "type": "git-branch", "color": "magenta" },
      { "id": "7", "type": "separator" },
      { "id": "8", "type": "git-changes", "color": "yellow" }
    ],
    [
      { "id": "omp-flow-flow-v2", "type": "flow-status", "view": "flow" }
    ]
  ],
  "powerline": {
    "enabled": true,
    "separators": ["\uE0B0"],
    "separatorInvertBackground": [false],
    "startCaps": ["\uE0B6"],
    "endCaps": ["\uE0B4"],
    "autoAlign": false,
    "continueThemeAcrossLines": false
  }
}
```

Task is therefore first; native model/context/Git retain their relative order and remain native
widgets. Existing configuration uses the explicit placements and shifts foreign nodes without
reordering them relative to one another. It never creates or targets a third line.

## Ownership manifest and one-way v1 cutover

The exact v2 ownership record is:

```ts
type FlowStatusSetupOwnershipV2 = {
  version: 2;
  capability: "flowStatusWidgetV2";
  configPath: string;
  providerDigest: string;
  buildRevision: string;
  widgets: [
    {
      id: "omp-flow-root-task-v2";
      type: "flow-status";
      view: "root-task";
      line: number;
      position: number;
      canonicalDigest: string;
    },
    {
      id: "omp-flow-flow-v2";
      type: "flow-status";
      view: "flow";
      line: number;
      position: number;
      canonicalDigest: string;
    }
  ];
  preInstall: { state: "absent" } | { state: "existing"; digest: string };
  managedPostInstallDigest: string;
};
```

Setup recognizes the exact prior ownership v1 record and exact
`omp-flow-flow-status-v1` widget only in the explicit `update` path. That one-time setup migration
is not a runtime cache compatibility reader.

The update transaction is:

1. Probe and stage the exact v2 build/provider/guard/supervisor; pass doctor capability and digest
   checks before config mutation.
2. Lock configuration and classify it against ownership. Foreign `flow-status`, duplicate,
   modified, swapped-view or unowned owned-ID objects are conflicts.
3. Write an ignored bounded pending record containing old/new config and ownership digests, both
   placements and staged artifact digests.
4. For a valid owned v1 installation, atomically replace the exact v1 node with both v2 nodes in
   one config write. For fresh/existing unowned config, atomically insert both v2 nodes. Never
   leave a committed one-view profile.
5. Atomically write ownership v2, then delete ownership v1 and the pending record.
6. Enable the v2 status command only after the config and ownership record agree. Then invalidate
   v1 cache envelopes.

If any pre-enable step fails, restore the exact old config/ownership and v1 command/artifacts.
Interrupted recovery compares only recorded digests: old state discards pending; complete new
config plus matching ownership completes cleanup; new config with missing v2 ownership writes the
already-staged manifest then continues; any other/mutated state stops as conflict without
overwriting user data.

Idempotent update requires both exact nodes, canonical digests, requested placements and v2
ownership to agree. A valid v2 manifest with one exact node missing is `partial-owned`: preview
may atomically restore the missing canonical node after confirmation if its slot is free; it
never silently repairs. A modified node, duplicate, swapped view or occupied required slot is
conflict.

Removal with a valid manifest atomically removes both exact canonical nodes. In `partial-owned`,
confirmed removal deletes the remaining exact owned node and manifest but leaves foreign or
modified content untouched. Fresh absence is restored only when the whole managed config still
matches `managedPostInstallDigest`; otherwise only owned nodes are removed. Provider/build/guard
removal occurs only after config no longer references them. Failure restores both nodes and the
manifest; no singular ownership record is committed.

## Rendering contract

Full:

```text
 Task · 07-30-omp-flow-tui-control · TUI control  Sonnet 4  ctx 38%  main +5 
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

Compact:

```text
Task · TUI control | Sonnet 4 | ctx 38% | main +5
Flow 6/9 Execute | Work 4/13 | Review R2
```

If title is present, width priority is full `ID · title`, then friendly `title`, then an
ellipsized title. If title is null, it is full ID then a middle-ellipsized ID. This deliberately
implements the Wiki rule that explicit friendly title may replace full ID under width pressure.
The provider never derives title. The `Task ·` label remains attached.

Flow-row priority is: blocking attention; Flow index/position; labelled measure; current
Work/review detail; movement; freshness/prose. A bar becomes the same atomic labelled ratio
before removal. `Flow n/9 Label` is the minimum valid Flow fact. At most one bar is rendered.

Exact unavailable behavior:

- fresh valid root publication: both views render from the same frame snapshot;
- root unavailable for any reason: `root-task` renders `Task · unavailable` (or `Task ?` below
  18 display columns); `flow` is semantic empty, so its otherwise-empty second line and
  separators collapse;
- fewer than 6 display columns: `root-task` is also semantic empty and native first-row widgets
  remain; and
- native activity absence never changes either v2 view.

Wave is semantic-empty in both persistent views regardless of width. It appears only in
`status inspect`/managed Skill detail with its explicit revision, work-set scope, ordinal/total and
focus Work IDs.
