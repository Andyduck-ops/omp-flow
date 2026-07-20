# Research: Trellis Channel CLI Feature Surface

- **Query**: Survey `packages/cli/src/commands/channel/*.ts` feature surface (subcommands, flags, output behaviour, scope/type model) as feedstock for the `trellis-channel` bundled skill `command-reference.md` draft.
- **Scope**: internal
- **Date**: 2026-06-15

## Findings

### Files Read

| File Path | Description |
|---|---|
| `packages/cli/src/commands/channel/index.ts` | Commander wiring; every subcommand, every flag, parsing helpers (`parseDuration`, `parseNonNegativeInteger`). |
| `packages/cli/src/commands/channel/create.ts` | Creates channel via core `coreCreateChannel`; deprecated `--linked-context-*` aliases still folded into canonical `--context-*`. |
| `packages/cli/src/commands/channel/send.ts` | Wraps `sendMessage`; resolves body from arg/stdin/file; emits raw event JSON on stdout. |
| `packages/cli/src/commands/channel/wait.ts` | Streams `watchEvents`, supports `--all` multi-agent join, exits **124** on timeout. |
| `packages/cli/src/commands/channel/run.ts` | One-shot: create ephemeral → spawn → send → wait `done` → print final assistant text → cleanup. Default timeout 5m. |
| `packages/cli/src/commands/channel/spawn.ts` | Forks `__supervisor` worker; agent file loader + context assembly + OOM guard budget check. |
| `packages/cli/src/commands/channel/list.ts` | Table summary (name/workers/events/last/kind/type/task) sorted by recency; `--json` for JSON. |
| `packages/cli/src/commands/channel/messages.ts` | View/filter/follow events; auto-detects forum and shows thread board unless filters applied. |
| `packages/cli/src/commands/channel/kill.ts` | SIGTERM → grace → SIGKILL escalation; `--force` skips graceful path. |
| `packages/cli/src/commands/channel/rm.ts` | Single-channel delete + bulk `prune` with dry-run by default, mutually-exclusive filter flags. |
| `packages/cli/src/commands/channel/context.ts` | Channel-level or thread-level (`--thread`) context add/delete/list. |
| `packages/cli/src/commands/channel/threads.ts` | Forum-specific: `post`, `forum` (list), `thread <name> <key>` show, `thread rename`. |
| `packages/cli/src/commands/channel/title.ts` | `title set` / `title clear`. |
| `packages/cli/src/commands/channel/interrupt.ts` | Sends interrupt + replacement instruction to a named worker. |
| `packages/cli/src/commands/channel/guard.ts` | OOM guard policy: idle TTL + max-live-workers; env vars `TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT`, `TRELLIS_CHANNEL_MAX_LIVE_WORKERS`; config under `channel.worker_guard` in `.trellis/config.yaml`. |
| `packages/cli/src/commands/channel/agent-loader.ts` | Loads `.trellis/agents/<name>.md` (YAML frontmatter + body); name must match `[A-Za-z0-9._-]+`. |
| `packages/cli/src/commands/channel/context-loader.ts` | Assembles `--file` (glob) + `--jsonl` manifests into system-prompt `# CONTEXT FILES` block; 1 MB per-file cap, 200 KB warn, 500 KB total warn; path-traversal jail to cwd. |
| `packages/cli/src/commands/channel/adapters/index.ts` | Provider registry (`claude`, `codex`); `WorkerAdapter` interface; `getAdapter`, `listProviders`, `isProvider`. |
| `packages/cli/src/commands/channel/adapters/claude.ts` | Claude stream-json parser/encoder; CLI args include `-p`, `--input-format stream-json`, `--permission-mode bypassPermissions`, `--dangerously-skip-permissions`, `--append-system-prompt`. No handshake. |
| `packages/cli/src/commands/channel/adapters/codex.ts` | Codex `app-server` JSON-RPC 2.0; requires `initialize` → `thread/start` handshake (30 s deadline); auto-accepts MCP elicitation. |

### Subcommand Reference

Top-level: `trellis channel <subcommand>` — description: *Multi-agent collaboration runtime — spawn / coordinate / interrupt worker agents through a shared event log*.

Every subcommand accepts `--scope <scope>` (`project` | `global`) except the dev/internal ones; `project` is the default. `--scope global` writes/reads under the `__global__` bucket.

#### `create <name>`
Purpose: create a new channel session and append the `create` event.
Flags:
- `--scope <scope>` — project | global (default project)
- `--type <type>` — `chat` | `forum` (default `chat`)
- `--task <path>` — associated Trellis task dir, recorded in event
- `--project <slug>` — project slug
- `--labels <csv>` — labels
- `--description <text>` — stable description
- `--context-file <abs-path>` (repeatable) / `--context-raw <text>` (repeatable) — attach context entries at create
- `--linked-context-file` / `--linked-context-raw` — **deprecated aliases** (still folded in)
- `--cwd <path>`
- `--by <agent>` — default `main`
- `--force` — overwrite existing channel
- `--ephemeral` — hide from default `list`, eligible for `prune --ephemeral`

Output: `Created channel '<name>' (<type>) at <dir>` on stdout; ephemeral warning to stderr.

#### `send <name> [text]`
Purpose: append a `message` event to the channel.
Flags:
- `--as <agent>` **(required)** — author
- `--scope <scope>`
- `--to <agents>` — CSV; one → string, many → array; broadcast if omitted
- `--stdin` / `--text-file <path>` — alternative body sources
- `--delivery-mode <mode>` — `appendOnly` | `requireKnownWorker` | `requireRunningWorker`
- `[text]` positional — inline body

Output: appended event as JSON on stdout.

#### `wait <name>`
Purpose: block until a filter-matching event arrives (or timeout). Streams matches as JSON.
Flags:
- `--as <agent>` **(required)** — `self` for filter context
- `--scope <scope>`
- `--timeout <duration>` — `30s` / `2m` / `1h` / `1000ms`
- `--from <agents>` — CSV authors
- `--kind <kind[,kind...]>` — CSV, OR semantics
- `--thread <key>` / `--action <action>` — forum filters
- `--to <target>` — default = own agent (broadcast + explicit-to-me)
- `--include-progress` — also wake on progress events
- `--all` — wait until every agent in `--from` has produced a match (requires `--from`)

Output: one line of JSON per matching event on stdout. Timeout → **exit 124** + stderr `timeout: still waiting on ...` when `--all`.

#### `spawn <name>`
Purpose: register a worker (claude/codex) into the channel; supervisor is forked as `channel __supervisor`. Worker stays inbox-idle until first `send --to <worker>`.
Flags:
- `--scope <scope>`
- `--agent <agent-name>` — load `.trellis/agents/<name>.md` (sets defaults for provider/model/as/system prompt)
- `--provider <provider>` — `claude` | `codex` (overrides agent; validated against registry)
- `--as <name>` — channel worker name; defaults to agent name
- `--cwd <path>` — worker cwd
- `--model <id>` — model override
- `--resume <id>` — resume session/thread id
- `--timeout <duration>` — auto-kill after duration
- `--warn-before <duration>` — supervisor_warning lead time (default 5m, `0ms` disables)
- `--file <path>` (repeatable, glob-supported) — inject file content into system prompt
- `--jsonl <path>` (repeatable) — Trellis jsonl manifest (`{file, reason}` per line)
- `--by <agent>` — author of `spawned` event (defaults to `TRELLIS_CHANNEL_AS` env or `main`)
- `--inbox-policy <policy>` — `explicitOnly` (default) | `broadcastAndExplicit`
- `--idle-timeout <duration>` — OOM guard idle TTL (default 5 m; `0` disables)
- `--max-live-workers <n>` — spawn-time live-worker budget (default 6; `0` disables)

Output: stderr guard cleanup notices; spawn errors raise; on success channel records `spawned` event with `pid`, `provider`, `agent`, `files`, `manifests`.

#### `run [name]`
Purpose: one-shot. Auto-generates `run-<hex>` name when omitted; creates ephemeral channel, spawns single worker, sends the prompt, waits for `done`, prints final assistant message to stdout, then `channel rm`s on success. On failure keeps channel for inspection and sets exit code 1.
Flags (subset of spawn + message source):
- `--agent`, `--provider`, `--as`, `--cwd`, `--model`, `--file` (repeatable), `--jsonl` (repeatable)
- `--message <text>` / `--message-file <path>` / `--stdin` — prompt source
- `--timeout <duration>` — wait for done; default 5 m

#### `rm <name>`
Purpose: kill any live workers then delete the channel directory.
Flags: `--scope <scope>`
Output: `Removed channel '<name>'` (unless internal `force` flag suppressed by callers).

#### `prune`
Purpose: bulk-remove channels matching a single criterion (filter flags are mutually exclusive — error otherwise).
Flags:
- `--scope <scope>` — `project` only the current bucket, `global` only the global bucket; unscoped scans every project (intentional, repo-wide cleanup).
- `--all` | `--empty` | `--idle <duration>` | `--ephemeral` — pick one
- `--yes` — actually delete (without it: dry-run + refusal warning)
- `--dry-run` — default true; preview only
- `--keep <names>` — CSV channels excluded from removal

Output: per-candidate line `name  last-ts  (reason)`; final summary line. Live-worker channels are always skipped.

#### `list`
Purpose: table of channels in `~/.trellis/channels/` with project bucket, worker counts, last activity.
Flags:
- `--scope <scope>` — `global` lists only the global bucket, `project` only the current
- `--json` — JSON array instead of formatted table
- `--project <slug>` — filter where `task` contains substring
- `--all` — include ephemeral channels (default hides them; suffix `*` marks ephemeral)
- `--all-projects` — scan every project bucket (default: only the current cwd's project)

Output: colored table with header `NAME WORKERS EVENTS LAST KIND TYPE TASK`; footer notes hidden ephemeral count.

#### `messages <name>`
Purpose: view / follow / filter the channel event log; auto-detects forum and renders a thread board when no filters applied.
Flags:
- `--scope <scope>`
- `--raw` — one JSON per line
- `--follow` — stream new events (Ctrl-C to stop)
- `--last <N>` — only the last N matching events (parsed as int)
- `--since <seq>` — only events with `seq > N`
- `--kind <kind>` — single-kind filter (validated against whitelist)
- `--from <agents>` (CSV) / `--to <target>` — author / routing filters
- `--thread <key>` / `--action <action>` — forum-only (errors on chat channels)
- `--no-progress` — hide progress events

Output: colored, right-padded timeline; thread board summary when applicable.

#### `kill <name>`
Purpose: stop a worker (supervisor SIGTERM → 8 s grace → SIGKILL escalation; CLI writes a `killed` event when SIGKILL is needed so the log stays truthful).
Flags:
- `--as <agent>` **(required)** — worker agent name (positional `<name>` is the channel)
- `--scope <scope>`
- `--force` — SIGKILL immediately (also kills inner worker pid)

Side effects: cleans `pid`, `worker-pid`, `config`, `spawnlock` sidecar files; keeps `log`, `session-id`, `thread-id` for forensics / resume.

#### `interrupt <name> [text]`
Purpose: interrupt a worker turn and inject a replacement instruction (provider-level interrupt where supported).
Flags:
- `--as <agent>` **(required)** — caller
- `--to <agent>` **(required)** — target worker
- `--scope <scope>`
- `--stdin` / `--text-file <path>` — alternative body sources
- `[text]` — inline body

Output: appended `interrupt` event as JSON on stdout. (Reason recorded as `"user"`.)

#### `post <name> <action>` (forum)
Purpose: append a structured `thread` event to a forum channel. `action=rename` is rejected — use `thread rename` instead.
Flags:
- `--as <agent>` **(required)**
- `--scope <scope>`
- `--thread <key>` — required except for the `opened` action
- `--title <text>`
- `--text <text>` / `--stdin` / `--text-file <path>` — event body
- `--description <text>` — stable thread description
- `--status <status>`
- `--labels <csv>` — replaces thread labels (not append)
- `--assignees <csv>` — replaces assignees
- `--summary <text>`
- `--context-file <abs-path>` (repeatable) / `--context-raw <text>` (repeatable)
- `--linked-context-file` / `--linked-context-raw` — **deprecated aliases**

Output: appended event JSON.

#### `forum <name>`
Purpose: list threads in a forum channel (reduced thread state).
Flags: `--scope`, `--status <status>` filter, `--raw` JSON per-state.
Output: formatted board, or one JSON per thread.

#### `thread <name> <thread>` (timeline)
Purpose: show one thread's timeline.
Flags: `--scope`, `--raw` (raw events per line).
Output: header line `<thread> [<status>] <title>`, then description / labels / assignees / summary / timeline lines.

#### `thread rename <name> <oldThread> <newThread>`
Purpose: rename a thread inside a forum channel.
Flags: `--as <agent>` **(required)**, `--scope`.

#### `context add <name>` / `context delete <name>` / `context list <name>`
Purpose: manage channel-level or thread-level context entries.
Shared flags:
- `--as <agent>` (default `main`; add/delete only)
- `--scope <scope>`
- `--thread <key>` — operate on thread-level context instead of channel-level
- `--file <abs-path>` (repeatable) / `--raw <text>` (repeatable) — add/delete only; at least one required
- `--raw` boolean on `list` — JSON per entry

Output: add/delete print event JSON; list prints `file <path>` or `raw <truncated text>` lines, `(no context)` when empty.

#### `title set <name>` / `title clear <name>`
Purpose: project a stable display title onto the channel.
Flags:
- `--as <agent>` (default `main`)
- `--scope <scope>`
- `--title <text>` — **required for `set`**

Output: event JSON.

#### Hidden / internal commands
- `channel __supervisor <channel> <worker> <config>` — entry point used by `spawn`'s forked process. Marked `[internal] — do not invoke directly`.
- `channel __parse-trace <adapter> <file>` — dev helper to feed a recorded stream-json / wire trace through the matching adapter and print the resulting channel events. Validates adapter against the provider registry.

### Channel Scope & Type Model

**Scope** (`--scope`):
- `project` (default) — channel lives under the current cwd's project bucket (`~/.trellis/channels/<project-key>/<channel>/`). Used by `list`, `wait`, `messages`, etc.
- `global` — channel lives under the `__global__` bucket (`GLOBAL_PROJECT_KEY` constant). Visible only when explicitly scoped, or via `--all-projects` on `list`.

`prune` has a special third mode: when `--scope` is omitted, it scans **every** project bucket (intentional, supports repo-wide cleanup).

**Type** (`--type` at `create` time only; immutable thereafter):
- `chat` (default) — flat message timeline. `messages` always shows the event stream. `--thread` / `--action` filters error out.
- `forum` — thread-oriented. `messages` (without filters) renders a thread-board summary. `post` / `forum` / `thread` / `thread rename` only apply here.

**Ephemeral channels** are an orthogonal flag (`--ephemeral` at create time): hidden from default `list`, surfaced with `--all`, swept by `channel prune --ephemeral`. `channel run` always creates ephemeral channels (origin metadata `createMode=run`) and removes them on success.

**Worker concepts** (orthogonal to scope/type):
- A `spawn` registers a `WorkerAdapter` (currently `claude` or `codex`); each adapter handles its own stdin/stdout protocol. Codex requires `initialize` + `thread/start` handshake before user messages flow.
- Inbox policy: `explicitOnly` (default — only `send --to <worker>` wakes it) vs `broadcastAndExplicit` (also wakes on broadcast).
- OOM guard enforced at spawn (idle-TTL cleanup of expired idle workers + live-worker budget per project bucket). Precedence: CLI flag → env (`TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT`, `TRELLIS_CHANNEL_MAX_LIVE_WORKERS`) → `.trellis/config.yaml#channel.worker_guard` → built-in defaults (5 min, 6 workers).

### Output Conventions

- **Event-emitting mutations** (`send`, `interrupt`, `post`, `context add/delete`, `title set/clear`, `thread rename`) print the appended event as a single JSON line on **stdout**.
- **Streaming reads** (`wait`, `messages --follow`) print one JSON event per line.
- **Pretty reads** (`list`, `messages`, `forum`, `thread`, `context list`) print colored, padded tables / timelines.
- **`run`** prints only the final assistant text to stdout (so callers can pipe); diagnostic notes go to stderr.
- **Errors** go through `chalk.red("Error:")` to stderr and exit 1; `wait` timeout exits 124.

### Caveats / Not Found

- The file inventory in the original prompt listed `wait.ts` as "find the wait file location" — it is at `packages/cli/src/commands/channel/wait.ts` (sibling of the other subcommands, not nested).
- The prompt listed `messages.ts` and `prune.ts` separately; in this codebase **`prune` lives inside `rm.ts`** (exported as `channelPrune` from the same file as `channelRm`). There is no standalone `prune.ts`.
- The prompt listed `dev-parse-trace.ts` implicitly via "etc." — it is wired as the hidden `__parse-trace` subcommand and is dev-only.
- I did not survey `store/`, `supervisor/`, `supervisor.ts`, `text-body.ts`, or the codex adapter internals beyond their handshake/registration surface — those are runtime plumbing, not user-facing CLI surface, and were out of scope for the command reference.
