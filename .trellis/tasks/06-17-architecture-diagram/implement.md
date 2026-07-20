# Implement — Architecture Diagram (v1 in `tmp/`)

Ordered. This task lands first of the three parent tasks so its glossary unblocks `community-governance`. All v1 paths live under `tmp/architecture/` (gitignored).

## Phase 0 — Lock inputs

- Owner: **@taosu** primary, `BACKUP NEEDED` flag in footer.
- Channel runtime drilldown: **included in v1**.
- Mount: **`tmp/architecture/` for v1**; promotion is a follow-up task.
- Update cadence: **deferred to promotion task**.
- [ ] 0.1 Verify `tmp/` is gitignored: `grep -nE '^tmp/?$' .gitignore` returns a hit. (Already confirmed.)
- [ ] 0.2 Create `tmp/architecture/` directory.

## Phase 1 — Author staging doc

- [ ] 1.1 Create `tmp/architecture/architecture.md` skeleton with: How to read / Master flow / 2 drilldown placeholders / Glossary / Onboarding path / Footer with `BACKUP NEEDED`.
- [ ] 1.2 Hand-author master flowchart Mermaid block using the layer names from research (CLI Entry, Configurators, Templates, Migrations, Runtime Scripts, Hook Injection, Channel, Mem, Spec/Marketplace).
- [ ] 1.3 Populate Glossary — every node label maps to ≥ 1 file path.
- [ ] 1.4 Populate Onboarding path (10–12 ordered files per design.md).
- **Verify**: paste into a GitHub scratch PR description → preview renders.

## Phase 2 — Configurator drilldown

- [ ] 2.1 Write `tmp/architecture/scripts/dump-platforms.ts` (reads `AI_TOOLS`, prints `key\tname\tdir`).
- [ ] 2.2 Run it; capture current platform list.
- [ ] 2.3 Hand-author the Configurator dispatch Mermaid block; add HTML comment with the platform list + sync date.
- **Verify**: every key from `dump-platforms.ts` output appears in the diagram.

## Phase 3 — Channel runtime drilldown

- [ ] 3.1 Read `packages/cli/src/commands/channel/index.ts`, `commands/channel/supervisor.ts`, `commands/channel/spawn.ts`, `packages/core/src/channel/api/*.ts` to confirm the runtime shape.
- [ ] 3.2 Hand-author Mermaid block: CLI surface → core API → event store → supervisor → adapters → workers.
- [ ] 3.3 Glossary entries for Channel nodes.
- **Verify**: a developer who has never touched channel reads the drilldown + opens 3 of the glossary files and can describe the runtime in 3 sentences.

## Phase 4 — Verify visuals

- [ ] 4.1 Paste `architecture.md` into a scratch GitHub PR description; toggle light + dark mode; screenshot to `tmp/architecture/screenshots/{light,dark}.png`.
- [ ] 4.2 Fix any rendering issues (broken Mermaid, label overflow, color clashes).
- **Verify**: both screenshots are readable; no broken diagrams.

## Phase 5 — Glossary handoff prep

- [ ] 5.1 Rerun `dump-platforms.ts` to get final platform list as of today.
- [ ] 5.2 Author `tmp/architecture/notes/glossary-handoff.md` per design.md template.
- [ ] 5.3 When `community-governance` reaches PR-template authoring, owner pastes from this file.
- **Verify**: handoff file's lists match `architecture.md` glossary verbatim.

## Phase 6 — Iteration window (≥ 2 weeks)

- [ ] 6.1 Leave v1 in `tmp/` for at least 2 weeks; collect informal feedback from any teammate / contributor who reads it.
- [ ] 6.2 Each correction recorded as a small commit-message-style note in `tmp/architecture/notes/iteration-log.md` (also gitignored).
- [ ] 6.3 Owner ticks `tmp/architecture/notes/promotion-readiness.md` checklist:
  - [ ] No new corrections in last 7 days
  - [ ] Backup owner identified
  - [ ] Glossary stable across last 3 reviews
  - [ ] All Mermaid blocks render cleanly in dark mode

## Phase 7 — Wrap + create promotion follow-up

- [ ] 7.1 `task.py create "Promote architecture diagram to docs/" --slug promote-architecture-to-docs` linking back to `tmp/architecture/architecture.md` snapshot.
- [ ] 7.2 Promotion follow-up's PRD scope (drafted now, refined later): move to `docs/architecture.md`, add `pnpm gen:arch-diagram` script, add CI drift gate test, ASCII fallback for npm, README + docs-site mount.
- [ ] 7.3 `task.py finish` + archive this v1 task. v1 planning artifacts remain tracked by Trellis; `tmp/architecture/` artifacts remain gitignored.

## Validation commands

```bash
grep -nE '^tmp/?$' .gitignore
git check-ignore tmp/architecture/architecture.md   # should print the path → confirmed ignored
git status --porcelain tmp/ | head                  # should be empty
tsx tmp/architecture/scripts/dump-platforms.ts | sort
```

## Rollback points

- After Phase 2: if `dump-platforms.ts` can't compile against current TS config, fall back to running `node --experimental-strip-types` or copy-paste the registry into a `.json` snapshot.
- After Phase 3: if Channel drilldown can't be read in 3 sentences, simplify the diagram; defer detail to design.md prose.
- Phase 6 iteration window can stretch — never promote until corrections plateau.

## Out-of-scope reminder

Push back if any of these come up:
- Putting files outside `tmp/`.
- Wiring `pnpm gen:arch-diagram`, drift gate, README updates (all → promotion task).
- Sequence diagrams.
- C4 ceremony.
- Drawing in draw.io / d2 / excalidraw.
- Custom palette / accessibility theme.
