---
type: "Research"
title: "Prior Snow adapter history and current deltas"
---

# Prior Snow adapter history and current deltas

The repository's untracked archive contains a legacy pre-OKF task at
`.omp-flow/tasks/archive/2026-07/07-22-snow-cli-adapter/`. It is historical authored evidence, not
the current task Bundle and not runtime state. Its Markdown can inform the investigation; its
`task.json`, CSV/JSONL ledgers, copied reference tiers, and old topology must not be revived.

The archived `brainstorm.md` and `research/90-synthesis-001-native-snow-adapter.md` identify the
same upstream package at version `0.8.19` and select a full, Claude-shaped adapter using Snow's
per-event Hooks, `.snow/agents`, `.snow/skills`, and protected-path `beforeToolCall` gate. The
synthesis correctly flags `beforeSubAgentStart` as fail-open and places dispatch validation on the
earlier sub-agent tool call. It also records command execution through a shell, project-root cwd,
JSON stdin, session identity environment, output limits, and project Hook file collisions.

That work did not reach an implementable accepted design: the archived `design.md` contains only
empty Architecture, Decisions, and Verification headings, and the current codebase has no
`templates/snow/`, `--snow` registry entry, or Snow tests. Its selected direction therefore cannot
substitute for current Research/Design approval.

Two material deltas make a fresh synthesis necessary:

- Pinned Snow `0.8.24` now loads global and project `.agents/skills` alongside `.snow/skills`, with
  project `.snow` taking precedence over project `.agents` (`source/mcp/skills.ts:178-243`). The
  old proposal to deploy a second `.snow/skills` copy would create avoidable dual ownership.
- Current omp-flow requires the descriptor `actorId` to equal the Harness-native task item ID.
  Snow project Markdown supplies an agent *type* ID (`source/utils/config/projectAgents.ts:53-95`),
  but normal execution registers the provider-generated tool-call ID as `instanceId`
  (`source/utils/execution/toolExecutor.ts:411-441`), while Team members get generated UUID slices
  (`source/utils/team/teamConfig.ts:125-131`). The old synthesis did not resolve this newer exact
  correlation boundary.

The prior work supports continuing Hook feasibility research but argues against copying its design
verbatim. The present synthesis should minimize native resources, reuse `.agents/skills` directly,
and make identity feasibility an explicit go/no-go decision.
