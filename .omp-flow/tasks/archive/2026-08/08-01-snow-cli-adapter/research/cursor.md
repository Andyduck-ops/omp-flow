---
type: "Research"
title: "Minimal Cursor adapter contract"
---

# Minimal Cursor adapter contract

This bounded investigation uses the official sources recorded in
[Cursor primary references](../reference/cursor.md), inspected 2026-08-01. Cursor is proprietary,
so there is no upstream source clone. The current machine does not have `agent` or `cursor-agent`
on `PATH`; released-runtime smoke testing remains a later verification item.

## Conclusion

Cursor fits the same restrained adapter shape as Snow and requires little new machinery. It
already reads root `AGENTS.md`, project `.agents/skills`, native `.cursor/agents/*.md`, and project
`.cursor/hooks.json`. The adapter should use those surfaces directly and avoid a Cursor-specific
Skill copy, dispatcher, or task model.

The smallest product delta is:

1. add `cursor` Harness selection to init/config/update/help;
2. continue deploying the shared Skills only under `.agents/skills`;
3. deploy Cursor-native agent cards under `.cursor/agents`;
4. deploy one project `.cursor/hooks.json` and the few Python Hook handlers it calls;
5. bridge Cursor's Hook `conversation_id` to omp-flow's mechanical session context; and
6. add focused managed-resource, Hook fixture, session-isolation, and packaging tests.

No `.cursor/rules` file is required merely to repeat the repository's engineering guide: Cursor
CLI already reads root `AGENTS.md` as a rule. Add an always-on Cursor rule only if testing proves a
specific orientation requirement cannot be met by `AGENTS.md`, Skills, and `sessionStart`.

## Existing native surfaces

### Rules and Skills

Cursor project rules live under `.cursor/rules` as `.mdc` files; legacy `.cursorrules` is
deprecated. More importantly for this repository, the CLI reads root `AGENTS.md` and `CLAUDE.md`
alongside `.cursor/rules` ([Rules](https://cursor.com/docs/rules),
[Using CLI](https://cursor.com/docs/cli/using)). The existing project engineering guide therefore
already reaches Cursor without a duplicate managed rule.

Cursor's current Agent Skills contract discovers project `.agents/skills/<name>/SKILL.md` and
`.cursor/skills/<name>/SKILL.md` ([Agent Skills](https://cursor.com/docs/skills)). omp-flow's
canonical deployment under `.agents/skills` is directly usable. A `.cursor/skills` copy would add
two owners for the same Skill and is unnecessary.

### Subagents

Project subagents are Markdown files under `.cursor/agents`; user subagents live under
`~/.cursor/agents`. Each file has YAML frontmatter with `name`, `description`, optional `model`
(default `inherit`), `readonly`, and `is_background`, followed by the prompt body. Cursor also
recognizes compatible `.claude` and `.codex` sources but gives `.cursor` precedence
([Subagents](https://cursor.com/docs/subagents)). The adapter should install native `.cursor`
files rather than borrow another selected Harness's resources.

Cursor's parent Agent delegates through its Task tool and can run subagents in parallel. Its
project Hook `subagentStart` receives `subagent_id`, `subagent_type`, `task`,
`parent_conversation_id`, `tool_call_id`, model/background fields, and may allow or deny the spawn
([Hooks](https://cursor.com/docs/hooks)). This is enough for observation and dispatch validation.
It does not by itself make the generated subagent ID caller-chosen before the exact operation
assignment is authored, so strict receipt correlation remains a local dispatch constraint rather
than a reason to enlarge the adapter.

### Project Hooks

Cursor project Hooks use one flat file at `.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [{"command": ".cursor/hooks/session-start.py"}],
    "preToolUse": [{"command": ".cursor/hooks/protect-runtime.py"}]
  }
}
```

Commands run from the project root, receive JSON on stdin, and return JSON on stdout. Project
script paths therefore start with `.cursor/hooks/...`, not `./hooks/...`. Relevant current events
include `sessionStart`/`sessionEnd`, `preToolUse`/`postToolUse`/`postToolUseFailure`,
`subagentStart`/`subagentStop`, shell and MCP before/after events, `beforeReadFile`,
`afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, and `stop`
([Hooks](https://cursor.com/docs/hooks)).

The minimum omp-flow Hook set is smaller:

- `sessionStart` for selected-task orientation;
- `preToolUse` for known write/dispatch protection; and
- `subagentStart` only if needed to validate the strict descriptor against the native spawn data
  Cursor actually supplies.

There is no requirement to manage user/global Hooks. Existing init/update hash ownership already
provides the needed behavior for a foreign or user-modified project `.cursor/hooks.json`: preserve
it and report the collision rather than merge or overwrite it.

## CLI and session identity

The current primary command is `agent`; `cursor-agent` remains an alias. Cursor CLI supports
interactive prompts, print mode (`--print`), structured output, `ls`, `resume`, and
`--resume <chatId>` ([CLI overview](https://cursor.com/docs/cli/overview),
[parameters](https://cursor.com/docs/cli/reference/parameters)). Current official installation
supports macOS, Linux, Windows via WSL, and native Windows PowerShell
([installation](https://cursor.com/docs/cli/installation)).

Hook payloads carry a stable `conversation_id`. Hook processes also receive
`CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, and related documented variables, but the official Hook
environment list does not expose a unique `CURSOR_SESSION_ID` to ordinary terminal commands.
Therefore the session bridge should stay small and explicit: use `conversation_id` at the Hook
boundary and verify how the chosen Hook output/input path propagates `OMP_FLOW_CONTEXT_ID` to
agent-issued Python commands. Do not fall back to one project-global active pointer, because that
would merge concurrent Cursor chats.

This is the only material Cursor-specific design probe. It does not justify a new runtime model;
the acceptable implementation is a thin Hook/env translation with a fixture test. If the current
released CLI cannot carry the context into terminal tools, Cursor can still install project
resources, but session-dependent CLI operations must fail visibly until the native bridge is
available.

## Minimal verification

- CLI selection and config normalization for `--cursor`.
- Exact deployment/update ownership for `.cursor/agents`, `.cursor/hooks.json`, and Hook scripts.
- Proof that `.agents/skills` remains the sole shared Skill tree.
- JSON fixtures for `sessionStart`, `preToolUse`, and `subagentStart` payload/output behavior.
- Two distinct Cursor `conversation_id` values never resolve the same implicit active-task
  pointer.
- Native Windows and POSIX command rendering for Python Hook handlers.
- Build, test, pack dry-run, compileall, and `git diff --check` after implementation.

## Decision impact

Cursor confirms the selected thin-adapter direction. Its public project surfaces are closer to
omp-flow's existing Claude/Codex resources than Snow's, so Cursor should be included in the same
small Design without introducing a shared abstraction beyond the repository's existing Harness
resource groups.
