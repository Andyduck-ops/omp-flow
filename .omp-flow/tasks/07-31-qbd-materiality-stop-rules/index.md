---
okf_version: "0.2"
---

# 收敛 QbD 重要性与停止规则

- [Task](task.md) — purpose and durable task identity.
- [Brainstorm](brainstorm.md) — questions, hypotheses, and reframing.
- [现有 QbD 与工作流方法论缺陷调查](research/current-methodology-defects.md) — 从当前
  Workflow、Skills、Agents、测试与历史建立缺陷因果链并选择修正方向。
- [实践导向的 QbD 修正方向](research/practice-led-qbd-direction.md) — selected synthesis；
  保留独立审计与安全边界，把 materiality、人的治理和 scoped re-audit 下沉到提示合同。
- [mattpocock/skills Reference](reference/matt-pocock-skills.md) — 固定 revision 的外部样本；
  提炼小型可组合 Skill、人的控制权、Prompt 剪枝与实践反馈，也记录不应照搬的形式主义
  风险。
- [Grill Skill 适配分析](research/grill-skill-fit.md) — 将人主动入口、一次一个决定和
  Agent 负责事实调查改造为 material decision frontier，避免默认穷尽所有分支。
- [第一性锚定](research/first-principles-anchor.md) — 在广泛 Research 前共同识别现象、
  主要矛盾、不可牺牲结果与反证条件，让后续 Explore 循环有方向但仍可被实践修订。
- [QbD 1 设计审计](qbd/design-audit.md) — 整体方向成立；指出 accepted residual risk 与
  未解决重大 blocker 的授权边界仍需人类校准。
- [QbD 1 人类校准](qbd/human-decision-1.md) — 接受 blocker/residual-risk 边界，并规定
  重大价值边界变化必要时采用 human-first targeted Grill 后返回 framing/design。
- [B1 限定复审](qbd/design-audit-b1-recheck.md) — PASS；确认重大 blocker 不能由 accepted
  risk 绕过，targeted Grill 只用于必要的价值边界重构。
- [QbD 1 Human PASS](qbd/human-decision-design-pass.md) — 人批准设计进入 Work 分解，并要求
  人保留责任/决策、Prompt 避免易过时的微观思考约束。
- [Work Map](work/index.md) — 三个描述性工作面：共同方法论、Harness 角色合同、分发与
  `0.2.3` 发布验证。
- [QbD 2 Work Map 审计](qbd/work-map-audit.md) — PASS；三个 Work 的所有权、验证和发布
  归属完整，无 blocking finding。
- [QbD 2 Human PASS](qbd/human-decision-work-map-pass.md) — 批准进入实现；保留少量必要
  方法论名词，同时避免易过时的微观模型约束。
- [共同方法论 Handoff](handoff/methodology-contracts.md) / [独立 Review](review/methodology-contracts.md)
  — ACCEPTED；Workflow 与 Shared Skills 合同已实现并同步。
- [Harness 角色 Handoff](handoff/harness-agent-contracts.md) / [独立 Review](review/harness-agent-contracts.md)
  — ACCEPTED；OMP、Codex、Claude 角色语义与固有边界通过验证。
- [0.2.3 分发 Handoff](handoff/distribution-and-release.md) / [独立 Review](review/distribution-and-release.md)
  — ACCEPTED；339 项检查、版本、临时安装与包清单验证通过。
- [Completion](completion.md) — 三个 Work 独立接受，Fresh Finish 验证与知识收获完成。
- [PRD](prd.md) — 把第一性锚定、可证伪 Explore、QbD materiality、人的停止权和三
  Harness 一致性写成可测试的产品合同。
- [Technical Design](design.md) — 记录 Workflow、Shared Skills、Harness Agents 的
  canonical/deployed 所有权、Prompt 数据流、兼容性、验证路径与拒绝方案。

Add and link Concepts as the task grows. This index is navigation, not a closed manifest.
