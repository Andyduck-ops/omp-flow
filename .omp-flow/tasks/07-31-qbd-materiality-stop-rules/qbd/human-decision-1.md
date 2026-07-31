---
type: "Human Decision"
title: "QbD 1 校准：重大 blocker、残余风险与 targeted Grill"
---

# QbD 1 人类校准

## 关联

- 审计：[QbD 1 设计审计](design-audit.md)
- 设计：[实践导向 Explore 与 QbD 提示合同设计](../design.md)
- 要求：[实践导向 Explore 与 QbD 收敛](../prd.md)

## 人类决定

接受审计 B1 对授权边界的校正，并补充在必要时使用定向 Grill：

- advisory risk、PASS 中的 residual risk，或已经通过移除、禁用、缩范围、fail-soft 等
  手段不再满足 blocker 定义的风险，可以由人接受并继续；
- 未解决的 `FAIL` 不能以普通 accepted risk 名义让原危险范围原样进入后续实现；人选择
  修复、移除/安全降级、推迟或停止；
- 重大 `NEEDS_EVIDENCE` 不能仅凭风险接受绕过；人选择补证据、移除/安全降级不确定范围、
  推迟或停止；
- 若人考虑改变已经声明的不可牺牲边界，应将其视为价值和问题定义的实质变化，返回
  Brainstorm/Design 重构，而不是把旧 blocker 改名为 residual risk；
- 这种重大边界变更在必要时进行 targeted Grill：人先陈述改变边界的目的、价值和风险
  理由，Agent 再以最强反方、具体后果和更轻降级方案挑战，最终仍由人确认、修改或放弃
  该变化。

targeted Grill 不是每个 finding 的自动步骤，也不要求固定轮数或穷尽所有分支。只有当
边界变化可能实质改变问题内核、权限/数据安全或不可恢复后果时才值得启动。

## 下一步

只修订 PRD/Design 中 B1 指出的歧义和相应验收分叉，然后对 B1 做限定范围的独立复审；
第一性锚、Research ↔ Brainstorm 循环、Prompt 分层和三 Harness 同步方向不重开。
