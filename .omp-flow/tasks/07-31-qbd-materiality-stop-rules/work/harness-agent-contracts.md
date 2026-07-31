---
type: "Work"
title: "Harness 角色合同"
---

# Harness 角色合同

## 目标

让 OMP、Codex 与 Claude 的 Research/QbD 角色，以及 OMP Orchestrator，执行与 Shared
Skills 等价的最小角色动作，同时保留各 Harness 已有的身份、工具、descriptor 和授权边界。

## 输入

- [PRD](../prd.md)
- [Technical Design](../design.md)
- [QbD 1 Human PASS](../qbd/human-decision-design-pass.md)

## In scope / 文件边界

- `templates/omp/agents/orchestrator.md`、`researcher.md`、`qbd-auditor.md` 及 `.omp/agents/`
  对应部署副本；
- `templates/codex/agents/omp-flow-research.toml`、`omp-flow-qbd.toml` 及 `.codex/agents/`
  对应部署副本；
- `templates/claude/agents/omp-flow-research.md`、`omp-flow-qbd.md` 及 `.claude/agents/`
  对应部署副本；
- 本 Work 的 handoff Concept。

## Out of scope

- Workflow/Shared Skills、`tests/omp-flow.test.ts`、package version；
- Harness spawn/concurrency/UI、Python、Hooks、Flow Status；
- 新 Agent、模型别名或自定义 dispatcher。

## 完成条件

- 三套 Research Agent 都读取当前锚/问题、主动寻找最强反证，并报告证据会确认、修订或
  推翻什么决定；不替人决定价值排序；
- 三套 QbD Agent 都区分 decision-critical 与 advisory，只有重大后果无法判断时才使用
  `NEEDS_EVIDENCE`，blocking finding 提供因果链与 safe-degradation 分析；
- Agent 返回 exact next decision/options，不自行命令 fresh audit，也不把 active blocker
  描述为可直接接受继续的 residual risk；
- OMP Orchestrator 只加入初始可修订锚与 verdict 交人校准的短控制规则；
- OMP role/tools、Codex `multi_agent = false`、Claude strict-v1 descriptor、identity marker
  与 binding `TaskUpdate` 文本保持有效；
- 每个 canonical Agent 与当前部署副本字节一致；没有把整套上位哲学复制进角色 Prompt。

## 验证

- canonical/deployed byte/hash parity；
- 定向检查新角色动作和旧泛化语义消失；
- 对 strict descriptor、Claude identity/TaskUpdate 和 Codex/OMP 固有边界做静态回归检查；
- 运行现有 `npm test`；focused parity/contract test 新增由集成 Work 负责。

## 预期 handoff

写入 `handoff/harness-agent-contracts.md`，列出三 Harness 的语义对照、保留的固有边界、
验证结果和需要集成 Work 覆盖的合同。
