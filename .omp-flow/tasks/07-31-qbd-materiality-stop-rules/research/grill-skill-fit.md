---
type: "Research"
title: "Grill Skill 对 omp-flow 的适配分析"
---

# Grill Skill 对 omp-flow 的适配分析

## 问题

[mattpocock/skills Reference](../reference/matt-pocock-skills.md) 中的 grill 系列，哪些机制能
改善 omp-flow 的人机共同判断，又如何避免把 QbD 的无界审查换成无界访谈？

## 当前实现的实际结构

固定 revision `2ab958093e83e0ec752e6c1c5932da465bf23e0c` 中：

- [grilling](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/productivity/grilling/SKILL.md#L1-L12)
  只有 12 行。核心动作是沿 decision tree 按依赖
  一次问一个问题，每题给推荐答案；环境可查的是 Agent 的事实工作，决定交给人；人确认
  shared understanding 前不行动。
- [grill-me](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/productivity/grill-me/SKILL.md#L1-L7)
  只有 7 行，正文仅为运行 `/grilling`。它带 `disable-model-invocation: true`，因此是人
  主动选择的 stateless 入口。
- [grill-with-docs](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/grill-with-docs/SKILL.md#L1-L7)
  同样只有 7 行，只组合 `/grilling` 与
  `/domain-modeling`。后者要求文件延迟创建，并且仅当决定难以逆转、缺乏
  上下文会令人意外、且存在真实 trade-off 三项同时成立时才写 ADR
  （[domain-modeling](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/domain-modeling/SKILL.md#L40-L74)）。
- [invocation contract](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/.agents/invocation.md#L3-L16)
  明确区分 human-only entry 与 model-invoked discipline，
  Skill 之间用语义调用复用，不复制另一 Skill 的内容。

这个结构比“把完整流程写进每个 Agent”更接近单一事实源：入口表达用户意图，primitive
表达共同行为，domain discipline 只在需要持久化时组合进入。

## 为什么有效

1. **问题按依赖出现。** 先解决父决定，再问依赖它的子决定，避免并列问题建立在互相
   冲突的假设上。
2. **人不是空白答题器。** 每个问题带 Agent 推荐答案，人校准一个具体提案，而不是替
   Agent 做仓库调查或从零设计。这能降低回答负担，但也会产生锚定偏置，不能不分问题
   类型地照搬。
3. **控制权在入口和出口都可见。** 人选择进入高强度访谈，也由人确认 shared
   understanding；Agent 不能把“还有问题可问”当作自动实施或无限延长的授权。
4. **持久化是稀疏的。** stateless 入口可以只形成对话理解；需要 durable knowledge 时
   才组合 domain-modeling，而且 ADR 有严格的现实代价门槛。
5. **提示负担很小。** 三个 Skill 没有分别解释完整方法，减少同步漂移和某条规则被重复
   强调到超过实际重要性的风险。

## 与当前缺陷的冲突

原始 primitive 同时写了 `relentlessly`、`every aspect` 和 `each branch`，退出条件是
shared understanding。对于边界开放的架构问题，可能永远存在新分支；shared
understanding 也无法客观证明。若 Main 自动调用它，这会复现
`NEEDS_EVIDENCE -> fresh audit` 的同一种无限目标。

仓库中尚未 promoted 的
[batch-grill-me](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/in-progress/batch-grill-me/SKILL.md#L7-L15)
把这个方向推到更极端：每轮询问整个 frontier，
结束条件是 every branch visited、nothing silently assumed
。它适合用户主动追求穷尽的场景，
不能成为 omp-flow 默认的 Explore Gate。

## 用户校正：默认偏置与交流缺失

omp-flow 过去引入 Brainstorm、Research、独立 QbD 和 human decision，部分目的就是避免
同一个模型的默认倾向未经挑战直接成为设计。原始 Grill 要求模型为每个问题先给推荐答案，
可能让人只在模型设定的决策树和选项上校准，从而把这种偏置重新带回来。

但当前 Brainstorm 的另一端同样有缺陷：它只要求在 Agent 已经识别出、且证据不能回答的
ambiguity 上提问，没有要求先显式暴露 material decisions、默认假设或模型的反方挑战。
Agent 因而可以凭自己的默认解释认为“已经足够清楚”，几乎不交流就宣告 framing 可用。
少问没有消除偏置，只是把偏置从答案移到了问题选择和未声明假设中。

默认偏置至少有三层：

1. **取景偏置。** 模型先决定哪些分支存在、哪些值得问，人的选择被限制在模型画出的树中。
2. **锚定偏置。** recommendation-first 让人围绕模型首选修正，而不是先暴露自己的目标与
   风险偏好。
3. **停止偏置。** shared understanding 由模型主观判断时，可能过早收敛，也可能因模型
   继续发现分支而永不收敛。

项目 Wiki 提供了第三个支点：

- 仓库与 Wiki 保存过去实践、项目词汇、已接受边界和重复失败，不必让当前模型从通用
  预训练默认值重新发明项目判断。
- Wiki 不是教条，也不是天然无偏。它是带出处的历史证据，可能过时或继承旧模型/旧流程
  的偏置；若当前运行事实或用户目标不同，应显式指出冲突并由人决定沿用、修订或废弃。
- Wiki 也不能替代交流。Agent 需要把与当前决定真正相关的既有知识带进对话，而不是
  读取后静默替人作出选择。

因此更合适的模型是三角校准：**仓库/Wiki 的实践证据 + 人的目标与风险取舍 + 模型的
假设、建议和反方挑战**。三者中任何一个都不能单独宣布收敛。

## 推荐适配

### 第一性锚定：Grill 的首要落点

Grill 最有价值的时机不是方案已经确定后穷举所有分支，而是广泛 Research 之前共同形成
一个可修订的[第一性锚定](first-principles-anchor.md)：从可观察现象中识别当前主要矛盾、
不可牺牲结果、最强反假设和修订条件。它决定 material decision frontier 从哪里开始，
也防止 Research 被模型随手生成的问题带偏。

这里的互动强度来自反方质量与因果追问，不来自问题数量。价值与风险由人先表态、模型
随后挑战；技术事实由 Agent 先查，技术建议必须与 strongest counter-case 同时出现。
人确认的是“这个暂时锚足以指导下一轮实践”，而不是承诺它不可推翻。

### 普通 Brainstorm

继续以当前 `omp-flow-brainstorm` 为默认：只处理会改变目标、范围、风险或成功标准的
问题；仓库事实和相关 Wiki 先查；一次一个决定。非琐碎任务开始时先公开一个简短的
material decision frontier，至少说明已知事实、当前默认假设和仍需人决定的事项。即使
没有问题要问，也必须把拟采用的理解交给人做 shared-understanding checkpoint，不能把
沉默当成同意。

问题根据性质选择交互顺序：

1. **事实问题：Agent 先查。** 从代码、测试、历史、Wiki 或必要外部来源取得，不向人
   转嫁调查劳动。
2. **价值、偏好、风险容忍：人先回答。** 不先给单一推荐，避免锚定；人表态后，Agent
   再用证据、反例和替代方案挑战或完善。
3. **证据明显倾向某个技术选择：Agent 可先建议。** 但同时给 strongest counter-case、
   不确定性和什么事实会推翻建议，不制造只有一个“正确答案”的假菜单。
4. **难逆或高后果决定：两遍校准。** 人给初始立场，Agent 独立挑战，最后由人确认、
   修改或推迟。

### 显式 Grill 模式

当用户明确要求“深挖、grill、压力测试所有关键选择”，或同意进入高强度访谈时，在
Brainstorm 内启用 Grill 模式：

1. 画出当前 **material decision frontier**，只包含答案可能改变产品方向、风险接受或
   实现边界的决定。
2. 按依赖一次问一个；推荐答案何时出现遵循上面的事实/价值/技术/高后果分类，不默认
   由模型先锚定。
3. 环境可查的事实由 Agent 先查，不转嫁给人。
4. 用户答案改变树时重新计算 frontier；已经不影响决定的分支立即剪掉。
5. material frontier 为空且人确认共同理解时结束。并非要求所有可想象分支为空。
6. Bundle 只记录确定的决定、仍开放的重大分歧和有复用价值的领域语言，不保存完整问答
   transcript；ADR 只用于难逆、意外且有真实 trade-off 的选择。

### QbD 只借局部纪律

QbD 不自动启动完整 Grill。它只借用三点：事实由 Auditor 查、每次向人提出一个明确的
风险决定、把模型判断与 strongest safe-degradation/counter-case 并列呈现。Auditor 的
任务是提供证据和因果链，不是遍历整棵决策树，也不能用 verdict 替人预先决定风险偏好。

## 是否新增独立 Skill

本次 `0.2.3` 不建议先增加一个新的跨 Harness `omp-flow-grill` 或
`omp-flow-first-principles` Skill。现有 Brainstorm 已经具备一次一个问题、先查事实、
给出推荐方向和等人确认的核心行为；先把第一性锚定、显式 Grill 模式和 material frontier
写进 authoritative Brainstorm 合同，可以用更小改动验证价值。

只有实际使用证明用户需要一个可发现的独立命令，并且三个 Harness 都能可靠表达
human-only invocation 时，再拆成薄入口和共享 primitive。这个决定遵守参考项目自己的
规则：只有独立 invocation 真正值得其 context/cognitive load 时才切 Skill。
