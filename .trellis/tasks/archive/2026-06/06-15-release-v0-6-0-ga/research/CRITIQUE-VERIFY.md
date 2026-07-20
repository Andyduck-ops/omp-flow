# CRITIQUE Verification — v0.6.0 GA deliverables

- **Date**: 2026-06-15
- **Input**: 17 findings from `CRITIQUE.md` (A1–A4, B1–B3, C1–C3, D1–D7) against 9 patched files.
- **JSON validity**: `0.6.0-manifest-draft.json` parses cleanly (`python3 -m json.tool` exit 0). Keys: `version, description, breaking, recommendMigrate, changelog, migrations, notes`. `changelog` length = 10551 chars (~10 KB).

Status legend: **✓ FIXED** | **✗ NOT FIXED** | **△ PARTIAL**.

---

## A. `trellis-meta` rewrite

### A1 — CRITICAL — `bundled-skills.md` denied `trellis-channel` exists
**Status: ✓ FIXED**
- The "Current Bundled Skills (v0.6.0)" table at line 28 now lists a fourth row:
  > `| `trellis-channel` | Capability skill teaching an AI when to reach for `trellis channel` for multi-agent collaboration, forum/thread persistent boards, and dispatcher-wait patterns. |`
- The contradiction paragraph ("Older docs mention `trellis-channel`… It is not currently shipped…") is gone — no occurrence of "not currently shipped" or "is not currently" in the file.

### A2 — CRITICAL — `trellis-meta/SKILL.md` "Current Rules" omitted `trellis-channel`
**Status: ✓ FIXED**
- Line 73:
  > "Bundled multi-file skills (`trellis-meta`, `trellis-spec-bootstrap`, `trellis-session-insight`, `trellis-channel`) are auto-dispatched to every platform skill root by `getBundledSkillTemplates()`…"
- Line 82:
  > "Do not put team-private project rules into any public bundled skill (`trellis-meta`, `trellis-spec-bootstrap`, `trellis-session-insight`, `trellis-channel`); put project rules in `.trellis/spec/`…"

### A3 — SHOULD-FIX — frontmatter description missed bundled skills
**Status: ✓ FIXED**
- Line 3 description now ends:
  > "…or AI-facing bundled skills (trellis-channel, trellis-session-insight, trellis-spec-bootstrap) and bundled-skill auto-dispatch flow."

### A4 — SHOULD-FIX — `multi-agent-channel.md` missing platform sub-agent vs channel-runtime distinction
**Status: ✓ FIXED**
- "Relationship To Other Local Layers" gained a final bullet (line 65):
  > "**Platform sub-agent files vs. channel workers**: editing `.claude/agents/trellis-implement.md` (and its peers in other platform `.X/agents/` directories) does NOT change channel-runtime worker behavior — channel workers load `.trellis/agents/<name>.md`. The platform-specific agent files are for direct sub-agent dispatch from the main AI session, not for channel-spawned workers. See `platform-files/agents.md`…"

---

## B. `trellis-channel` bundled skill

### B1 — SHOULD-FIX — `forum.md` still had leftover `release-ci-only-publishing` thread key
**Status: ✓ FIXED**
- Lines 232–233 of the patched `forum.md`:
  > "Use stable, descriptive thread keys (e.g. `release-2026-q1`, `runtime-event-schema-change`) so later readers can find them by name."
- The illustrative example block at line 225 now uses `--thread release-2026-q1`. No occurrence of `release-ci-only-publishing` or `channel-threads-` in the file.

### B2 — SHOULD-FIX — `command-reference.md` carried a "Drift vs global skill" footer
**Status: ✓ FIXED**
- `grep` for `global skill | Drift vs global | ~/.claude/skills/trellis-channel | Drift | previously-shipped | previously shipped` returns 0 matches across the file (480 lines).
- Front matter sentence and closing drift section both removed; the file ends at line 480 with the `wait` timeout exit code 124 bullet.

### B3 — NICE-TO-HAVE — SKILL.md description too long
**Status: ✓ FIXED**
- Line 3 is now a single sentence:
  > "Use Trellis channel for live multi-agent collaboration, spawned workers, cross-agent review, progress inspection, forum channels, and channel log debugging."
- Verbatim trigger phrases moved into the body (line 10: "Typical user signals: …").

---

## C. `0.6.0.json` migration manifest

### C1 — SHOULD-FIX — manifest `changelog` "Bundled skills" missed `trellis-channel`
**Status: ✓ FIXED**
- `changelog` "Bundled skills" subsection now contains the parallel third bullet:
  > "- **trellis-channel** (new in v0.6.0 GA cycle): teaches AI agents when to reach for `trellis channel` for multi-agent brainstorm, peer review, forum/thread boards, and dispatcher-wait patterns."
- Vague "Channel runtime bundled skills auto-discovered…" line is gone.

### C2 — NICE-TO-HAVE — changelog string > 3-4 KB target
**Status: ✗ NOT FIXED**
- Measured `changelog` string length: **10551 chars (~10 KB)** — well above the 3–4 KB precedent target. Adding the trellis-channel bullet and other patches grew the field rather than trimming the **Updater** / **Workflow + planning** subsections that CRITIQUE flagged as redundant with per-beta changelogs. Trimming was not attempted in this patch round.

### C3 — NICE-TO-HAVE — `notes` field missing OpenCode degradation warning
**Status: ✓ FIXED**
- The `notes` field now has a dedicated OpenCode line (matches the `<Note>` in the EN/ZH changelog drafts):
  > "**OpenCode users**: `trellis mem` returns empty on OpenCode 1.2+ in this build — the SQLite reader was reverted at `0.6.0-beta.4` due to native-dependency install failures on Windows. A re-enable is planned post-0.6.0."

---

## D. GA changelog EN + ZH drafts

### D1 — CRITICAL — EN and ZH not 1:1 mirrored
**Status: △ PARTIAL**

| Mirror check | EN | ZH | Match? |
|---|---|---|---|
| `<Note>` blocks | 3 (Codex / New platforms / OpenCode) | 3 (Codex / 新支持平台 / OpenCode) | ✓ EQUAL |
| `## H2` sections | 11 | 10 | ✗ EN extra: `## Breaking changes & upgrade` (line 192) |
| Bug Fixes `###` entries | 1 (Exa MCP) | 1 (Exa MCP) | ✓ EQUAL |

- Two of three sub-divergences from the CRITIQUE are fixed:
  - ZH gained the missing `<Note>` for OpenCode and merged Reasonix+Pi into one `<Note>` (en-draft.md lines 12-33 mirror zh-draft.md lines 12-33).
  - ZH `## Bug 修复` is now a single `###` H3 about the Exa MCP fix (zh line 214), no longer the 7-row over-scoped table.
- One residual divergence: EN has a standalone `## Breaking changes & upgrade` H2 (en line 192) that ZH does not carry as its own H2 — ZH only has `## 升级` (zh line 230). Line counts: EN 227, ZH 252.

### D2 — SHOULD-FIX — `<Tip>` content differed between EN and ZH
**Status: ✓ FIXED**
- EN line 9 lead: `**Multi-agent collaboration is now a first-class primitive.**` … ends pointing at "The bundled `check` / `implement` agent definitions auto-install with `trellis init` / `trellis update`…".
- ZH line 9 lead now matches: `**多 agent 协作在 v0.6 升为一等原语。**` … ends with "`trellis init` / `trellis update` 现在会把内置的 `check` / `implement` agent 定义自动下发到每个新装项目，因此 `trellis channel spawn --agent check` 开箱即用".
- Same lead, same "check/implement agent definitions auto-install" closing angle.

### D3 — SHOULD-FIX — Missing `## RC stabilization` section
**Status: ✓ FIXED**
- EN line 196: `## RC stabilization` — body: "v0.6.0 GA = `0.6.0-rc.0` with zero `src/` changes; no rc.1 cut was needed…"
- ZH line 226: `## RC 稳定化` — body: "v0.6.0 GA = `0.6.0-rc.0`，src/ 零改动；不再切 rc.1…"

### D4 — SHOULD-FIX — Missing dedicated `## Platform coverage` H2
**Status: ✓ FIXED**
- EN line 93: `## Platform coverage` — 15-platform list + Reasonix/Pi/Codex/OpenCode/Cursor/Copilot bullets.
- ZH line 133: `## 平台覆盖` — parallel bullet list.

### D5 — SHOULD-FIX — ZH `<Tip>` anchor under-tested
**Status: ✓ FIXED**
- ZH H2 simplified from `## 多 agent 协作 (\`trellis channel\`)` to plain `## 多 agent 协作` (zh line 43).
- `<Tip>` anchor (zh line 9): `[多 agent 协作](#多-agent-协作)` — parens + backticks removed, slug now matches the H2 deterministically under Mintlify CJK-+-ASCII slugification.

### D6 — NICE-TO-HAVE — EN missed 84 tests / 81.89% coverage detail
**Status: ✓ FIXED**
- EN line 79 (Memory intro):
  > "A local CLI that indexes Claude Code and Codex conversation logs already on disk and exposes them through `list`, `search`, `context`, `extract`, and `projects` subcommands. Nothing is uploaded. (84 unit tests, 81.89% coverage on first ship.)"

### D7 — NICE-TO-HAVE — EN `## Upgrade` missed `rename-dir` migration warning
**Status: ✓ FIXED**
- EN lines 210-213 add a `<Warning>` block inside the `## Upgrade` section:
  > "Users running `update --migrate` from a 0.5.x install will also see a `rename-dir` migration that fixes the bundled skill directory name from `trellis-spec-bootstarp/` → `trellis-spec-bootstrap/` across every configured platform skill root. This is automatic and idempotent; missing roots silently skip."

---

## D1 mirror invariants — explicit counts

| Metric | EN (`v0.6.0-changelog-en-draft.md`) | ZH (`v0.6.0-changelog-zh-draft.md`) | Equal? |
|---|---|---|---|
| `<Note>` blocks (top-level, grep `^<Note>`) | 3 | 3 | ✓ |
| `## H2` sections (grep `^## `) | 11 | 10 | ✗ ZH missing `## Breaking changes & upgrade` |
| Bug Fixes `###` entries (within `## Bug Fixes` / `## Bug 修复`) | 1 (Exa MCP, rc.0) | 1 (Exa MCP, rc.0) | ✓ |
| Line count (`wc -l`) | 227 | 252 | (informational) |

`<Note>` headings line up category-by-category:
- EN `**Codex users — upgrade caveat in 0.6.0:**` ↔ ZH `**Codex 用户 —— 0.6.0 升级注意事项：**`
- EN `**New platforms in 0.6.0:**` ↔ ZH `**0.6.0 新支持平台：**`
- EN `**OpenCode users — reader temporarily unavailable:**` ↔ ZH `**OpenCode 用户 —— reader 暂时不可用：**`

H2 sections (in document order):

| # | EN | ZH |
|---|---|---|
| 1 | Multi-agent collaboration | 多 agent 协作 |
| 2 | Memory (`trellis mem`) | Memory (`trellis mem`) |
| 3 | Platform coverage | (out of order — appears as #4 in ZH) |
| 4 | SDK extraction (`@mindfoldhq/trellis-core`) | SDK 提取 (`@mindfoldhq/trellis-core`) |
| 5 | Workflow + planning | 平台覆盖 (= EN #3, out of order) |
| 6 | Updater | 工作流 + 规划 |
| 7 | Bundled skills | Updater (`trellis upgrade` + spec 刷新 + 可配置 hook) |
| 8 | Bug Fixes | 内置 skills |
| 9 | **Breaking changes & upgrade** | Bug 修复 |
| 10 | RC stabilization | RC 稳定化 |
| 11 | Upgrade | 升级 |

ZH lacks an explicit `## 破坏性变更与升级` (or merged content into `## 升级`) — the only structural divergence remaining after the patch round.

---

## Cross-deliverable rollup

| Severity | Total | ✓ FIXED | △ PARTIAL | ✗ NOT FIXED |
|---|---|---|---|---|
| CRITICAL | 3 (A1, A2, D1) | 2 (A1, A2) | 1 (D1) | 0 |
| SHOULD-FIX | 9 (A3, A4, B1, B2, C1, D2, D3, D4, D5) | 9 | 0 | 0 |
| NICE-TO-HAVE | 5 (B3, C2, C3, D6, D7) | 4 (B3, C3, D6, D7) | 0 | 1 (C2) |
| **Total** | **17** | **15** | **1** | **1** |

**Verdict**: All CRITICAL items addressed except D1 has one residual H2 mismatch (ZH missing `## Breaking changes & upgrade`). All SHOULD-FIX items resolved. Only NICE-TO-HAVE C2 (changelog size trim) was not attempted — `changelog` field grew to ~10 KB, ~2.5× the v0.5.0 precedent target.

**Recommended follow-ups before tag push** (optional):
1. Add `## 破坏性变更与升级` H2 to ZH draft (3-line section mirroring EN line 192-194), or fold both into `## 升级` in both languages for true symmetry.
2. Trim the manifest `changelog` field by 5-6 KB — drop **Updater** and **Workflow + planning** bullets that are already detailed in the per-beta changelogs, keep only what a user sees at `trellis update` time.
