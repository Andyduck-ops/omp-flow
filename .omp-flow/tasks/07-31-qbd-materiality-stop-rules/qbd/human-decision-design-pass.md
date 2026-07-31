---
type: "Human Decision"
title: "QbD 1 Human PASS：实践导向 Explore 与 QbD 设计"
---

# QbD 1 Human PASS

## 关联

- 设计：[实践导向 Explore 与 QbD 提示合同设计](../design.md)
- 初次审计：[QbD 1 设计审计](design-audit.md)
- B1 校准：[重大 blocker、残余风险与 targeted Grill](human-decision-1.md)
- 限定复审：[B1 限定复审](design-audit-b1-recheck.md)

## 决定

人确认 QbD 1 **PASS**，批准当前 PRD 与 Design 进入 Work 分解。

实现还应保持以下校准：

- 必要的责任、价值判断、风险取舍和最终决策由人承担，不能让模型 verdict 替代人的治理；
- 不给模型堆叠过多微观思考约束。优先表达稳定的目标、责任边界、最强反方义务、可验证
  后果和少量真正的安全边界；
- 容易随模型能力、Harness 或实践变化而过时的步骤性处方，应通过 no-op test 删除或缩短，
  不因担心模型犯错就不断增加 Prompt；
- 必要的 Grill 用于实质价值/风险/主要矛盾校准，不成为所有任务、finding 或模型回答的
  固定仪式；
- 实现后的真实效果继续返回实践检验。本次设计不是不可修改的最终理论。

这项批准不授权扩大到 runtime lifecycle state、Markdown parser、Hooks、Flow Status 或
新的风险治理数据库。
