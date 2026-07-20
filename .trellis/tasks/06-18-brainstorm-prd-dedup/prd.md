# brainstorm PRD 收敛去重环节

> 记账任务，后续做。来自社区 issue #320（Eliver-zx, 2026-06-01）。

## 问题

`trellis-brainstorm` 增量式构建 prd.md，每轮问答追加/编辑章节。多轮后同一事实在 PRD 里重复 4-5 处，且 brainstorm 临时章节（`What I already know` / `Assumptions` / `Open Questions`）收敛后未清除，全留在终态 PRD，导致喂给 implement/check 子代理的 PRD 大量冗余。

真实复现（#320 举例）：根因在 5 个章节重复（Goal / 镜像约定表 / 链路追踪 / 缺陷清单 / Decision）；缺陷清单 B1-B6 与需求 R1-R8 一一对应高度重复；临时章节未折叠。

> 注：本次 session（2026-06-18）自己起草的几个 PRD（含 community-governance 初版 122 行）也踩了同样的坑——增量堆叠后臃肿、需要手工砍。问题真实且高频。

## 建议方案（#320 给的，二选一或结合）

在 Step 8（最终确认）与 `task.py start` 之间加一个 **PRD 收敛/去重环节**：
1. 工作中 PRD 与"PRD 最终结构"比对
2. 跨章节重复的事实收敛到单一权威位置（根因、决策）
3. 删除已收敛的 Open Questions，临时章节并入 Goal / Background / Technical Notes / Requirements
4. 合并缺陷清单与需求清单的平行重复
5. **硬约束：无损** —— 只移冗余 + 已收敛临时章节，不丢任何 file:line 锚点 / 决策 / AC↔需求映射

落地形式：① 在 `trellis-brainstorm` skill 追加"启动前 PRD 去重"检查步 ② 新增类 trellis-check 子环节在 start 前触发。

## 影响面

- `.claude/skills/trellis-brainstorm/SKILL.md`（+ common/skills/brainstorm.md 源 + 多平台 dispatch 副本）
- 可能涉及 workflow.md 的 Phase 1 → Phase 2 过渡描述（Step 8 与 task.py start 之间）
- 多平台同步（同 sync-on-change Trigger 1 类）

## 验收

- [x] `trellis-brainstorm` 的 common/codex/copilot 模板都要求在最终 review 或 `task.py start` 前执行 PRD convergence pass。
- [x] 收敛步骤明确要求合并 `What I already know` / `Assumptions` / resolved `Open Questions`，并去除跨章节重复事实。
- [x] 收敛步骤明确要求无损保留 file:line 锚点、决策、约束、需求 ID、验收映射。
- [x] 回归测试覆盖三份安装模板，防止只改一份模板导致平台漂移。
- [ ] 关联 #320，实现后在 issue 回复并 close。

## 状态

in_progress。关联 issue #320（已标 enhancement）。
