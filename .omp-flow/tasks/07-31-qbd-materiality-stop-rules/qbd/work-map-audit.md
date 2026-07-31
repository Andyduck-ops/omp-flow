---
type: "QbD 2 Audit"
title: "实践导向 Explore 与 QbD Work Map 审计"
---

# QbD 2 Work Map 审计

## 审计对象与独立性

- Entry：[Work Map](../work/index.md)
- 已批准要求：[PRD](../prd.md)
- 已批准设计：[Technical Design](../design.md)
- QbD 1 结论：[B1 限定复审](design-audit-b1-recheck.md)
- 人类授权：[QbD 1 Human PASS](human-decision-design-pass.md)
- Actor：`qbd2-qbd-materiality-v1`
- Dispatch receipt：`ce3ae7b4d2cf4e4ebb2e4e20c9a6122e`
- Predecessor receipt：`75dc35152ec64c9187d1976fa8d5c112`

本审计只评估 Work Map 和三个 linked Work，不修改 Work、PRD、Design 或
产品文件。

## Verdict

**PASS — Work Map 能以最小、可实施、可独立审查的边界覆盖已批准设计，
没有未解决的 blocking finding。**

## 证据与判断

### 1. 三个 Work 按稳定的语义所有权分开

- [共同 Workflow 与 Shared Skills](../work/methodology-contracts.md) 独占 Workflow、Router、
  Brainstorm、Research 与 QbD Shared Skills 及其部署副本，不修改 Harness
  Agents、focused tests 或 package version。
- [Harness 角色合同](../work/harness-agent-contracts.md) 独占 OMP/Codex/Claude 的
  Research/QbD Agents 与 OMP Orchestrator，明确不修改 Shared Skills、tests 或版本。
- [分发合同与 0.2.3 发布验证](../work/distribution-and-release.md) 独占
  `tests/omp-flow.test.ts`、`package.json` 和 `package-lock.json`，并且只在前两项
  handoff 完成后集成。

前两项的写入边界不重叠，可并行实施；第三项明确依赖两个 handoff。
第三项只允许在测试证明必要时对已改 Prompt 做限定集成修正，且要在
handoff 逐项记录；这是有序集成边界，不是并行所有权冲突。

### 2. 正反 Prompt 合同与人类治理路由有明确归属

- 共同方法论 Work 覆盖可修订第一性锚、human-first 价值/风险校准、
  recommendation 的 strongest counter-case/falsifier、Research 的
  `confirm/revise/falsify`、QbD materiality、safe degradation、human calibration 和
  scoped re-audit（[完成条件](../work/methodology-contracts.md#完成条件)）。
- Harness Work 把同等语义限定为各角色每次必须执行的局部动作，包括
  Research 的反证、QbD 的重大后果因果链与不自行发起 fresh audit；它同时
  保留 OMP tools、Codex `multi_agent = false` 和 Claude descriptor/identity/TaskUpdate
  等 Harness 硬边界（[完成条件](../work/harness-agent-contracts.md#完成条件)）。
- 分发 Work 独立负责正向合同和负向合同：正向包含 material decision、
  counter-case/falsifier、Research revise、decision consequence、safe degradation、
  human calibration、targeted Grill 和 scoped re-audit；负向排除“任何缺失
  证据必为 `NEEDS_EVIDENCE`”、无条件 fresh audit 和 active blocker 被普通
  accepted risk 绕过（[完成条件](../work/distribution-and-release.md#完成条件)）。

因此 PRD AC1–AC5 的正向行为与关键反向回归都有实现和验证所有者，
不依赖实施者在三个 Work 之间自行补全语义。

### 3. active blocker 与 targeted Grill 边界可落实

共同方法论 Work 明确要求：active blocker 不能被普通 accepted risk 绕过；
人改变不可牺牲边界时先返回 Brainstorm/Design，只在必要时进行 targeted
Grill。Harness Work 进一步要求 Auditor 返回 exact decision/options，不把 active
blocker 描述为可直接接受并继续的 residual risk。分发 Work 则同时验证
targeted Grill 的正向合同与 blocker-bypass 的负向合同。这三层归属完整
实现了 [QbD 1 Human PASS](human-decision-design-pass.md) 中“必要时 Grill，但不成为
固定仪式”的校准。

### 4. Work 对易过时的微观思考处方有显式克制

- Work Map 要求 Prompt 只纠正已观察到的默认失效，每条新约束都必须连接
  PRD 验收场景（[范围纪律](../work/index.md#范围纪律)）。
- 共同方法论 Work 要求删减会诱导形式主义的旧语义，不规定固定字段、
  轮数或整套模型思考过程；Harness Work 只要求稳定的角色义务；分发
  Work 又明确禁止测试固定思考步骤或把整段 Prompt 变成脆弱快照。

这些约束与人类批准的 no-op test 一致：保留稳定目标、责任边界、反方
义务、可验证后果和少量真正安全边界，不把当前模型/Harness 特性固化为
新的流程微观管理。

### 5. 版本、包内容与完整验证不会在实现缝隙中丢失

分发 Work 明确要求 `package.json` 和 `package-lock.json` 一致更新为
`0.2.3`，检查 `npm pack --dry-run` 清单包含更新的 templates，并运行 compile、
build、test、pack 与 `git diff --check` 全套命令。它还要对 Workflow、四个
Shared Skills、OMP Orchestrator 和三套 Research/QbD Agents 检查 canonical、当前
部署与临时安装结果。这完整覆盖 PRD AC6，且版本/包验证由一个最后
集成 Work 独占，不会分散到并行实施者。

## 非阻塞观察

1. **限定集成修正的复审归属。** 分发 Work 已要求在 handoff 逐项说明对前两个
   Work 文件的任何修正；实施时应把这些修正纳入分发 Work 自身的独立
   Review 范围，不能只依赖被修正 Work 早先的 Review。这是正常集成责任，
   现有边界已足以落实，不需要返工 Work Map。
2. **静态 Prompt 测试的能力边界。** Work 正确把 focused tests 限定为部署和
   合同保护，并将模型的实际判断留给实现后独立 Review 和后续实践反馈；
   实施者不应为了让字符串断言通过而添加重复或无行为价值的文案。

## 结论与下一步

风险等级：**低**。当前 Work Map 没有核心要求遗漏、并行写入冲突、无法验证
的语义合同或发布漂移缺口。

**Exact next decision：** 请人确认 QbD 2 Human PASS；确认后可按 Work Map 开始实现与
独立 Review。第三个集成 Work 必须等待前两个 handoff，并对它产生的任何限定
集成修正一并负责。
