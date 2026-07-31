---
type: "Work Map"
title: "实践导向 Explore 与 QbD 实施视图"
---

# Work Map

本 Work Map 实现已获[QbD 1 Human PASS](../qbd/human-decision-design-pass.md)的
[PRD](../prd.md)与[Design](../design.md)。它按稳定语义所有权分为三个可独立审查的工作面，
不建立第二套依赖图。

## 正常推进顺序

1. [共同 Workflow 与 Shared Skills](methodology-contracts.md)先建立跨 Harness 的共同语义。
2. [Harness 角色合同](harness-agent-contracts.md)在不复制整套哲学的前提下落实角色动作。
3. [分发合同与 0.2.3 发布验证](distribution-and-release.md)最后保护源/部署一致性并完成版本、
   构建、测试与包内容验证。

前两项的文件所有权不重叠，可以由不同实现者并行；第三项读取两者的 handoff 后集成，
并独占 focused test 与包版本文件。每项都需要不同 actor 的独立 Review 后才算接受。

## 范围纪律

三个 Work 都不得修改 Python runtime、Hooks、Flow Status、TUI、operation descriptor 或
安装器映射。若实现证据表明这些机械边界必须变化，应返回 Design 并取得新的人的批准，
不得在 Work 内顺手扩张。

Prompt 的目标是纠正已观察到的默认失效，不是规定模型完整思考过程。实现者应优先删改
会诱导形式主义的旧语义；每条新约束都必须连接到 PRD 验收场景，否则不加入。
