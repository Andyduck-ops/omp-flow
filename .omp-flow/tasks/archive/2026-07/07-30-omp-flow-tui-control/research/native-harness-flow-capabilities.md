---
type: "Research"
title: "Native Harness flow-status capabilities"
---

# Native Harness flow-status capabilities

Question: which current public Claude Code, Codex, and Oh My Pi surfaces can truthfully provide
ambient presentation and a complete task/progress source without terminal scraping, transcript
parsing, or a second lifecycle database?

Scope: external official documentation and pinned upstream source plus the current repository
adapters, inspected 2026-07-30. This is capability research, not implementation authorization.

## Selected conclusion

The three Harnesses do not have one symmetric integration.

| Harness | Ambient flow presentation supportable now | Complete native task set supportable now |
|---|---|---|
| Claude Code | **Yes.** `statusLine` is a persistent, multi-line, ANSI-capable command surface; ccstatusline is a mature implementation of that surface. | **Conditional, not unconditional.** A `TaskList` result is a complete Task-tool snapshot, but status-line stdin does not contain it and mutation hooks alone do not establish a resume baseline. |
| Codex | **No custom footer item.** The current footer accepts a documented closed list of built-in item IDs. `$flow-status` remains the truthful first-release detail surface. | **Yes only for a client-owned app-server turn.** `turn/plan/updated` is a complete plan snapshot for a correlated turn; it is not an ambient extension point inside an unrelated running Codex TUI. |
| Oh My Pi | **Yes at pinned upstream v17.2.1.** An extension can call `ctx.ui.setStatus`, `ctx.ui.setWidget`, and `pi.registerCommand`. | **Yes for one explicitly bound native `task` call.** The actual batch arguments, full `TaskToolDetails.progress` snapshots, and task lifecycle/progress events are structured and correlated. |

Consequently, the current design should:

- retain Claude/ccstatusline as the rich Powerline presentation;
- treat Claude task counts as unavailable until a complete, current `TaskList` snapshot has been
  observed and then maintained from successful Task mutations, rather than reconstructing a set
  from partial hooks;
- keep Codex `$flow-status` on demand and leave a possible app-server plan capability to a later
  interface owned by a client with an explicit thread/turn map;
- revise the current Oh My Pi negative-capability claim: upstream supports a native footer entry
  and slash command, while this repository's adapter merely has not exposed or used those methods
  yet; and
- make every positive capability version/capability gated. Unsupported or unproven versions omit
  task counts and progress rather than guessing.

## Claude Code

### Ambient status is a positive capability

The official status-line contract runs the configured command on session and UI updates, sends
structured session JSON on stdin, accepts multiple output lines and ANSI styling, supplies terminal
dimensions through `COLUMNS`/`LINES` from Claude Code v2.1.153, and supports a periodic
`refreshInterval` for background work. The documented input includes model, workspace, repository,
cost, context, rate-limit, session, prompt, version, and mode facts, but **not** the Task-tool list.
This is a strong native home for ccstatusline and the proposed one/two-line Powerline presentation,
not a task source by itself.

The inspected installation is Claude Code `2.1.220`, so the documented status-line width,
debouncing, prompt ID, and subagent status-line version gates are present in this environment.
Product installation must still verify the target runtime rather than assuming this workstation's
version.

Primary source:

- [Official Claude Code status-line contract](https://code.claude.com/docs/en/statusline)

### Task tools are structured, but a complete baseline is mandatory

Claude Code v2.1.142 and later uses `TaskCreate`, `TaskUpdate`, `TaskGet`, and `TaskList`.
The documented states are `pending`, `in_progress`, and `completed`; `deleted` removes an item.
`TaskCreate` returns the assigned ID in its matching tool result, `TaskUpdate` patches an existing
item, and a `TaskList` tool result supplies a complete list snapshot.

That supports a conditional `claudeTaskListV1` producer without transcript parsing:

1. key scope by `session_id` and reject a different session or project;
2. remain unavailable after startup/resume until a successful `TaskList` result establishes the
   complete baseline;
3. accept only successful, correlated `TaskCreate`/`TaskUpdate` results after that baseline;
4. map `pending` to pending, `in_progress` to active, `completed` to completed, and remove
   `deleted`;
5. invalidate on missed hook continuity, malformed input/result, session change, or freshness
   expiry; and
6. replace the map whenever a newer successful `TaskList` snapshot arrives.

The current project template does not install those observation hooks. It has `SessionStart`,
Write/Edit protection, and selected `SubagentStart` identity injection only
(`templates/claude/settings.json:5`, `templates/claude/settings.json:48`, and
`templates/claude/settings.json:70`).
`TaskCreated` and `TaskCompleted` hooks are also insufficient by themselves: they are deltas,
there is no corresponding complete-list event, and they do not cover every in-progress,
description, dependency, or deletion patch.

`subagentStatusLine` is adjacent but not equivalent. Its command receives all **visible subagent
rows** on a refresh tick as a `tasks` array and customizes one agent-panel row per ID. It does not
place that array in the main `statusLine` stdin, and “visible subagent rows” is not the same set as
the Task-tool plan. It may be useful for a later agent-panel integration, but it must not silently
stand in for `claudeTaskListV1`.

Primary sources:

- [Official Task-tool lifecycle and complete-snapshot guidance](https://code.claude.com/docs/en/agent-sdk/todo-tracking)
- [Official hook inputs for TaskCreated, TaskCompleted, and PostToolUse](https://code.claude.com/docs/en/hooks)
- [Official subagent status-line input](https://code.claude.com/docs/en/statusline#subagent-status-lines)

### Claude recommendation

Ambient Claude/ccstatusline presentation is supportable in v1. Positive task counts are supportable
only after the implementation pins and tests the exact `TaskList` PostToolUse response for the
minimum Claude Code version and enforces the baseline/continuity rules above. Until then,
`claudeTaskListV1` must be `unsupported` or `incomplete`; hooks must not manufacture counts.

## Codex

### The current TUI footer remains closed to third-party items

The fresh official Codex manual documents `tui.status_line` as an ordered array of footer item
identifiers and `/statusline` as a picker for model/reasoning, context, limits, Git, token, session,
directory/project, and version fields. It does not document registering a third-party item or
provider. The current built-in footer is therefore configurable but not an ambient omp-flow
extension surface.

The first-release claim remains: install a managed, read-only `$flow-status` Skill and use it on
demand. Do not describe that invocation as a persistent footer.

Primary source:

- [Official Codex CLI status-line configuration](https://developers.openai.com/codex/cli/slash-commands#configure-footer-items-with-statusline)

### `turn/plan/updated` is a positive, bounded task-set source

At pinned official Codex revision
[`bdda5da56cae0a9fedf3428ac6d308767b4518f9`](https://github.com/openai/codex/tree/bdda5da56cae0a9fedf3428ac6d308767b4518f9),
app-server emits `turn/plan/updated` with:

```text
turnId
explanation?
plan[] = { step, status: pending | inProgress | completed }
```

Each notification replaces the current plan for that turn; it is suitable as a complete ephemeral
task-set snapshot and denominator. The notification itself does not carry `threadId`. A valid
`codexPlanV1` producer must therefore own the app-server request/response correlation:

- retain the `threadId` used in `turn/start` and the returned `turn.id`;
- accept plan updates only when `turnId` equals that current mapped turn;
- retain `{ appServerRevision, connectionId, threadId, turnId, localEventSequence }`;
- reject plan events for unmapped, completed, interrupted, failed, or superseded turns;
- replace the whole plan on every accepted update; and
- invalidate on disconnect or uncertain replay continuity.

This is a positive source for a client the project owns. It does not attach a provider to the
already-running stock Codex TUI, and `thread/read` is explicitly replay-only rather than a live
subscription.

Primary sources:

- [Official app-server documentation](https://developers.openai.com/codex/app-server)
- [Pinned app-server protocol guide](https://github.com/openai/codex/blob/bdda5da56cae0a9fedf3428ac6d308767b4518f9/codex-rs/app-server/README.md)

### Codex recommendation

Keep ambient Codex parity out of the first-release outcome. The app-server plan source remains
future/programmatic research for a later interface where omp-flow launches and owns the client.
The current TUI path is `$flow-status`, and unavailable plan data must remain omitted.

## Oh My Pi

### Pinned upstream capability

The official repository was cloned to ignored
`.omp-flow/cache/repos/oh-my-pi/` at:

- URL: `https://github.com/can1357/oh-my-pi.git`
- revision: `7a2ced50bea8b97dbab7d9bd579329c4ea704de0`
- tag/package version: `v17.2.1` / `@oh-my-pi/pi-coding-agent` `17.2.1`

At that revision, the public extension contract provides:

- `ctx.ui.setStatus(key, text)` for a native footer/status-bar entry;
- `ctx.ui.setWidget(key, content, options)` for a richer component above or below the editor;
- `ctx.ui.setFooter(...)` for full footer replacement;
- `pi.registerCommand(name, handler)` for a native slash command;
- `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`; and
- `pi.events`, the shared typed event bus.

Pinned sources:

- [Extension UI and status APIs](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/extensibility/extensions/types.ts#L228-L269)
- [Command registration](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/extensibility/extensions/types.ts#L1178-L1186)
- [Shared extension EventBus](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/extensibility/extensions/types.ts#L1327-L1331)
- [Status-entry sanitization and composition](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/docs/hooks.md#L233-L240)

The local installed binary reports `omp/16.4.4`; its exact bundled source was not available for
this audit. Implementation must therefore require a verified minimum version/capability probe or
remain unavailable. It must not infer that v16.4.4 has the v17.2.1 contract merely because the
latest upstream does.

### Exact `ompTaskBatchV1` source

For a single explicitly selected native `task` tool call, v17.2.1 supplies a deterministic task
set without Markdown or transcript parsing:

1. `tool_execution_start` supplies the executed `args`, `toolName`, and `toolCallId`. The task
   arguments are either one flat task or a batch containing the complete `tasks[]` submitted by
   that call.
2. `tool_execution_update.partialResult.details` carries `TaskToolDetails`, whose `progress[]` is
   a full snapshot for the call. The task implementation constructs the array from every spawn,
   in input index order, before reporting updates.
3. Each `AgentProgress` has stable `index`, allocated `id`, agent, task/assignment, and the exact
   state union `pending | running | completed | failed | aborted`.
4. `tool_execution_end.result.details` supplies the final structured details for synchronous
   completion.
5. The public task EventBus channels additionally emit correlated lifecycle/progress payloads;
   `SubagentLifecyclePayload` carries `id`, `index`, optional `parentToolCallId`, and
   `started | completed | failed | aborted`.

Pinned sources:

- [Task batch schema and lifecycle channels](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/task/types.ts#L58-L104)
- [Exact `AgentProgress` state and fields](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/task/types.ts#L395-L466)
- [Full `TaskToolDetails.progress` snapshot](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/task/types.ts#L537-L551)
- [Full-spawn snapshot construction](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/task/index.ts#L825-L889)
- [Public tool execution event fields](https://github.com/can1357/oh-my-pi/blob/7a2ced50bea8b97dbab7d9bd579329c4ea704de0/packages/coding-agent/src/extensibility/extensions/types.ts#L674-L699)

A closed producer should remain unavailable until it receives a full progress snapshot whose
length equals the submitted batch length and whose indexes are exactly `0..n-1`. It then replaces
the full member state on each accepted snapshot, maps `running` to active, `completed` to
completed, `pending` to pending, and treats `failed`/`aborted` as terminal attention. Scope is
`{ sessionId, toolCallId }`; a local monotonic event sequence is the source revision. Multiple
simultaneous unselected `task` calls are ambiguous and must not be merged: select one explicit
binding or report unavailable.

### Local adapter gap, not upstream absence

The current repository declares a hand-written minimal `ExtensionAPI` containing only `on`,
`sendMessage`, and `setActiveTools`
(`src/omp/extension-entry.ts:9`). It registers
`tool_call` and `agent_end`, but not the structured execution-update events, UI status, or command
surface (`src/omp/extension-entry.ts:34`).

Therefore the prior statement “Oh My Pi exposes no status or command registration” is false as an
upstream capability claim. The truthful statement is: **the current omp-flow adapter does not yet
import/use the upstream public UI and command API.**

For first release, a thin adapter can:

- call `ctx.ui.setStatus("flow-status", compactText)` to coexist with the native footer;
- register `/flow-status` for read-only detail;
- subscribe to the exact task execution/task EventBus sources above; and
- clear its status key on session switch/shutdown or invalidation.

`setStatus` deliberately strips ANSI/control sequences and is width-truncated, so it is a compact
native footer entry, not ccstatusline Powerline parity. `setWidget` can render richer content but
is a widget above/below the editor. `setFooter` replaces the built-in footer and is not recommended
for this thin coexistence design.

## Claims safe to hand back to design

The next design/QbD revision can safely claim:

1. Claude Code supplies the rich ambient Powerline surface; complete Task-tool counts appear only
   after a verified current `TaskList` baseline and otherwise disappear.
2. Codex supplies an on-demand `$flow-status`; app-server plan support is deferred to a later
   interface and project-owned, explicitly correlated client.
3. Oh My Pi v17.2.1 supplies both a compact ambient footer entry and `/flow-status`, plus an exact
   single-task-call batch/progress source. Older/unverified versions are capability-gated.
4. Cross-Harness visual identity is not required: data semantics can be shared while Claude uses
   Powerline, Oh My Pi uses its native sanitized footer, and Codex uses detail on demand.
5. No source may infer task counts from Bundle files, operation receipts, elapsed time, token use,
   Git state, terminal output, transcript storage, or private Harness files.

Implementation verification required after design approval:

- adapter replay tests over the linked
  [pinned native capability fixtures](../reference/native-capability-fixtures.md);
- a live Claude smoke capture in an authenticated environment when available—the 2026-07-30 local
  probe was blocked before a model turn by an expired configured third-party CodingPlan
  subscription and is disclosed in the fixture Concept; and
- an Oh My Pi installed-version/API probe before enabling the pinned 17.2.1 path.

The bounded Claude published-schema and Oh My Pi pinned-upstream fixtures now cover the positive
payload shapes, invalidation cases, and version provenance required for design review.
`codexPlanV1` has been removed from the first-release source/snapshot union, so no Codex
connection/thread/turn fixture is claimed or required by v1.
