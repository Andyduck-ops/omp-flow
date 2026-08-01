---
type: "PRD"
title: "Project-owned Snow and Cursor Flow Status commands"
---

# Project-owned Snow and Cursor Flow Status commands

## Outcome

Snow and Cursor users can discover and invoke `/flow-status` from the current project and receive
the existing exact-session, read-only Flow Status result in Agent chat. The feature accurately
identifies itself as on demand and does not claim or install a persistent footer.

## Requirements

1. `init --snow` installs one Snow-native project command at
   `.snow/commands/flow-status.json`; `init --cursor` installs one Cursor-native project command
   at `.cursor/commands/flow-status.md`.
2. Each command narrowly instructs the current Harness to use the already installed shared
   `flow-status` Skill. It does not reproduce the Skill procedure, embed a second renderer, run a
   direct shell command, select a cache, or infer a session.
3. Both command resources use the existing exact-owned manifest/update behavior. Init preserves a
   foreign destination; update changes only an unmodified owned file and reports deletion,
   modification, or foreign content without merging.
4. Snow and Cursor continue sharing only `.agents/skills`; no `.snow/skills`, `.cursor/skills`,
   Cursor rule, global plugin, or user configuration is added.
5. README and help-facing resource documentation distinguish on-demand Agent-chat output from
   Snow/Cursor persistent native status lines and explain why the latter are not installed.
6. The npm package contains both new canonical templates and installation produces them only for
   the selected Harness.

## Non-goals

- writing `~/.snow/plugin/statusline`, `~/.snow/plugin/anypanel`, or
  `~/.cursor/cli-config.json`;
- claiming persistent Snow, Cursor CLI, or Cursor Desktop status display;
- adding a new cache, status renderer, Hook event, session alias, IDE extension, MCP server, or
  global setup/update/removal policy;
- proving that a model-mediated prompt command always invokes a Skill in every released surface.

## Acceptance criteria

- Canonical Snow JSON parses and matches Snow's project prompt-command contract; canonical Cursor
  Markdown is a bounded project command.
- Snow-only, Cursor-only, and combined init install exactly the selected command resources with no
  global or duplicate Skill path.
- Managed-resource parity and update tests cover unchanged, deleted, modified, and foreign command
  files through the existing ownership machinery.
- Focused tests prove both prompts name the shared `flow-status` Skill, state that output is
  on-demand, preserve explicit unavailable behavior, and contain no direct status-inspect command
  or fallback-selection instructions.
- README no longer says merely that Snow has no native persistent status capability; it states the
  accurate project-owned on-demand support and the user-global/session/freshness reasons persistent
  setup remains outside normal init for both Harnesses.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks templates/snow/hooks templates/cursor/hooks`,
  `npm run build`, `npm test`, `npm pack --dry-run`, and `git diff --check` pass.

## Sources

- [Selected synthesis](research/synthesis.md)
- [Snow display research](research/snow-display.md)
- [Cursor display research](research/cursor-display.md)
