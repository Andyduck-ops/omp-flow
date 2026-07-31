---
type: "QbD 1 Audit"
title: "实践导向 Explore 与 QbD 提示合同设计审计"
---

# QbD 1 设计审计

## 审计对象与独立性

- Entry：[Technical Design](../design.md)
- 要求：[PRD](../prd.md)
- 主要来源：[实践导向的 QbD 修正方向](../research/practice-led-qbd-direction.md)、
  [第一性锚定](../research/first-principles-anchor.md)、
  [现有缺陷调查](../research/current-methodology-defects.md)和
  [Grill 适配分析](../research/grill-skill-fit.md)
- Actor：`qbd1-qbd-materiality-v1`
- Dispatch receipt：`b8bbb598221f4154b6432948a97bb962`
- Predecessor receipt：`339338f6ab5740248ebc6543e029f841`

本审计只修改本 Audit Concept，不修改 PRD、Design、来源、产品文件或人的决定。

## Verdict

**FAIL — 1 个 decision-critical blocking finding。**

第一性锚定、Research ↔ Brainstorm 可证伪循环、Prompt 分层、三 Harness 同步与验证边界
整体有充分来源和可执行路径；阻塞项仅是 `FAIL`/`NEEDS_EVIDENCE` 后 accepted risk 的
授权含义尚未与不可牺牲边界对齐。修清这一处即可重新进行限定范围审计，不需要重开其他
设计主题。

## Blocking finding

### B1 — “人接受残余风险”可能被实现为允许未降级的重大危险范围原样继续

**证据锚点**

- PRD R3 把 `FAIL` 限定为已有证据支持的错误事实、权限/数据越界、不可恢复副作用或核心
  链路不可实现/验证，且 safe degradation 不足；`NEEDS_EVIDENCE` 则表示无法判断这类重大
  后果是否存在（[PRD](../prd.md#r3--qbd-重要性与-verdict-语义)）。
- 当前第一性锚把权限越界、数据损坏、虚假事实和不可恢复副作用列为不可牺牲边界
  （[第一性锚定](../research/first-principles-anchor.md#当前任务的暂时锚)）。
- Design 允许 QbD 后由人选择“接受”，并在错误表中把“人接受残余风险或停止”合并为
  “停止本轮；不自动 fresh audit”，但没有说明接受是否可以让未修改的 `FAIL` 范围进入
  Decompose/Execute（[Design](../design.md#router)、
  [Design](../design.md#错误与降级行为)）。
- PRD R4 同样列出“接受残余风险”，但没有区分 advisory/PASS residual risk、已安全降级的
  风险与仍满足 `FAIL`/重大 `NEEDS_EVIDENCE` 定义的风险
  （[PRD](../prd.md#r4--人类校准与有范围的复审)）。

**因果链**

```text
FAIL 已证明重大后果且 safe degradation 不足
  或 NEEDS_EVIDENCE 无法排除同类重大后果
→ Router 把“接受风险”解释为可继续的 human calibration
→ 未修复、未移除、未安全降级的危险范围仍可进入实现
→ 权限/数据/不可恢复边界从 fail-closed 退化为一句人的豁免
→ 违背当前已批准的第一性锚和 PRD 自己的 verdict 定义
```

这不是“模型不同意人的风险偏好”。人仍应决定修复、补证据、移除/关闭危险范围、缩小
范围、推迟或停止；但若人要改变此前声明的不可牺牲边界，那是一次显式的价值重构，应
返回 Brainstorm/Design 更新决定，而不能被含混地记为普通 accepted residual risk。

**受影响决定**

QbD 1 后是否允许进入 Decompose，以及 QbD 2 后是否允许进入 Execute。

**为什么现有 safe degradation 不足**

Design 已列出 omit、`unavailable`、拒绝写入等降级，但没有把“只有风险已经变成残余风险
后才可接受并继续”写进 transition。报告有因果链并不能防止 Main 在校准时采用另一种解释。

**最小 remediation**

在 PRD R4、Design Router/QbD transition 和错误表中统一补一条授权边界：

1. `PASS` 携带的 advisory/residual risk，或通过移除、禁用、缩范围、fail-soft 后不再满足
   blocking 定义的风险，可以由人接受并继续；
2. 未解决的 `FAIL` 只能由人选择修复、移除/安全降级该范围、推迟或停止，不能让原范围
   原样继续；
3. 重大 `NEEDS_EVIDENCE` 只能补证据、移除/安全降级不确定范围、推迟或停止；若人明确
   改变原先不可牺牲边界，先作为一次价值重构返回 Brainstorm/Design 记录；
4. 保持“不自动 fresh audit”：是否修复、何时重新审计仍由人决定，机械授权错误仍在
   dispatch 前直接 fail closed。

随后只需用 AC4/AC5 增加一个分叉断言：human acceptance 能收束非阻塞残余风险，但不能
把未变更的 permission/data `FAIL` 或重大证据缺口改名为可执行的 PASS。

## 非阻塞观察

1. **第一性锚没有成为新机器 Gate。** Design 明确不增加 phase、schema、固定文件或
   Markdown 解析，并允许机械低歧义任务跳过；这与 Bundle ownership 一致。
2. **Research 循环具有可证伪出口。** `confirm/revise/falsify` 连接到实际决定，且反假设
   明确允许在无决策价值时缩减或删除锚定动作，不是只允许证明方法论正确。
3. **三 Harness 同步路径可实现。** Shared Skills 由 `templates/common/skills/` 统一部署，
   OMP/Codex/Claude role Agent 保留各自 startup/identity/tool 边界；设计没有要求 runtime、
   Hook 或 descriptor 承载新语义。
4. **验证诚实区分了 Prompt 部署与模型行为。** focused parity/语义检查能防止源与部署
   漂移，真实场景仍交给独立 QbD/Review 和后续实践反馈；这不是阻塞发布的额外评测系统。

## 审计结论与限定下一步

风险等级：**高但局部**。它直接决定 permission/data blocker 是否仍然 fail closed，但修复
只涉及一处 transition 语义及对应场景断言，不要求新增 runtime 状态、风险枚举或审计循环。

**Exact next decision：** 请人确认 accepted risk 的授权边界采用上述四点；若确认，设计者
只修订 PRD/Design 的该歧义，再由新的独立 Auditor 对 B1 做 scoped re-audit。其余主题不应
重开。
