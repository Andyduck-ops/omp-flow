---
type: "Decision"
title: "Human decision: do not implement Snow/Cursor status display"
---

# Human decision: do not implement Snow/Cursor status display

Date: 2026-08-01

The human reviewed the QbD 1 PASS and the subsequent Trellis comparison and chose **not to
implement** the proposed Snow/Cursor project commands.

The reason is product proportionality: current project-owned options are model-mediated,
on-demand prompts, while the genuinely persistent native surfaces are user-global and require
additional ownership, session, freshness, update, and removal machinery. Status display is not
important enough to justify building or maintaining that extra adapter surface. Trellis 0.6.12
also provides no Cursor status-line implementation to reuse; its old orphan Cursor statusline Hook
was explicitly removed as never invoked.

This decision stops the feature before decomposition or implementation. No Snow/Cursor status
command, persistent plugin, global configuration, runtime field, renderer, cache, or product code
is authorized by this Bundle. The completed research and design remain as evidence for a future
reconsideration only if native project ownership or exact-session persistent contracts materially
change.
