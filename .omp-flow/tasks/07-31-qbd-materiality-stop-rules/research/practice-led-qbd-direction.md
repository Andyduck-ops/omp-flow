---
type: "Selected Synthesis"
title: "实践导向的 QbD 修正方向"
---

# 实践导向的 QbD 修正方向

## 选定方向

保留 QbD 1、QbD 2、独立 Auditor 和 linked human decision，但把审计从“追求对象完备”
改成“帮助人判断当前设计是否可以负责任地进入下一次实践”。本方向来自
[现有缺陷调查](current-methodology-defects.md)和项目 Wiki 的
[实践导向的推理](../../../wiki/philosophy/practice-led-reasoning.md)。

## 前置第一性锚定

非琐碎任务在展开广泛 Research 前，先由人和 Agent 共同形成一个可修订的
[第一性锚定](first-principles-anchor.md)：说明可观察现象、当前主要矛盾、不可约减结果、
不可牺牲边界、最强反假设和什么证据会推翻当前判断。价值与风险由人先表态、Agent
随后挑战；证据倾向明显的技术问题才由 Agent 先给建议，并同时给 strongest counter-case。

它是 Explore 的前置方向，不是独立 lifecycle phase 或强制文档 Gate。Research 可以
推翻它并回到 Brainstorm 修订；若它不能改善问题选择、关键假设暴露或停止判断，就应
依据实践缩减，而不是为了完成流程保留。

## 五个必要修正

1. **先锚定问题和决定，再审计。** 审计入口应说明本轮要改变的决定、不可接受的用户/权限/
   数据/核心链路后果、已知约束与已接受风险。信息可从用户方向、PRD 和现有 human
   decision 中取得；只有风险偏好确实未知时才询问人，不能机械增加表格。
2. **blocker 必须有因果链。** 只有会造成错误事实、越权、数据损坏、不可恢复副作用、
   核心链路无法实现/验证，且没有足够安全降级时才阻塞。`NEEDS_EVIDENCE` 只表示缺失
   证据阻止了对这类后果的判断，不再表示“仍有未知项”。PASS 可以携带 non-blocking
   risk、implementation verification 和 deferred recommendation。
3. **模型建议，人作治理决定。** 每次 verdict 后，人都可以选择修复、补证据、缩小范围、
   安全降级、接受残余风险、推迟或停止。`FAIL`/`NEEDS_EVIDENCE` 不自动授权 Main 开启
   新一轮；Agent 必须说明下一轮可能改变什么决定。
4. **独立不等于失忆。** fresh Auditor 继承本轮 scope、已关闭 finding、human-accepted
   risk 和唯一待验证变化。它可报告新观察，但超出范围的新问题只有在能建立重大后果
   因果链时才建议人重开，不得通过换 Agent 无限扩题。
5. **让证据回到对应实践阶段。** QbD 1 阻止不可实现架构和错误边界，QbD 2 阻止无法
   落地/验证的 Work map；只有实现后才能产生的性能、平台探针和运行证据进入 Implement/
   Review/Finish。能通过 omit、unavailable、expiry 或 fail-soft 保持诚实的观察，不因
   缺少完整体验而自动阻塞。

## 下沉位置

- `templates/.omp-flow/workflow.md`：加入实践导向的共同原则、人类治理和 QbD 语义。
- `templates/common/skills/omp-flow/SKILL.md`：Router 先判断具体任务、后果和所需深度，
  保留机械 fail-closed 边界。
- `templates/common/skills/omp-flow-qbd/SKILL.md`：修改 finding 分类、human decision、
  scoped re-audit 和停止规则。
- OMP/Codex/Claude QbD Agent canonical definitions：使用同一操作化语言，要求因果链、
  decision impact、safe degradation 和 scope continuity。
- 其他角色只补与自身有关的短原则，避免把整页哲学复制进每个 Prompt。
- 同步所有部署副本，并在 focused tests 中保护 canonical/deployed parity 和关键提示合同。

Hooks、Flow Status、Python runtime 不解释 materiality、accepted risk 或人的价值判断，
也不增加 audit counter、自动 waiver 或新生命周期状态。

## Prompt 写作约束

参考 [mattpocock/skills](../reference/matt-pocock-skills.md) 的 Skill 剪枝实践，本次设计还应
要求：

- 每条新增提示都通过 no-op test：它必须改变一个已观察到的默认行为，否则删除。
- 共同哲学只在 Workflow/Router 保持一份；角色 Skill 只内联该角色每次都需要的动作，
  其余通过明确 context pointer 渐进加载。
- 优先写目标行为，例如“说明可能改变的决定”，而不是连续重复禁令；权限和数据等真正
  hard guardrail 保留清楚的禁止语句并同时说明正确替代动作。
- 将 decision-critical findings 与 advisory/craft observations 分轴；tooling 已经机械
  保证的事项不再由 Auditor 重复表演。
- 对体验或状态模型的不确定性，如果低成本 throwaway prototype 能更快得到事实，允许
  回到 Explore/实践验证，而不是继续扩写设计证明。

Brainstorm 可增加经用户明确选择的 Grill 模式，采用
[material decision frontier](grill-skill-fit.md)。仓库/Wiki 实践、人的目标与风险取舍、
模型的假设与反方挑战共同校准；价值问题由人先表态，证据倾向明显的技术问题才由 Agent
先建议并同时给 strongest counter-case。QbD 不得自动遍历整棵决策树或用 verdict 预先
替人决定风险偏好。

## 明确不选

- 不取消独立审计或把 Auditor 变成迎合式 PASS 生成器。
- 不规定固定审计次数；旧三次 cap 只能止损，不能替人判断风险。
- 不把 Gate 合并成一个，也不按任务大小自动跳过人的参与。
- 不要求所有 finding 都证明绝对安全；承认不确定性，并根据实际后果决定处理方式。
- 不用“实事求是”等口号替代操作规则，避免反形式主义变成新的形式主义。
- 不把 relentless grilling 或“覆盖所有分支”设为默认；深度访谈只在用户主动选择或
  未解决决定确实会改变结果时使用。

## 设计必须保持的验证边界

后续设计应能通过代表性场景说明：

- 缺少可选状态栏字段时，Agent 推荐隐藏或 unavailable，而不是阻塞整个交付；
- 权限越界、数据损坏或虚假权威显示仍然阻塞；
- Auditor 发现非关键内部合同未知项时记录风险，并说明其是否可能改变人的决定；
- 人接受风险或要求收束后，同一问题不会被 fresh audit 换名重开；
- material design change 或新的外部证据仍可由人重开审计。

这些是提示与方法论的可观察合同，不应变成 Python 对 Markdown verdict 的解析规则。
