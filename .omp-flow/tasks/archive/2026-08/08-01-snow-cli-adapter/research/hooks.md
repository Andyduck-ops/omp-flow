---
type: "Research"
title: "Snow workflow Hooks"
---

# Snow workflow Hooks

This Concept answers the Hook questions in the linked
[Brainstorm](../brainstorm.md). Source provenance and the exact acquisition revision are recorded
in [Snow CLI upstream source](../reference/snow-cli-upstream.md). The investigated source is
`MayDay-wpf/snow-cli` npm package `snow-ai` v0.8.24, tag `v0.8.24`, commit
`86a18cfbf5844c14a99dcc717eed26b8cf5b89d4` (2026-07-31).

## Conclusion

Snow has a real, repository-local workflow Hook surface, not merely React hooks or a `.agent`
convention. It is capable enough to provide optional session orientation and a defense-in-depth
write guard, but it is not a safe default dependency for the first omp-flow adapter:

1. A project file `.snow/hooks/<hookType>.json` does **not** compose with the corresponding global
   file. Any non-empty project rule array completely shadows the global rules for that event,
   including when its actions are disabled. This contradicts the upstream guide's claim that both
   scopes execute project-first.
2. A configured `command` is passed directly to Node `child_process.exec()` without a project
   trust/hash gate in the load-to-execute path. A checked-in project Hook therefore represents
   shell execution under the user's account.
3. Windows uses Node's default `ComSpec` shell. Snow has no Codex-like `commandWindows` field, so
   existing omp-flow Hook command strings cannot be copied unchanged.
4. Root and team ordinary tool calls do pass through `beforeToolCall`, but team
   `afterToolCall` does not honor a hard `block` result. Hook coverage is useful defense in depth,
   not a complete sandbox or a portable enforcement boundary.
5. Snow already exports its stable session UUID as `SNOW_SESSION_ID` to Hook and tool child
   processes. The current omp-flow runtime does not recognize that environment key. Direct
   session-scoped CLI compatibility should therefore be solved at the mechanical identity boundary,
   independently of installing a Hook.

The smallest justified direction is: make Snow session identity and native Skills/agents work
without Hooks; do not install project Hook JSON by default. Treat optional managed
`onSessionStart` and `beforeToolCall` integrations as a later, explicit capability with visible
global-shadowing, trust, ownership-conflict, and coverage caveats. This **confirms** the anchor's
native-exactness concern but **revises** any assumption that finding analogous Hook events
automatically justifies a fourth Hook layer.

## Confirmed upstream contract

### Discovery, configuration, and execution order

- Snow defines nine events: `onUserMessage`, `beforeToolCall`, `toolConfirmation`,
  `afterToolCall`, `onSubAgentComplete`, `beforeCompress`, `onSessionStart`, `onStop`, and
  `beforeSubAgentStart`. Actions are `command`, `prompt`, or `context`
  (`.omp-flow/cache/repos/snow-cli/source/utils/config/hooksConfig.ts:15-41`; [pinned
  source](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/hooksConfig.ts#L15-L41)).
- Global files are `~/.snow/hooks/<hookType>.json`; project files are resolved from
  `process.cwd()` as `.snow/hooks/<hookType>.json`. A file may contain a raw rule array or an object
  keyed by its Hook type. Invalid JSON is logged and treated as no rules
  (`.omp-flow/cache/repos/snow-cli/source/utils/config/hooksConfig.ts:147-214`; [pinned
  source](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/hooksConfig.ts#L147-L214)).
- The actual precedence is fallback, not composition: the loader returns project rules whenever
  `projectRules.length > 0`, otherwise global rules. The executor calls only that loader
  (`.omp-flow/cache/repos/snow-cli/source/utils/config/hooksConfig.ts:241-248`,
  `.omp-flow/cache/repos/snow-cli/source/utils/execution/unifiedHooksExecutor.ts:175-180`;
  [pinned loader](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/hooksConfig.ts#L241-L248)).
  This falsifies the guide at
  `.omp-flow/cache/repos/snow-cli/docs/usage/en/07.Hooks Configuration.md:746-777,1411-1413`,
  which says both scopes execute.
- Only actions with `enabled === true` run. Matching rules and actions execute sequentially in
  authored order. Exit 1 is recorded as a soft result; exit 2+ stops later actions
  (`.omp-flow/cache/repos/snow-cli/source/utils/execution/unifiedHooksExecutor.ts:192-220,240-343`;
  [pinned executor](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/unifiedHooksExecutor.ts#L192-L343)).
- Matchers are comma-separated OR clauses. An unqualified matcher is a case-insensitive,
  whole-name tool match with `*` wildcard; `key:pattern` addresses a context field. If no
  `toolName` exists, the implementation falls back to substring search over serialized context
  (`.omp-flow/cache/repos/snow-cli/source/utils/execution/unifiedHooksExecutor.ts:450-519`;
  [pinned matcher](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/unifiedHooksExecutor.ts#L450-L519)).

### Command transport and platform behavior

For every `command` action, Snow:

- serializes the event context as one JSON object on stdin;
- chooses `context.cwd` when present, otherwise `process.cwd()`;
- injects session identity environment variables;
- calls `child_process.exec(command, {cwd, timeout, maxBuffer, env})`;
- defaults to a 5,000 ms timeout and 10,000-character executor output bound; and
- captures stdout and stderr separately
  (`.omp-flow/cache/repos/snow-cli/source/utils/execution/unifiedHooksExecutor.ts:575-622,624-730`;
  [pinned command executor](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/unifiedHooksExecutor.ts#L575-L730)).

`exec()` is a shell API. Snow does not select a shell or expose a per-platform command field.
For the Node >=22 runtime required by Snow, Node documents the default as `/bin/sh` on Unix and
`process.env.ComSpec` on Windows, and warns that shell metacharacters execute
([Node.js child-process documentation](https://nodejs.org/download/release/v22.18.0/docs/api/child_process.html#child_processexeccommand-options-callback)).
Snow only adds `PYTHONIOENCODING=utf-8` on Windows; that changes encoding, not parsing or quoting
(`.omp-flow/cache/repos/snow-cli/source/utils/execution/unifiedHooksExecutor.ts:606-620`). Thus an
omp-flow Snow template must use an install-time platform command or a deliberately cross-platform
entry script and must be smoke-tested under `cmd.exe`; POSIX substitution and quoting from the
Codex template are not portable.

The command environment sets `SNOW_SESSION_ID` to the current UUID, fills
`TRELLIS_CONTEXT_ID=snow-<uuid>` only when the parent has none, sets `SNOW_CWD`, and defaults
`SNOW_PLATFORM=snow`. Stdin is enriched with both `sessionId` and `session_id`, plus `cwd` and
`platform` (`.omp-flow/cache/repos/snow-cli/source/utils/execution/sessionIdentityEnv.ts:17-46,57-87`;
[pinned identity contract](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/sessionIdentityEnv.ts#L17-L87)).

### Event payloads and interpreted outcomes

| Event | Confirmed payload / output | Outcome relevant to an adapter |
|---|---|---|
| `onSessionStart` | `{messages, messageCount, sessionId, cwd, isResume}`; exit 0 JSON may provide `additionalContext` | Context is buffered once for the next model-bound user turn. Exit 1 warns and continues; exit 2+ blocks session loading. Unexpected executor exceptions are caught and fail open. Evidence: `.omp-flow/cache/repos/snow-cli/source/utils/session/sessionManager.ts:33-43,1374-1433` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:183-216`. |
| `onUserMessage` | `{message, imageCount, source, sessionId, cwd, messageCount}` | Exit 0 JSON prepends context while keeping the UI bubble unchanged; exit 1 replaces model-bound text; exit 2+ blocks sending. Evidence: `.omp-flow/cache/repos/snow-cli/source/hooks/conversation/chatLogic/useMessageProcessing.ts:676-729,825-880` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:36-64`. |
| `beforeToolCall` | `{toolName, args}` | Exit 1 blocks that tool and supplies stderr/stdout as the tool result. Exit 2+ blocks with `hookFailed`. A successful stdout can auto-answer `askuser-ask_question`. Evidence: `.omp-flow/cache/repos/snow-cli/source/utils/execution/toolExecutor.ts:275-342` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:66-93`. |
| `toolConfirmation` | `{toolName, args, isSensitive, matchedPattern, matchedReason, allTools?}` | Successful stdout can approve, always approve, reject, or reject with reply. Exit 1 warns; exit 2+ rejects in the main ToolConfirmation UI. Evidence: `.omp-flow/cache/repos/snow-cli/source/ui/components/tools/ToolConfirmation.tsx:242-283` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookResultInterpreter.ts:330-398`. |
| `afterToolCall` | `{toolName, args, result, error}` | Exit 1 replaces the normal result; exit 2+ produces a block/`hookFailed` interpretation. Root execution honors it, but team execution does not consistently do so. Evidence: `.omp-flow/cache/repos/snow-cli/source/utils/execution/toolExecutor.ts:652-681` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:95-122`. |
| `beforeSubAgentStart` | `{agentId, agentName, prompt, cwd, sessionId}`; exit 0 JSON may return a full `prompt` or `additionalContext` | Full prompt wins over prepend context. Every failure/timeout is intentionally fail-open, preserving the original prompt. Evidence: `.omp-flow/cache/repos/snow-cli/source/utils/execution/subAgentExecutor.ts:102-127` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:218-251`. |
| `onSubAgentComplete` | `{agentId, agentName, content, success, usage}` | Command exit 2+ or a prompt response addressed to AI is injected as a new user message and continues the sub-agent loop. Evidence: `.omp-flow/cache/repos/snow-cli/source/utils/execution/subAgentExecutor.ts:404-439` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:253-299`. |
| `beforeCompress` | `{messages, conversationJson}` | Exit 1 warns and continues; exit 2+ returns a blocked compression result. Evidence: `.omp-flow/cache/repos/snow-cli/source/utils/core/contextCompressor.ts:643-686` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:152-181`. |
| `onStop` | `{messages}` | Runs after a non-aborted conversation completes. Prompt/command outcomes can inject user or assistant messages and continue the conversation. Evidence: `.omp-flow/cache/repos/snow-cli/source/hooks/conversation/core/onStopHookHandler.ts:17-68` and `.omp-flow/cache/repos/snow-cli/source/utils/execution/hookStrategies.ts:301-362`. |

`context` actions perform static injection without a shell and are allowed only for
`onSessionStart`, `onUserMessage`, and `beforeSubAgentStart`
(`.omp-flow/cache/repos/snow-cli/source/utils/config/hooksConfig.ts:332-349`). Successful command
or context output accepts top-level `additionalContext`, nested
`hookSpecificOutput.additionalContext`, optional UI-only `display`, and `prompt` for sub-agent
start. Non-JSON output is not injected; multiple contexts join with blank lines and are truncated
to 8,192 code units (`.omp-flow/cache/repos/snow-cli/source/utils/execution/hookResultInterpreter.ts:68-184,186-240`;
[pinned result protocol](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/hookResultInterpreter.ts#L68-L240)).

## Root and team tool-path verification

The root tool executor invokes `beforeToolCall` before checking and dispatching `team-*` or other
tools, and invokes `afterToolCall` from `finally`
(`.omp-flow/cache/repos/snow-cli/source/utils/execution/toolExecutor.ts:284-344,652-681`).

Team ordinary MCP calls also pass through Hooks in both relevant branches:

- plan-mode non-blocked calls run `beforeToolCall` before `executeMCPTool`, followed by
  `afterToolCall` (`.omp-flow/cache/repos/snow-cli/source/utils/execution/teamExecutor.ts:971-1056`;
  [pinned team path](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/teamExecutor.ts#L971-L1056));
- approved regular calls repeat the same ordering
  (`.omp-flow/cache/repos/snow-cli/source/utils/execution/teamExecutor.ts:1143-1220`).

However, team code catches Hook executor exceptions as best effort. More importantly, after
interpreting `afterToolCall`, it applies only `action === 'replace'`; an `action === 'block'` from
exit 2+ is ignored, and the error branch executes `afterToolCall` without interpreting its result
(`teamExecutor.ts:1034-1056,1071-1092,1198-1220,1230-1251`). This revises the upstream guide's
unqualified claim that `afterToolCall` exit 2+ terminates the AI flow
(`docs/usage/en/07.Hooks Configuration.md:1124-1140`). An omp-flow adapter must not place
authoritative runtime protection or operation correlation in that outcome.

## Trust and ownership implications

No trust prompt, reviewed hash, signature, allowlist, or repository-ownership check is present
between project discovery and shell execution: `loadHookConfigWithFallback()` reads the current
project file, and `executeCommand()` sends its string to `exec()` at the anchors above. This is a
bounded implementation finding, not a claim about OS sandboxing elsewhere in Snow. It means:

- omp-flow must describe a Snow `command` Hook as executable project configuration;
- init/update should never merge into, overwrite, or silently adopt a foreign
  `.snow/hooks/<event>.json`;
- an exact-owned project file still suppresses the user's global Hook for that event; and
- putting a static `context` action in the project file avoids shell side effects but does not
  avoid global shadowing.

The existing omp-flow updater already has the right general ownership posture: unchanged managed
files auto-update, user-modified or unmanaged files are skipped/presented as conflicts, and an
explicit new copy is available (`src/cli/update.ts:64-142,198-224`). If optional Snow Hook files
are ever added, they should use this exact-owned behavior rather than a new merge/compatibility
database. A foreign event file should degrade the optional Hook capability visibly while leaving
Skills and explicit CLI operation available.

## Adapter decision implications

### Required for core compatibility

1. **Do not require Hooks for session identity.** Snow already propagates `SNOW_SESSION_ID` into
   Hook and terminal/tool children. The current runtime accepts Codex, OMP, and Pi environment
   keys but not Snow (`templates/.omp-flow/scripts/common/active_task.py:14-20,44-61`). The
   Architect should choose a mechanical Snow identity binding (most directly a `("snow",
   "SNOW_SESSION_ID")` environment mapping) and verify two concurrent Snow sessions resolve
   distinct active-task pointers. `TRELLIS_CONTEXT_ID` is not currently consumed and should not be
   mistaken for compatibility.
2. **Keep task meaning out of Hook output.** If an optional `onSessionStart` handler is designed,
   it may read the already-selected runtime `status` and return bounded mechanical orientation via
   `additionalContext`. It must not infer Task, Flow, approval, verdict, or progress from Markdown,
   transcripts, Hook events, or task counts. This preserves the existing project boundary in
   `templates/codex/hooks/session-start.py:14-21,78-101,117-143`.
3. **Keep Python authoritative.** A `beforeToolCall` guard can inspect Snow's concrete
   `filesystem-create`, `filesystem-edit`, and `filesystem-replaceedit` argument shapes and deny
   known `.omp-flow/.runtime` writes. It cannot safely claim coverage of arbitrary
   `terminal-execute`, external MCP mutators, skipped/broken Hooks, or the team after-Hook gap.

### Optional Hook capability gate

An optional project Hook layer is justified only if all of these are accepted and verified:

- the user explicitly opts into executable project Hooks;
- each event file is absent or exact-owned; foreign or modified files produce a visible conflict;
- the installer warns that creating a project file shadows the same global event;
- platform rendering produces a valid `python`/`python3` command for the installed OS because
  Snow has no `commandWindows` alternative;
- `onSessionStart` new/resume, root tools, direct sub-agents, and both team tool branches are smoke
  tested on Windows and one POSIX platform; and
- the product describes failure as safe degradation to Skills/CLI, not as guaranteed Hook
  enforcement.

Until upstream provides scope composition or a stable trust mechanism, the costs of a default
Hook installation outweigh bounded orientation convenience. No new Hook layer is necessary for
the irreducible outcome.

## Counter-evidence and remaining unknowns

- **Against “Snow has no stable Hook surface”:** the typed event map, UI editor, executor,
  documented paths, and call sites are substantial evidence of a supported surface. That part of
  the Brainstorm counter-hypothesis is falsified.
- **Against “the documented contract is uniform”:** project/global precedence and team
  `afterToolCall` hard-failure behavior contradict the guide. Code at the pinned revision is the
  compatibility authority.
- **Unknown:** no upstream test was found for project-versus-global composition or team hard
  `afterToolCall` handling. These should be upstream regression candidates, not assumptions in
  omp-flow.
- **Verification limitation:** the pinned repository had no `node_modules`; an attempted
  `npm ci --ignore-scripts --no-audit --no-fund` exceeded the 120-second investigation bound, so
  no upstream tests were executed. Static upstream tests nevertheless corroborate context parsing,
  8 KiB truncation, prompt precedence, and session identity at
  `source/test/hookAdditionalContext.test.ts:38-190` and
  `source/test/sessionIdentityEnv.test.ts:15-190`. The timed-out dependency acquisition changed
  only the ignored clone cache, not product source or task meaning.

## Decision impact

No material reframe of the user goal is required, so returning to Brainstorm is not recommended.
The evidence confirms that Snow merits a native adapter, but narrows its first design: core
compatibility should be session identity plus native Skills/agents and explicit CLI operation;
project Hooks are an optional, conflict-aware enhancement rather than a prerequisite. Design must
not claim global Hook composition, trusted project Hooks, universal hard-failure enforcement, or
cross-platform command parity without new upstream evidence.
