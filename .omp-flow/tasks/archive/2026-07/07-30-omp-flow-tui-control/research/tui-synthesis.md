---
type: "Synthesis"
title: "Selected synthesis: an omp-flow operator console"
---

# Selected synthesis: an omp-flow operator console

> Superseded on 2026-07-30 by the
> [status-line synthesis](statusline-synthesis.md) after the user clarified that the intended
> product is an embedded terminal status line, not a standalone full-screen TUI. This Concept is
> retained as investigation history and remains the subject of the earlier QbD audit.

This synthesis combines the linked
[repository](internal-observability-seams.md),
[Claude Code](claude-code-tui-landscape.md), and
[Codex](codex-tui-landscape.md) evidence. It selects a direction for design; it does not authorize
implementation.

## Decision

Design a terminal-first **omp-flow operator console** with two adjacent but non-collapsed planes:

1. an authored Bundle view for durable task meaning, navigation, Git-visible artifacts, and direct
   opening of Concepts; and
2. an ephemeral live-execution view populated by thin, capability-declared Harness adapters.

The console is not a scheduler, dispatcher, lifecycle database, transcript index, or replacement
Harness. It does not manufacture percentages or phase state. It observes, correlates, navigates,
and delegates supported controls back to the Harness that owns the native session.

## Why this direction wins

| Direction | Strength | Disqualifying cost |
|---|---|---|
| tmux/PTY supervisor | Works with almost any terminal program; proven by Claude Squad and Agent Deck | Pane churn and prompt text are heuristic. They cannot safely authorize approval, cancellation, or semantic progress and are weak on native Windows. |
| Transcript/session database dashboard | Rich history, search, analytics, and cost views; demonstrated by ccboard and CloudCLI | Couples to private or changing formats, duplicates provider state, and invites a second task/lifecycle database. |
| Embedded UI in each Harness only | Maximum native fidelity and control | Cannot provide one cross-Harness view; repeats the same Bundle/runtime presentation and leaves no coherent operator surface. |
| One new universal agent host | Could normalize launch, events, approvals, and cancellation | Takes spawn/session ownership from the Harnesses, becomes a custom dispatcher, and narrows compatibility to sessions it launches. |
| **Hybrid operator console** | Cross-Harness view with native event fidelity and safe delegated controls | Requires explicit capability negotiation and honest degraded states. This complexity represents real platform differences instead of hiding them. |

The mature projects contribute presentation patterns—attention-first sorting, session grouping,
preview before attach, worktree context, diff adjacency, recoverable archive, explicit destructive
actions, and freshness indicators. Their shadow state, transcript parsing, pane inference,
worktree ownership, and automatic approval are counterexamples for omp-flow's architecture.

## Source-of-truth model

The console composes observations without promoting them into a new authoritative store:

| Plane | Owner | Console use | Forbidden inference |
|---|---|---|---|
| Bundle Concepts and authored indexes | Git-tracked task Bundle | Show/open raw authored navigation, recent file changes, and linked design/work/handoff/review material | Phase, verdict, approval, topology, percentage, or completion derived from Markdown |
| Portable runtime snapshot | omp-flow Python kernel | Show selected task and mechanical operation receipts, actor/role, entry/output paths, predecessor, timestamps, and terminal receipt state | Native process liveness, activity, cancellation, acceptance, or ETA |
| Claude observations | Claude Code supervisor commands, hooks, status data, or SDK for adapter-owned runs | Show Claude work state, process liveness, waiting reason, activity, session identity, context/cost enrichment, and supported actions | Taking over an arbitrary session, treating a hook as current state, or reading private supervisor/transcript storage |
| Codex observations | Codex app-server; `exec --json` only for adapter-owned batch runs | Show thread/turn/item state, plan/diff updates, waiting requests, usage, replay/live status, and supported actions | Treating replay as live, treating `notify` as a lifecycle, or sending guessed terminal keys |
| OMP observations | Native OMP task/job and extension events | Show native actor/job progress, completion delivery, and supported cancellation/interaction | Reconstructing Harness state from Python receipts |

The console may maintain an in-memory projection and a bounded screen-local timeline. Restart or
reconnect always re-queries authoritative snapshots and marks gaps. No append-only semantic event
ledger or cross-session lifecycle database is introduced.

## Correlation rule

Correlation uses existing mechanical identity, never prompt parsing:

- an omp-flow operation supplies the opaque receipt, role, task, entry/output paths, and bound
  actor ID;
- Harness adapters report native session/job/actor identity and observation provenance;
- an operation and native activity are shown as bound only on an exact, verified actor/session
  mapping established by the adapter;
- otherwise each remains visible as **unbound**. Matching by cwd, title, prompt text, timestamps,
  filenames, or terminal output is forbidden.

The UI must preserve three different statuses:

1. **authored evidence** — which Concepts exist or changed;
2. **mechanical receipt** — active/completed/failed correlation;
3. **native execution** — provider-specific live, waiting, idle, interrupted, failed, or
   disconnected observations.

None silently overwrites another.

## Capability model

Every target advertises its current capabilities and source freshness. Controls are absent or
disabled when the proof is missing.

| Capability | Portable runtime | Claude adapter | Codex adapter | Degraded PTY/tmux |
|---|---|---|---|---|
| Inspect Bundle/operation | Yes | Enrichment only | Enrichment only | No |
| Preview/logs | Snapshot paths only | Native logs/peek or SDK stream | App-server items or owned JSONL stream | Captured screen, labelled inferred |
| Attach/focus | No | Native `attach` where available | Native/remote TUI connection when supported | Terminal attach |
| Steer/reply | No | Native reply or adapter-owned SDK input | `turn/steer` / native user-input response | Disabled |
| Interrupt | No | Native stop or adapter-owned SDK interrupt | Correlated `turn/interrupt` | Separate hard process stop, not equivalent |
| Approve/deny | No | Only while adapter owns the unresolved native request | Only while adapter owns the unresolved server request | Disabled |
| Resume/respawn | No | Native resume/respawn capability | `thread/resume` or owned exec resume | Provider-specific attach only |
| Delete/worktree mutation | Archive only through kernel | Outside shared first release | Outside shared first release | Disabled |

An acknowledgement must retain provider, native target/request ID, requested action, outcome,
time, and error. It remains ephemeral operational evidence; it is not a human workflow approval
Concept.

## Progress presentation

The product should answer four operator questions without a fake progress bar:

- **What durable artifact are we working from or toward?** Entry and output Concepts, shown as
  paths with direct open actions.
- **What is happening now?** Native current activity such as a command, tool, plan step, diff
  update, subagent task, or waiting reason.
- **What needs me?** Approval, question, disconnected/stale adapter, failed operation, or
  unreviewed/unbound result, each with provenance.
- **What changed?** Git-visible Bundle/code changes and native diff summaries, without interpreting
  their semantic acceptance.

Time, token/context use, plan-step counts, file changes, and operation age are useful measured
facts. A percent complete or ETA is not justified unless the owning Harness explicitly supplies
it with defined semantics.

## Product shape handed to design

The first coherent release should be a standalone `omp-flow tui` operator surface inside the
existing TypeScript package, plus thin installed adapters for configured Harnesses. Being
standalone gives one cross-Harness view; being adapter-driven preserves Harness ownership.

The release should include:

- a task header with selected Bundle, Git state, adapter connectivity, and observation freshness;
- an attention-sorted native session/actor list;
- side-by-side Bundle/operation detail and native activity detail;
- a compact event timeline that is rebuilt from current connections rather than treated as
  history;
- direct open, preview, attach/focus, and exact native interrupt where capability-proven;
- an action palette that explains why an unavailable action is disabled;
- explicit live, replay, snapshot, heuristic, stale, disconnected, and unbound badges;
- keyboard-only operation, narrow-terminal fallback, and UTF-8-safe Windows behavior.

Approval relay, steering, Claude SDK-owned runs, destructive session removal, worktree mutation,
aggregate analytics, remote multi-user access, and durable event history should not all be forced
into the first slice. The design may stage capability-proven approval/steering after the read and
interrupt seams are verified end to end.

## Risks that design must resolve

- The current deployed project runtime is pre-cutover while the canonical template kernel is OKF
  v0.2. Product implementation must update canonical and owned deployed copies together only when
  safe; the console cannot add a compatibility reader.
- Claude agent view remains a research preview. The adapter must version-probe and degrade to
  hooks or observation-only mode without reading private supervisor files.
- Codex app-server evolves and contains experimental methods. Generate or negotiate the installed
  schema and distinguish stable from experimental capabilities.
- No current shared stream enumerates all Harness sessions. Discovery policy, adapter startup,
  reconnect, and multi-instance collision behavior need explicit interfaces.
- Windows cannot assume tmux or Unix sockets. The conservative first transport is child-process
  stdio or loopback/named-pipe behavior proven by tests.
- Native IDs may change across restart or respawn. The console must show broken bindings and ask
  the normal coordinator to establish new operations; it must never repair receipt state itself.

## Source provenance

Exact upstream URLs, revisions, useful anchors, dated maturity observations, and caveats are
recorded directly in the Claude and Codex research Concepts. Separate Reference Concepts would
duplicate that provenance without improving navigation, so this Bundle deliberately keeps those
records in the bounded source analyses linked above.
