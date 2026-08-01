---
type: "Research"
title: "Cursor native Flow Status display surfaces"
---

# Cursor native Flow Status display surfaces

This Concept answers the [native display question](native-display.md) for Cursor only. Evidence was
checked on 2026-08-01 against repository revision
`0826ba543283179de07650acd6cf075cf60e76e3`, current first-party Cursor documentation/changelog,
and the locally installed Cursor 3.13.25 artifacts. No product code or configuration was changed.

## Conclusion

The provisional anchor is **revised, not falsified**.

- Cursor now has a real native persistent custom status line, but the supported surface evidenced
  here is the **Cursor CLI prompt footer**, not a project-owned Cursor Desktop/Agents Window status
  contribution. Cursor announced `/statusline` on 2026-04-14 specifically as a CLI custom status
  bar for session/runtime signals, including active-task hints
  ([Cursor changelog, 2026-04-14](https://cursor.com/changelog/04-14-26)).
- The installed status-line contract is strong enough to justify a future thin adapter: one command
  is spawned on conversation updates, receives the exact session and workspace as JSON on stdin,
  and renders stdout above the prompt. It supports multiple rows and ANSI. However, the documented
  configuration location is user-global (`~/.cursor/cli-config.json`), not a project file, and its
  refresh is update-driven rather than proven periodic.
- No current primary evidence establishes an arbitrary project-owned persistent footer in Cursor
  Desktop. Cursor's menubar can monitor Cursor Agents, but that is Cursor-owned agent activity, not
  an extension point for root Task/Flow semantics
  ([Cursor 1.7 changelog](https://cursor.com/changelog/1-7)). A VS Code extension could create a
  status-bar item, as the installed base API exposes `window.createStatusBarItem`, but adding an IDE
  extension is explicitly outside the current boundary
  (`D:/各种应用/cursor/resources/app/out/vscode-dts/vscode.d.ts:11667-11684`).
- Therefore the smallest truthful current integration is split by native surface: retain/install an
  obvious **project-local on-demand Cursor command** for Desktop/Agent chat, while treating CLI
  `statusLine` as a separate explicit user-scope capability that must pass released-runtime and
  ownership gates before it is claimed as persistent Flow Status.

This changes the practical decision from “Cursor has no persistent surface” to “Cursor CLI has one,
but it cannot be installed as an unconditional project resource or presented as Cursor Desktop
support.” It does not change the principal contradiction: native presentation must not weaken exact
session scope, lease truthfulness, or ownership.

## Confirmed facts

### Installed release anchor

The Windows user installation reports Cursor `3.13.25`; its packaged base is VS Code `1.128.0`,
Cursor commit `31e8d61c448c7472e371505838a0fe34083dad50` / real commit
`31e8d61c448c7472e371505838a0fe34083dad55`, dated `2026-07-28T06:17:45.069Z`:

- `D:/各种应用/cursor/resources/app/package.json:3`
- `D:/各种应用/cursor/resources/app/product.json:7`
- `D:/各种应用/cursor/resources/app/product.json:2223`
- `D:/各种应用/cursor/resources/app/product.json:2276-2278`

The installed first-party `cursor-agent-host`, `cursor-agent-exec`, and
`cursor-local-agent-runtime` extension manifests each have an empty declarative `contributes`
object (`.../extensions/<name>/package.json:1`). This is bounded counter-evidence against an
extension-manifest command/status contribution, not proof that Cursor's private workbench contains
no internal UI.

The app-installed Cursor guidance is revision-anchored here by file hash:

- `C:/Users/27309/.cursor/skills-cursor/statusline/SKILL.md`, SHA-256
  `9CE07CEFC16FAF737AD58FB8F09AC6D34FF457382DAF90FF6A06D402F4688D73`, modified
  `2026-07-29T15:28:06+08:00`.
- `C:/Users/27309/.cursor/skills-cursor/create-hook/SKILL.md`, SHA-256
  `28BFA0C6CD13FA0167C72512FCA0DA2C6FC24B6EEA67C5307BF1EF2BEDCA61A6`, modified
  `2026-07-29T15:28:05+08:00`.

Neither `agent`, `cursor-agent`, nor `cursor` resolved on this Windows process's `PATH`; no
`~/.cursor/cli-config.json` or `~/.cursor/hooks.json` existed. Thus this investigation positively
identified the installed Desktop build and its packaged guidance/schema, but did **not** execute a
released Cursor CLI 3.13.25 status line. Package/guidance presence is not runtime-delivery proof.

### Cursor CLI persistent status line

Official Cursor changelog evidence says `/statusline` customizes the CLI status bar and that the
built-in footer also shows working directory, worktree, and branch
([2026-04-14 changelog](https://cursor.com/changelog/04-14-26)). The installed 3.13.25 guidance adds
the exact contract:

- It is “rendered above the prompt”; a command is spawned on each **conversation update**, stdin is
  one JSON session payload, and stdout is the visible status line
  (`C:/Users/27309/.cursor/skills-cursor/statusline/SKILL.md:8-10`).
- Configuration is documented at `~/.cursor/cli-config.json` under one `statusLine` key. The command
  may be an executable/script or inline command; `padding` defaults to `0`, `updateIntervalMs` to
  `300` ms with a 300 ms lower clamp, and `timeoutMs` to `2000` ms
  (`.../statusline/SKILL.md:12-34`). The packaged agent-host config schema also contains exactly
  `type`, `command`, `padding`, `updateIntervalMs`, and `timeoutMs` in
  `D:/各种应用/cursor/resources/app/extensions/cursor-agent-host/dist/main.js` at byte offset
  `3606696` (minified one-line artifact).
- Stdin includes `session_id`, `session_name`, `transcript_path`, `render_width_chars`, `cwd`, model,
  workspace/current directory, CLI version, context-window data, and optional worktree data
  (`.../statusline/SKILL.md:36-108`). `session_id` is explicitly described as the unique session
  identifier (`:85-88`). The official CLI output-format contract likewise puts one `session_id` on
  initialization and all subsequent events and says it remains consistent within one execution
  ([Cursor CLI output format](https://docs.cursor.com/en/cli/reference/output-format)).
- Multiple stdout lines and ANSI are supported. A non-zero exit with empty stdout retains the
  previous text. Timeout or a new update kills the in-flight process. Rendering is local and does
  not consume API tokens (`.../statusline/SKILL.md:123-129`). The implementation note says spawning
  is no-shell on Unix, while Windows uses `shell: true` for `.cmd`/`.bat`; updates are debounced and
  a replacement update aborts the running invocation (`:188-196`).

This is a genuine persistent native presentation surface. It is not, however, a periodic watcher:
`updateIntervalMs` is documented as a **minimum interval/debounce**, and invocation is tied to
conversation updates. No checked primary source promises a timer invocation solely because a Flow
Status lease expires. A line rendered while fresh can therefore remain visible during an idle
period after root authority expires unless Cursor produces another conversation update. The
non-zero/empty “keep previous text” behavior also means an adapter must not use that failure shape
for unavailable or stale state.

### Cursor project commands are on demand, not a status widget

Cursor's official command surface discovers Markdown prompts under
`.cursor/commands/[command].md`, shows them when the user types `/`, and runs the selected reusable
prompt in Agent chat. Cursor describes the feature as beta
([Commands documentation](https://docs.cursor.com/en/agent/chat/commands);
[Cursor 1.6 changelog, 2025-09-12](https://cursor.com/changelog/1-6)). This provides a discoverable,
Git-owned `/flow-status`-style entry, but its output is a conversation response on demand; it is
neither persistent nor notification-like. The `/commands` CLI action added in January 2026 manages
these commands, while `agent` became the primary CLI executable and `cursor-agent` an alias
([Cursor changelog, 2026-01-08](https://cursor.com/changelog/cli-jan-08-2026)).

For omp-flow this prompt surface can point to the already installed read-only `flow-status` Skill;
it should not introduce another cache or infer a session. The current Skill requires explicit
Cursor host evidence plus a matching Hook-injected context and executes the exact project runtime
inspect command ([Flow Status Skill](../../../../templates/common/skills/flow-status/SKILL.md):10-45).

### Hooks establish project ownership and session evidence, but are not presentation

Current official docs describe Hooks as scripts that observe, control, and extend the Agent loop,
for auditing, blocking, or redaction—not as a status UI
([Hooks documentation](https://cursor.com/docs/hooks);
[Cursor 1.7 changelog](https://cursor.com/changelog/1-7)). Installed 3.13.25 guidance confirms:

- project hooks live at `.cursor/hooks.json` with scripts under `.cursor/hooks/`, execute from the
  project root, and are preferred for repository-shared behavior
  (`C:/Users/27309/.cursor/skills-cursor/create-hook/SKILL.md:26-36`);
- `sessionStart`/`sessionEnd` are lifecycle events, while `beforeSubmitPrompt`, `stop`, tool events,
  and response/thought events have other control/observation roles (`:38-70`);
- command hooks exchange JSON over stdin/stdout; output fields are event-specific (`:117-168`,
  `:193-203`); Cursor watches and reloads `hooks.json` on save and exposes a Hooks settings tab and
  Hooks output channel for verification/debugging (`:205-228`). Those output-channel surfaces are
  diagnostic, not persistent project status contributions.

The existing omp-flow adapter already uses the smallest useful Hook boundary: exact-owned
`sessionStart` plus a write guard
([hooks.json](../../../../templates/cursor/hooks.json):1-18). `sessionStart` requires
`conversation_id`, rejects a conflicting optional `session_id`, confirms the Git root is one of the
native workspace roots, and returns `OMP_FLOW_CONTEXT_ID=<conversation_id>` plus
`OMP_FLOW_HOST=cursor`
([session-start.py](../../../../templates/cursor/hooks/session-start.py):27-55,
57-89,123-147). The repository deliberately states that fixture success does not establish real
environment propagation, concurrent conversations, resume/reopen, or subagent inheritance
([README](../../../../README.md):510-524).

Hooks should therefore remain an identity/lifecycle bridge. Running inspect from every Hook and
trying to display its stdout would conflate a control/diagnostic channel with presentation and
still would not create a footer.

### Existing Flow Status v2 is already sufficient as the data source

The Python runtime accepts `cursor` as one of five closed hosts
([flow_status.py](../../../../templates/.omp-flow/scripts/common/flow_status.py):25). Read-only
inspection filters by canonical repository, exact host, exact host session, bounded cache age, and
unambiguous scope; it converts an expired root lease to unavailable
([flow_status.py](../../../../templates/.omp-flow/scripts/common/flow_status.py):3449-3514). Its
existing text formatter emits scope, session, root Task, Flow ordinal/position, bounded measure,
Execute/Review detail, Wave, and separately labelled native activity
([flow_status.py](../../../../templates/.omp-flow/scripts/common/flow_status.py):3517-3574).

There is also an existing compact v2 formatter in the Oh My Pi adapter which renders Task, Flow
ordinal, and measure without relabelling native tasks
([flow-status.ts](../../../../src/omp/flow-status.ts):201-240). A Cursor adapter should call/reuse an
existing supported renderer or pass through the Python detail formatter; it must not fork a third
interpretation of snapshot semantics.

## Strongest counter-evidence and its effect

1. **Counter to “Cursor has no persistent surface”:** the 2026-04-14 CLI `/statusline` release and
   installed 3.13.25 contract directly disprove that broad claim. The framing must distinguish
   Cursor CLI from Cursor Desktop.
2. **Counter to “install the status line project-locally”:** checked guidance documents only the
   user-global `~/.cursor/cli-config.json` statusLine. No checked primary source establishes a
   project `.cursor/cli.json` override for this field. Installing it during ordinary
   `init --cursor` would silently widen project ownership into exclusive user configuration.
3. **Counter to “the native status line makes freshness automatic”:** it refreshes on conversation
   updates, not on a proven wall-clock timer, while Flow Status root authority expires independently.
   Its failure contract can intentionally retain the previous line. Persistent visibility alone is
   not evidence that displayed semantics remain current.
4. **Counter to “Hooks can fill the gap”:** Hooks can provide identity and execute scripts, but the
   supported outputs control or contextualize Agent behavior. The Hooks output channel is for
   diagnostics. No Hook event contributes a persistent status item.
5. **Counter to “there is no Desktop option at all”:** the underlying VS Code extension API can
   create status-bar items. That would work only by introducing and owning an IDE extension, which
   violates the explicit no-extension boundary and is not the smallest adapter.

These findings warrant a narrow Brainstorm clarification only if “Cursor” was intended to mean
both Desktop and CLI with one identical promise. They do not require rewriting the anchor's values:
truthful native capability and exact scope remain the right criteria.

## Recommendation

### Immediate bounded direction

1. **Cursor Desktop / Agents Window:** add or retain one exact-owned project command such as
   `.cursor/commands/flow-status.md` whose sole purpose is to invoke the shared read-only
   `flow-status` Skill. Describe it as **on-demand Agent-chat output**, not a status bar. Preserve a
   foreign or modified command and fail visibly on ownership conflict. This is the smallest native,
   project-local, discoverable surface supported by current evidence.
2. **Cursor CLI:** design native `statusLine` support as an explicit user-scope setup/update/remove
   operation, not part of normal `init --cursor`. It may own only the exclusive `statusLine` key and
   one bounded adapter command; it must preserve all unrelated user config and refuse a foreign or
   modified statusLine. Absence of the CLI or positive capability evidence must degrade to
   unavailable without modifying config.
3. The CLI adapter should read one bounded stdin JSON object, require a non-empty `session_id`,
   require `cwd` and `workspace.current_dir` to agree when both exist, resolve that repository only,
   and inspect `--host cursor --session <session_id>`. It should emit the existing detail/compact
   representation only for a fresh exact match. Missing, expired, conflicting, malformed, or
   scope-mismatched state must clear or render explicit unavailable state; it must never use the
   documented non-zero/empty path that retains old text.
4. Do not read `transcript_path`, infer from configured Harness order, reuse a cache from another
   session, renew the lease, or add a second renderer/cache. Hooks remain the environment/session
   bridge; the status command remains a read-only observer.

### Required released-runtime verification before claiming CLI persistence

- Install/run the actual current `agent`/`cursor-agent` CLI and capture one real statusLine stdin
  payload plus `sessionStart` payload in the same session; prove `statusLine.session_id` equals the
  Hook `conversation_id`/optional `session_id` used for publication.
- Repeat after `/resume`, a new chat, concurrent sessions, worktree use, and current-directory
  changes. Prove isolation and that no prior scope is selected.
- Prove exit-zero/empty stdout clears old content. Prove timeout, non-zero/empty, malformed JSON,
  command-not-found, and repo disappearance behavior in the released CLI.
- Let the v2 root lease expire without a conversation update. Observe whether Cursor triggers a
  refresh. If it does not, persistent output must visibly carry a bounded validity timestamp or the
  capability must remain labelled update-driven/best-effort rather than “current.” This is the
  principal unresolved safety issue.
- Verify Windows quoting/shell behavior separately because `.cmd`/`.bat` execution uses a shell.
  Prefer a pinned absolute executable/script and no user-controlled shell interpolation.

Until those checks pass, the on-demand project command is the selected truthful integration and the
CLI status line is a justified follow-up design candidate, not a released capability claim.

## Unknowns that still matter

- Whether current Cursor CLI accepts `statusLine` from project `.cursor/cli.json`; no checked
  primary source says it does. The installed guidance names only the user-global file.
- Whether statusLine `session_id` and IDE/CLI Hook `conversation_id` remain identical through
  resume, worktree, remote, and handoff paths.
- Whether a conversation-independent timer refresh exists despite the documented
  conversation-update/debounce wording.
- Whether exit-zero with empty stdout clears the previous line; only non-zero/empty retention is
  documented.
- Whether Cursor Desktop 3.13.25 exposes a private built-in status contribution not documented in
  the public Hooks/commands/statusline sources. This cannot authorize integration without a stable
  public contract.

None of these unknowns blocks the Desktop on-demand command. All of the session/freshness unknowns
block an unconditional persistent CLI claim.

## Source provenance and clone decision

Primary external anchors used here are Cursor's official docs/changelog URLs with the dates named
above. Cursor's exact statusLine implementation source is not available as a useful public
repository in the checked evidence; the installed build is minified and the installed first-party
guidance provides the stronger version-local contract. The public VS Code repository would only
demonstrate the out-of-scope generic extension API already present in installed `vscode.d.ts`.
Accordingly no external repository was cloned into `.omp-flow/cache/repos/` and no separate
Reference Concept was created. If Cursor publishes the referenced
`packages/agent-cli/src/hooks/use-status-line.ts`, acquire that repository at an exact revision and
add one task-local Reference Concept anchored to status-line scheduling, config precedence,
process spawning, and empty-output replacement behavior.

## Assignment correlation

- Actor ID: `cursor_status_researcher`
- Dispatch receipt: `86d092d6cab4416589f5ff07d9c9feed`
- Output boundary: this Research Concept only
