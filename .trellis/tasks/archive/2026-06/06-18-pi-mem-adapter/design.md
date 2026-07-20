# Design: Pi support for `trellis mem`

## Architecture

The feature extends the existing switch-based `mem` adapter model. Pi is added as another persisted-session source inside `@mindfoldhq/trellis-core/mem`; CLI changes remain limited to platform validation and help text.

```text
Pi JSONL files
  -> packages/core/src/mem/adapters/pi.ts
  -> MemSessionInfo + DialogueTurn[] + TaskPyEvent[]
  -> existing list/search/context/extract/projects orchestration
  -> packages/cli/src/commands/mem.ts rendering
```

No adapter registry refactor is required for this task. The existing `sessions.ts` dispatch points are small and explicit; adding `pi` there keeps risk lower than restructuring all platforms at once.

## Core Type Changes

- `MemSourceKind`: add `"pi"`.
- `MemProjectSummary.by_platform`: include `pi` with default count `0`.
- Keep `MemSessionInfo.parent_id` as OpenCode-only for now. Pi `parentSession` is a fork/clone source path, not sub-agent descendant linkage, so it should not participate in `--include-children`.

## Path Resolution

Add Pi path helpers under `packages/core/src/mem/internal/paths.ts`:

- `PI_AGENT_DIR`: `process.env.PI_CODING_AGENT_DIR ?? path.join(HOME, ".pi", "agent")`.
- `PI_SESSIONS`: `process.env.PI_CODING_AGENT_SESSION_DIR ?? path.join(PI_AGENT_DIR, "sessions")`.
- `piProjectDirFromCwd(cwd)`: use Pi's encoded cwd directory rule.

Also consider reading `settings.json.sessionDir` from `PI_AGENT_DIR` when the env var is absent. This should be best-effort and silent on parse errors, matching the loose external-parser style.

When `f.cwd` is present and the session root is the default root, the adapter can directly inspect the encoded cwd directory. If a custom session root is configured, list the root's `.jsonl` files and filter by header `cwd`.

## Pi Adapter Contract

New file: `packages/core/src/mem/adapters/pi.ts`.

Exports:

```ts
export function piListSessions(f: MemFilter): MemSessionInfo[];
export function piExtractDialogue(s: MemSessionInfo): DialogueTurn[];
export function piSearch(s: MemSessionInfo, kw: string): SearchHit;
export function collectPiTurnsAndEvents(s: MemSessionInfo): {
  turns: DialogueTurn[];
  events: TaskPyEvent[];
};
```

External shapes stay local and loose. Guard every field at use with `typeof` / `Array.isArray`.

## Listing Algorithm

1. Find candidate `.jsonl` files.
2. Read the first JSONL row as header.
3. Scan rows using shared JSONL reader helpers.
4. Track:
   - latest `session_info.name` as title;
   - last user/assistant activity timestamp as updated;
   - file mtime fallback for updated;
   - header timestamp as created.
5. Apply `sameProject(cwd, f.cwd)`.
6. Apply `inRangeOverlap(created, updated, f)`.
7. Return `MemSessionInfo` rows; global sorting/capping stays in `listAll()`.

Do not use first user message as title. It can leak private content into `mem list`.

## Active Branch + Compaction Algorithm

`piExtractDialogue` and `collectPiTurnsAndEvents` should share one internal builder so their turn semantics remain identical.

1. Load valid entries from the JSONL file.
2. Build `id -> entry` for non-header entries.
3. Choose leaf as the last non-header entry in file order.
4. Walk `parentId` to root and reverse to get active path.
5. If the active path contains one or more compaction entries, use the last compaction on the path:
   - emit synthetic compaction summary first;
   - include path entries from `firstKeptEntryId` up to the compaction entry;
   - include entries after the compaction entry;
   - drop earlier entries outside the kept range.
6. Convert resulting effective entries to cleaned turns and task events.

This mirrors Pi's `buildSessionContext()` behavior closely enough for `mem` while keeping Trellis core independent of Pi runtime packages.

## Dialogue Conversion

- `message.role === "user"`: keep string content or text blocks.
- `message.role === "assistant"`: keep text blocks only; ignore thinking and toolCall blocks for dialogue.
- `custom_message`: convert text content to a synthetic user-like turn.
- `branch_summary`: convert to `[branch summary]\n<summary>`.
- `compaction`: convert to `[compact summary]\n<summary>`.
- Ignore tool results, bash execution output, image blocks, model changes, thinking-level changes, labels, and custom state entries.

Each retained text chunk runs through `stripInjectionTags()` and `isBootstrapTurn()`.

## Phase Boundary Conversion

While building effective entries, collect `task.py` commands from:

- assistant text entry's sibling `toolCall` blocks where `name` is `bash` or `shell` and `arguments.command` is a string;
- `message.role === "bashExecution"` with a string `command`.

For each parsed command returned by `parseTaskPyCommandsAll(command)`, emit a `TaskPyEvent` with `turnIndex` equal to the current cleaned-turn count at the moment the command is encountered.

If a compaction changes the effective path, pre-compaction events outside the kept range are naturally discarded because events are derived from the effective entries, not from the full file.

## CLI Changes

- Add `pi` to `VALID_PLATFORMS` in `packages/cli/src/commands/mem.ts`.
- Update help text and command description strings to mention Pi.
- Keep OpenCode warning logic unchanged and only triggered for `opencode` / `all`.

## Compatibility and Risk

- Existing `--platform all` will include Pi sessions after this change. That is intended, but may increase result volume. Sorting and `--limit` already handle this.
- Core remains local-only and read-only.
- The adapter must not print warnings for malformed Pi rows; skip malformed or unknown rows silently.
- Node compatibility is preserved by not importing Pi's Node >=22 package.

## Testing Strategy

Core tests own parser and orchestration behavior; CLI tests own platform flag/help/output integration.

Important fixtures:

- linear Pi session with user/assistant text;
- session title from `session_info`;
- active branch with abandoned branch text that must not appear;
- compaction with discarded pre-compaction text that must not appear;
- assistant `toolCall` and `bashExecution` phase boundaries;
- cross-day updated timestamp filtering.
