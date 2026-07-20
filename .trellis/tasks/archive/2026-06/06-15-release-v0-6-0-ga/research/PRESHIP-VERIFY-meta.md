# PRESHIP-VERIFY: trellis-meta rewrite (production location)

Verification of `packages/cli/src/templates/common/bundled-skills/trellis-meta/` against the CHECK 2 criteria for v0.6.0 GA release.

## Files Inspected

- `packages/cli/src/templates/common/bundled-skills/trellis-meta/SKILL.md` (85 lines)
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/multi-agent-channel.md` (69 lines)
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/local-architecture/bundled-skills.md` (146 lines)
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/platform-files/platform-map.md` (84 lines)
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-skills-or-commands.md` (122 lines)

Total references tree: 23 files under `references/` (8 local-architecture, 4 platform-files, 9 customize-local + their parents).

## Criterion Results

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | SKILL.md is new ~85-line v0.6 version, not old 73-line v0.5 version | PASS | `wc -l` reports 85 lines; explicit v0.6 surfaces present (see below) |
| 2 | SKILL.md mentions channel runtime | PASS | Lines 10, 15, 26, 41 mention `trellis channel` runtime, JSONL event log, `.trellis/agents/{check,implement}.md` |
| 3 | SKILL.md mentions trellis mem | PASS | Lines 10, 18, 39, 70 reference `trellis mem list/search/context/extract/projects` |
| 4 | SKILL.md mentions trellis-core SDK | PASS | Lines 10, 20, 39, 83 reference `@mindfoldhq/trellis-core` SDK and `/channel`, `/task`, `/mem`, `/testing` subpaths |
| 5 | SKILL.md mentions parent/child task trees | PASS | Line 37, 69: `parent/child task trees`, `task.py create --parent`, `add-subtask`, `remove-subtask`, `list-context` |
| 6 | SKILL.md mentions workflow templates | PASS | Line 36, 55, 66: `native`, `tdd`, `channel-driven-subagent-dispatch`, marketplace; `trellis workflow --template <id>` |
| 7 | SKILL.md mentions bundled-skill auto-dispatch | PASS | Line 3 (frontmatter), 60, 73: `getBundledSkillTemplates()` auto-dispatch, `packages/cli/src/templates/common/index.ts` |
| 8 | SKILL.md mentions Reasonix | PASS | Line 15, 47, 74: Reasonix skills + frontmatter rule |
| 9 | SKILL.md mentions Pi native `trellis_subagent` | PASS | Line 15, 47: `Pi additionally exposes a native trellis_subagent tool with single / parallel / chain dispatch modes` |
| 10 | Frontmatter description ends with bundled-skill triggers (`trellis-channel`, `trellis-session-insight`, `trellis-spec-bootstrap`) | PASS | Line 3 ends: `...AI-facing bundled skills (trellis-channel, trellis-session-insight, trellis-spec-bootstrap) and bundled-skill auto-dispatch flow.` |
| 11 | New file `references/local-architecture/multi-agent-channel.md` exists and is non-trivial | PASS | 69 lines covering storage layer, core paths table, when-to-reach decision rules, customization table, layer relationships, runtime usage handoff |
| 12 | New file `references/local-architecture/bundled-skills.md` exists and is non-trivial | PASS | 146 lines covering what counts as bundled, current bundled set (v0.6.0), per-platform landing, dispatch wiring code paths, adding/overriding/removing skills, operating rules |
| 13 | `platform-map.md` has Reasonix row | PASS | Line 23: `\| Reasonix \| --reasonix \| .reasonix/ \| .reasonix/skills/ \| None — sub-agents are skills with runAs: subagent frontmatter \| None \|` |
| 14 | `platform-map.md` has "Native Trellis Sub-Agent Tool" subsection mentioning Pi | PASS | Lines 46-52: `### Native Trellis Sub-Agent Tool` with `Pi Agent — trellis_subagent tool, defined in .pi/extensions/trellis/index.ts. Supports single / parallel / chain dispatch modes` |
| 15 | `change-skills-or-commands.md` has "Bundled vs. Project-Local" subsection covering all 4 bundled skills | PASS | Line 51-63: `### Bundled vs. Project-Local` subsection; the bundled column header explicitly enumerates `trellis-meta`, `trellis-spec-bootstrap`, `trellis-session-insight`, `trellis-channel` |
| 16 | `change-skills-or-commands.md` common-paths table has 13+ platform rows | PASS | Common Paths table (lines 78-92) contains 13 data rows: Claude Code, Cursor, OpenCode, Codex, Gemini CLI, Kiro, Qoder, CodeBuddy, GitHub Copilot, Factory Droid, Pi Agent, Reasonix, Kilo/Antigravity/Windsurf |
| 17 | `bundled-skills.md` does NOT contain "not currently shipped" or "is not currently" (CRITIQUE A1 fix) | PASS | `grep` of both phrases returns 0 matches |
| 18 | Current Rules section lists 4 bundled skills (`trellis-channel`, `trellis-meta`, `trellis-session-insight`, `trellis-spec-bootstrap`), not 3 | PASS | Line 73 of SKILL.md: `Bundled multi-file skills (trellis-meta, trellis-spec-bootstrap, trellis-session-insight, trellis-channel) are auto-dispatched...` — all 4 named |
| 19 | Do Not section has no v0.5-anchored claims | PASS | Lines 78-85 are all v0.6-anchored: dual-package lockstep release (`@mindfoldhq/trellis` + `@mindfoldhq/trellis-core`), 4-skill bundled set, `~/.trellis/channels/` event log, `.trellis/agents/<name>.md` vs platform sub-agent split, `trellis-core/channel` SDK, "removed or never-shipped mechanisms" admonition |

## Summary

**All 19 criteria PASS.**

The production location `packages/cli/src/templates/common/bundled-skills/trellis-meta/` has been correctly rewritten to v0.6 shape:

- SKILL.md is the new 85-line version touching every required v0.6 surface (channel runtime, `trellis mem`, `trellis-core` SDK, parent/child task trees, workflow templates, bundled-skill auto-dispatch, Reasonix, Pi `trellis_subagent`).
- Frontmatter description ends with the three required bundled-skill triggers in the exact required order.
- Two net-new reference files exist (`multi-agent-channel.md`, `bundled-skills.md`), each substantial.
- `platform-map.md` has the Reasonix row and the "Native Trellis Sub-Agent Tool" subsection naming Pi.
- `change-skills-or-commands.md` has the "Bundled vs. Project-Local" subsection enumerating all 4 bundled skills and a 13-row common-paths table.
- CRITIQUE A1 regression check is clean: `bundled-skills.md` does not contain "not currently shipped" or "is not currently".
- Current Rules names the full 4-skill bundled set, and the Do Not section is anchored entirely in v0.6 mechanics.

No fixes were required.

## File Paths

- Verification target: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/src/templates/common/bundled-skills/trellis-meta/`
- This report: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/.trellis/tasks/06-15-release-v0-6-0-ga/research/PRESHIP-VERIFY-meta.md`
