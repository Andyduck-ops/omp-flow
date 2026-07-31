---
type: "Work"
title: "分发合同与 0.2.3 发布验证"
---

# 分发合同与 0.2.3 发布验证

## 目标

在共同方法论与 Harness 角色修改完成后，用 focused tests 保护 canonical/deployed/安装
分发一致性和关键正反语义，更新 `0.2.3` 版本，并完成真实包验证。

## 输入

- [PRD](../prd.md)
- [Technical Design](../design.md)
- [共同 Workflow 与 Shared Skills](methodology-contracts.md)的最新 handoff；
- [Harness 角色合同](harness-agent-contracts.md)的最新 handoff。

## In scope / 文件边界

- `tests/omp-flow.test.ts`；
- `package.json`、`package-lock.json`；
- 仅在测试证明确有必要时，对前两个 Work 已修改的 Prompt/部署副本做限定集成修正，并在
  handoff 中逐项说明；
- 本 Work 的 handoff Concept。

## Out of scope

- 新测试框架、模型评测服务或 Prompt 快照系统；
- Python、Hooks、Flow Status、TUI、安装器映射和 runtime state；
- 为通过字符串断言而增加没有行为价值的 Prompt 文案。

## 完成条件

- focused tests 覆盖 Workflow、四个 Shared Skills、OMP Orchestrator、三套 Research/QbD
  Agents 的 canonical/current-deployed 与临时安装结果一致性；
- 正向合同覆盖 material decision、counter-case/falsifier、Research revise、decision
  consequence、safe degradation、human calibration、targeted Grill 与 scoped re-audit；
- 负向合同证明“任何缺失证据必为 `NEEDS_EVIDENCE`”、无条件 fresh audit、active blocker
  可由普通 accepted risk 绕过等旧语义不存在；
- 测试不要求模型使用固定思考步骤，不把完整 Prompt 文案做脆弱快照；
- `package.json` 与 `package-lock.json` 均为 `0.2.3`；包清单包含更新后的 templates；
- 工程指南中的 compile、build、test、pack 和 diff 检查全部通过。

## 验证

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

另外检查 `npm pack --dry-run` 清单与版本字段，并用 PRD AC1–AC6 做一次跨 Work 集成核对。

## 预期 handoff

写入 `handoff/distribution-and-release.md`，记录 focused tests、完整命令结果、包清单与版本、
任何限定集成修正，以及仍需实现后独立 Review 验证的模型行为边界。
