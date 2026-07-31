---
type: "Research"
title: "Claude Code TUI landscape"
---

# Claude Code TUI landscape

Question: which mature Claude Code terminal projects and official interfaces provide reusable
patterns for status, progress, sessions, approvals, cancellation, recovery, and multiplexing?

Research completed 2026-07-30. This is external research only; it does not authorize or contain
implementation.

## Selected conclusion

Claude Code now has a first-party supervision plane that should be the default Claude-specific
seam, not something omp-flow recreates:

- `claude agents` is a terminal supervisor for background sessions. It distinguishes semantic
  work state (`working`, `blocked`, `done`, `failed`, `stopped`) from whether the underlying
  process is alive, supports peek/reply/attach, and keeps sessions running in a per-user supervisor
  process.
- `claude agents --json` is the strongest read interface. It returns session identity, cwd, state,
  process status, and a typed `waitingFor` reason. `claude logs`, `attach`, `stop`, `respawn`, and
  `rm` are the corresponding native shell controls.
- Hooks are the best passive event seam for ordinary interactive sessions, but hook observations
  are not a lifecycle database. They need timestamps, freshness, source, and an explicit
  unknown/stale state.
- The Agent SDK is the strongest structured interface when an application itself owns the Claude
  session: streaming input/output, session resume, interrupt, and `canUseTool` approval callbacks.
  It is not a reason for a cross-Harness TUI to take session ownership away from Claude Code.
- Status-line JSON and OpenTelemetry are useful enrichment. Claude's own documentation explicitly
  says transcript entries under `~/.claude/projects/*/*.jsonl` are an internal, version-changing
  format, so transcript parsing must not become omp-flow's primary contract.

For omp-flow, the justified direction is therefore a thin Claude adapter over official commands
and events, with capability discovery. The shared TUI should show Claude-native state and delegate
Claude-native control; it should not become another Claude session host, infer state from terminal
text, or mirror Claude's supervisor files.

## Official interfaces

All official documentation below was accessed 2026-07-30. Agent view is documented as a research
preview requiring Claude Code v2.1.139 or later, so the adapter must negotiate availability rather
than assume it.

### Agent view and supervisor

The closest first-party precedent is
[agent view](https://code.claude.com/docs/en/agent-view). It groups sessions by attention state,
shows recent activity, lets the user reply from a peek panel, attaches to the full conversation,
and leaves detached work running. Particularly useful contracts are:

- [`claude agents --json`](https://code.claude.com/docs/en/agent-view#list-sessions-as-json)
  returns `cwd`, `kind`, `startedAt`, background `id`, `state`, live `pid`/`status`, full
  `sessionId`, and `waitingFor`. The latter distinguishes permission, input, sandbox, worker, and
  dialog blocks.
- [Shell management commands](https://code.claude.com/docs/en/agent-view#manage-sessions-from-the-shell)
  provide logs, attach, stop/kill, respawn, remove, and daemon status without requiring screen
  scraping. Removal can also remove a Claude-created worktree, so it is a destructive,
  Claude-owned action that needs the native confirmation/safety semantics.
- [The supervisor](https://code.claude.com/docs/en/agent-view#the-supervisor-process) is per-user
  and separate from both terminal and view. It keeps active/waiting/attached processes alive,
  reconnects after supervisor upgrades, and can stop idle processes while preserving resumable
  session state.
- [On-disk supervisor files](https://code.claude.com/docs/en/agent-view#where-state-is-stored) are
  documented for inspection, but the docs explicitly direct callers to `claude daemon status`
  rather than reading them. Omp-flow should follow that boundary.

Agent view itself demonstrates several design choices worth copying at the presentation level:
attention-needed rows sort above working/completed rows; task state and process liveness are shown
separately; recent activity is a sentence rather than a fake percentage; a lightweight peek
precedes full attach; and control remains possible after a worker process exits because the
conversation is resumable.

### Hooks

[Claude Code hooks](https://code.claude.com/docs/en/hooks) receive structured JSON at defined
session, turn, tool, permission, subagent, task, worktree, compaction, and termination points.
Common fields include `session_id`, `transcript_path`, `cwd`, `permission_mode`, and
`hook_event_name`. This is sufficient to correlate a Claude observation with an omp-flow actor or
operation when the adapter already knows that mapping.

Important limits:

- A hook is an event, not a current-state query. Missing `SessionEnd` after a crash, delayed async
  hooks, compaction/resume, and a process disappearing all require freshness and reconciliation.
- [`PermissionRequest`](https://code.claude.com/docs/en/hooks#permissionrequest) can make an
  allow/deny decision, including for headless contexts, but a shared UI must never fabricate that
  authority. It may surface the request only when the Claude adapter can route the user's decision
  back to the owning session.
- `PreToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop`, and related events
  can block in event-specific ways; `SessionEnd` and notifications cannot. A generic “cancel”
  button cannot be implemented by treating hook exit codes as universal control.
- Hook payloads carry useful `SubagentStart`/`SubagentStop`, `TaskCreated`/`TaskCompleted`,
  `WorktreeCreate`/`WorktreeRemove`, and `CwdChanged` events. These can enrich a Claude-specific
  detail view but must not be reinterpreted as omp-flow phase state.

### Agent SDK and headless streams

The [Agent SDK streaming-input mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
is the documented preferred mode for an application that owns an agent. It supports a long-lived
process, queued messages, interruptions, real-time output, permissions, and session management.
The [session API](https://code.claude.com/docs/en/agent-sdk/sessions) supports continue, resume by
session ID, and fork; persisted conversation history is explicitly separate from filesystem
state.

The [`canUseTool` approval callback](https://code.claude.com/docs/en/agent-sdk/user-input) pauses
execution until the caller returns allow or deny and also carries `AskUserQuestion`. This is a
good model for a capability-bound approval UI: show the exact tool request, its owning session,
and the adapter that will receive the decision. The SDK's permission modes also show why
`bypassPermissions` cannot be represented as an innocuous toggle.

For one-shot subprocess integration,
[`--output-format stream-json`](https://code.claude.com/docs/en/headless#stream-responses) emits
structured stream events and a terminal result with cost and session metadata. It is better than
PTY text parsing, but it is still a session that the launching application owns.

### Status line and telemetry

The [status-line JSON contract](https://code.claude.com/docs/en/statusline#available-data) includes
model, cwd/project/worktree, session ID and name, prompt ID, transcript path, version, cost,
duration, lines changed, context usage, rate limits, agent, and PR data. It is a cheap,
session-local snapshot, not a global discovery or control mechanism.

[OpenTelemetry monitoring](https://code.claude.com/docs/en/monitoring-usage) provides organization-
level metrics, events, and traces. `prompt.id`, `message.uuid`, request IDs, and `tool_use_id`
support audit correlation. It is appropriate for aggregate usage/cost/activity, not low-latency
interactive control. The same documentation warns that transcript entry format is internal and
can change on any release; that warning applies equally to third-party JSONL readers.

[Remote Control](https://code.claude.com/docs/en/remote-control) proves that one live local session
can be steered from multiple synchronized surfaces and can reconnect after network interruption.
It is an Anthropic-hosted product surface, not a documented local adapter API. It should be treated
as precedent for provenance, connectivity, and ownership display, not as a dependency for the
omp-flow TUI.

## Mature project evidence

Repository popularity is only a maturity signal, not a design verdict. Counts below are a
2026-07-30 snapshot. Each repository was shallow-cloned into ignored
`.omp-flow/cache/repos/` and inspected at the exact revision listed.

| Project | Snapshot and revision | Strong pattern | Boundary or failure mode |
|---|---|---|---|
| [Claude Squad](https://github.com/smtg-ai/claude-squad) | 8,212 stars, 593 forks; `5a604f76fc943d29fbc1ee76ec33b4ebd03178e3` (2026-06-17) | A compact TUI over isolated git worktrees and tmux sessions; preview, diff, attach/detach, pause/resume, and explicit destructive session deletion are understandable primitives. [README controls](https://github.com/smtg-ai/claude-squad/blob/5a604f76fc943d29fbc1ee76ec33b4ebd03178e3/README.md#L95-L111). | Status is inferred by hashing `tmux capture-pane` output and looking for English prompt strings, then treating output change as running and no change as ready. This is brittle across versions, locales, animations, and non-tmux Windows environments. [Detection source](https://github.com/smtg-ai/claude-squad/blob/5a604f76fc943d29fbc1ee76ec33b4ebd03178e3/session/tmux/tmux.go#L233-L255), [state application](https://github.com/smtg-ai/claude-squad/blob/5a604f76fc943d29fbc1ee76ec33b4ebd03178e3/app/app.go#L238-L250). |
| [Agent Deck](https://github.com/asheshgoplani/agent-deck) | 627 stars, 105 forks; `580e772c1a267834199451c91caeb0b76f0c1a74` (2026-07-27) | Cross-agent grouping, search, worktrees, attach, notifications, and a four-state attention model. More importantly, it evolved from terminal inference toward native Claude hooks with explicit freshness and acknowledgement semantics. [README status model](https://github.com/asheshgoplani/agent-deck/blob/580e772c1a267834199451c91caeb0b76f0c1a74/README.md#L258-L283), [hook derivation](https://github.com/asheshgoplani/agent-deck/blob/580e772c1a267834199451c91caeb0b76f0c1a74/internal/sessionstatus/sessionstatus.go#L114-L161). | Its source documents different stale-event behavior between TUI and web because one surface can afford a tmux fallback and the other cannot. That is direct counter-evidence to a single unqualified status field: source, age, and confidence/capability must travel with the value. [Freshness caveat](https://github.com/asheshgoplani/agent-deck/blob/580e772c1a267834199451c91caeb0b76f0c1a74/internal/sessionstatus/sessionstatus.go#L22-L43). |
| [ccboard](https://github.com/FlorianBruniaux/ccboard) | 88 stars, 6 forks; `fde5fb2254b7537376161f121f85660ba1cd1fa4` (2026-07-15) | A focused observability TUI/Web UI that triangulates hook events, OS process discovery, and incremental transcript metrics. Its merged view retains hook-only and process-only sessions instead of dropping incomplete observations. [Merge model](https://github.com/FlorianBruniaux/ccboard/blob/fde5fb2254b7537376161f121f85660ba1cd1fa4/crates/ccboard-core/src/live_monitor.rs#L533-L590). | It writes a separate `~/.ccboard/live-sessions.json` and parses internal Claude transcripts. Its stale pruning and process reconciliation are useful lessons, but copying the shadow-state file or transcript parser would violate omp-flow's ownership boundary. [Hook state](https://github.com/FlorianBruniaux/ccboard/blob/fde5fb2254b7537376161f121f85660ba1cd1fa4/crates/ccboard-core/src/hook_state.rs#L54-L130), [event mapping](https://github.com/FlorianBruniaux/ccboard/blob/fde5fb2254b7537376161f121f85660ba1cd1fa4/crates/ccboard-core/src/hook_event.rs#L36-L49). |
| [CloudCLI / Claude Code UI](https://github.com/siteboon/claudecodeui) | 12,971 stars, 1,768 forks; `264e0946d2a168c281b85807cd1183130f40b090` / tag `v1.37.0` (2026-07-29) | A mature non-TUI supervision foil. It uses the Claude Agent SDK, normalizes provider events, exposes approval requests, buffers sequenced events for reconnect, records a single terminal completion, resumes by provider-native ID, and interrupts the SDK query for abort. [SDK stream and approval path](https://github.com/siteboon/claudecodeui/blob/264e0946d2a168c281b85807cd1183130f40b090/server/modules/providers/list/claude/claude-runtime.provider.js#L533-L648), [interrupt path](https://github.com/siteboon/claudecodeui/blob/264e0946d2a168c281b85807cd1183130f40b090/server/modules/providers/list/claude/claude-runtime.provider.js#L752-L777). | Its reliability comes from owning an application session registry and the Claude SDK run. That is appropriate for its product, but not a thin cross-Harness observer. It also reads and normalizes Claude JSONL history, which creates a version-coupled compatibility burden. [JSONL reader](https://github.com/siteboon/claudecodeui/blob/264e0946d2a168c281b85807cd1183130f40b090/server/modules/providers/list/claude/claude-sessions.provider.ts#L105-L145). |

Separate Reference Concepts were deliberately not created: this assignment's output boundary
allows one research Concept, and the exact URL, revision, anchors, interpretation, and caveats for
each inspected repository fit here without losing provenance.

## Design implications for synthesis

1. Prefer `claude agents --json` for Claude background-session discovery. Polling is acceptable
   initially because it is an official snapshot command; every observation still needs
   `observed_at`, adapter/version, and freshness.
2. Expose native controls only when advertised by the Claude adapter: logs/peek, attach, stop,
   respawn, and possibly remove. Keep remove visually separate because it can clean up a worktree.
3. Show at least three adjacent fields rather than flattening them: Claude work state, process
   liveness, and control connectivity/capability. A stale hook or dead process is not equivalent to
   a failed omp-flow operation.
4. Use hooks to observe interactive sessions that are not in agent view and to improve
   attention-needed latency. Reconcile them with native snapshots; do not persist them as a second
   task or lifecycle database.
5. Keep status-line and OTel data optional. Cost/context/rate-limit data are valuable detail, but
   missing telemetry must not make an otherwise controllable session appear unavailable.
6. Never derive semantic progress from Claude transcript prose. Show native recent activity or
   link/attach to the session, while durable omp-flow progress remains the authored Bundle and its
   linked Concepts.
7. Do not adopt tmux pane scraping as the primary Claude adapter. It remains a possible degraded
   terminal preview for user-managed sessions, clearly labelled inferred and read-only.
8. If a future Claude adapter launches sessions through the Agent SDK, that adapter becomes the
   explicit owner of those runs and must implement streaming, approval, interrupt, resume,
   exactly-once terminal events, and reconnect. The shared TUI itself should not assume that role.

## Counter-evidence and unknowns

- Agent view is still a research preview. Its JSON and command surface are documented, but no
  long-term compatibility promise was found. Version/capability probing is mandatory.
- `claude agents --json` is a snapshot interface, not an event subscription. Hooks may reduce
  latency, but the correlation and reconciliation policy still needs design.
- Official agent view does not list ordinary foreground interactive sessions until they are
  backgrounded. A cross-Harness view therefore needs an explicit “interactive observation only”
  category when hooks or process detection see such a session.
- No documented API was found for embedding agent view's own supervisor event stream. Reading
  `roster.json`, job `state.json`, daemon sockets, or transcript JSONL would rely on internal
  storage and should not be the initial design.
- The SDK gives precise approval and interrupt semantics only for sessions the SDK caller owns.
  There is no evidence that it can take over an arbitrary already-running terminal session.
- Third-party projects demonstrate genuine user demand and useful UX, but their status inference,
  shadow state, or application-owned registries are counterexamples to copying architecture
  wholesale.

This evidence is sufficient for the cross-project synthesis to select a Claude adapter strategy
without reconstructing the research from chat.
