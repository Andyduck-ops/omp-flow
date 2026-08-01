---
type: "Synthesis"
title: "Selected Snow and Cursor status display direction"
---

# Selected Snow and Cursor status display direction

The research revises the broad assumption that Snow and Cursor lack native persistent status-line
APIs: Snow 0.8.24 has a StatusLine plugin system, and current Cursor CLI has `/statusline`.
Nevertheless, both evidenced persistent surfaces are user-global rather than project-owned.
Snow's public StatusLine context is session-blind; Cursor's view is conversation-update-driven and
has unresolved lease-expiry, resume-identity, and empty-output clearing behavior. Neither is a
truthful unconditional project adapter today.

The selected immediate direction is therefore two exact-owned, Git-visible, native on-demand
commands:

- `.snow/commands/flow-status.json` is a prompt command that asks Snow to use the existing
  project `flow-status` Skill;
- `.cursor/commands/flow-status.md` is a project command with the same narrow instruction.

Both commands are discoverable as `/flow-status`, use the shared Skill as the sole inspection
procedure, and produce Agent-chat output only when requested. They add no renderer, cache,
session inference, global Hook/plugin, duplicate Skill, Cursor rule, or direct execute command.
Missing or conflicting session evidence remains an explicit unavailable result. Foreign,
modified, or deleted command resources retain the existing managed-resource conflict behavior.

Normal `init --snow` and `init --cursor` must not write `~/.snow/plugin/statusline`,
`~/.snow/plugin/anypanel`, or `~/.cursor/cli-config.json`. A future explicit user-scope setup may
be designed only after released-runtime tests prove exact session binding, concurrency/resume,
freshness/lease-expiry refresh, empty-output clearing, failure behavior, and safe ownership,
update, and removal. Cursor Desktop persistent display would require a separately accepted IDE
extension boundary.

This confirms the Brainstorm's principal contradiction and narrows “补齐状态显示” to the strongest
capability compatible with the user's established project-install/no-global-management boundary.
The counter-case is that a global opt-in could provide richer persistence now; it is rejected for
this task because it expands ownership and still cannot yet prove current exact-session semantics.

Evidence: [Snow research](snow-display.md), [Cursor research](cursor-display.md), and
[Snow reference](../reference/snow-cli-v0.8.24.md). A check of
[current Trellis](trellis-cursor-status.md) found no Cursor status-line integration to reuse and
confirmed that its former orphan Cursor statusline Hook was removed as never invoked.
