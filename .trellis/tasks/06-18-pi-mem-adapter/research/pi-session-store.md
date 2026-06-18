# Pi Session Store Research

## Sources

- `/home/haurynlee/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/docs/session-format.md`
- `/home/haurynlee/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/docs/sessions.md`
- `/home/haurynlee/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js`
- `/home/haurynlee/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts`
- Local structural inspection of `~/.pi/agent/sessions/**` without copying dialogue text.

## Storage layout

Pi stores sessions as local JSONL files, not SQLite:

```text
~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<session-id>.jsonl
```

The cwd directory encoding is:

```ts
`--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
```

Session root selection in Pi startup is:

1. `--session-dir`
2. `PI_CODING_AGENT_SESSION_DIR`
3. `settings.json.sessionDir`
4. default `~/.pi/agent/sessions/<encoded-cwd>`

For Trellis `mem`, the adapter can infer environment and settings-based roots. A Pi CLI `--session-dir` used in another process is not visible unless Trellis adds a matching flag later.

## File format

The first JSONL row is a session header:

```json
{
  "type": "session",
  "version": 3,
  "id": "uuid",
  "timestamp": "ISO",
  "cwd": "/project",
  "parentSession": "optional path"
}
```

Subsequent rows are entries with `id`, `parentId`, and `timestamp`. Version 3 is tree-shaped; `/tree` creates branches inside the same file, while `/fork` and `/clone` create new session files.

Relevant entry types:

- `message`
- `session_info`
- `compaction`
- `branch_summary`
- `custom_message`
- `custom`
- `model_change`
- `thinking_level_change`
- `label`

Relevant message roles:

- `user`
- `assistant`
- `toolResult`
- `bashExecution`
- `custom`
- `branchSummary`
- `compactionSummary`

Assistant content can include `text`, `thinking`, and `toolCall` blocks. Only `text` should enter cleaned dialogue.

## Active branch requirement

A Pi session file is not a linear transcript. The adapter must find the active leaf and walk `parentId` back to root, then reverse the path. The default leaf matches Pi behavior: last non-header entry in file order.

Indexing every message in file order would include abandoned branches and produce false `search`/`extract` results.

## Compaction requirement

Pi compaction keeps old entries on disk. The adapter must reproduce `buildSessionContext()` semantics:

1. If the active path contains a compaction entry, emit a synthetic compaction summary first.
2. Then include messages from `firstKeptEntryId` up to the compaction entry.
3. Then include messages after compaction.
4. Drop pre-compaction messages outside that kept range.

Boundary events for `--phase` must reset together with turns when compaction changes the effective dialogue, otherwise stale `turnIndex` values can point into discarded history.

## Cleaned dialogue mapping

- `user`: keep string content or text content blocks.
- `assistant`: keep only text content blocks; drop thinking and tool calls from dialogue.
- `branch_summary`: synthetic user turn `[branch summary]\n...`.
- `custom_message`: synthetic user turn from text content, after cleaning.
- `compaction`: synthetic user turn `[compact summary]\n...`.
- `toolResult`, `bashExecution` output, images, tool call arguments, and thinking text stay out of cleaned dialogue.

All retained text should go through the shared `stripInjectionTags()` + `isBootstrapTurn()` cleaning pipeline.

## Phase boundary mapping

Pi can support `--phase brainstorm|implement` by collecting `task.py create/start` from:

- assistant `toolCall` blocks with `name === "bash"` (case-insensitive tolerant) and `arguments.command` as a string.
- `bashExecution` messages with a string `command`.

The command string then flows through existing `parseTaskPyCommandsAll()` and `buildBrainstormWindows()`.

## Implementation constraint

Do not import `@earendil-works/pi-coding-agent` into Trellis core. Pi currently requires Node `>=22.19.0`, while `@mindfoldhq/trellis-core` supports Node `>=18.17.0`. The adapter should be a zero-dependency, loose JSONL parser like the Claude and Codex adapters.
