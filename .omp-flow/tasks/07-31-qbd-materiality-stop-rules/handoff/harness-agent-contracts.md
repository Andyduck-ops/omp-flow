---
type: "Implementation Handoff"
title: "Harness 角色合同实现"
status: "DONE"
---

# Harness 角色合同实现

## 关联与身份

- Implements：[Harness 角色合同](../work/harness-agent-contracts.md)
- Design：[Technical Design](../design.md)
- Predecessor：[QbD 2 Work Map Audit](../qbd/work-map-audit.md)
- Actor ID：`implement-harness-contracts-v1`
- Dispatch receipt：`8ac8561f61894726beaaa17edb68ada6`
- Predecessor receipt：`ce3ae7b4d2cf4e4ebb2e4e20c9a6122e`
- Result：`DONE`

## 实现摘要

三套 Harness 的 Research 与 QbD 角色现在执行等价的最小动作；OMP Orchestrator 同时承担
初始可修订锚和 QbD 交人校准的短控制规则。方法论名词只保留为少量方向锚：
`实践论 / 实事求是`、`第一性锚定`、`主要矛盾`，没有复制整套哲学或规定模型的微观
思考步骤。

Research 角色现在会读取当前问题/决定及已有第一性锚，主动寻找最强反证，并明确证据是
确认、修订还是推翻锚或决定；若证据改变问题，它只建议返回 Brainstorm，不替人重写
价值与风险排序。

QbD 角色现在把 decision-critical finding 与 advisory observation 分开。只有证据缺口
阻止判断重大后果时才使用 `NEEDS_EVIDENCE`；每个 blocker 必须给出
cause → consequence → decision、最小修复和 safe-degradation 分析。它返回 exact next
decision/options 交人校准，不自行命令 fresh audit，也不把 active blocker 改名为可直接
继续的 accepted risk。

## 三 Harness 语义对照

| Harness | Research | QbD | 保留的固有边界 |
|---|---|---|---|
| OMP | 第一性锚/主要矛盾、最强反证、confirm/revise/falsify、decision impact | materiality、重大后果因果链、safe degradation、human options | 原 role/model/tools；Research/QbD 不 spawn；Orchestrator 原 native task 与 strict descriptor 转发合同 |
| Codex | 与 OMP 等价的调查与 handoff 动作 | 与 OMP 等价的分类、blocker 和 human-calibration 动作 | `sandbox_mode = "workspace-write"`、`multi_agent = false` 和 `multi_agent_v2.enabled = false` 原样保留 |
| Claude | 与 OMP 等价的调查与 handoff 动作 | 与 OMP 等价的分类、blocker 和 human-calibration 动作 | strict-v1 首行、identity marker、binding request、binding `TaskUpdate`、immutable progress 文本和无 Agent/Task 边界原样保留 |

OMP Orchestrator 对非琐碎 Explore 要求先形成可修订第一性锚，让 Research 以实践证据确认、
修订或推翻；每次 QbD verdict 在后续 dispatch 前先交人校准，targeted Grill 只在可能改变
不可牺牲边界且后果值得时使用。

## 修改文件

- OMP canonical/deployed：`templates/omp/agents/{orchestrator,researcher,qbd-auditor}.md`、
  `.omp/agents/` 对应副本；
- Codex canonical/deployed：`templates/codex/agents/{omp-flow-research,omp-flow-qbd}.toml`、
  `.codex/agents/` 对应副本；
- Claude canonical/deployed：`templates/claude/agents/{omp-flow-research,omp-flow-qbd}.md`、
  `.claude/agents/` 对应副本；
- 本 handoff Concept。

未修改 Workflow、Shared Skills、`tests/omp-flow.test.ts`、package version、Python、Hooks、
Flow Status、TUI 或 runtime/session records。

## 验证

1. **Canonical/deployed parity：PASS。** 七对文件逐对计算 SHA-256，全部字节一致。
2. **Research 定向合同：PASS。** 三套 canonical 均包含第一性锚/主要矛盾、最强反证、
   confirm/revise/falsify、decision impact 与不替人排序价值/风险的动作。
3. **QbD 定向合同：PASS。** 三套 canonical 均包含 decision-critical/advisory 区分、
   consequence chain、safe degradation、exact next decision/options 与禁止自行 fresh audit；
   旧的泛化语句 `Missing or contradictory required evidence ... NEEDS_EVIDENCE, never PASS`
   已不存在。
4. **Harness 边界静态检查：PASS。** OMP model/tools、Codex `multi_agent = false`、Claude
   strict descriptor、identity、binding request 与 `TaskUpdate` 文本均存在且未被本 diff 修改。
5. **Scoped `git diff --check`：PASS。** 无空白错误；Git 仅提示 Windows checkout 的
   LF/CRLF 转换策略。
6. **`npm test`：PASS。** `276 focused checks` 通过；Node TAP `3/3` 通过；archive 链接、
   Claude Flow Status hook 与既有 native operation/descriptor 覆盖全部通过。

## 集成 Work 后续合同

- 在 `tests/omp-flow.test.ts` 增加七对 source/deployed 及临时安装 parity；
- 以少量正向/负向语义断言保护 Research/QbD/Orchestrator 合同，不固定整段 Prompt；
- 保留 strict descriptor、Claude identity/TaskUpdate 和 Codex multi-agent 回归；
- 由发布 Work 独占更新 `0.2.3` 与 package/pack 验证。本 Work 运行测试时显示的
  `omp-flow@0.2.2` 属于已批准的后续集成范围，不是本 Work 漏改。

## Caveats

没有已知实现 blocker。Prompt 静态合同不能证明模型在所有真实任务中判断正确；实际行为
仍应由独立 Review、集成场景检查与后续实践反馈验证。
