# PRESHIP-VERIFY rootcontent (CHECK 6)

**Result: PASS**

Verified docs-site root content after `docs-promote.sh` promotion of ex-`rc/` to root.

## Verification matrix

### 1. rc/ and zh/rc/ removal — PASS

- `docs-site/rc/` directory does not exist (no entry in `ls docs-site/`).
- `docs-site/zh/rc/` directory does not exist (no entry in `ls docs-site/zh/`).
- `git ls-files | grep '^rc/'` → 0 matches.
- `git ls-files | grep '^zh/rc/'` → 0 matches.

### 2. Root start/, advanced/, index.mdx exist with v0.6 content — PASS

Both English and Chinese trees present:
- `docs-site/start/`, `docs-site/advanced/`, `docs-site/index.mdx`
- `docs-site/zh/start/`, `docs-site/zh/advanced/`, `docs-site/zh/index.mdx`

v0.6-era identifiers verified across promoted content:

| Identifier | Where found in promoted root |
|------------|-----------------------------|
| `Pi Agent` (Pi platform = v0.6 addition) | `advanced/architecture.mdx`, `advanced/multi-platform.mdx`, `index.mdx`, `zh/advanced/architecture.mdx`, `zh/advanced/multi-platform.mdx`, `zh/index.mdx` |
| 14-platform count + `.agents/skills/` standard (v0.6 ecosystem) | `index.mdx`, `advanced/architecture.mdx` |
| `trellis mem` | `advanced/roadmap.mdx` |
| `trellis-core` (`@mindfoldhq/trellis-core`) | `advanced/roadmap.mdx` |
| `trellis-session-insight` bundled skill | `advanced/roadmap.mdx` |

Notes on the additional identifiers called out in the check brief:
- `Reasonix`, `trellis channel`, `trellis_subagent` — these are documented in `changelog/v0.6.0.mdx`, `changelog/v0.6.0-rc.0.mdx`, `changelog/v0.6.0-beta.{10,15,17,19,23}.mdx` and their Chinese mirrors. They do not appear in `start/` / `advanced/` / `index.mdx`, which is consistent with the rc/ source content the promote script copied — these surfaces are feature/changelog-scoped, while the user-doc root focuses on workflow primitives. No regression vs the ex-rc content.

Content is v0.6 (not stale v0.5): `advanced/architecture.mdx` mentions Pi Agent's SessionStart-equivalent extension and the 14-platform capability table, neither of which existed pre-v0.6.

### 3. No stale @rc / @beta install commands — PASS

- `grep '@mindfoldhq/trellis@rc'` across `start/`, `advanced/`, `index.mdx`, `zh/start/`, `zh/advanced/`, `zh/index.mdx` → 0 hits.
- `grep '@mindfoldhq/trellis@beta'` across same scope → 0 hits.
- Broader `grep -E '@rc|@beta'` across same scope → 0 hits (including backtick-prose mentions; none present).
- Install commands in `start/install-and-first-task.mdx` and `zh/start/install-and-first-task.mdx` use `@latest`, which is correct for GA.

### 4. Backtick @rc / @beta references in prose — N/A

None present anywhere in promoted root content, so no acceptable-prose carve-out needed.

## Summary

All four sub-checks pass. The promoted root (`start/`, `advanced/`, `index.mdx` + `zh/` mirrors) is the v0.6 content with no remnant RC directory, no stale `@rc` / `@beta` install commands, and no orphaned `@rc` / `@beta` prose references. Safe to proceed with publish.

File path: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/.trellis/tasks/06-15-release-v0-6-0-ga/research/PRESHIP-VERIFY-rootcontent.md`
