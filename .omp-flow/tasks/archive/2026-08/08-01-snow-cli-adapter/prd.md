---
type: "PRD"
title: "Snow and Cursor Harness adapters"
---

# Snow and Cursor Harness adapters

## Outcome

Users can select Snow and/or Cursor during omp-flow initialization and receive a small,
project-local adapter that uses each Harness's native agents, Hooks, session identity, and the
existing shared Skills. Installation and update behave like current Harness resource groups and
do not create a new orchestration layer.

## Requirements

1. The CLI accepts `--snow` and `--cursor`, persists them in normalized Harness order, includes
   them in interactive selection/help, and rejects invalid combinations before writing files.
2. Both Harnesses use the canonical common Skills already deployed to `.agents/skills`; init and
   update create no `.snow/skills` or `.cursor/skills` duplicate.
3. Snow receives project-native agent definitions under `.snow/agents` and project Hook
   configuration/handlers under `.snow/hooks`.
4. Cursor receives project-native agent definitions under `.cursor/agents` and one project
   `.cursor/hooks.json` plus its handlers. Cursor does not receive a duplicate rule when root
   `AGENTS.md` and shared Skills already carry the required guidance.
5. Snow task selection is isolated by `SNOW_SESSION_ID`. Cursor task selection is isolated by the
   Hook `conversation_id`; two concurrent conversations must not share an implicit active-task
   pointer.
6. Project Hooks provide bounded session orientation and runtime-write/dispatch protection using
   native payload and output formats. They do not infer authored workflow state.
7. A native operation assignment is dispatched only when the chosen Harness can preserve the
   exact actor/native-item binding. An unavailable correlation path fails visibly rather than
   aliasing an agent type/name or rewriting an existing receipt.
8. Existing managed-resource hash ownership applies unchanged: unmodified owned resources update;
   deleted, foreign, or user-modified project files are preserved and surfaced as conflicts.
9. README/package content describes the two Harnesses, their native project paths, their shared
   Skill reuse, and any explicitly unsupported native dispatch path.

## Non-goals

- global/user Hook management or Hook-file merging;
- a generalized Harness identity framework;
- a custom dispatcher, lifecycle database, or task schema;
- duplicated Skills or borrowed Claude/Codex resource roots;
- Markdown parsing for Task, Flow, approval, review, or completion meaning;
- changing Snow or Cursor upstream as a prerequisite.

## Acceptance criteria

- Snow-only, Cursor-only, and combined non-interactive init produce exactly their selected native
  resources plus core files.
- Config read/write and interactive selection round-trip both Harness values in stable order.
- Update tests cover unchanged, deleted, foreign, and modified Snow/Cursor managed files.
- Shared Skill parity tests prove `.agents/skills` remains the only deployed Skill tree.
- Python tests prove distinct `SNOW_SESSION_ID` values and distinct Cursor `conversation_id`
  values resolve isolated task selections.
- Hook fixture tests cover Snow session/tool payloads and Cursor `sessionStart`, `preToolUse`, and
  `subagentStart` payloads, including Windows-safe Python command rendering.
- Agent-definition fixtures match each native frontmatter contract and preserve strict assignment
  startup requirements without another model-dispatch layer.
- The required compileall, build, test, pack dry-run, and `git diff --check` suite passes.

## Sources

- [Selected synthesis](research/synthesis.md)
- [Snow upstream](reference/snow-cli-upstream.md)
- [Cursor primary references](reference/cursor.md)
- [Cursor adapter research](research/cursor.md)
