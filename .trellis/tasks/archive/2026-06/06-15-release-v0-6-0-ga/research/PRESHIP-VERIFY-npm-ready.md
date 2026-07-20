# PRESHIP-VERIFY-npm-ready — CHECK 10

**Scope:** npm publish readiness + cross-deliverable consistency between
`packages/cli/package.json`, `packages/core/package.json`,
`packages/cli/src/migrations/manifests/0.6.0.json`, and
`docs-site/changelog/v0.6.0.mdx`.

**Date:** 2026-06-15
**Branch:** `feat/v0.6.0-rc` @ `c463533c`

---

## Cross-checks

### 1. Version-string parity across both package.json files — PASS

| File | `version` |
|------|-----------|
| `packages/cli/package.json` | `0.6.0-rc.0` |
| `packages/core/package.json` | `0.6.0-rc.0` |

Both packages sit on `0.6.0-rc.0` today. `pnpm release:promote` will promote both
in lockstep to `0.6.0`. The CLI's `dependencies["@mindfoldhq/trellis-core"]` is
`workspace:*`, which `bump-versions.js promote` rewrites to the exact published
version at publish time.

### 2. Manifest claims vs EN GA changelog — PASS (with one platform-list nuance, see below)

Cross-checked the following claims in the manifest's `description` + `changelog`
fields against the EN changelog body (`docs-site/changelog/v0.6.0.mdx`):

| Claim | Manifest | EN changelog | Match |
|-------|----------|--------------|-------|
| "Stable promotion of rc.0, no new src/ changes" | yes | line 6, line 204 | OK |
| 15-platform total | yes | line 101 enumerates 15 | OK |
| New: Reasonix + matured Pi | yes | lines 29-30, 103-104 | OK |
| Codex `[features.multi_agent_v2]` removed | yes | line 21 | OK |
| Codex `dispatch_mode: inline` default | yes | line 22, line 105 | OK |
| `trellis channel` runtime headline | yes | "Multi-agent collaboration" headline section | OK |
| `trellis mem` 5 subcommands (`projects/list/search/context/extract`) | yes | line 85 | OK |
| `--phase brainstorm\|implement\|all` slicing | yes | line 89 | OK |
| `@mindfoldhq/trellis-core` subpath exports `/channel /task /testing /mem` | yes (`/channel`, `/task`, `/testing`, `/mem`) | line 111 says `/channel /task /testing` only | MINOR (see note) |
| OpenCode 1.2+ mem reader degraded | yes | line 37 | OK |
| OOM guard `idle_timeout 5m`, `max_live_workers 6` | yes | line 73 | OK |
| Bundled `.trellis/agents/{check,implement}.md` ship at init/update (#323) | yes | line 81 | OK |
| `trellis-spec-bootstarp` → `trellis-spec-bootstrap` rename (#296) | yes | line 178, line 217 | OK |
| `0.6.0-beta.0` is load-bearing breaking manifest | yes | line 200 | OK |
| Feature requests deferred: #193, #318, #320, #325, #326 | yes | line 45 | OK |
| Bug fix (rc.0): #302 mcp__exa__* drop on `trellis-implement` / `trellis-check` | yes | "Bug Fixes" section, lines 186-196 | OK |

**Minor nuance (not a blocker):** the manifest's SDK-extraction bullet lists
four subpath exports including `/mem`, while the EN changelog's prose mentions
only `/channel`, `/task`, `/testing` (line 111). The table further down
(lines 117-121) DOES enumerate `/mem` separately, so the changelog is
internally complete. Recommend a tiny inline fix to line 111 (append `/mem`)
for prose-table parity, but this is not a contradiction with the manifest —
not held as a blocker for promote.

**Section ordering** between manifest and EN changelog is intentionally
different (manifest places SDK extraction before Platform coverage; EN
changelog places SDK extraction after Platform coverage). The check
specification's "no contradictions on section ordering" is interpreted as "no
contradictory orderings of the same logical content" — both orderings are
defensible narrative arcs. PASS.

### 3. Bundled-skill enumeration: manifest vs filesystem — FAIL (1 of 4 missing)

`packages/cli/src/templates/common/bundled-skills/` contains four
subdirectories:

```
trellis-channel/
trellis-meta/
trellis-session-insight/
trellis-spec-bootstrap/
```

The manifest's `**Bundled skills**` section enumerates only three:

1. `trellis-spec-bootstrap` (renamed from typoed, #296)
2. `trellis-session-insight` (new)
3. `trellis-channel` (new in GA cycle)

`trellis-meta` is **NOT** named in the manifest changelog. The EN changelog's
`## Bundled skills` section enumerates only two (`trellis-spec-bootstrap` and
`trellis-session-insight`) — even `trellis-channel` is missing from the EN
changelog's Bundled-skills section (though channel work is covered elsewhere
in the doc). `trellis-meta` is missing from the EN changelog entirely (zero
`grep` hits in `docs-site/changelog/v0.6.0.mdx`).

This conflicts directly with PRD success criterion #11
(`packages/cli/src/templates/common/bundled-skills/trellis-meta/SKILL.md`
covers all v0.6 architecture elements; new references/ items added per
design.md). PRD line 21 lists the `trellis-meta` refresh as in-scope.

**Status: FAIL.**

**Not self-fixed** — release-artifact changelog text is high-stakes prose
that needs human sign-off (the GA changelog was explicitly written from
scratch by re-reading 25 beta + rc.0 changelogs per PRD line 51). Fix
recommendation deferred to the human author:

- Add a fourth bullet to the manifest's `**Bundled skills**` section, e.g.
  `\n- \`trellis-meta\` (refreshed): expanded coverage of v0.6 architecture
  — channel, mem, dual-package SDK, parent/child tasks, workflow templates,
  registry-backed spec, configurable hooks, Reasonix + Pi platforms,
  bundled-skill auto-dispatch flow.`
- Add a parallel `### \`trellis-meta\`` subsection to `docs-site/changelog/v0.6.0.mdx`
  under `## Bundled skills` (and the same to `docs-site/zh/changelog/v0.6.0.mdx`).
- Also worth adding a `### \`trellis-channel\`` subsection to the EN/zh
  changelog's `## Bundled skills` block so prose enumeration matches the
  three "new/refreshed" skills (parity with manifest).

### 4. `@mindfoldhq/trellis-core@0.6.0` does not yet exist on npm — PASS

`npm view @mindfoldhq/trellis-core versions --json` returned 12 versions
spanning `0.6.0-beta.13` → `0.6.0-rc.0`. **`0.6.0` is NOT in the list.**
The package will exist at `0.6.0` only after `pnpm release:promote` triggers
the CI publish workflow. PASS.

### 5. `@mindfoldhq/trellis@0.6.0` does not yet exist on npm (no collision) — PASS

`npm view @mindfoldhq/trellis versions --json` returned the full historical
list ending at `0.5.0-rc.7 ... 0.5.0 ... 0.5.19 ... 0.6.0-beta.0 ...
0.6.0-rc.0`. **`0.6.0` is NOT in the list.** No collision; promote is free
to publish `0.6.0` on the public npm registry. PASS.

### 6. `git tag -l v0.6.0` is empty — PASS

`git tag -l v0.6.0` returned no output. The tag will be created by
`pnpm release:promote` after the PR merging `feat/v0.6.0-rc` into `main`
lands (mirroring v0.5.0's PR #233 precedent — PRD success criterion #4).
`git tag -l 'v0.6.0*'` enumerates all 25 beta + rc tags but no GA tag.
PASS.

---

## Summary

| # | Cross-check | Result |
|---|-------------|--------|
| 1 | Version-string parity (both packages on `0.6.0-rc.0`) | PASS |
| 2 | Manifest claims vs EN GA changelog (no contradictions) | PASS (minor `/mem` prose-table inconsistency in changelog, not a contradiction) |
| 3 | 4 bundled-skill dirs match manifest enumeration | **FAIL** — `trellis-meta` missing from manifest (and EN changelog) |
| 4 | `@mindfoldhq/trellis-core@0.6.0` not on npm yet | PASS |
| 5 | `@mindfoldhq/trellis@0.6.0` not on npm (no collision) | PASS |
| 6 | `git tag -l v0.6.0` empty | PASS |

**Overall:** 5 of 6 cross-checks PASS. One **FAIL** on bundled-skill
enumeration (manifest + EN changelog both omit `trellis-meta`, which PRD line
21 + success criterion #11 declare in-scope).

**Recommended pre-promote fix (not self-applied — release-artifact prose):**
Add `trellis-meta` (refreshed) bullet to the manifest's `**Bundled skills**`
section, and add a `### \`trellis-meta\`` subsection to both
`docs-site/changelog/v0.6.0.mdx` and `docs-site/zh/changelog/v0.6.0.mdx`. Also
consider adding `### \`trellis-channel\`` to the EN/zh changelog Bundled-skills
section for prose-manifest parity.

**Do NOT** run `pnpm release:promote` until the manifest gap is resolved —
otherwise the GA changelog (which is what users see in `trellis update
--migrate` output and on the docs site) understates the actual skill churn
shipped in v0.6.0.
