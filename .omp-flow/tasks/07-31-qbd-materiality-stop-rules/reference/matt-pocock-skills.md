---
type: "Reference"
title: "mattpocock/skills：小型可组合 Skill 与人的控制权"
---

# mattpocock/skills：小型可组合 Skill 与人的控制权

## 来源与版本

- Repository: https://github.com/mattpocock/skills
- Revision: `2ab958093e83e0ec752e6c1c5932da465bf23e0c`
- Observed: 2026-07-31
- License: MIT（以仓库中的 LICENSE 为准）

仓库已通过 `gh repo clone mattpocock/skills ... -- --depth 1 --filter=blob:none` 获取到忽略的
`.omp-flow/cache/repos/mattpocock-skills`。工作树干净，`HEAD` 与通过 GitHub API 查询的上述
revision 一致。以下链接均绑定该 revision，而不是浮动 `main`。

## 有用锚点

- [README](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/README.md)：
  明确反对由方法论“拥有整个过程”而削弱人的控制，主张 Skill 小、可适配、可组合；也
  强调小步反馈、共享语言和由用户调用的 orchestration 与模型调用的 discipline 分离。
- [writing-great-skills](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/productivity/writing-great-skills/SKILL.md)：
  用 information hierarchy、progressive disclosure、single source、no-op test、sediment、
  sprawl 和 positive steering 修剪提示；每句话都应证明自己能改变模型行为。
- [grilling](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/productivity/grilling/SKILL.md)：
  仓库事实由 Agent 自己查，决定属于人；一次问一个问题，未形成共同理解前不行动。
- [grill-me](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/productivity/grill-me/SKILL.md)
  与 [grill-with-docs](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/grill-with-docs/SKILL.md)：
  两个用户调用入口都只有一条委托语句，分别复用 `grilling`，后者再组合
  `domain-modeling`；调用、访谈纪律和知识沉淀没有复制成三套文本。
- [prototype](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/prototype/SKILL.md)：
  prototype 是回答一个问题的 throwaway code，问题决定形态；跳过 polish，把结论返回
  正式实现和 durable decision。
- [code-review](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/code-review/SKILL.md)：
  把 Standards 与 Spec 分轴，明确 heuristic 是 judgment call、repo rule 优先，并跳过
  tooling 已经强制的事项；子报告有 400-word 上限。
- [research](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/research/SKILL.md)：
  研究围绕一个问题，回到 primary source，把结果写入一个有引用的 Markdown 文件。
- [to-spec](https://github.com/mattpocock/skills/blob/2ab958093e83e0ec752e6c1c5932da465bf23e0c/skills/engineering/to-spec/SKILL.md)：
  当对话信息已经足够时明确禁止重复 interview，直接综合；同时它要求非常广泛的 user
  stories，构成本项目需要警惕的反例。

## 对当前问题的解释

这个仓库最有价值的不是另一套完整生命周期，而是几个能修正 omp-flow 目标函数的
Prompt 技术：

1. **方法论不拥有人的过程。** Skill 提供可组合纪律，用户仍控制何时调用和如何适配。
2. **事实与决定分权。** Agent 应主动取得仓库事实，人决定目标、偏好和风险；这比
   “模型先 verdict，人最后签字”更接近真实协作。
3. **问题决定验证形态。** 对体验或状态模型的不确定性，可用可丢弃 prototype 返回实践，
   不必在 Design/QbD 中把所有可能性证明完。
4. **分轴防止尺度污染。** decision/spec correctness 与 standards/craft heuristic 分开，
   可以避免内部完备性压过用户结果；tooling 已保证的机械事实不必由 QbD 重复表演。
5. **Prompt 需要主动减法。** no-op、sediment、sprawl 和 negation 检查直接适用于本次
   Workflow/Skill/Agent 修改，防止把哲学页复制成新的提示负担。
6. **深度由入口表达。** `grill-me`/`grill-with-docs` 是人主动调用的薄入口，通用
   `grilling` 才是复用的模型纪律。高强度访谈不是所有任务的默认成本。

## 不应照搬

- `grilling` 的 relentless/every branch 适合用户主动请求的深度访谈；若成为默认 Gate，
  会复制当前 QbD 的无界探索问题。
- `to-spec` 的极度广泛 user stories 可能把“覆盖所有方面”变成文档目标，必须由任务
  后果与规模约束。
- `writing-great-skills` 把 predictability 视为根本美德，并认可 exhaustive completion
  criteria；这对机械操作很有效，但若施加于开放设计判断，仍可能诱发本本主义。
- 该仓库没有与 omp-flow QbD、linked human decision、跨 Harness runtime correlation
  等价的完整合同，不能复制其目录或流程替代现有架构。

## 本地采用建议

- 在本次 Prompt 设计和 Review 中增加 no-op/sediment/sprawl 检查；每条新增规则必须说明
  要改变的具体默认行为。
- QbD 报告分为 decision-critical findings 与 advisory/craft observations，后者不能遮蔽
  或自动升级为前者。
- 对已经被 runtime、Hook 或测试机械保证的事实，Auditor 检查保证是否存在即可，不再
  重复推演所有内部实现细节。
- 当一个低成本 prototype 能直接回答体验/状态问题时，优先让认识接触实践，再决定是否
  值得扩写设计。
- 用正面目标行为搭配必要的 hard guardrail，减少连续 `Never/Do not` 对禁区概念的反复
  激活。
- 将 grill 技术作为明确选择的深度 Brainstorm 模式；用“material decision frontier”
  代替“every branch”，并只把已解决决定、领域术语和真正难逆的 trade-off 写入 Bundle/
  Wiki，不保存逐问逐答的仪式性转录。
