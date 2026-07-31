---
type: "Task"
title: "收敛 QbD 重要性与停止规则"
---

# 收敛 QbD 重要性与停止规则

Task directory: `07-31-qbd-materiality-stop-rules`.

本任务修正 omp-flow 的 QbD 方法论：独立审计必须聚焦会改变用户结果、权限边界、
数据正确性或核心链路可行性的实质风险，不得把内部合同细节、可安全降级的不确定性，
或纯粹的完备性追求自动升级为反复返工的阻塞项。

目标发布版本为 `0.2.3`。任务完成后，canonical workflow、Shared Skill、三个 Harness 的
QbD Agent 语义以及部署副本应保持一致；Hooks 和 runtime 只有在证据表明机械行为必须
变化时才进入范围。
