# PRESHIP-VERIFY-changelog

**Result**: PASS (after self-fix)

## Files checked

- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/docs-site/changelog/v0.6.0.mdx`
- `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/docs-site/zh/changelog/v0.6.0.mdx`

## EN/ZH mirror table

| Check                                          | EN                                                              | ZH                                                                     | Status |
| ---------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Frontmatter `title`                            | `'v0.6.0'`                                                      | `'v0.6.0'`                                                             | PASS   |
| Frontmatter `description`                      | `'2026-06-15'`                                                  | `'2026-06-15'`                                                         | PASS   |
| Body H1 present?                               | No                                                              | No                                                                     | PASS   |
| `<Note>` block count                           | 3                                                               | 3                                                                      | PASS   |
| `<Warning>` block count                        | 2 (intro + Upgrade rename-dir notice)                           | 1 (intro only)                                                         | INFO   |
| `## H2` section count                          | 11                                                              | 11                                                                     | PASS   |
| Bug Fixes H3 entry count                       | 1 (Exa MCP fix)                                                 | 1 (Exa MCP fix)                                                        | PASS   |
| ZH 7-row over-scoped Bug Fixes table (CRIT D1) | n/a                                                             | absent — collapsed to single entry                                     | PASS   |
| ZH "## 破坏性变更与升级" header                | n/a                                                             | present (line 239)                                                     | PASS   |
| Bundled skills entries: channel                | added                                                           | added                                                                  | FIXED  |
| Bundled skills entries: meta                   | added                                                           | added                                                                  | FIXED  |
| Bundled skills entries: spec-bootstrap         | present                                                         | present                                                                | PASS   |
| Bundled skills entries: session-insight        | present                                                         | present                                                                | PASS   |
| Closing `</Note>` / `</Warning>` at col 0      | all unindented                                                  | all unindented                                                         | PASS   |
| `@rc` / `@beta` in install commands            | none                                                            | none                                                                   | PASS   |
| Install command form                           | `npm install -g @mindfoldhq/trellis` (untagged)                 | `npm install -g @mindfoldhq/trellis` (untagged)                        | PASS   |
| Tip anchor link                                | `#multi-agent-collaboration` → `## Multi-agent collaboration` | `#多-agent-协作` → `## 多 agent 协作`                              | PASS   |
| ZH session-insight back-ref anchor             | n/a                                                             | `#内置-trellis-session-insight-skill` → `### 内置 …skill` (line 116) | PASS   |

## EN H2 headers (11 total, in file order)

1. `## Multi-agent collaboration`
2. `## Memory (\`trellis mem\`)`
3. `## Platform coverage`
4. `## SDK extraction (\`@mindfoldhq/trellis-core\`)`
5. `## Workflow + planning`
6. `## Updater`
7. `## Bundled skills`
8. `## Bug Fixes`
9. `## Breaking changes & upgrade`
10. `## RC stabilization`
11. `## Upgrade`

## ZH H2 headers (11 total, in file order)

1. `## 多 agent 协作`
2. `## Memory (\`trellis mem\`)`
3. `## SDK 提取 (\`@mindfoldhq/trellis-core\`)`
4. `## 平台覆盖`
5. `## 工作流 + 规划`
6. `## Updater (\`trellis upgrade\` + spec 刷新 + 可配置 hook)`
7. `## 内置 skills`
8. `## Bug 修复`
9. `## 破坏性变更与升级`
10. `## RC 稳定化`
11. `## 升级`

All 11 required headers present 1:1 in both files (ZH names translated, EN names verbatim). Section ordering differs slightly (EN: `Platform coverage` precedes `SDK extraction`; ZH: `SDK 提取` precedes `平台覆盖`) — task spec requires presence, not order.

## Issues found and fixed

1. `docs-site/changelog/v0.6.0.mdx:174–183` — Bundled skills section listed only 2 of 4 skills (spec-bootstrap, session-insight). Added `### \`trellis-channel\`` (new bundled capability skill, 5 reference files, auto-dispatched) and `### \`trellis-meta\`` (rewritten for v0.6 architecture, new multi-agent-channel + bundled-skills reference docs, expanded platform map). Now lists all 4.
2. `docs-site/zh/changelog/v0.6.0.mdx:207–215` — Same gap mirrored. Added Chinese counterparts for `trellis-channel` and `trellis-meta` entries.

## Issues not fixed

- **Warning block asymmetry** (informational): EN has 2 `<Warning>` blocks (intro `Known upstream issues` + `## Upgrade` `rename-dir migration` callout); ZH has 1 (intro only — the rename-dir callout is folded into prose at line 253). Task spec required equality only for `<Note>` blocks (3 each), not `<Warning>`, so leaving as-is. Reporting for awareness; structural mirror could be tightened by mirroring the rename-dir `<Warning>` into ZH `## 升级`.

## Verification of remaining spec gates

- Closing tags at column 0: `grep -E "^[[:space:]]+</(Note|Warning|Tip)>"` returned 0 matches in both files. PASS.
- `@rc` / `@beta` / `@latest` in install commands: `grep -E "@(rc|beta|latest)"` returned 0 matches in both files. The only install command is `npm install -g @mindfoldhq/trellis` (untagged). PASS.
- `trellis update --migrate` referenced once each in `## Upgrade` / `## 升级`. PASS.
- All anchor refs in `<Tip>` / inline links resolve to existing headers.

## Summary

Checked 2 files. Found 1 issue affecting both (bundled skills section missing `trellis-channel` and `trellis-meta` entries). Self-fixed in both files. All required structural mirror checks now pass: 3 Notes each, 11 H2 sections each, 1 Bug Fix entry each, all 11 required headers present 1:1, all anchor links resolve, no `@rc`/`@beta` in install commands, all closing tags at column 0. One informational delta noted (`<Warning>` count 2 vs 1) but outside the spec's strict equality requirements.

**Result file**: `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/.trellis/tasks/06-15-release-v0-6-0-ga/research/PRESHIP-VERIFY-changelog.md`
