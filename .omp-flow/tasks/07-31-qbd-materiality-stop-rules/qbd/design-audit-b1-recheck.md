---
type: "QbD 1 Scoped Re-audit"
title: "B1 风险授权边界限定复审"
---

# B1 风险授权边界限定复审

## 审计对象与范围

- Entry：[Technical Design](../design.md)
- 要求：[PRD](../prd.md)
- 人类校准：[QbD 1 人类决定](human-decision-1.md)
- 原 finding：[QbD 1 设计审计 B1](design-audit.md#b1--人接受残余风险可能被实现为允许未降级的重大危险范围原样继续)
- Actor：`qbd1-qbd-materiality-recheck-v1`
- Dispatch receipt：`75dc35152ec64c9187d1976fa8d5c112`
- Predecessor receipt：`6d841f3b073e4aaaa5bce8a0ee623916`

本次只复审 B1：风险接受的授权边界，以及不可牺牲边界变化时 targeted Grill 的路由。
不重开第一性锚、Research 循环、Prompt 分层、Harness 同步或原审计中的非阻塞观察。

## Verdict

**PASS — B1 已按人类决定完成限定修订，没有未解决的 blocking finding。**

## 证据

### 1. 可接受风险与仍属 blocker 的风险已经明确分流

- PRD R4 明确只有 advisory observation、`PASS` 携带的 residual risk，或经移除、禁用、
  缩范围、fail-soft 后已不再满足 blocking 定义的风险，才能由人接受并继续
  （[PRD R4](../prd.md#r4--人类校准与有范围的复审)）。
- Design Router 采用同一分流，并明确 `FAIL`/`NEEDS_EVIDENCE` verdict 本身不产生新的
  operation 授权（[Design Router](../design.md#router)）。
- Design 的错误与降级表为“可继续的 residual/advisory”“未解决 FAIL”“重大
  NEEDS_EVIDENCE”分别给出不同路由，消除了原 B1 中“接受”可能同时表示继续或停止的
  歧义（[错误与降级行为](../design.md#错误与降级行为)）。

这与人类决定中对 advisory、PASS residual risk 和已安全降级风险的授权范围一致。

### 2. 未解决的危险范围不能原样进入 Decompose/Execute

- PRD R4 与 AC4 均要求：未解决的 `FAIL` 只能修复、移除/安全降级、推迟或停止；重大
  `NEEDS_EVIDENCE` 只能补证据、移除/安全降级、推迟或停止。单独记录 accepted risk
  不能让原危险或不确定范围进入 Decompose/Execute
  （[PRD R4](../prd.md#r4--人类校准与有范围的复审)、[PRD AC4](../prd.md#ac4--权限数据与虚假事实继续-fail-closed)）。
- Design Router、QbD coordinator 和错误表重复了同一授权边界；人的治理决定不再能把
  仍满足 blocking 定义的风险制造为 `PASS`。只有修复、取证、移除或安全降级改变风险
  状态后，才能重新判断后续授权
  （[Design Router](../design.md#router)、[QbD coordinator](../design.md#qbd-coordinator)、
  [错误与降级行为](../design.md#错误与降级行为)）。

因此原 B1 的因果链已被截断：人的校准保留下一步选择权，但不构成对未变化重大危险范围
的语义豁免。

### 3. 改变不可牺牲边界会回到设计，并只在必要时 human-first Grill

- PRD R4 与 AC5 把不可牺牲边界变化定义为价值和问题定义的实质变化，要求返回
  Brainstorm/Design；不得把旧 blocker 直接改写为 accepted residual risk
  （[PRD R4](../prd.md#r4--人类校准与有范围的复审)、[PRD AC5](../prd.md#ac5--人收束后不自动复审)）。
- Design Router 规定，只有该变化可能改变问题内核、权限/数据安全或不可恢复后果时，
  才进行 targeted Grill；顺序为人先陈述目的、价值和风险理由，Agent 再提供 strongest
  counter-case、具体后果和更轻降级方案，最终由人确认、修改或放弃
  （[Design Router](../design.md#router)）。
- Design 同时明确该 Grill 不自动触发复审，也不能把旧 blocker 改名为可执行的 residual
  risk；QbD transition 已改为由 human decision 指定下一步，而不是 verdict 自动产生
  fresh audit（[QbD coordinator](../design.md#qbd-coordinator)）。

这准确实现了人类决定中的“必要时可以 Grill”：Grill 用来检验一次实质边界重构，不是
每个 finding 的固定仪式、自动复审入口或风险豁免机制。

## 结论

B1 已关闭。PRD 与 Design 对风险状态、允许的治理动作、Decompose/Execute 授权以及
human-first targeted Grill 的关系一致，且保留机械 fail-closed 边界。本限定复审不发现
需要再次修订或补证据的事项；其余已判定非阻塞主题不在本次结论范围内。
