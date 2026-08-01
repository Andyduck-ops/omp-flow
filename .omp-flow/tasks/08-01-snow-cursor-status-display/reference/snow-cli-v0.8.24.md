---
type: "Reference"
title: "Snow CLI 0.8.24 display surfaces"
---

# Snow CLI 0.8.24 display surfaces

Primary source: `https://github.com/MayDay-wpf/snow-cli.git`, revision and tag
`86a18cfbf5844c14a99dcc717eed26b8cf5b89d4` / `v0.8.24`. The ignored local clone is
`.omp-flow/cache/repos/snow-cli`. npm `snow-ai@0.8.24` reports the same `gitHead`; a bounded
released probe verified `snow --version` and `snow cmd statusline status --json`.

Useful anchors at that revision:

- `source/ui/components/common/statusline/{useStatusLineHooks.ts,types.ts}` and
  `source/ui/components/common/StatusLine.tsx` — user-global plugin loading, context, refresh,
  failure isolation, and native footer rendering;
- `source/utils/execution/{sessionIdentityEnv.ts,sessionCommandHandlersExtra.ts}` — exact child
  identity and the inventory-only statusline control-plane command;
- `source/utils/commands/custom.ts` — project `.snow/commands` discovery and override behavior;
- `source/utils/plugins/anypanel/*` and `source/ui/pages/AnyPanelScreen.tsx` — user-global plugin
  ownership with current-session, on-demand panel rendering; and
- `source/mcp/skills.ts` — shared project `.agents/skills` discovery.

Interpretation: Snow's persistent StatusLine is real but loads only from
`~/.snow/plugin/statusline` and its public context lacks a session ID. AnyPanel receives the exact
session but its plugin is also user-global and the panel is on demand. The project-owned surface
available without widening ownership is `.snow/commands`, backed by the existing shared
`flow-status` Skill. Source contracts do not substitute for an interactive TTY capture.
