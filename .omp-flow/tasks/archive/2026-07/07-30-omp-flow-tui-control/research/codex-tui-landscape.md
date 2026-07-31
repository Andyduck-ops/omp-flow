---
type: "Research"
title: "Codex TUI landscape"
---

# Codex TUI landscape

Question: which mature Codex terminal projects and official interfaces provide reusable patterns
for status, progress, sessions, approvals, cancellation, recovery, and event-driven supervision?

Research scope: external primary sources, inspected 2026-07-30. Useful repositories were cloned
under ignored `.omp-flow/cache/repos/codex-landscape/` and pinned below. This Concept is both the
source record and synthesis because the assignment permits only this output path; no separate
Reference Concepts were created.

## Selected conclusion

For Codex, the strongest live adapter boundary is `codex app-server`, not terminal scraping and not
an omp-flow-owned session database. App-server already owns Codex thread/turn identity, runtime
status, streamed item progress, approval request/response correlation, steering, interruption,
history, and recovery. `codex exec --json` is a useful second boundary for supervisor-launched
non-interactive jobs. The external `notify` hook is only a completion signal and cannot support
live supervision by itself.

Mature multi-agent TUIs confirm that operators need a searchable session list, attention states,
fast attach, preview/diff views, worktree context, archive/recovery affordances, and clear
destructive-action boundaries. They also demonstrate the failure mode to avoid: inferring
Codex state from PTY text, output churn, or tmux pane contents and then treating the inference as
control authority.

The justified direction for the cross-project synthesis is therefore a hybrid:

- read authored omp-flow Concepts directly as durable semantic navigation;
- obtain Codex live mechanics through a thin, version-aware app-server adapter;
- use `codex exec --json` only for jobs the adapter itself launches in that mode;
- retain terminal/tmux integration as a degraded preview or attach capability, visibly labelled as
  heuristic and non-authoritative;
- send approvals, steering, and cancellation only through the Harness-native correlated interface.

This selects a research direction, not an implementation.

## Official Codex interfaces

### `codex app-server`: rich, bidirectional control

The official app-server protocol is JSON-RPC-like and supports newline-delimited JSON over stdio.
The pinned repository also documents Unix-socket transport and labels WebSocket transport
experimental/unsupported. Clients must initialize, then work with three native primitives:
threads, turns, and items. The CLI can generate TypeScript or JSON Schema artifacts that exactly
match the installed Codex version.

The current surface directly covers the task's supervision needs:

| Need | Native evidence |
|---|---|
| Discovery/recovery | `thread/list`, `thread/read`, `thread/resume`, `thread/fork`, `thread/loaded/list`, archive/unarchive |
| Coarse live status | `ThreadStatus`: `notLoaded`, `idle`, `systemError`, or `active`; active flags include `waitingOnApproval` and `waitingOnUserInput` |
| Turn state | `inProgress`, `completed`, `interrupted`, or `failed` |
| Progress | `turn/started`, `turn/completed`, `item/started`, item deltas, `item/completed`, token usage, `turn/plan/updated`, and `turn/diff/updated` |
| Safe input/control | `turn/start`, in-flight `turn/steer`, and correlated `turn/interrupt` |
| Approvals | Server-initiated requests for command execution, file changes, permissions, user input, and MCP elicitation; each is scoped by thread/turn/item or request identity |
| Process cleanup | Experimental thread-scoped background-terminal list/terminate/clean operations |

Two protocol details are especially relevant:

1. `thread/read` is deliberately replay-only: it reads stored state without resuming or subscribing.
   A live UI must distinguish that snapshot from an attached event stream.
2. Item lifecycle is authoritative. Approval flows end in `item/completed`, and the official docs
   tell clients to use `item/*` rather than reconstructing final item state from summaries.

The official Codex TUI itself now consumes app-server through an app-server client. Its source keeps
per-thread event channels, distinguishes replay-only from live attachment, treats event lag and
disconnect as explicit conditions, and refreshes liveness from the server. That is stronger
evidence than a hypothetical wrapper: Codex's own terminal UI uses the same separation a
supervisor needs.

Implications for omp-flow:

- Codex status should retain native identity, provenance, observation time, and capability. A
  replayed `thread/read` result must never look like a live subscription.
- Approval UI must relay the original request and its allowed decisions. Sending `y`, Enter, or
  other guessed terminal input is not equivalent.
- `turn/interrupt` is a scoped cancellation request. Killing a PTY or tmux session is a separate,
  coarser capability and must not be presented as the same control.
- A reconnecting adapter should query authoritative thread state before applying new events;
  silence is not evidence of idleness.
- Schema generation is version-specific, so the adapter cannot safely freeze a hand-copied wire
  model or assume experimental methods exist.

Primary sources:

- [Official app-server documentation](https://learn.chatgpt.com/docs/app-server)
- [`app-server/README.md` at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/app-server/README.md)
- [Thread status protocol at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/app-server-protocol/src/protocol/v2/thread.rs)
- [Turn protocol at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/app-server-protocol/src/protocol/v2/turn.rs)
- [Official TUI session lifecycle at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/tui/src/app/session_lifecycle.rs)
- [Official TUI app-server event handling at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/tui/src/app/app_server_events.rs)

### `codex exec --json`: observable jobs, not an interactive supervisor

Official non-interactive mode emits JSONL events on stdout. The typed stream includes
`thread.started`, turn start/completion/failure, item start/update/completion, and fatal errors.
Items cover messages, reasoning, command execution, file changes, MCP calls, collaboration calls,
web search, and to-do updates. A thread ID can later be used with `codex exec resume`.

This is an excellent boundary for a job that a supervisor starts and owns: it is structured,
streamable, and easy to correlate with process exit. It is not a substitute for app-server when a
human must answer an approval, steer an in-flight turn, attach to arbitrary existing live threads,
or recover a missed bidirectional request. Non-interactive mode expects approval and sandbox
settings to be preselected.

Primary sources:

- [Official non-interactive documentation](https://developers.openai.com/codex/noninteractive)
- [`exec_events.rs` at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/exec/src/exec_events.rs)

### `notify`: useful fallback, insufficient telemetry

The official `notify` command receives only supported external notification events. At the pinned
revision the legacy wire payload has one event, `agent-turn-complete`, with thread ID, turn ID,
cwd, input messages, and last assistant message. It supplies a low-cost completion/attention hint
for an otherwise opaque interactive process, but no authoritative running state, approval
request, interruption acknowledgement, or item progress.

This is important counter-evidence to third-party integrations that accept several hypothetical
turn-start/turn-failed spellings: those mappings may be forward-compatible guesses, but current
official `notify` does not emit a complete lifecycle.

Primary sources:

- [Official advanced configuration: notifications](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications)
- [`legacy_notify.rs` at `bdda5da`](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/hooks/src/legacy_notify.rs)

## Mature supervision projects

Maturity here means released software with active maintenance and meaningful adoption, not that
every project is an architectural fit. GitHub counts are only a rough adoption signal, recorded as
a dated snapshot.

### Agent Deck

[Agent Deck](https://github.com/asheshgoplani/agent-deck) is a Go/Bubble Tea and tmux session
manager for several coding agents. At inspection it had about 627 stars, release `v1.10.11`
(2026-07-26), and recent activity. It offers groups, search, status filters, attach, native session
forking where supported, worktrees, archive/unarchive, web views, and remote conductor features.

Reusable patterns:

- a fleet view optimized around attention (`running`, `waiting`, `idle`, `error`);
- stable session identity separate from display name;
- group-local and global navigation;
- archive as a recoverable operation distinct from delete;
- source-specific freshness windows and a fallback hierarchy;
- preserving session/process state when the dashboard exits.

Counter-evidence and limits:

- Codex status is collapsed into a local hook file and a four-state projection.
- `running` has a short freshness window while `waiting` is treated as longer-lived; some surfaces
  deliberately accept stale waiting status. This is practical, but proves freshness and source
  must be visible.
- The Codex hook maps many possible lifecycle spellings, while current official `notify` only
  guarantees completion.
- tmux pane-title/output fallback remains heuristic. Agent Deck's own comments describe drift
  between CLI, web, and TUI derivations before centralizing the mapping.
- Its database, conductor, worktree, and lifecycle ownership are product features, not semantics
  omp-flow should copy.

Pinned source:

- URL: `https://github.com/asheshgoplani/agent-deck.git`
- Revision: `580e772c1a267834199451c91caeb0b76f0c1a74`
- Useful anchors: [README](https://github.com/asheshgoplani/agent-deck/blob/580e772c1a267834199451c91caeb0b76f0c1a74/README.md),
  [status derivation](https://github.com/asheshgoplani/agent-deck/blob/580e772c1a267834199451c91caeb0b76f0c1a74/internal/sessionstatus/sessionstatus.go),
  [Codex hook adapter](https://github.com/asheshgoplani/agent-deck/blob/580e772c1a267834199451c91caeb0b76f0c1a74/cmd/agent-deck/codex_hooks_cmd.go)

### Claude Squad

[Claude Squad](https://github.com/smtg-ai/claude-squad) is a compact Go TUI using tmux and Git
worktrees for Claude Code, Codex, Gemini, and arbitrary programs. At inspection it had about 8,211
stars and release `v1.0.19` (2026-06-17). It provides a session list, embedded terminal preview,
diff view, attach/detach, worktree isolation, checkout, pause/resume, and kill.

Reusable patterns:

- preview and diff are adjacent views of runtime output and repository effect;
- tmux lets managed sessions survive detaching from the dashboard;
- worktrees make concurrent file effects legible and reduce conflicts;
- pause is recoverable and distinct from kill.

Counter-evidence and limits:

- “Running” versus “ready” is derived from changes in captured tmux pane output. Prompt recognition
  is hard-coded for some tools but not Codex.
- Its stored instance JSON duplicates session/worktree lifecycle state and its pause/checkout
  operations may commit or remove worktrees. That ownership conflicts with omp-flow's thin-adapter
  boundary.
- Terminal output change is activity, not proof of semantic progress or liveness.

Pinned source:

- URL: `https://github.com/smtg-ai/claude-squad.git`
- Revision: `5a604f76fc943d29fbc1ee76ec33b4ebd03178e3`
- Useful anchors: [README](https://github.com/smtg-ai/claude-squad/blob/5a604f76fc943d29fbc1ee76ec33b4ebd03178e3/README.md),
  [instance lifecycle](https://github.com/smtg-ai/claude-squad/blob/5a604f76fc943d29fbc1ee76ec33b4ebd03178e3/session/instance.go),
  [tmux monitor](https://github.com/smtg-ai/claude-squad/blob/5a604f76fc943d29fbc1ee76ec33b4ebd03178e3/session/tmux/tmux.go)

### CCManager

[CCManager](https://github.com/kbwo/ccmanager) is a TypeScript/Ink multi-project session manager
with no tmux dependency. At inspection it had about 1,204 stars and release `v4.2.1`
(2026-07-11). It owns child PTYs, mirrors them into headless xterm instances, polls for
`idle`/`busy`/`waiting_input`, switches between sessions, manages worktrees, and runs status hooks.

Reusable patterns:

- one navigable view across projects and worktrees;
- a persistent headless terminal model enables instant preview switching;
- explicit state-change hooks are useful for attention notifications;
- command presets and provider-specific detectors make capabilities visible.

Counter-evidence and limits:

- Codex detection scans the last 30 terminal lines for strings such as approval prompts and
  `esc ... interrupt`; otherwise it declares the session idle.
- Screen text changes across Codex versions, themes, terminal widths, and localization. A regex hit
  cannot safely authorize approval or cancellation.
- The manager owns the child PTY; destroying a session kills the process. This is a valid
  single-product choice but not a cross-Harness control contract.
- Its experimental automatic approval is intentionally outside the recommended shared surface.

Pinned source:

- URL: `https://github.com/kbwo/ccmanager.git`
- Revision: `ba9e38c06e002b11f741f1b668b5f11269ec6297`
- Useful anchors: [README](https://github.com/kbwo/ccmanager/blob/ba9e38c06e002b11f741f1b668b5f11269ec6297/README.md),
  [Codex detector](https://github.com/kbwo/ccmanager/blob/ba9e38c06e002b11f741f1b668b5f11269ec6297/src/services/stateDetector/codex.ts),
  [PTY session manager](https://github.com/kbwo/ccmanager/blob/ba9e38c06e002b11f741f1b668b5f11269ec6297/src/services/sessionManager.ts)

## Comparison and design consequences

| Surface | Observation fidelity | Bidirectional control | Recovery | Fit for omp-flow |
|---|---|---|---|---|
| Codex app-server | Typed thread/turn/item events and native status | Approvals, input, steer, interrupt, thread controls | List/read/resume plus event resubscription | Primary Codex live adapter |
| `codex exec --json` | Typed JSONL for one owned run | Preconfigured run; process signal/exit | Resume by thread ID | Batch-operation adapter |
| Codex `notify` | Completion callback only | None | Thread ID hint | Degraded attention signal |
| tmux/PTY supervisors | Screen/activity inference | Attach, keys, kill | Process/session dependent | Preview/attach fallback only |
| Authored omp-flow Bundle | Human-readable linked task meaning | Changed through normal authored Concepts | Git-visible durable files | Primary semantic view |

The comparison supports two adjacent UI views rather than one synthetic status:

1. **Bundle view:** authored Concepts and links, with no inferred phase or percentage.
2. **Live execution view:** native Harness observations with source, freshness, identity, and
   available controls.

The UI may summarize a native state for scanning, but must retain the native detail. For example,
“needs attention” can group `waitingOnApproval` and `waitingOnUserInput`, while the detail and
permitted response remain distinct.

## Counter-evidence, risks, and unknowns

- App-server is broad and evolving. Stable versus experimental methods vary by installed Codex
  version; generated schemas and capability checks are mandatory evidence, not optional polish.
- `thread/list` finds stored Codex threads and `thread/loaded/list` finds threads loaded by one
  app-server. Neither proves discovery of every unrelated Codex process on the machine.
- A stored thread status of `notLoaded` is not a live process state. A read snapshot, a live
  subscription, and a PTY heuristic need visibly different provenance.
- Event consumers can lag or disconnect. Recovery semantics must be verified against the installed
  version; blindly replaying buffered UI events can manufacture a false current state.
- Windows favors stdio for the conservative first adapter. Unix-socket and remote-WebSocket
  behavior should not be assumed portable, and the pinned repository explicitly marks WebSocket
  experimental.
- It remains to decide whether omp-flow launches a dedicated app-server, connects to a
  Harness-owned server, or supports both. That decision affects ownership, authentication,
  discovery, and shutdown and belongs in design.
- Cross-Harness controls have unequal strength. “Interrupt a correlated Codex turn” and “kill a
  terminal process” must remain separate capabilities even if the TUI gives them adjacent keys.

## Recommendation handed to synthesis

Treat app-server as the Codex control authority for any session the adapter can prove it owns or is
subscribed to. Preserve replay/live/heuristic provenance and exact native IDs. Use structured
events to render plans, items, diffs, approvals, failures, and completion without deriving
percentage progress. Use third-party projects as UI references for grouping, search, attention
queues, preview/diff, attach, archive, and recovery affordances—not as state-model templates.

The first safe cross-Harness controls should be capability-gated focus/attach and native,
correlated interruption. Approval response should be exposed only when the adapter holds the
original unresolved native request. Destructive delete, worktree mutation, guessed keystrokes, and
automatic approval should remain outside the shared surface unless a later design gives them an
explicit Harness-specific contract.
