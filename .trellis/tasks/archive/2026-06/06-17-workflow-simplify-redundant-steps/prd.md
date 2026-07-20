# Workflow 简化：删除 3.1 + 审计其它冗余步骤

砍掉 `.trellis/workflow.md` 中本质重复或低价值的步骤，降低 AI / 用户每次走流程的认知负担。

## 缘起

`Phase 3.1 Quality verification` 跟 `Phase 2.2 Quality check` 在能力层面同源——都加载 `trellis-check` skill 跑 spec 合规 + lint/typecheck/test + 跨层一致性。中间 2.2 是 `[repeatable]`，理论上"最后一次 2.2"已经覆盖了 3.1 的全部工作。3.1 现存的唯二独有价值（全量 package 视图、Spec Sync 触发点）都是 checklist 行，可以无损地折叠进 2.2 / 3.4。

借机审计：workflow 还有哪些步骤是"backstop / 重复 / 仪式感"而不是真有独立能力，一并清理。

## 范围

### In scope

- 删除 `Phase 3.1 Quality verification` 步骤
- 把 3.1 现有的两个独有价值（"全量 package 视图"、"Spec Sync 触发提醒"）合理转移：
  - 全量 package 视图 → `2.2 Quality check` 的描述里强调"最后一次 2.2 必须在所有 implement 完成后跑一次 full-scope check"
  - Spec Sync 提醒 → `3.4 Commit changes` 步骤开头加 1 行 preamble："若上次 2.2 之后又改过代码，再跑一次 trellis-check skill；同时确认 Spec Sync checklist 是否触发 Phase 3.3"
- 审计 workflow.md 中所有 14 个 step（1.0-1.5, 2.1-2.3, 3.1-3.5），找出同类冗余/仪式步骤
- 把 Phase Index 表头、Rules 段、Active Task Routing 表里所有提到 3.1 的地方一并改掉
- 跨平台同步：14 个平台的 `workflow.md` 模板由 `packages/cli/src/templates/common/` 单一来源派生，确保删除生效

### Out of scope

- 修改 `trellis-check` skill 本身（skill 内容不动，只改 phase 引用）
- 修改 `trellis-break-loop` / `trellis-update-spec` 等其它 skill
- 改变 2.2 / 3.3 / 3.4 的 implementation（只动文案，不动行为）
- 增加新 phase 或新 step
- 改 1.5 Completion criteria（这是 phase 1 的退出条件表，不是 action step；不属于"步骤"概念）

## 验收标准

1. `.trellis/workflow.md` 不再有 `Phase 3.1` 章节
2. Phase Index、Rules、Active Task Routing 三处提到 3.1 的地方全部移除或改向
3. 2.2 Quality check 步骤文案明确"包含 commit 前的最终 full-scope 检查职责"
4. 3.4 Commit changes 步骤文案加入"commit 前若有未 check 的改动，先跑一次 trellis-check"的 1 行 reminder
5. `pnpm trellis init` 在 /tmp 跑出来的 .trellis/workflow.md 跟主仓内容一致（模板同步）
6. 所有 14 个平台的 generated workflow（如有）跟主版本一致
7. 审计报告产出（`research/audit-findings.md`）覆盖：每个 step 的"独有价值是什么"、"能否折叠"、"建议保留 / 删除 / 合并"
8. 审计报告里没被建议动手的步骤，明确说明保留理由（不是"忘了审"）
9. 至少一个 dogfood：在新临时项目里跑 `trellis init` → `trellis update`，确认 workflow.md 被正确替换

## 约束

- 不能破坏现有 in-flight task 的工作流——已经处于 in_progress 的任务读 workflow.md 时不能因为找不到 3.1 而卡住（解决办法：步骤改名时保留向后兼容映射，或在审计报告里确认"找不到的 step 号 AI 应该跳过"是 graceful 行为）
- 改动必须是**减法**为主：删除步骤 OK，新增/重命名其它步骤的工作放别的任务
- 不动 task.py / get_context.py 脚本的接口（`--mode phase --step <X.Y>` 接口稳定）
- Spec Sync 提示的迁移不能让"修了 bug 但没沉淀进 spec"的概率上升——3.4 preamble 的措辞要足够刺眼

## 风险

- **AI 长期记忆中已经"知道" 3.1**：删除后短期内可能 AI 仍按旧 workflow 提及 3.1。低风险——下次 SessionStart 注入新 workflow.md 后会自然修正
- **第三方依赖文档**：docs-site / 教程里如果有引用 "Phase 3.1" 字面值会过时。审计时需 grep 一遍
- **多平台模板漂移**：14 个平台 workflow 来自单一源，但部分平台有 inline 区域 `[platform-name] ... [/platform-name]`。修改时要走每个平台的 inline 区域确认没遗漏
