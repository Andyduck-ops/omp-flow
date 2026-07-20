# PRESHIP-VERIFY: docs-site/docs.json

**Result: PASS**

File: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/docs-site/docs.json`

## Check Matrix

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Valid JSON (parses) | PASS | `json.load()` succeeded |
| 2 | Top-level `banner` key ABSENT | PASS | Top-level keys: `$schema, colors, contextual, exclude, favicon, footer, interaction, js, logo, name, navbar, navigation, redirects, repository, theme` (no `banner`) |
| 3a | EN language has exactly 1 version block | PASS | `VERSION_COUNT=1` |
| 3b | EN version label = `Release`, default=true | PASS | `version='Release' default=True` |
| 3c | ZH language has exactly 1 version block | PASS | `VERSION_COUNT=1` |
| 3d | ZH version label = `Release`, default=true | PASS | `version='Release' default=True` |
| 4 | No RC version block remains | PASS | Only one block per language, labeled `Release` |
| 5a | EN Changelog first entry = `changelog/v0.6.0` | PASS | docs.json line 121 |
| 5b | EN Changelog second entry = `changelog/v0.6.0-rc.0` | PASS | docs.json line 122 |
| 5c | EN Changelog third entry = `changelog/v0.6.0-beta.23` | PASS | docs.json line 123 |
| 5d | ZH Changelog first entry = `zh/changelog/v0.6.0` | PASS | docs.json line 345 |
| 5e | ZH Changelog second entry = `zh/changelog/v0.6.0-rc.0` | PASS | docs.json line 346 |
| 5f | ZH Changelog third entry = `zh/changelog/v0.6.0-beta.23` | PASS | docs.json line 347 |
| 6 | navbar `Changelog` href = `/changelog/v0.6.0` | PASS | `{'label': 'Changelog', 'href': '/changelog/v0.6.0'}` — no stale `v0.6.0-beta.*` / `v0.6.0-rc.*` |
| 7 | No nav page starts with `rc/` or `zh/rc/` | PASS | `RC_PAGES: []` across 314 nav page entries |

## Distinct Nav Page Prefixes

Collected from every `pages: []` entry across both languages (314 pages total):

- `advanced/`
- `blog/`
- `changelog/`
- `contribute/`
- `index` (root EN home)
- `showcase/`
- `skills-market/`
- `start/`
- `templates/`
- `use-cases/`
- `zh/advanced/`
- `zh/blog/`
- `zh/changelog/`
- `zh/contribute/`
- `zh/index` (root ZH home)
- `zh/showcase/`
- `zh/skills-market/`
- `zh/start/`
- `zh/templates/`
- `zh/use-cases/`

All prefixes correspond to existing top-level directories under `docs-site/` (verified at `ls docs-site/`: `advanced/ blog/ changelog/ contribute/ showcase/ skills-market/ start/ templates/ use-cases/ zh/`). No orphan / dangling prefixes.

## Counts

- `TOTAL_PAGES = 314` (distinct nav page entries)
- `Changelog` group page count: 117 entries per language (EN + ZH mirror)

## Notes (non-blocking)

- The `redirects[]` block still contains `/release/...` and `/zh/release/...` sources mapping to `/release` / `/zh/release` — these are legacy permanent redirects FROM old `/release/...` URLs (pre-promotion), not nav entries, so they do not violate the "no `rc/` or `zh/rc/`" nav rule. They are out of scope for this check (no `rc/` source paths).
- Reviewed task artifacts: `prd.md`, `design.md`, `implement.md` under `.trellis/tasks/06-15-release-v0-6-0-ga/`.

## Summary

All 7 docs.json post-promote invariants for the v0.6.0 GA cut hold. No fixes applied; no fixes required.
