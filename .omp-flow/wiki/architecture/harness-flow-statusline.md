---
type: "Architecture"
title: "Harness-native Flow Status line"
---

# Harness-native Flow Status line

Flow Status v2 makes one selected root Task and its current methodology Flow legible without
turning the Bundle into machine lifecycle state. The durable counting rationale is in
[Observable methodology without lifecycle state](../philosophy/observable-flow-without-lifecycle-state.md);
the schemas, decisions, evidence, and verification remain linked from the
[archived TUI Flow Status Bundle](../../tasks/archive/2026-07/07-30-omp-flow-tui-control/index.md).

## Visible model

The preferred Claude presentation is two Powerline rows:

```text
 TUI 状态栏返工  Opus  ctx 42%  main* 
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

Row 1 identifies the root Task and preserves ccstatusline's native model, context, and Git facts.
Row 2 shows the reversible Flow position and its most useful bounded detail. There is at most one
labelled graphical bar. Wave is available in detail inspection but not in the persistent views.

The nine positions are Explore, Design, QbD 1, Decompose, QbD 2, Execute, Integrate, Wiki, and
Finish. They describe current reasoning orientation, not an irreversible phase machine or a
percentage of total completion. Brainstorm and Research share the Explore spiral. Explore rounds,
QbD attempts, and per-Work review/rework rounds advance only at their explicitly defined semantic
boundaries.

## Authority and data flow

```text
Bundle Concepts
  → main-session semantic interpretation
  → sole Root Flow publisher
  → closed portable receiver + CAS + lease
  → one scoped v2 cache envelope
  ├─ rootFlow publication
  └─ nativeActivity (optional, independently fresh)
      ↓
  Harness-native presentation
```

The publisher receives already-authored semantic input and produces the closed
`orchestratorFlowPublicationV2` request. It is the only production constructor. It does not read
the filesystem, Markdown, Git, operation receipts, handoffs, reviews, prompts, or transcripts.
For Execute it requires a complete current Work catalog and derives current Work, accepted Work,
catalog/acceptance digests, and independent-review attestations from that catalog.

The Python receiver validates only the closed request and mechanical relations: exact repository,
host, session, selected Task, actor, revisions, movement, bounded counts, Work relations, CAS,
lease, size, lock, and cache limits. It performs one atomic cache write. It never infers task
meaning or Flow position from authored Markdown.

Root authority uses a 10–15 minute lease. The main-session publisher explicitly renews while the
same semantic assertion remains current, no later than five minutes between renewals. Providers,
renderers, observers, and read-only inspection cannot renew it. Selection changes, task clearing,
archive, session end, disconnect, and publisher shutdown explicitly clear it. Expiry removes only
root authority; independently fresh `nativeActivity` may remain visible with a native label.

## Harness boundaries

### Claude Code

The reviewed `@omp-flow/ccstatusline@2.2.27-flowstatus.2` build is pinned to upstream revision
`83c8ffd551ec700fceeed98fe9ab50de84cb49fa`. Its capability probe must return the exact v2 quartet:

```json
{
  "flowStatusWidgetV2": true,
  "flowStatusSnapshotV2": true,
  "flowStatusViewsV2": ["root-task", "flow"],
  "flowStatusSharedFrameReadV2": true
}
```

The two exact managed widgets are `omp-flow-root-task-v2/root-task` and
`omp-flow-flow-v2/flow`. A single provider instance reads and validates the scope once per
ccstatusline frame and supplies both views. Powerline styling, terminal-width degradation, model,
context, and Git rendering remain ccstatusline responsibilities.

Claude's structured observer maintains only a fresh complete native TaskList baseline and
correlated task/attention events. The five managed omp-flow agents receive `TaskUpdate` but not
`Agent`. A PreToolUse guard authorizes only one fresh identity binding and bounded progress for
the exact bound task; status, owner, dependency, or another task mutation is denied. PostToolUse
commits only an exact successful response. Failure, replay, expiry, owner change, subagent stop,
session replacement, or malformed evidence revokes authority.

### Oh My Pi

The adapter is positively pinned to `@oh-my-pi/pi-coding-agent` 17.2.1 and revision
`7a2ced50bea8b97dbab7d9bd579329c4ea704de0`. It owns only the `flow-status` keyed status
contribution and read-only command. Its structured native task batch is published as
`nativeActivity`; it never supplies root Task/Flow semantics.

### Codex

The project installs the read-only `$flow-status` detail Skill. Stock Codex TUI is not claimed to
support an arbitrary third-party persistent footer, so omp-flow does not modify
`tui.status_line`. When a supported native surface exists, it can consume the same v2 snapshot
without changing the semantic publisher or receiver.

## Setup and failure behavior

`flow-status setup|update` requires explicit binary, package metadata, ccstatusline config, Claude
settings, scope, and the two line/position placements. It verifies the exact package, revision,
capability quartet, TaskUpdate guard, hook matcher, and managed-agent tools before writing. Fresh
setup creates the Powerline two-row default; existing configs preserve unrelated widgets, theme,
and Powerline settings. Foreign, duplicate, modified, swapped, or partial-owned states fail
closed or require explicit recovery.

The supervisor executes only the pinned absolute renderer and managed config, with no shell. It
bounds stdin to 1 MiB, output to 64 KiB, and presentation to 400 ms. Timeout stops acceptance,
closes stdin, requests default child termination, closes pipes, detaches cleanup, and immediately
returns semantic empty. Doctor is read-only and never executes a command recovered from Claude
settings.

The ownership record enables exact idempotent update and removal. Pending records and same-directory
atomic replacement recover the preceding complete document set after interrupted multi-file
commits. Runtime/cache state stays ignored; Bundle and Wiki knowledge stays Git-visible.

## Non-goals

Flow Status does not add a lifecycle database, Markdown parser, Evidence ledger, generated context
package, exact-topology grammar, compatibility reader, custom dispatcher, or second renderer. A
cached display is never control authority. Native task totals are never relabelled as root Task,
Work, Wave, or overall completion.
