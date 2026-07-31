---
type: "Work"
title: "共同 Workflow 与 Shared Skills"
---

# 共同 Workflow 与 Shared Skills

## 目标

在共同 Workflow、Router、Brainstorm、Research 与 QbD Shared Skills 中落实可修订的
第一性锚、Research ↔ Brainstorm 反证循环、human-first 价值校准、QbD materiality 与
scoped re-audit，同时减少会过度约束模型或诱导无界流程的旧提示。

## 输入

- [PRD](../prd.md)
- [Technical Design](../design.md)
- [QbD 1 Human PASS](../qbd/human-decision-design-pass.md)

## In scope / 文件边界

- `templates/.omp-flow/workflow.md` 与部署 `.omp-flow/workflow.md`；
- `templates/common/skills/omp-flow/SKILL.md`；
- `templates/common/skills/omp-flow-brainstorm/SKILL.md`；
- `templates/common/skills/omp-flow-research/SKILL.md`；
- `templates/common/skills/omp-flow-qbd/SKILL.md`；
- 上述四个 Skill 在 `.agents/skills/`、`.omp/skills/`、`.codex/skills/`、
  `.claude/skills/` 中对应的当前项目部署副本；
- 本 Work 的 handoff Concept。

## Out of scope

- Harness Agent 定义、`tests/omp-flow.test.ts`、package version；
- Python、Hooks、Flow Status、TUI、CLI 安装映射；
- 新 Skill、固定 `anchor.md`、风险枚举或机器 phase。

## 完成条件

- 非琐碎 Explore 默认形成可修订问题锚，机械低歧义工作可直接推进；没有固定字段/轮数；
- 价值与风险由人先表态，技术建议包含 strongest counter-case 与 falsifier；
- Research 能报告对锚/决定的 confirm、revise 或 falsify，并在实质变化时返回 Brainstorm；
- QbD blocker、`NEEDS_EVIDENCE`、safe degradation、human calibration 与 scoped re-audit
  符合 PRD R3/R4；active blocker 不能被普通 accepted risk 绕过；
- 人改变不可牺牲边界时返回 Brainstorm/Design，必要时 targeted Grill；
- 删除无条件 `FAIL/NEEDS_EVIDENCE -> fresh audit` 与“所有缺失证据都阻塞”的旧泛化语义；
- canonical 与四个部署 Skill roots 字节一致，Workflow canonical/deployed 一致；
- 新增 Prompt 能指向一个已观察失效或验收场景，没有把哲学全文复制进每个角色。

## 验证

- 对 canonical/deployed 目标做 byte/hash parity 检查；
- 定向搜索新旧合同词组，并人工对照 PRD AC1–AC5；
- 运行现有 `npm test` 观察是否破坏既有机械合同；focused test 新增由集成 Work 负责。

## 预期 handoff

写入 `handoff/methodology-contracts.md`，说明改动文件、被删除的过时约束、保留的硬边界、
定向检查与剩余集成验证。
