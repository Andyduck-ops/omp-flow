---
type: "Brainstorm"
title: "Brainstorm: 收敛 QbD 重要性与停止规则"
---

# Brainstorm: 收敛 QbD 重要性与停止规则

## 初始观察

当前 QbD Agent 容易陷入“形式上的科学性”：持续审查 publisher lease、旧 revision、
双视图 ownership 等内部合同细节，即使这些问题不会改变已确定的核心体验，或者可以
通过隐藏字段、显示 unavailable、fail-soft 等方式安全降级。结果是审计不断制造新的
设计返工循环，而不是识别真正影响决策的风险。

用户要求把目标发布版本设为 `0.2.3`，并将该方法论修正作为独立任务处理。

## 已确认的仓库事实

- `templates/common/skills/omp-flow-qbd/SKILL.md` 与 `.agents`、`.codex`、`.claude`、
  `.omp` 的部署副本哈希一致；当前策略已经同步，但同步的是同一缺陷。
- canonical QbD Skill 要求 `PASS`、`FAIL` 或 `NEEDS_EVIDENCE`，且任何 `FAIL` 或
  `NEEDS_EVIDENCE` 都返回修复并启动新的独立审计。
- 三个 Harness 的 QbD Agent 都声明“缺失或矛盾证据必须是 `NEEDS_EVIDENCE`，不能
  PASS”，但没有定义证据的重要性阈值、可接受风险、降级策略、复审预算或停止规则。
- Claude Hooks 负责身份、TaskUpdate 授权和状态观察；观察 Hook 明确不阻塞 Claude。
  没有 Hook 解释审计 verdict 或自动派发下一轮 QbD。
- Flow Status 记录 QbD attempt 是历史观测，不是要求继续审计的生命周期状态。
- [Verifiable claim](../../wiki/specs/verifiable-claim.md) 已要求验证与后果成比例；
  [Evidence-led exploration](../../wiki/philosophy/evidence-led-exploration.md) 已要求只在能
  改善真实决策时增加结构和严谨度。

## 问题假设

根因不是存在 QbD 1/QbD 2，也不是独立审计本身，而是审计提示的目标函数缺少
materiality 和 decision consequence。Agent 因而把“还能找到未知细节”误当成“仍有
阻塞项”，并通过 `NEEDS_EVIDENCE -> repair -> fresh audit` 形成无界循环。

更具体地说，当前机制同时放大了六种偏差：

1. **证据负担不对称。** Agent 被要求“证据不足必须 `NEEDS_EVIDENCE`，不能 PASS”。
   任何复杂设计都永远存在未知项，因此证明“足够继续”近乎无限，而提出一个新疑点
   几乎没有成本。
2. **审计范围以完备性而非关键质量为中心。** QbD 1 被要求同时挑战问题、需求、来源、
   架构、边界、替代方案和接口；QbD 2 又覆盖全部相关 Work。没有由人先确定哪些用户
   后果、权限边界或数据风险是本次真正的 critical-to-quality，Agent 就会把“还能审”
   当成“应该审”。
3. **输出结构诱导 blocker。** 当前报告强调 blocking findings 和 required remediation，
   却没有同等清楚地承认 accepted risk、可逆决策、安全降级和非阻塞建议。为了完成
   角色，Agent 会把建议升级成 blocker。
4. **人类参与是末端签字，不是风险治理。** 文本说人类负责 calibration，但没有明确
   人类在审计前设定风险口径，也没有明确人类可以接受残余风险、缩小问题或判断继续
   取证已无决策价值。于是 Agent verdict 实际掌握了返工权，人只在循环后确认。
5. **重新审计缺少 scope continuity。** fresh independent audit 强调独立，却没有要求
   继承已接受风险、已关闭问题和本轮唯一待验证的变化。新的 Agent 为体现独立性和
   价值，容易重新搜索新问题，形成 scope drift。
6. **设计 QbD 与实现验证混淆。** lease、旧 revision、双视图 ownership 等细节可能是
   重要实现不变量，但在实现证据出现前反复要求设计层证明全部细节，只会制造
   `NEEDS_EVIDENCE`。能通过隐藏、过期、拒绝写入或测试控制的风险，应在相应实现/Review
   边界验证，而不是自动扩大设计 Gate。

## 当前推荐方向

1. 只有有证据表明会造成用户可见的错误事实、权限或数据越界、不可恢复的数据损坏，
   或核心链路无法工作/验证，finding 才能阻塞。
2. `PASS` 可以携带非阻塞风险和建议；缺失证据只有在缺失本身妨碍核心正确性或安全性
   判断时才使用 `NEEDS_EVIDENCE`。
3. 可安全降级的不确定性优先隐藏字段、显示 unavailable、fail-soft 或记录后续债务，
   不得阻塞主链路。
4. 不硬编码审计轮数、Gate 合并或自动豁免。是否继续取证或复审由人结合风险、成本和
   决策价值判断；Agent 必须说明“下一轮可能改变什么决定”，不能仅因仍存在未知项而
   自主延长流程。
5. 每个 blocking finding 必须说明用户/权限/数据/核心链路影响、证据、最小修复和为何
   安全降级不足。无法建立这条因果链时只能是非阻塞建议。
6. 人类接受风险或明确要求收束后，本次 Gate 终止。除非出现新的外部证据或用户主动
   重开，不得把同一内部不确定性包装成新审计继续循环。
7. fresh audit 必须继承已接受风险、已关闭 finding 和明确的本轮审计问题。超出范围的
   新观察可以记录为建议，但只有人判断它是否值得重开当前决策。

## 范围与非目标

预计需要同步修改 authoritative workflow、Router、QbD Shared Skill，以及 OMP、Codex、
Claude 的 QbD Agent 定义和相应部署副本。需要增加覆盖 materiality、fail-soft、定向复审
和人类停止权的文本/机械回归检查。

本任务不取消独立审计，不削弱权限、数据完整性或错误展示保护，也不把 QbD verdict
编码成 runtime 生命周期状态。除非进一步证据显示必要，否则不修改 Hooks、Flow Status
attempt 结构或 Python runtime。

## 成功标准

- 三个 Harness 对 blocker、非阻塞风险、`NEEDS_EVIDENCE` 和安全降级使用一致语义。
- QbD Agent 不能仅凭“内部合同仍可更完整”要求返工。
- 人类在审计前定义风险口径，在审计后决定接受、取证、返工或收束，而不是只签署
  Agent 已经决定的流程结果。
- 真正可能错误展示、越权或损坏数据的问题仍保持 fail-closed。
- 发布包中的 canonical 与部署资源同步，目标版本为 `0.2.3`。

## 已确认的人类治理原则

不由方法论硬规定低风险任务必须审几轮、是否合并 Gate 或何时自动豁免。人始终参与：
先定义这次什么后果不可接受，再依据审计证据决定继续、降级、接受风险、返工或停止。
方法论提供判断结构和可追溯记录，不替人制定统一风险偏好。

## 上位方法论

这个缺陷不只是 QbD 的停止规则缺失，也暴露了 omp-flow 现有哲学碎片尚未形成共同的
判断原则：Agent 容易从提示词、Gate 和清单出发证明自己“按流程做了”，而不是从具体
事实、主要风险和实践后果出发判断流程是否仍有价值。

已将 [实践导向的推理](../../wiki/philosophy/practice-led-reasoning.md) 写入项目 Wiki，作为
本任务后续设计的上位方法论。它借用实事求是、实践论、反对本本主义与形式主义的精神，
但在产品中落为可执行原则：事实优先于规则、具体问题具体分析、认识返回实践验证、严谨度
与后果成比例、人决定价值与风险、继续工作必须能说明可能改变的具体决定。

后续设计应把这些原则分别翻译进 authoritative Workflow、共享 Skill 和 Harness Agent
提示词，尤其是 Router 与 QbD；不应只复制哲学口号，也不应把重要性、主要矛盾或人类
风险偏好编码进 Hooks、状态栏或 Python runtime。

## Grill、模型偏置与 Wiki 的校正

用户指出，原始 Grill 的 recommendation-first 会用模型默认倾向锚定人的回答；过去设置
Research、独立 QbD 和 human decision，正是为了避免单一模型把默认值直接变成设计。
另一方面，当前 Brainstorm 几乎不 Grill：Agent 只在自己已经识别到 ambiguity 时提问，
很容易静默采用默认假设，造成交流不足和虚假收敛。

因此问题不是选择“多问”或“少问”，而是让偏置显形。推荐采用三角校准：相关仓库/Wiki
实践作为可质疑的历史证据，人提供目标、价值和风险取舍，模型负责提出假设、证据和反方
挑战。事实由 Agent 先查；价值/偏好问题由人先说以减少锚定；证据明显的技术选择可由
Agent 先建议，但必须给 strongest counter-case；难逆决定经过人初始立场、模型挑战、
人最终校准两遍。

普通 Brainstorm 也应先公开简短的 material decision frontier 和默认假设，并在退出前
取得一次明确的 shared-understanding checkpoint。用户主动选择 Grill 时才深入遍历仍会
改变结果的 material frontier，不追求所有可想象分支。详细证据见
[Grill Skill 适配分析](research/grill-skill-fit.md)。

## 第一性锚定与主要矛盾

用户进一步确认，高强度 Grill 不应只在已经画好的方案树里选择，而应先共同讨论主题的
主要矛盾或第一性原理。这个前置锚决定后续 Research ↔ Brainstorm 循环在寻找什么，也
给停止判断提供了真实参照。

当前任务的暂时锚是：**既要有足够强的独立挑战和人机互动来暴露模型偏置，又要让方法论
服从实践证据、真实交付和人的治理，不能让“严谨”取得无限返工权。** 价值、风险和不可
牺牲结果由人先表态，模型随后挑战；技术问题才允许模型先给建议，并同时给最强反方和
推翻建议所需的事实。

这个锚是可修订假设，不是新的本本。Research 若发现当前主要矛盾判断错误，就回到
Brainstorm 重写它；若新增工作既不会修订这个锚，也不会改变一个具体决定，就不应仅以
“更完整”为理由继续。详细设计见[第一性锚定](research/first-principles-anchor.md)。
