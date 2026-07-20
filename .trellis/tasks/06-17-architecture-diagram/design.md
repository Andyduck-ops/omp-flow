# Design — Architecture Diagram (v1 in `tmp/`)

> All paths under `tmp/architecture/` are gitignored. The promotion follow-up task moves the final shape into `docs/architecture.md` + adds the CI drift gate.

## Architecture (v1 staging)

```
tmp/architecture/
├── architecture.md            # canonical staging doc: master + 2 drilldowns + glossary + onboarding path
├── scripts/
│   └── dump-platforms.ts      # one-shot: reads AI_TOOLS, prints current platform keys
├── screenshots/
│   ├── light.png              # GitHub light-mode render
│   └── dark.png               # GitHub dark-mode render
└── notes/
    ├── glossary-handoff.md    # exact text pasted into community-governance PR template
    └── promotion-readiness.md # checklist owner ticks before creating the promotion follow-up task
```

## `tmp/architecture/architecture.md` layout

```markdown
# Trellis Architecture (v1 — staging in tmp/)

> Last verified: vX.Y.Z — Owner: @taosu — Backup: BACKUP NEEDED
> Staging: this doc lives in `tmp/architecture/` while shape is iterated.
> Promotion to `docs/architecture.md` is a separate Trellis task.

## How to read this doc
- Start with the **Master flow** below.
- Drill into **Platform Configurator dispatch** — the heart of Trellis.
- Drill into **Channel + Worker Runtime** for multi-agent collaboration.
- Use the **Glossary** to jump to source files.
- Follow the **Onboarding path** if you're new.

## Master flow
\```mermaid
flowchart TD
  ...
\```

## Drilldown: Platform Configurator dispatch
<!-- Source of platform list: AI_TOOLS in packages/cli/src/types/ai-tools.ts -->
<!-- Last-synced platforms: <list from dump-platforms.ts output> -->
\```mermaid
flowchart LR
  ...
\```

## Drilldown: Channel + Worker Runtime
\```mermaid
flowchart LR
  ...
\```

## Glossary
| Node | File(s) |
|------|---------|
| CLI Entry | packages/cli/src/cli/index.ts |
| AI_TOOLS registry | packages/cli/src/types/ai-tools.ts |
| Configurator dispatch | packages/cli/src/configurators/index.ts |
| Template Catalog | packages/cli/src/templates/<platform>/index.ts |
| Migration Engine | packages/cli/src/migrations/index.ts |
| Runtime Scripts | .trellis/scripts/, .trellis/scripts/common/ |
| Hook Injection | packages/cli/src/templates/shared-hooks/ |
| Channel Runtime | packages/cli/src/commands/channel/, packages/core/src/channel/ |
| Memory / Recall | packages/cli/src/commands/mem.ts, packages/core/src/mem/ |
| Spec / Marketplace | marketplace/, packages/cli/src/utils/template-fetcher.ts |
| ... | ... |

## Onboarding path
1. `packages/cli/src/cli/index.ts` — command surface
2. `packages/cli/src/types/ai-tools.ts` — the registry
3. `packages/cli/src/commands/init.ts` — top half
4. `packages/cli/src/configurators/index.ts` + `configurators/shared.ts`
5. `packages/cli/src/configurators/claude.ts` + `templates/claude/index.ts`
6. `packages/cli/src/templates/shared-hooks/index.ts`
7. `packages/cli/src/migrations/index.ts` + a recent manifest
8. `.trellis/scripts/task.py` + `scripts/common/active_task.py`
9. `packages/cli/src/templates/shared-hooks/session-start.py`
10. `packages/core/src/channel/index.ts` + `packages/cli/src/commands/channel/index.ts`
11. (only if working on it) `packages/core/src/mem/api/index.ts`
```

## Master flowchart contract

Boxes (named to lock vocabulary for community-governance handoff):
- User
- CLI Entry & Commands (`init`, `update`, `uninstall`, `mem`, `workflow`, `channel`)
- Platform Configurators
- Template Catalog
- Migration Engine
- Runtime Scripts (Python)
- Hook Injection (cross-tool session glue)
- Channel + Worker Runtime
- Memory / Recall
- Spec / Marketplace System

Edges show data flow direction. One color/shape per category: subsystem (rounded), on-disk artifact (square brackets), external AI tool (cylinder).

## Configurator-dispatch drilldown

Hand-written. The owner runs `tsx tmp/architecture/scripts/dump-platforms.ts` to print the current `AI_TOOLS` key list and reconciles. The diagram's HTML comment header records the last-synced platform set, so future drift is visible at review time.

```ts
// tmp/architecture/scripts/dump-platforms.ts
import { AI_TOOLS } from "../../../packages/cli/src/types/ai-tools";

for (const tool of AI_TOOLS) {
  console.log(`${tool.key}\t${tool.displayName}\t${tool.configDir}`);
}
```

## Channel-runtime drilldown contract

Nodes:
- `trellis channel` CLI surface (`spawn`, `send`, `interrupt`, `wait`, `threads`)
- `packages/core/src/channel/api/*` (spawn, runtime, threads APIs)
- Channel event store (append-only files under `.trellis/channels/`)
- Supervisor (`commands/channel/supervisor.ts`)
- Platform adapters (Claude / Codex / OpenCode CLI invokers)
- Worker processes (external AI CLI subprocesses)
- Inbox / thread state

Edges: user runs CLI → core API appends event → supervisor watches store → adapter spawns subprocess → worker output streamed back as events.

## Vocabulary handoff to community-governance

When `community-governance` reaches its PR-template authoring step, owner produces `tmp/architecture/notes/glossary-handoff.md`:

```markdown
# Glossary handoff to community-governance

Source: tmp/architecture/architecture.md (snapshot date YYYY-MM-DD, commit <head>)

## Layer checkbox list (paste into PULL_REQUEST_TEMPLATE.md "Affected layers")
- [ ] cli
- [ ] configurators
- [ ] templates
- [ ] migrations
- [ ] runtime-scripts (Python)
- [ ] hook-injection
- [ ] channel
- [ ] memory
- [ ] spec/marketplace
- [ ] docs

## Platform checkbox list (paste into PULL_REQUEST_TEMPLATE.md "Affected platforms")
- [ ] claude-code
- [ ] cursor
- [ ] opencode
- [ ] codex
- [ ] iflow
- [ ] gemini-cli
- [ ] kiro
- [ ] kilo
- [ ] qoder
- [ ] antigravity
- [ ] codebuddy
- [ ] copilot
- [ ] droid
- [ ] pi
- [ ] reasonix
- [ ] windsurf
- [ ] other
```

(Exact platform list pulled from `dump-platforms.ts` output the day of handoff.)

## Tradeoffs

| Decision | Picked | Alternative | Why |
|----------|--------|-------------|-----|
| Stage in `tmp/` | Yes | Direct to `docs/architecture.md` | User wants to iterate without git churn. |
| 3 diagrams (master + configurator + channel) | Yes | 2 (skip channel) | User explicitly wants Channel in v1. |
| Manual generator (owner runs script) | Yes | Automated `pnpm gen` hook | `pnpm gen` wiring is part of promotion task. |
| No CI drift gate in v1 | Yes | Add now | Test would fire on a tmp/ file path; defer wiring to promotion task. |
| Single canonical staging file | `tmp/architecture/architecture.md` | One file per diagram | Easier to iterate as a single review unit. |
| Skip sequence diagrams | Yes | Include | Age fastest, low navigational value. |
| Skip ASCII fallback in v1 | Yes | Include | Promotion task adds it when there's a real npm-registry need. |

## Data flow

1. Owner writes initial `tmp/architecture/architecture.md` (master + glossary + onboarding by hand).
2. Owner runs `tsx tmp/architecture/scripts/dump-platforms.ts` to align Configurator drilldown.
3. Owner authors Channel drilldown.
4. Owner copies architecture.md into a scratch GitHub PR description to verify Mermaid renders; saves screenshots.
5. When community-governance reaches PR-template step, owner generates `glossary-handoff.md` from current architecture.md.
6. v1 sits for ≥ 2 weeks of iteration / corrections.
7. Owner ticks `notes/promotion-readiness.md` checklist, creates `promote-architecture-to-docs` task.

## Rollback / fail-soft

- If Mermaid breaks visibly in GitHub render: owner simplifies the offending block; never ship a broken visual.
- If `AI_TOOLS` shape changes mid-iteration: rerun `dump-platforms.ts` + update Configurator drilldown.
- If owner loses interest before backup found: docs stay in tmp/, no public-facing damage.

## Dependencies

- None blocking. Should land first of the three parent tasks (provides vocabulary).
- After v1: trigger glossary handoff to community-governance.
- After v1: create `promote-architecture-to-docs` follow-up.
