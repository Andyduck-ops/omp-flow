# 支持 Devin 平台（Windsurf 改名，#325）

## 缘起

issue #325：Windsurf 改名 Devin Desktop（Cognition 2026-06-02 OTA 更新，已查证为改名非两产品，见 research/windsurf-to-devin.md），配置目录从 `.windsurf/` 变为 `.devin/`（`.devin/` 优先，`.windsurf/` 向后兼容）。维护者已在 #325 认领（"我来搞一下"）。

## 目标

让 Trellis 跟进 Devin 改名：`trellis init --devin` 写 `.devin/` 配置，已装 `.windsurf/` 的项目可迁移。

## 方案（倾向 A：改名 + 迁移，见 research 设计选项）

- registry windsurf 条目改名为 devin（`name: "Devin"`、`configDir: ".devin/..."`、`cliFlag: "devin"`）
- 加 `rename-dir` migration：`.windsurf/workflows` → `.devin/workflows`、`.windsurf/skills` → `.devin/skills`（用项目已有的 rename-dir migration type，参照 beta.23 trellis-spec-bootstarp 改名）
- 保留 `--windsurf` 作 deprecated alias 一个版本，平滑过渡

## 实现前必须确认（research 待定项）

- [ ] Devin Desktop 实际读哪个子目录结构？（官方 FAQ 说 `.devin/rules/`，Trellis 用 `.windsurf/workflows` + `.windsurf/skills`——确认 Devin 是否读 `.devin/workflows`/`.devin/skills` 还是结构变了）
- [ ] Devin Local（替代 Cascade）是否带来 hook/agent 能力变化？重评估当前 `agentCapable: false` / `hasHooks: false`

## 验收

- [x] `trellis init --devin` 写 `.devin/` 配置（正确子目录）
- [x] `--windsurf` 仍可用（deprecated alias，打印弃用提示）
- [x] rename-dir migration 把已装 `.windsurf/` 迁到 `.devin/`，dogfood 验证迁移幂等（0.6.3.json）
- [x] registry-invariants / platforms 测试覆盖新 devin 条目（1236 tests pass）
- [x] docs-site 平台列表 + ai-tools 页改名 + redirect（windsurf → devin）
- [ ] 实现后在 #325 回复并 close（用户操作）

## 追加范围进度（windsurf → devin 全量同步）

- [x] #1 workflow.md 主源 — marker 改 `Devin`（commit 1a9a9475）
- [x] #2 marketplace 三套 workflow.md（commit 6d7e713 + pointer）
- [x] #3 docs-site 中英 ~34 文件 + ai-tools/windsurf.mdx → devin.mdx + docs.json redirect（docs-site bd22d44 / pointer d9005c57）
- [x] #4 trellis-meta skill references（随实现 commit 处理）
- [x] #5 dev spec（configurator-shared / platform-integration / workflow-state-contract / directory-structure；commit 50f1d5cc）。历史叙述（codex marker 迁移 retrospective）保留 windsurf 作准确历史
- [x] #6 dogfood 副本同步（commit c019b7a8）
- 保留：`--windsurf` alias 代码 + legacy `.windsurf/` 路径检测 + changelog/manifest 历史

## 状态
implemented（代码 + 文档 + spec 全量同步并推送）。待用户在 #325 回复 close。关联 #325。维护者已认领。

---

## 追加范围：全文档/workflow 同步（windsurf → devin）

实现 workflow（wah9hen0u）只覆盖 registry/configurator/migration/test。windsurf 散落比 ai-tools.ts 广得多，全仓 grep 分类如下，需在实现结果确定后一并同步（**第二轮文档同步 workflow，待实现 workflow 回来后基于其 registry 最终命名 + inject 标签决策再规划**）：

### 必须改

1. **workflow.md 主源**（`packages/cli/src/templates/trellis/workflow.md`）：10 处 platform-group 标签 `[codex-inline, Kilo, Antigravity, Windsurf]`（inline-capable 组，inject-workflow-state 按它过滤）。⚠️ **强耦合**：改这个标签要同步确认 `inject-workflow-state.py` / registry 平台名匹配逻辑认新名，否则 inline 注入对不上。
2. **marketplace 三套 workflow.md**（native / tdd / channel-driven-subagent-dispatch）：共 26 处同样的标签。子模块，单独 commit + pointer bump。
3. **docs-site**（中英各处，~22 处）：advanced/（平台表、multi-platform、custom-* 等）、start/、ai-tools/、skills-market/ —— 平台列表 / 能力表 / 路径示例里的 windsurf。排除 changelog（冻结）。
4. **trellis-meta skill references**（主源 + 5 平台 dispatch 副本）：platform-files/platform-map.md（平台行）、local-architecture/、customize-local/ 里的 windsurf 提及。
5. **spec**：`.trellis/spec/cli/backend/` + `.trellis/spec/guides/` + `templates/markdown/spec/guides/` 里的 windsurf 提及。
6. **dogfood 副本**：改完源后 `trellis update` 同步 `.{platform}/skills/...`。

### 绝对不能动

- **migrations/manifests**（7 处，0.4.0-beta.9 / 0.5.0-beta.0 / 0.6.0-beta.23）：历史记录，描述当时 shipped 的内容，保留旧名（同 trellis-spec-bootstarp 改名先例，旧 manifest 保留 typo）。

### 决策点（实现 workflow 回来后定）

- workflow.md 的 `Windsurf` platform-group 标签：是直接换成 `Devin`，还是保留 `Windsurf` 作 inject 兼容标签？取决于实现 workflow 怎么处理 registry 平台名 + `--windsurf` alias + inject 脚本匹配。**文档同步必须基于此，否则代码文档不一致。**
- 文案口径：平台列表/能力表/路径 → 直接 windsurf→devin 替换；`--windsurf` deprecated alias 的文档 → 保留"旧名 windsurf"说明；changelog/manifest → 不动。
