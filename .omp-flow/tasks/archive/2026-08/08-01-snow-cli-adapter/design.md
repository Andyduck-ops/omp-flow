---
type: "Design"
title: "Thin Snow and Cursor Harness adapters"
---

# Thin Snow and Cursor Harness adapters

## Design summary

Extend the existing Harness resource-group mechanism with `snow` and `cursor`. Each adapter owns
only its native project agents and Hooks. Common workflow Skills remain under `.agents/skills`, and
the portable Python kernel gains only the session/Flow Status host values required for mechanical
correlation.

No new adapter framework is introduced. `Harness`, `managedResources()`, template rendering,
manifest hashes, backups, and update conflict behavior remain the existing implementation seams.

## CLI and resource groups

Add `snow` and `cursor` to the `Harness` union and stable order in `src/cli/harness.ts`, then extend
argument parsing, interactive choices, help, README, config validation, and tests through the same
paths currently used by OMP/Codex/Claude.

`src/cli/init.ts` adds two resource groups:

```text
snow
  .snow/agents/omp-flow-{research,architect,qbd,implement,check}.md
  .snow/hooks/onSessionStart.json
  .snow/hooks/beforeToolCall.json
  .snow/hooks/session-start.py
  .snow/hooks/protect-runtime.py

cursor
  .cursor/agents/omp-flow-{research,architect,qbd,implement,check}.md
  .cursor/hooks.json
  .cursor/hooks/session-start.py
  .cursor/hooks/protect-runtime.py
```

Both selections continue receiving core `.omp-flow` files and common `.agents/skills`. There is no
Snow/Cursor Skill resource group.

Template rendering extends the existing `{{PYTHON_CMD}}` substitution to Snow event JSON and
Cursor `hooks.json`. Commands are rendered with project-relative script paths because both native
Hook executors run at the project root. Platform-specific smoke fixtures cover the selected Python
command; no shell wrapper layer is added.

## Native agents

Create native Markdown cards from the current common role behavior, not by copying Claude's
identity/TaskUpdate-only startup details.

- Snow frontmatter uses its documented `id`, `name`, `description`, `role`, and `tools` contract.
- Cursor frontmatter uses `name`, `description`, `model: inherit`, and `readonly` where the role is
  read-only. The prompt body requires the strict-v1 assignment first, explicit Bundle/output
  boundaries, no workflow sub-spawn, and the linked role Skill.

Agent cards do not create receipts, infer predecessor state, or normalize actor IDs. Main creates
the operation first and forwards its assignment unchanged. If a native spawn surface cannot
preserve the exact actor/native-item relation, that operation path fails visibly and is documented
as unsupported; the rest of the project adapter remains usable.

## Project Hooks

### Snow

Snow loads one project file per event. `onSessionStart.json` invokes `session-start.py` and
`beforeToolCall.json` invokes `protect-runtime.py` for the known file-mutating tool matchers. The
handlers translate Snow JSON stdin/stdout only; they reuse the same mechanical orientation and
path-confinement rules as current adapters.

`session-start.py` reads `SNOW_SESSION_ID` and calls the portable status/task interfaces. Add
`("snow", "SNOW_SESSION_ID")` to the active-task environment mapping. No global Snow Hook
handling or file merge is implemented.

### Cursor

Cursor uses one flat version-1 `.cursor/hooks.json`. Register:

- `sessionStart` -> `.cursor/hooks/session-start.py`;
- `preToolUse` for known write tools -> `.cursor/hooks/protect-runtime.py`;
- `subagentStart` only if a focused fixture proves it adds a required strict-dispatch check.

Cursor `sessionStart` supplies a unique `session_id` and accepts an `env` result. The handler
returns `OMP_FLOW_CONTEXT_ID=<session_id>` and `OMP_FLOW_HOST=cursor` in `env`, plus bounded
mechanical orientation in `additional_context`. The existing explicit-context precedence then
isolates subsequent CLI commands without adding a Cursor session key to Python or rewriting Shell
commands.

The Hook is fire-and-forget, so missing/invalid input produces no manufactured selection. Later
commands either see the injected explicit context or fail with the existing missing-context error.

## Flow Status

Add `snow` and `cursor` to the closed Flow Status host unions/allowlists in the TypeScript semantic
publisher, CLI validation/help, and portable Python receiver. Update the common read-only
`flow-status` Skill to choose the explicit current Harness host rather than hardcoding `codex`.

- Snow uses `SNOW_SESSION_ID` and host `snow`.
- Cursor's session Hook exports the same `session_id` as `OMP_FLOW_CONTEXT_ID` and host `cursor`.

This extends only the existing scoped CAS/lease store; it adds no renderer, semantic inference, or
new state shape.

## Ownership and errors

Every new file is an ordinary exact-owned managed resource. Init skips a foreign destination.
Update changes only content still matching its recorded hash, preserves user deletion and
modification, backs up owned changes, and reports conflicts through existing results. No JSON
merge is attempted for `.cursor/hooks.json` or Snow event files.

Errors remain local and visible:

- invalid Harness arguments fail before writes;
- missing session identity fails task selection;
- malformed Hook input returns a bounded error/no-op according to the native event contract;
- unsafe runtime paths are denied;
- unsupported exact native dispatch does not create an alias or post-hoc receipt.

## Verification map

- Extend CLI/init tests for Snow-only, Cursor-only, combined selection, stable normalization, help,
  invalid config, and zero writes on argument failure.
- Add resource parity tests from canonical templates to installed destinations.
- Add update ownership tests for unchanged, deleted, modified, and foreign native files.
- Add stdlib Python fixtures for Snow session/tool payloads and Cursor `sessionStart`/`preToolUse`.
- Prove two Snow IDs and two Cursor session IDs select four isolated pointers.
- Assert no `.snow/skills` or `.cursor/skills` files are packaged or installed.
- Extend Flow Status host validation/CAS tests for `snow` and `cursor` without changing v2 shape.
- Run compileall, build, tests, pack dry-run, and `git diff --check`.

## Rejected alternatives

- A common new adapter SDK: the two resource groups fit existing init/update seams.
- Global Hook coordination or JSON merging: outside the project-install model.
- Reusing `.claude`/`.codex` native cards in Cursor: native `.cursor` files are clearer and do not
  couple Harness selection.
- Duplicate native Skill trees: both Harnesses already read `.agents/skills`.
- Project-global active-task fallback: it would merge concurrent sessions.
- Agent-name/instance-ID aliases: they weaken exact operation correlation.

## Linked requirements and evidence

- [PRD](prd.md)
- [Selected synthesis](research/synthesis.md)
- [Snow research](research/agents-skills.md)
- [Cursor research](research/cursor.md)
