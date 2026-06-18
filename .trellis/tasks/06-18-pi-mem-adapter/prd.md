# Add Pi support to trellis mem

## Goal

Add first-class Pi Agent support to `trellis mem` so local Pi sessions can be listed, searched, inspected with context windows, extracted as cleaned dialogue, grouped by project, and sliced by Trellis brainstorm/implementation phase using the same public `@mindfoldhq/trellis-core/mem` APIs as Claude and Codex.

## Confirmed Facts

- Existing `mem` implementation is split between reusable core (`packages/core/src/mem/**`) and CLI rendering/argument handling (`packages/cli/src/commands/mem.ts`).
- Pi stores sessions as JSONL files under `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<session-id>.jsonl` by default.
- Pi session files are tree-shaped via `id` / `parentId`; the adapter must recover the active branch instead of scanning all rows as a linear transcript.
- Pi compaction keeps old entries on disk; the adapter must reproduce Pi `buildSessionContext()` semantics so old compacted history does not appear in cleaned dialogue.
- Pi phase boundary signals can be recovered from assistant `toolCall` blocks for `bash` and from `bashExecution.command` messages.
- OpenCode remains out of scope for this task.

## Requirements

- Add `pi` as a valid `MemSourceKind` / CLI `--platform` value without changing existing Claude, Codex, or OpenCode behavior.
- Implement a zero-dependency Pi mem adapter in core; do not import `@earendil-works/pi-coding-agent` or add native/runtime dependencies.
- List Pi sessions from default, environment-configured, and settings-configured session roots where practical.
- Return unified `MemSessionInfo` metadata: platform, id, cwd, created, updated, filePath, and optional title from latest `session_info.name`.
- Extract cleaned dialogue from the active Pi branch only.
- Preserve the existing cleaning contract: keep user and assistant text, strip Trellis/platform injection tags, skip bootstrap turns, exclude thinking/tool results/tool output/image payloads.
- Implement Pi compaction handling consistent with Pi's active-context logic.
- Support `--phase brainstorm|implement|all` for Pi by collecting `task.py create/start` events with correct cleaned-turn indices.
- Keep core pure: no console output, no `process.exit`, no CLI-only imports.
- Update project aggregation and CLI help/output so Pi appears consistently.
- Add tests for core adapter behavior, phase slicing, public API dispatch, and CLI parsing/integration.

## Out of Scope

- OpenCode adapter rework.
- Indexing Pi tool output, thinking text, image data, or full tool call arguments as searchable dialogue.
- Adding a new `trellis mem --session-dir` flag unless implementation reveals it is necessary for minimal support.
- Depending on Pi's Node >=22 package APIs from Trellis core.
- Sharing/uploading any session data; `mem` remains a local read-only feature.

## Acceptance Criteria

- [ ] `trellis mem list --platform pi --json` returns Pi session metadata for fixture-backed tests.
- [ ] `trellis mem search <kw> --platform pi --json` searches only cleaned active-branch dialogue.
- [ ] `trellis mem context <id> --platform pi --json` returns context windows through the existing core API.
- [ ] `trellis mem extract <id> --platform pi --phase brainstorm --json` slices Pi sessions using `task.py create/start` boundaries.
- [ ] Pi compaction fixtures do not leak discarded pre-compaction dialogue into search/extract.
- [ ] Pi branch fixtures do not leak abandoned branch dialogue into search/extract.
- [ ] `listMemProjects()` includes `by_platform.pi` counts.
- [ ] Existing Claude/Codex/OpenCode mem tests still pass.
- [ ] Core remains free of Pi package imports and native dependencies.
- [ ] Relevant core and CLI tests pass, plus typecheck for touched packages.
