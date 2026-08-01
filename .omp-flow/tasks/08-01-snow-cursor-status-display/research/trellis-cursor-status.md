---
type: "Research"
title: "Trellis Cursor status-line implementation check"
---

# Trellis Cursor status-line implementation check

Checked 2026-08-01 against `https://github.com/mindfold-ai/Trellis.git` revision
`516b34e3591001b28fda5e2d4df3f717e82f5785` (`0.6.12`, upstream `main`). The existing local
reference was fetched without changing its working tree.

Trellis does not currently implement a Cursor status line. Its `--with-statusline` option and
interactive opt-in explicitly target Claude Code only. The Cursor configurator writes project
commands, Cursor Skills, agents, shared Hooks, and `.cursor/hooks.json`; it writes no
`~/.cursor/cli-config.json`, status-line command, Cursor Desktop extension, or equivalent view.

Earlier Trellis distribution did leave `.cursor/hooks/statusline.py`, but migration
`0.5.0-beta.15` removes the pristine file with the explicit reason that Cursor has no
`statusLine` Hook event and the shared script was never invoked. The latest shared-Hook source
still states that the opt-in statusLine is Claude-only and that no other platform has that Hook
event. This is evidence against copying a Trellis Cursor implementation: there is none in the
current release.

This finding does not contradict Cursor's newer CLI-native user-global `statusLine` surface. It
shows only that Trellis has not adopted that surface and that Hook delivery is not a substitute.
It confirms the current omp-flow design: project `.cursor/commands/flow-status.md` is the bounded
on-demand surface, while persistent Cursor CLI integration would require a separate explicit
user-scope design and current runtime verification.

Useful anchors:

- `packages/cli/src/configurators/cursor.ts:15-49` — actual Cursor-owned project resources;
- `packages/cli/src/cli/index.ts:94-98` — `--with-statusline` is Claude-only;
- `packages/cli/src/templates/shared-hooks/index.ts:71-75` — Claude-only statusLine boundary;
- `packages/cli/src/migrations/manifests/0.5.0-beta.15.json:8-16` — removal of the never-invoked
  Cursor statusline hook.
