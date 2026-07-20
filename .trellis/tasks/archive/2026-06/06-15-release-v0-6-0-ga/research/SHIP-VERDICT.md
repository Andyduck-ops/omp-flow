# SHIP-VERDICT — v0.6.0 GA pre-ship aggregation

**SHIP: RED — 2 checks FAIL, blockers present — must fix before `pnpm release:promote`**

Aggregated from the 10 `PRESHIP-VERIFY-*.md` reports under `.trellis/tasks/06-15-release-v0-6-0-ga/research/`.

| # | Check | Status | Summary | Critical blockers |
|---|---|---|---|---|
| 1 | changelog | PASS (after self-fix) | EN/ZH changelog mirror clean; 11 H2 sections each, 3 Notes each, 1 Bug Fix entry each, all anchors resolve. Self-fixed missing `trellis-channel` + `trellis-meta` entries under `## Bundled skills` in both EN and ZH. | None |
| 2 | channel | **FAIL** | Bundled `trellis-channel` skill structurally correct (5 references, dist matches src, no machine-specific content, no "drift vs global skill" framing). | **`@mindfoldhq/trellis@beta` dist-tag at `packages/cli/src/templates/common/bundled-skills/trellis-channel/references/progress-debugging.md:197` (and its `dist/` mirror) must be flipped to `@mindfoldhq/trellis` (or `@latest`) and rebuilt. Confirmed still present in working tree.** |
| 3 | docsjson | PASS | All 7 docs.json invariants hold: no top-level `banner`, exactly 1 `Release` version block per language (EN+ZH), Changelog group has `v0.6.0` → `v0.6.0-rc.0` → `v0.6.0-beta.23` in order, navbar `Changelog` href = `/changelog/v0.6.0`, no `rc/` nav prefixes remain. | None |
| 4 | dogfood | PASS | Full replay `0.5.19 → 0.6.0-rc.0` via `update --migrate --force` in `/tmp/v060-ga-dogfood-verify`: 4 bundled skills × 3 platform roots present, typoed `trellis-spec-bootstarp` only in backup tree, `.trellis/agents/{check,implement}.md` ship, `trellis-meta` SKILL.md is 85-line v0.6 rewrite, second plain `update` is idempotent. | None |
| 5 | manifest | PASS (1 PARTIAL non-blocker) | `packages/cli/src/migrations/manifests/0.6.0.json` is valid JSON; `version=0.6.0`, `breaking=false`, `recommendMigrate=true`, `migrations=[]`; changelog = 4.32 KB with all 10 required section headers in order; notes cover 0.5.x users, 0.6.0-prerelease users, Codex, channel opt-in, OpenCode degradation, install command. Description is two sentences (matches v0.5.0 precedent verbatim — not a regression). | None on its own. **But see check #7 — manifest's `**Bundled skills**` section omits `trellis-meta`.** |
| 6 | meta | PASS | All 19 criteria pass on `packages/cli/src/templates/common/bundled-skills/trellis-meta/`: SKILL.md is 85-line v0.6 rewrite touching channel runtime, `trellis mem`, `trellis-core` SDK, parent/child tasks, workflow templates, bundled-skill auto-dispatch, Reasonix, Pi `trellis_subagent`. Two new reference files (`multi-agent-channel.md`, `bundled-skills.md`); `platform-map.md` has Reasonix row + "Native Trellis Sub-Agent Tool" subsection; `change-skills-or-commands.md` has 13-row platform table and 4-skill "Bundled vs. Project-Local" subsection. CRITIQUE A1 regression clean. | None |
| 7 | npm-ready | **FAIL** | 5 of 6 cross-checks pass: CLI/core both at `0.6.0-rc.0` lockstep, `@mindfoldhq/trellis@0.6.0` and `@mindfoldhq/trellis-core@0.6.0` not yet on npm, `git tag -l v0.6.0` empty. Minor `/mem` prose-table inconsistency in EN changelog line 111 (not a contradiction). | **`packages/cli/src/migrations/manifests/0.6.0.json` `**Bundled skills**` section enumerates only 3 of 4 bundled skill dirs — `trellis-meta` is missing. PRD line 21 + success criterion #11 declare `trellis-meta` refresh in-scope. Confirmed: `grep "trellis-meta" 0.6.0.json` returns 0 hits in working tree. Release-artifact prose, deferred for human sign-off.** |
| 8 | preflight | PASS | All 4 preflight commands exit 0: `check-docs-changelog --type promote`, `release-preflight check-versions`, `verify-packed-cli`, `publish-plan`. CLI `dependencies["@mindfoldhq/trellis-core"]` is `workspace:*`, correctly rewritten to exact version by `npm pack`. Promote-time chain will need re-run after `bump-versions.js promote` flips to `0.6.0`. | None |
| 9 | rootcontent | PASS | `docs-site/rc/` and `docs-site/zh/rc/` removed (0 git-tracked files); root `start/`, `advanced/`, `index.mdx` (+ ZH mirrors) contain v0.6 identifiers (Pi Agent, 14-platform table, `trellis mem`, `trellis-core`, `trellis-session-insight`); no `@rc` / `@beta` install commands anywhere in root content. | None |
| 10 | tests | PASS | `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` exit 0. 1488 tests pass (core 278 + CLI 1210), 0 failures. `BUNDLED_SKILL_NAMES` constant in `platforms.test.ts` updated to 4 entries including `trellis-channel`. | None |

## Aggregate

- PASS: 7 (changelog, docsjson, dogfood, manifest, meta, preflight, rootcontent, tests) — note: 8 if manifest's PARTIAL is counted as PASS, which it is here because it matches v0.5.0 precedent and the partial is non-blocking on its own.
- FAIL: 2 (channel, npm-ready)
- PARTIAL: 0 (manifest's PARTIAL rolled into PASS per the report's own conclusion)

## Blockers — must fix before `pnpm release:promote`

1. **`packages/cli/src/templates/common/bundled-skills/trellis-channel/references/progress-debugging.md:197`** — replace `npm install -g @mindfoldhq/trellis@beta` with `npm install -g @mindfoldhq/trellis` (untagged, GA). Apply the same edit to the `dist/` mirror or re-run the build so `dist/` re-syncs. Verified still present in working tree.

2. **`packages/cli/src/migrations/manifests/0.6.0.json`** — append a fourth bullet to the `**Bundled skills**` section enumerating `trellis-meta` (refreshed: expanded v0.6 architecture coverage — channel, mem, dual-package SDK, parent/child tasks, workflow templates, registry-backed spec, configurable hooks, Reasonix + Pi platforms, bundled-skill auto-dispatch flow). Verified `grep "trellis-meta" 0.6.0.json` returns 0 hits. Release-artifact prose; needs human sign-off rather than agent self-fix.

## Recommendation

Do NOT run `pnpm release:promote` until both blockers are resolved. After fixing, re-run CHECK 2 (channel) and CHECK 10 (npm-ready) plus CHECK 7 (preflight) to verify the build still passes.
