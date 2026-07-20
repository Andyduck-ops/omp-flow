# Research: v0.6 Cycle Synthesis Outline

- **Query**: Synthesize 25 v0.6 prerelease changelogs (beta.0 through beta.23 + rc.0) into a GA-changelog-ready outline grouped by area.
- **Scope**: internal (docs-site/changelog/*.mdx)
- **Date**: 2026-06-15

Cycle window: **2026-05-08 (beta.0) → 2026-06-08 (rc.0)**. 24 betas + 1 rc.

---

## 1. Multi-agent collaboration (`trellis channel`)

### 1a. Channel runtime — initial CLI + adapters + store

- **Shipped in**: `beta.10`
- **Problem**: No first-class primitive for coordinating multiple AI worker processes through a shared event log; multi-agent flows had to be hand-stitched.
- **Summary**: Adds `trellis channel create | send | wait | spawn | run | list | messages | kill | rm | prune` with Claude `stream-json` and Codex `app-server` JSON-RPC adapters that normalize provider output into `message` / `progress` / `done` / `error` events, persisted to `~/.trellis/channels/<project>/<channel>/events.jsonl` with locked sequence assignment.

### 1b. Thread / forum channels for issue-style boards

- **Shipped in**: `beta.12` (initial `--type thread`), `beta.13` (renamed to `--type threads` + context/title/rename), `beta.15` (`--type forum` + reducers)
- **Problem**: Channels were transient event logs; nothing supported durable issue/thread-style discussion boards with stable per-thread context.
- **Summary**: Adds durable thread channels (`--type threads`) and forum channels (`--type forum`) with `channel post|threads|thread|forum`, `channel context add|delete|list`, `channel title set|clear`, and `channel thread rename`. Events can carry stable `--description`, `--context-file`, `--context-raw` (with legacy `--linked-context-*` aliases).

### 1c. `--scope project|global` resolution

- **Shipped in**: `beta.12`
- **Problem**: Channel storage was project-bucket-only with no explicit global option.
- **Summary**: Every channel subcommand now accepts `--scope project|global` for explicit targeting of project or global storage.

### 1d. Worker coordination — wait filters, timeout warnings, inbox APIs

- **Shipped in**: `beta.15` (worker runtime APIs + Codex turn serialization), `beta.17` (multi-kind wait filter + `supervisor_warning` + `--warn-before`)
- **Problem**: Channel workers had no graceful timeout warning, no multi-kind wait filtering, and no public inbox/runtime API for SDK consumers.
- **Summary**: Adds `channel wait --kind done,killed` (multi-kind), `channel spawn --warn-before <duration>` with `supervisor_warning` event (5m default lead time, disable via `0ms`), and exports worker-lifecycle/subscription primitives (`listWorkers`, `watchWorkers`, `spawnWorker`, `requestInterrupt`, `interruptWorker`, `readChannelEvents`, `watchChannels`, `readWorkerInbox`, `watchWorkerInbox`, `WorkerInboxError`, `matchesInboxPolicy`) from `@mindfoldhq/trellis-core/channel`. Codex workers now record completed answers before `done` and serialize non-interrupt turns (`turn_started`/`turn_finished`/`interrupt_requested`/`interrupted`).

### 1e. Channel worker OOM guard

- **Shipped in**: `beta.18`
- **Problem**: Long-lived worker processes could accumulate, exhausting memory; idle workers had no automatic cleanup.
- **Summary**: Default safeguards `channel.worker_guard.idle_timeout` (5m) and `channel.worker_guard.max_live_workers` (6), configurable per-spawn (`--idle-timeout`, `--max-live-workers`) or via env vars (`TRELLIS_CHANNEL_WORKER_IDLE_TIMEOUT`, `TRELLIS_CHANNEL_MAX_LIVE_WORKERS`). Idle workers emit `killed` with `reason: "idle-timeout"`; mid-turn workers are not killed.

### 1f. Channel message-routing cleanup + durable idempotency

- **Shipped in**: `beta.18` (tag-routing removed), `beta.19` (idempotency keys)
- **Problem**: Message tags were leaking into routing concerns they didn't belong in; channel writes had no replay-safe idempotency mechanism.
- **Summary**: Removes tag-based routing from `send.ts` / `wait.ts` / provider adapters (kept only on channel events, worker inbox policy, and explicit `to`); adds interrupt-specific adapter encoding. Adds durable `idempotencyKey` option to `sendMessage` and `postThread` — repeated writes with the same key return the original JSONL event without producing duplicate `undeliverable` events.

### 1g. Codex channel streaming deltas

- **Shipped in**: `beta.14`
- **Problem**: Codex channel workers didn't expose streamed `item/agentMessage/delta` content with stream metadata.
- **Summary**: Codex channel progress events now carry `detail.kind` (`output|commentary|reasoning`), `detail.stream_id`, `detail.phase`, `detail.text_delta`. Consumers should group deltas by `stream_id` and keep `kind:"message"` as the canonical completed answer.

### 1h. Channel runtime agent definitions auto-dispatched

- **Shipped in**: `beta.23` (closes #323)
- **Problem**: `trellis channel spawn --agent check` failed with `Agent 'check' not found` after switching to `channel-driven-subagent-dispatch` workflow because no command shipped `.trellis/agents/{check,implement}.md`.
- **Summary**: `trellis init` / `trellis update` now ship platform-agnostic `.trellis/agents/{check,implement}.md` on every install. `trellis workflow --template <id>` prints a non-blocking warning when the resolved workflow references missing `.trellis/agents/<name>.md` files (detection via `utils/agent-refs.ts`).

---

## 2. Memory (`trellis mem`)

### 2a. Initial `trellis mem` CLI

- **Shipped in**: `beta.0`
- **Problem**: No way for an AI to recall what was discussed/decided in prior Claude Code / Codex / OpenCode sessions; conversation history is locked inside per-platform on-disk formats.
- **Summary**: Adds `trellis mem list | search | context | extract | projects` reading each platform's session files on disk, stripping hook injections / AGENTS.md preambles / tool-call noise, with filters (`--since`, `--cwd`, `--platform`, `--json`). Handles Claude compaction summaries and Codex compacted events. 84 unit tests; 81.89% statement coverage.

### 2b. `--phase brainstorm|implement|all` slicing

- **Shipped in**: `beta.3`
- **Problem**: An AI recalling a past task wanted just the planning discussion or just the implementation portion, not the full transcript.
- **Summary**: `mem extract <id> --phase brainstorm` slices between `task.py create` and `task.py start`; `--phase implement` is the inverse; `--phase all` is default. Multi-task sessions are separated by `--- task: <slug> ---`. Supported on Claude and Codex; OpenCode falls back to full dialogue. Also: 5–9× speed-up across `mem list` / `mem extract`. `--phase` parser handles `$(... --slug NAME)` substitution, multiple `task.py` invocations per Bash command, and `task.py start` inside commit-message heredocs.

### 2c. Cross-day session window correctness

- **Shipped in**: `beta.2`
- **Problem**: A 29MB Claude session that started on day N–1 and was still being written on day N returned 0 matches under `--since <day N>` despite containing 19 matching turns written that day.
- **Summary**: Filter switched from "session created in range" to `inRangeOverlap(start, end, filter)` — sessions match if `[created, updated]` overlaps `[since, until]`. Removed the misoptimized codex filename-ts short-circuit. 23 new tests across five interval relations × three platforms.

### 2d. OpenCode 1.2+ reader → degraded

- **Shipped in**: `beta.3` (SQLite reader added), `beta.4` (SQLite reader reverted)
- **Problem**: OpenCode 1.2 moved session storage to SQLite, so the old JSON-dir reader returned 0 sessions for anyone on a recent OpenCode. The SQLite fix in beta.3 added a `better-sqlite3` native dependency that failed to install on machines without a C toolchain.
- **Summary**: The SQLite reader is reverted in beta.4; OpenCode `tl mem list / search / extract` now returns empty with a one-shot stderr warning. Claude and Codex paths unchanged. (Permanent OpenCode reader rework is deferred past v0.6.0.)

### 2e. Core mem API in SDK

- **Shipped in**: `beta.15`
- **Problem**: `tl mem` retrieval logic was CLI-only; SDK consumers couldn't reuse it.
- **Summary**: `@mindfoldhq/trellis-core/mem` exports `listMemSessions`, `searchMemSessions`, `readMemContext`, `extractMemDialogue`, `listMemProjects`, with per-platform adapters under `packages/core/src/mem/adapters/`. CLI becomes a thin wrapper.

### 2f. `trellis-session-insight` bundled skill

- **Shipped in**: `beta.23`
- **Problem**: AIs didn't reliably reach for `trellis mem` even when the user phrased a clear "we discussed this before" request.
- **Summary**: A new bundled skill teaches when to invoke `trellis mem` (past-solution recall, decision retrieval, cross-session continuation, familiar-bug debugging, self-pattern spotting, finish-work retrospective) with verbatim English + Chinese triggering phrases. Intentionally does not prescribe a fixed write-back file — the AI judges in the moment whether to quote inline, update a `prd.md` / `design.md`, hand off to `trellis-update-spec`, etc. Auto-dispatched to every supported platform.

---

## 3. SDK extraction (`@mindfoldhq/trellis-core`)

### 3a. Core SDK package

- **Shipped in**: `beta.13`
- **Problem**: Channel and task primitives were locked inside the CLI binary, unavailable to Node consumers and external integrations.
- **Summary**: New published package `@mindfoldhq/trellis-core` exposes `/channel`, `/task`, `/testing` subpath exports. The CLI now depends on it; both packages share one git tag, one npm dist-tag, and one version per release.

### 3b. Dual-package release plumbing

- **Shipped in**: `beta.13` (initial workflow), `beta.14` (post-publish npm verification)
- **Problem**: Releasing two packages in lockstep needed coordinated preflight, version bump, publish, and verification.
- **Summary**: `.github/workflows/publish.yml` publishes `@mindfoldhq/trellis-core` before `@mindfoldhq/trellis`. `release-preflight.js`, `bump-versions.js`, `release.js` are updated for dual-package. Post-publish `verify-npm --package all` confirms both packages on the public npm registry.

### 3c. Reusable channel + mem APIs

- **Shipped in**: `beta.15` (channel worker runtime + mem), `beta.17` (worker inbox APIs), `beta.19` (durable idempotency)
- **Problem**: Channel runtime internals were not yet exported to SDK consumers.
- **Summary**: `@mindfoldhq/trellis-core/channel` and `/mem` expose the lifecycle, subscription, inbox, and retrieval primitives covered in sections 1d and 2e.

---

## 4. Platform additions

### 4a. Reasonix (DeepSeek-Reasonix)

- **Shipped in**: `beta.23` (closes #301)
- **Problem**: Reasonix users had no Trellis support.
- **Summary**: 15th supported AI coding tool, available via `trellis init --reasonix`. Skills live at `.reasonix/skills/<name>/SKILL.md` with YAML frontmatter; slash commands are platform-built-in (no `commands/` dir). `{{CMD_REF:start}}` resolves to `/skill trellis-start` via a new `/skill trellis-` `cmdRefPrefix`. Subagent skills (`trellis-implement`, `trellis-check`) carry `runAs: subagent` frontmatter for isolated subagent loops.

### 4b. Pi Agent — native `trellis_subagent` extension

- **Shipped in**: `beta.5` (initial `<workflow-state>` injection + `npm:pi-subagents` isolation), `beta.19` (native `trellis_subagent` tool + progress cards)
- **Problem**: Pi sub-agents couldn't carry Trellis workflow context, and dispatching Trellis agents through Pi's generic `subagent` collided with community packages and had no progress UI.
- **Summary**: New `trellis_subagent` tool (avoids `subagent` namespace collision) with `single` / `parallel` / `chain` dispatch modes, native progress cards (`renderResult`, throttled by `THROTTLE_MS`), `Alt+O` detail view, `isTrellisAgent()` validation, bounded stdout/stderr buffers. Earlier Pi work in beta.5: per-input `<workflow-state>` / `<session-overview>` injection, `subagent` tool registration carrying `promptSnippet`, and project-level `npm:pi-subagents` isolation via `.pi/settings.json` (closes #246, #249).

---

## 5. Workflow + planning

### 5a. Task triage consent gates

- **Shipped in**: `beta.8`
- **Problem**: Trellis silently created a task for every turn, including simple conversational ones, polluting the task list.
- **Summary**: No-task turns now classify the request. Simple/small: ask only whether to create a Trellis task; if not, skip Trellis for the turn. Complex: ask permission to create a task and enter planning; if declined, clarify scope or suggest a smaller split.

### 5b. Planning artifacts (`prd.md` / `design.md` / `implement.md`)

- **Shipped in**: `beta.8`
- **Problem**: Complex tasks had no structured planning artifacts; everything funneled into a single PRD.
- **Summary**: `task.py create` now creates a default `prd.md`. Complex planning uses `prd.md` (requirements, constraints, acceptance criteria, out-of-scope), `design.md` (boundaries, data flow, contracts, tradeoffs), `implement.md` (checklist, validation commands, review gates) before `task.py start`. Implement/check context loading order is consistent across hook-push, pull-prelude, Pi extension, OpenCode plugin, and inline modes: `jsonl entries → prd.md → design.md → implement.md`.

### 5c. Brainstorm templates aligned to planning flow

- **Shipped in**: `beta.9`
- **Problem**: Brainstorm instructions still referenced the pre-beta.8 single-PRD flow and were too long.
- **Summary**: Shortened brainstorm templates in `codex/skills/brainstorm/SKILL.md`, `common/skills/brainstorm.md`, and `copilot/prompts/brainstorm.prompt.md` — all share the new planning contract.

### 5d. Parent / child task trees

- **Shipped in**: `beta.16`
- **Problem**: Workflow had no guidance on when/how to use parent tasks with independently verifiable children.
- **Summary**: `.trellis/workflow.md` and `get_context.py --mode phase --step 1.1` document parent/child task tree usage. Breadcrumbs `[workflow-state:planning]` and `[workflow-state:planning-inline]` updated. `trellis-brainstorm` and `trellis-meta` skills cover the pattern.

### 5e. Workflow templates (selectable + switchable)

- **Shipped in**: `beta.17`
- **Problem**: There was a single `workflow.md` baked in; users couldn't pick or switch flavors.
- **Summary**: Adds `trellis init --workflow / --workflow-source` and `trellis workflow` switching command. Built-ins: `native`, `tdd`, `channel-driven-subagent-dispatch`. Marketplace via `workflow-resolver.ts`. Active file remains `.trellis/workflow.md`.

### 5f. Check agents review artifacts first

- **Shipped in**: `beta.16`
- **Problem**: Check agents could rubber-stamp code against specs without reading the PRD/design/implement artifacts.
- **Summary**: Check agents now require `prd.md` and optionally read `design.md` / `implement.md` before checking code. Applied to Claude Code, Cursor, OpenCode, Gemini, Kiro, Qoder, CodeBuddy, Droid, and Pi (`trellis-implement.md` + `trellis-check.md`).

### 5g. Workflow-state tool routing — agents vs skills

- **Shipped in**: `beta.19`
- **Problem**: `[workflow-state:in_progress]` blurred sub-agent types and skills, leading agents to try calling missing `trellis-implement` / `trellis-research` skills.
- **Summary**: `trellis-implement` and `trellis-research` declared as sub-agent types only; `trellis-update-spec` declared as skill; `trellis-check` exists as both (verification after code changes should prefer the Agent form).

---

## 6. Updater (`trellis upgrade` + registry refresh + configurable hooks)

### 6a. `trellis upgrade` command

- **Shipped in**: `beta.9`
- **Problem**: Update hints surfaced raw `npm install -g @mindfoldhq/trellis@…` snippets; users were guessing channels.
- **Summary**: `trellis upgrade` installs the npm channel matching the current CLI version (`latest` / `beta` / `rc`). Flags: `--tag <tag>` for explicit dist-tag/version, `--dry-run` to preview. Validates input, avoids shell interpolation on POSIX, uses `cmd.exe /d /s /c` on Windows, prints npm/PATH troubleshooting on failure. Session-start hints now point at `trellis upgrade`.

### 6b. Registry-backed `.trellis/spec` refresh

- **Shipped in**: `beta.23` (closes #315)
- **Problem**: Spec templates pulled from a registry at `trellis init --template <id>` had no path to receive registry updates on `trellis update`.
- **Summary**: `trellis init --template <id>` persists the spec source + template id into `.trellis/config.yaml` under a new `registry.spec` block. `trellis update` reads that block, downloads the configured spec registry into a temp dir, and feeds it through the existing hash / conflict / "modified by you" flow. Supports direct spec registries and marketplace-style registries, including SSH and self-hosted Git. New utility: `utils/registry-config.ts`.

### 6c. Configurable hooks via `.trellis/config.yaml`

- **Shipped in**: `beta.6` (`session_auto_commit`), incrementally through beta cycle
- **Problem**: Project-level configuration of hooks and channel runtime was scattered or absent.
- **Summary**: `.trellis/config.yaml` now drives `session_commit_message` / `max_journal_lines` / `session_auto_commit` (journal auto-commit shape), `hooks.after_create` / `after_start` / `after_finish` / `after_archive` (user shell commands on task lifecycle), `channel.worker_guard.idle_timeout` / `max_live_workers` (channel OOM protection), and `codex.dispatch_mode: inline | sub-agent`. Existing projects receive commented-out blocks via `configSectionsAdded` on `trellis update`.

### 6d. Updater hardening (template ownership, hash tracking, workflow.md as whole file)

- **Shipped in**: `beta.7` (workflow.md as runtime template), `beta.11` (template manifest ownership + Windows hook encoding)
- **Problem**: The updater treated user-owned platform runtime files as Trellis templates; `.trellis/workflow.md` merged only `[workflow-state:*]` blocks, leaving phase headings + platform routing markers stale; hooks on Windows broke on non-UTF-8 stdio.
- **Summary**: `initializeHashes()` now tracks platform/root files from `startRecordingWrites()` output instead of walking `.codex/` / `.claude/` etc. `pruneOrphanManifestKeys()` removes stale orphans before `update` and `uninstall`. `trellis init` / `uninstall` refuse to run in `$HOME` unless `TRELLIS_ALLOW_HOMEDIR=1`. `trellis update` now refreshes hash-tracked `.trellis/workflow.md` as a whole template (fixes upgraded Codex installs with stale `[Codex]` blocks). Hook templates force UTF-8 on Windows (`python -X utf8` + stdio reconfigure with replacement errors).

---

## 7. Bundled skills

### 7a. `trellis-spec-bootstrap`

- **Shipped in**: `beta.18` (initial, typoed name `trellis-spec-bootstarp`), `beta.20` (template-source fix), `beta.23` (rename to `trellis-spec-bootstrap` + `rename-dir` migration across 13 platform skill roots, closes #296)
- **Problem**: After `trellis init`, default spec templates needed project-specific content; users had to find and install a marketplace skill to bootstrap `.trellis/spec/` from the real codebase.
- **Summary**: Platform-neutral bundled skill at `templates/common/bundled-skills/trellis-spec-bootstrap/` provides source-backed references for repository analysis, spec task planning, spec writing, and MCP setup. Auto-installed across all platforms on `trellis init` / `trellis update`, replacing the older `cc-codex-spec-bootstrap` marketplace entry. The beta.23 migration renames already-installed typoed directories across `.claude/skills/`, `.cursor/skills/`, `.opencode/skills/`, `.agents/skills/`, `.kiro/skills/`, `.qoder/skills/`, `.codebuddy/skills/`, `.github/skills/`, `.factory/skills/`, `.pi/skills/`, `.agent/skills/`, `.windsurf/skills/`, `.kilocode/skills/`.

### 7b. `trellis-session-insight`

- **Shipped in**: `beta.23` (covered above in §2f)

---

## 8. Bug fixes & internal cleanup — headline items

### 8a. Exa MCP absence no longer silent-skips Trellis sub-agents (`rc.0`, closes #302)

- **Problem**: Bundled `trellis-implement` / `trellis-check` declared `mcp__exa__web_search_exa` and `mcp__exa__get_code_context_exa` as explicit tools. Claude Code silently skips agent registration when an explicit MCP tool name fails to resolve, so any user without Exa MCP installed lost every Trellis sub-agent from dispatch — the main agent implemented work itself instead of delegating.
- **Summary**: `trellis-implement` / `trellis-check` drop both `mcp__exa__*` entries (these agents do not need web search; tools list shrinks to `Read, Write, Edit, Bash, Glob, Grep`). `trellis-research` folds `mcp__exa__*` + `mcp__chrome-devtools__*` into a single `mcp__*` wildcard, which Claude Code resolves lazily without silent-skip. The Copilot transformer (`mapLegacyToolToCopilot`) gets a matching `mcp__*` case. OpenCode files use `mcp__exa__*: allow` syntax that doesn't silent-skip, so they're intentionally left unchanged.

### 8b. Codex `multi_agent_v2` config block — removed (`beta.21`)

- **Problem**: Codex CLI changed `features` deserialization between 0.130 and 0.131. The structured table form only loads on 0.131+; on 0.130 and earlier (including the Codex desktop app's bundled CLI) it fails with `data did not match any variant of untagged enum FeatureToml…` and aborts config load, blocking Codex from starting. Earlier attempts (`beta.19`/`beta.20`) tried to write a valid bounds set with version notes.
- **Summary**: `trellis init` / `trellis update` no longer write a `[features.multi_agent_v2]` block to `.codex/config.toml`. Codex's own default is used; users tune in their user-level `~/.codex/config.toml` if needed.

### 8c. Codex `dispatch_mode: inline` default (`beta.1`)

- **Problem**: Codex sub-agents run with `fork_turns="none"` isolation, so they can't inherit the parent session's task context — they either exit silently or recursively dispatch.
- **Summary**: Default flipped from `sub-agent` to `inline` so the main Codex agent keeps context. Opt back in via `codex.dispatch_mode: sub-agent` in `.trellis/config.yaml`. `--platform codex` now namespaces into `codex-inline` / `codex-sub-agent` virtual platforms with mode-aware `workflow.md` guidance and a `<codex-mode>` banner injected each turn.

### 8d. Codex sub-agent toml: duplicated pull-based prelude removed (`beta.22`)

- **Problem**: Generated `.codex/agents/trellis-check.toml` and `trellis-implement.toml` contained the "Required: Load Trellis Context First" prelude twice. The class-2 platforms (Codex/Copilot/Gemini/Qoder) can't inject sub-agent context via hook, so a configurator-side injector (`injectPullBasedPreludeToml`) prepends it — but the two Codex toml source templates also carried an inline copy, producing duplication.
- **Summary**: Inline copies removed; the injector is the single source. Regression test asserts the prelude appears exactly once across all class-2 platforms.

### 8e. Task archive auto-commit safety (`beta.5` → `beta.6` → `beta.11` → `beta.18`)

- **Problem**: A `git add -f .trellis/` runaway in `add_session.py` and `task.py archive` could blow past `.gitignore`; later, archive could falsely report success while leaving dirty task files behind.
- **Summary**: Staging now scoped to specific Trellis-owned paths (`safe_commit.py` helper, then `safe_archive_paths_to_add()` in beta.11). `session_auto_commit` config (beta.6) lets users disable auto-commit entirely. Archive now fails non-zero when its auto-commit fails (beta.18) instead of reporting success.

### 8f. Archived task slug collision check (`beta.19`)

- **Problem**: `task.py create` happily created an active task with a slug that already existed under `.trellis/tasks/archive/**`, producing two tasks with the same slug.
- **Summary**: `task.py create` now rejects a slug that already exists in any archived task directory, prints the colliding archived path, and prompts the user to pick a new slug.

### 8g. Cursor `sessionStart` schema match (`beta.17`)

- **Problem**: Cursor `sessionStart` output used the shared `hookSpecificOutput.additionalContext` shape, but Cursor expects a top-level `additional_context` field; the unsupported `beforeSubmitPrompt` hook was also being installed.
- **Summary**: Cursor `sessionStart` output now emits `additional_context` at the top level (shared format retained). Removed unsupported `beforeSubmitPrompt` hook and the copied `.cursor/hooks/inject-workflow-state.py`.

### 8h. OpenCode shell-dialect-aware `TRELLIS_CONTEXT_ID` (`beta.9`)

- **Problem**: OpenCode emitted `env TRELLIS_CONTEXT_ID=…` regardless of which shell would parse it, breaking PowerShell.
- **Summary**: Picks prefix per dialect — PowerShell `$env:TRELLIS_CONTEXT_ID = …`, Git Bash/MSYS/Cygwin `export TRELLIS_CONTEXT_ID=…`, otherwise `env TRELLIS_CONTEXT_ID=…`.

### 8i. Session context — non-Git roots + bounded polyrepo scan (`beta.9`)

- **Problem**: Trellis roots that weren't Git repositories were reporting a fake "clean" Git state.
- **Summary**: Session context now states explicitly that the root is not a Git repo and bounded-scans child repositories for unconfigured polyrepo layouts.

### 8j. Hook timeouts + Copilot stale `systemMessage` (`beta.9`)

- **Problem**: Default hook timeouts were too tight for slow CI / cold-start machines; Copilot `SessionStart` emitted a stale `systemMessage` alongside the canonical `hookSpecificOutput.additionalContext`.
- **Summary**: Default hook timeouts: 30s for `SessionStart`, 15s for per-prompt workflow injection across hook-based platforms. Copilot `SessionStart` keeps only `hookSpecificOutput.additionalContext`.

### 8k. Session-start version-update hint (`beta.5`, closes #254)

- **Problem**: Users didn't notice when their installed Trellis version lagged behind latest.
- **Summary**: `get_context.py` default mode runs a once-per-session `trellis --version` check (1s timeout, best-effort) and prepends `Trellis update available: <current> -> <latest>, run npm install -g @mindfoldhq/trellis@latest` when the install lags.

### 8l. Spec drift cleanup + internal manifest continuity

- **Shipped in**: `beta.2` (spec drift), `beta.9` (`0.5.13.json`), `beta.11` (`0.5.14` / `0.5.15`), `beta.19` (`0.5.17`), `beta.22` (`0.5.19`)
- **Problem**: Spec docs (`.trellis/spec/*`) drifted from real code; manifest-continuity guards intermittently failed on the beta branch because stable-line migration manifests weren't backported.
- **Summary**: `script-conventions.md`, `workflow-state-contract.md`, `directory-structure.md` re-aligned with current code; `docs-site/advanced/architecture.mdx` corrected the false `.trellis/.current-task` fallback claim (EN + ZH). All stable-line migration manifests restored to the beta branch byte-identical to what shipped on `main`.

---

## Caveats / Not Found

- OpenCode `tl mem` reader for OpenCode 1.2+ remains degraded (returns empty + one-shot stderr warning) for the entire v0.6 cycle; a permanent rework is deferred past v0.6.0.
- Feature requests tracked in `#193`, `#318`, `#320`, `#325`, `#326` are explicitly deferred to v0.7 or later per `rc.0`.
- `rc.0` is the feature freeze point; further `0.6.0-rc.*` releases will be bug-only.
