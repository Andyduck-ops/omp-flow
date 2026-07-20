# Trellis System Architecture Diagram

> **Staging in `tmp/architecture/`** (gitignored) first. v1 iterates there until shape is right, then a follow-up task promotes the final doc to `docs/architecture.md` for public use. Planning artifacts (this PRD, design.md, implement.md) stay tracked by Trellis.

## Goal

Ship a **navigation tool, not decoration**: 3 maintainable Mermaid diagrams + a glossary that gives cold contributors a 10-minute path from "I cloned Trellis" to "I know which file I'm changing." v1 lives in `tmp/architecture/` so we can iterate fast without trapping ourselves in a git-versioned doc that's not ready.

## Why now

Two of the other in-flight tasks depend on this. `community-governance` needs vocabulary lock for its PR template (copies verbatim from `tmp/architecture/` at template-authoring time). Internal benchmark task references vocabulary in task briefs. Onboarding new contributors and teammates means N hours of grep-and-pray per person until this exists.

## Approach: iterate in `tmp/`, promote later

- v1 doc lives at `tmp/architecture/architecture.md` (gitignored) — we can break things, regenerate, screenshot, abandon drafts without polluting history.
- Drift gate (test) is **not** wired up while in `tmp/` — owner manually re-runs the generator.
- A separate follow-up task ("promote architecture diagram to docs/") flips it into `docs/` + adds the CI drift gate + adds the dynamic generator hook into `pnpm gen`. That task starts after v1 has held up for ≥ 2 weeks of iteration.

## Scope (v1, in `tmp/architecture/`)

**In scope**
- 1 master flowchart (User → CLI → core subsystems → on-disk artifacts → AI tools).
- 1 drilldown: Platform Configurator dispatch — Mermaid manually written but **shaped from** `AI_TOOLS` registry data (owner runs a one-shot script to dump current platforms).
- 1 drilldown: Channel + Worker Runtime (per user choice).
- Glossary table mapping every node label to file path(s).
- Onboarding path: 8–12 ordered files a cold contributor should read.
- Owner footer: `@taosu` primary, `BACKUP NEEDED`.
- Light + dark mode screenshot pair in `tmp/architecture/screenshots/`.

**Out of scope (explicit)**
- `docs/architecture.md` promotion (separate follow-up task).
- CI drift gate test (deferred to promotion task).
- `pnpm gen:arch-diagram` script wired into pnpm scripts (deferred; owner runs by hand for now).
- README / docs-site updates (deferred to promotion task).
- ASCII fallback for npm registry (deferred to promotion task).
- Sequence diagrams (age fastest, low value).
- C4 ceremony / formal syntax.
- Diagrams for: Migration Engine (ASCII tree suffices), Spec/Marketplace fetch (linear, prose fine), Mem subsystem (self-contained).
- draw.io / d2 / excalidraw.
- Putting the same diagram in 3 places.
- Custom palette / accessibility theme beyond Mermaid defaults.

## Constraints

- **Mermaid only.**
- **All v1 paths under `tmp/architecture/`** — never `git add` anything in this task except the planning docs.
- **Single canonical staging file**: `tmp/architecture/architecture.md`.
- **Owner**: @taosu, with `BACKUP NEEDED` flag in footer until filled.
- **Update cadence**: deferred to the promotion follow-up task.
- **Vocabulary handoff**: when `community-governance` needs PR-template layer/platform names, owner reads the current `tmp/architecture/architecture.md` glossary and pastes verbatim into the PR template — `community-governance` does NOT block waiting for promotion.

## Acceptance Criteria

- [ ] `tmp/` confirmed gitignored (already true, see benchmark PRD).
- [ ] `tmp/architecture/architecture.md` exists with:
  - Master flowchart Mermaid block.
  - Platform Configurator dispatch Mermaid block (with a comment listing AI_TOOLS platform keys used).
  - Channel + Worker Runtime drilldown Mermaid block.
  - Glossary table mapping every node label to evidence file path(s).
  - Onboarding path: ordered list of 8–12 files.
  - Owner footer with `BACKUP NEEDED` flag.
- [ ] `tmp/architecture/scripts/dump-platforms.ts` — one-shot script that reads `AI_TOOLS` and prints the current list (used to keep the Configurator diagram honest; rerun manually when adding platforms).
- [ ] Mermaid renders correctly in GitHub light + dark mode preview when copied into a scratch PR description (visual spot-check). Screenshots saved to `tmp/architecture/screenshots/{light,dark}.png`.
- [ ] Vocabulary handoff done: when `community-governance` reaches its PR template step, the glossary's layer + platform node labels are pasted verbatim into PULL_REQUEST_TEMPLATE.md.
- [ ] Followup task `promote-architecture-to-docs` created via `task.py create` with link back to current `tmp/architecture/` snapshot path.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Tmp doc never gets promoted ("forever in tmp") | Followup task is created at v1 completion with explicit trigger ("after 2 weeks of iteration"). |
| Hand-written configurator diagram drifts from `AI_TOOLS` | `dump-platforms.ts` is the canonical platform list; owner reruns when registry changes. CI gate added at promotion time. |
| Vocabulary leaks into `community-governance` before stable | community-governance copies verbatim at PR-template authoring; if architecture later changes, community-governance amends in a follow-up. |
| Mermaid breaks in some surface | Owner verifies in GitHub preview. ASCII fallback deferred to promotion task. |
| No backup owner | Footer flags `BACKUP NEEDED`; promotion task blocks on resolving backup. |

## Open questions

- (resolved) Owner: @taosu primary, backup TBD.
- (resolved) Channel drilldown: included in v1.
- (resolved) Mount: stays in `tmp/` for v1; promotion is a follow-up task.
- (resolved) Update cadence: deferred to promotion task.

## Dependencies

- None blocking. Should land first of the three parent tasks so vocabulary is available for handoff.
- After v1 lands: trigger glossary copy into `community-governance` PR template.
- After v1 lands: create follow-up `promote-architecture-to-docs` task.
