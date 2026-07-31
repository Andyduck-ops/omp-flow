---
type: "Product Requirements"
title: "实践导向 Explore 与 QbD 收敛"
---

# 实践导向 Explore 与 QbD 收敛

## 目的

omp-flow 要在不削弱独立挑战、人的治理和机械安全边界的前提下，修复两种相反但同源的
失效：Brainstorm 交流不足导致模型默认假设静默进入设计，QbD 又把所有未知细节当作继续
返工的理由。依据[选定综合](research/practice-led-qbd-direction.md)和
[第一性锚定研究](research/first-principles-anchor.md)，非琐碎任务先形成可证伪的问题锚，
Research 与 Brainstorm 用实践证据确认或修订它；QbD 只阻塞与真实重大后果存在因果链的
问题，最终风险决策仍由人作出。

目标发布版本为 `0.2.3`。

## 使用者结果

- 人在广泛 Research 前能看见并校准任务的可观察现象、主要矛盾、不可牺牲结果、关键
  假设与修订条件，而不是被模型已经选好的解决方案树锚定。
- Research 能说明调查将验证或推翻哪个关键假设、改变哪个实际决定；证据改变问题内核
  时，工作自然返回 Brainstorm，而不是维护原先文字的权威。
- Auditor 能严格拦截错误事实、权限/数据越界、不可恢复副作用和核心链路不可实现，却
  不会因非关键合同还可更完整、或可诚实降级的可选体验而无限要求返工。
- 人在审计前提供价值、风险和不可牺牲边界，在审计后可以选择修复、补证据、缩小范围、
  安全降级、接受残余风险、推迟或停止；模型 verdict 不自动取得下一轮审计授权。
- OMP、Codex 与 Claude Code 使用同一方法论语义，安装包与仓库内已部署副本不会漂移。

## 功能需求

### R1 — 可修订的第一性锚定

对于非琐碎任务，初始 Explore 在广泛 Research 前应共同形成一个暂时的问题锚。它至少让
参与者能说清：可观察现象、当前主要矛盾、不可约减结果、不可牺牲边界、初始假设、最强
反假设，以及什么事实会修订当前判断。它可以写在现有 Brainstorm Concept 或一个有用的
描述性 Concept 中；不得要求固定标题、字段、文件名或机器可读结构。

高强度 Grill 只覆盖会改变问题内核的 material decision frontier。价值、风险偏好和
不可牺牲结果由人先表态，Agent 随后以最强反方、反例与后果链挑战；证据倾向明确的技术
问题允许 Agent 先给建议，但必须同时给 strongest counter-case 和推翻建议所需的事实。
明显机械、低歧义任务可直接推进，不需要为了证明“完成锚定”而制造仪式。

### R2 — 可证伪的 Research ↔ Brainstorm 循环

Research 选题应连接到当前锚中的关键假设、主要矛盾或一个实际决定。结果必须区分事实、
解释、反证和未知，并明确它是确认、修订还是推翻了当前问题锚。发生实质重构时返回
Brainstorm，更新 authored knowledge，并形成新的 shared-understanding checkpoint；仅
重复读取或恢复会话不算新一轮认识增量。

项目 Wiki 是历史实践证据，不是不可质疑的规则。Agent 应读取与决定相关的最小主题，并
在 Wiki、当前仓库事实和人的目标冲突时公开冲突，不得让 Wiki 静默替人决定价值排序。

### R3 — QbD 重要性与 verdict 语义

每轮审计必须围绕本次可能改变的决定、不可接受后果、当前范围，以及已有的已关闭 finding
和人已接受风险进行。Auditor 将观察分为 decision-critical finding 与 advisory/craft
observation：

- `FAIL` 只用于已有证据支持、可能导致错误事实、权限或数据越界、不可恢复副作用，或
  核心链路无法实现/验证，且安全降级不足的 blocking finding。
- `NEEDS_EVIDENCE` 只用于缺失证据使 Auditor 无法判断上述重大后果是否存在；“仍有未知
  项”本身不满足该 verdict。
- `PASS` 表示当前范围内没有未解决 blocking finding；它可以携带非阻塞风险、实现期
  verification、deferred recommendation 或已接受残余风险。

每个 blocking finding 必须给出证据、重大后果因果链、可能改变的决定、最小修复，以及
为什么隐藏、`unavailable`、expiry、拒绝写入或其他 fail-soft 降级不足。不能建立这条链的
观察只能成为非阻塞建议。

### R4 — 人类校准与有范围的复审

Auditor 给出 verdict 后，Main 必须把 material findings 与可选治理动作呈现给人，并记录
一个普通链接的 human decision Concept。`FAIL` 或 `NEEDS_EVIDENCE` 不再自动触发 repair
和 fresh audit。只有人的决定要求继续，或新的外部证据/实质设计变化经人判断需要重开，
才进入下一轮。

这里“接受风险并继续”只适用于 advisory observation、`PASS` 携带的 residual risk，或
已经通过移除、禁用、缩小范围、fail-soft 等手段而不再满足 R3 blocking 定义的风险。
未解决的 `FAIL` 只能由人选择修复、移除/安全降级原危险范围、推迟或停止，不能以普通
accepted risk 名义让原范围原样继续；重大 `NEEDS_EVIDENCE` 只能选择补证据、移除/安全
降级不确定范围、推迟或停止，不能仅凭风险接受绕过。

若人考虑改变已经声明的不可牺牲边界，应返回 Brainstorm/Design，将其记录为价值和问题
定义的实质变化，而不是把旧 blocker 改名为 residual risk。必要时进行 human-first
targeted Grill：人先陈述改变边界的目的、价值和风险理由，Agent 再给最强反方、具体后果
和更轻的降级方案，最终由人确认、修改或放弃该变化。它不是每个 finding 的自动步骤，
也不要求固定轮数或穷尽分支。

复审须继承当前范围、先前已关闭 finding、人已接受风险和本轮唯一待验证变化。fresh
actor 可以提出范围外观察，但除非它能建立新的重大后果因果链，否则只能建议由人另行
决定，不得换名重开已收束问题。独立性意味着独立判断，不意味着丢失已记录的治理上下文。

### R5 — Canonical 与部署一致性

共同语义以 canonical Workflow 和 Shared Skills 为源；Harness Agent 只保留各角色每次
都必须执行的具体动作。实现必须同步当前仓库中对应的 `.omp-flow`、`.agents`、`.omp`、
`.codex` 与 `.claude` 管理副本，并以 focused tests 保护 canonical/deployed parity 及关键
正反合同。包版本与 lockfile 更新到 `0.2.3`。

## 约束

- Bundle Markdown 与人拥有任务含义、风险偏好、锚、verdict 和 human decision；Python
  只拥有既有机械边界。
- 不增加 runtime lifecycle state、audit counter、waiver store、risk enum、Markdown
  parser、固定 frontmatter 或由 Hook 推断的审计状态。
- 现有 session/actor identity、path confinement、operation receipt、review actor
  independence、原子副作用和缺失机械身份的 fail-closed 行为保持不变。
- Prompt 修改必须通过 no-op test：每条新增规则都对应一个已观察的默认失效或验收场景；
  哲学只在上位资源说明一次，角色提示使用短的可执行动作。
- 保持 Python stdlib-only 与 Windows UTF-8 兼容；本任务预期不修改 Python。

## 非目标

- 不取消 QbD 1、QbD 2、独立 Auditor 或 linked human decision。
- 不规定固定问答轮数、审计次数、任务大小阈值、统一风险等级或自动跳过 Gate。
- 不引入独立 `first-principles` lifecycle phase、强制 `anchor.md`，或要求穷尽完整 decision
  tree。
- 不让 `PASS` 变成迎合用户的默认结果，也不把“反形式主义”解释为忽略权限、数据和
  不可恢复风险。
- 不修改 Hooks、Flow Status、TUI 或 runtime 来解释 materiality、accepted risk、
  Explore 轮次或 human approval。

## 验收标准

### AC1 — 当前任务的第一性锚与可证伪循环

给定当前任务的现象“Brainstorm 静默采用模型默认值，同时 QbD 围绕低决策价值内部合同
反复审计”，更新后的 Brainstorm 合同应促成人与 Agent 形成并确认以下等价语义：主要
矛盾是“足够强的独立挑战”与“方法论服从实践、交付和人的治理”之间的张力；最强反假设
是“根因可能只是角色提示过多和边界重叠，新增前置动作会成为另一种形式主义”。

随后一个 Research 结果必须能明确产生三种可观察结果之一：证据支持该锚并缩小后续调查；
证据改变主要矛盾并触发 Brainstorm 修订；证据证明锚没有改变问题选择或停止判断，因而
缩减/删除该动作。任何结果都不得创建新的 runtime phase 或依赖 Markdown 解析。

### AC2 — 人机发言顺序与 shared understanding

静态 Prompt 合同与人工场景检查共同证明：价值/风险问题不由 Agent recommendation-first；
技术建议同时携带最强反方和可推翻证据；普通 Brainstorm 在进入 Design 前公开关键默认
假设并取得一次人的 shared-understanding checkpoint，而非静默收敛或固定轮数访谈。

### AC3 — 可安全降级的状态栏未知项不阻塞

给定可选状态栏字段缺少可靠来源，但界面可隐藏字段或显示 `unavailable` 且不制造虚假
事实，Auditor 将其记为 non-blocking risk、implementation verification 或 deferred
recommendation；不得仅凭合同仍不完整给出 blocking finding。

### AC4 — 权限、数据与虚假事实继续 fail-closed

给定设计允许未授权 actor 修改任务、可能损坏持久数据，或把过期/猜测状态显示成权威
事实，Auditor 给出 `FAIL`；若现有证据不足以判断这些重大后果是否存在，则给出
`NEEDS_EVIDENCE`。报告包含证据、后果链、受影响决定、最小修复和安全降级为何不足。

当人仅记录“接受风险”、但原权限/数据/虚假事实 `FAIL` 未修复、移除或安全降级时，Main
不得让原危险范围进入 Decompose/Execute；重大 `NEEDS_EVIDENCE` 未补证据、移除或安全
降级时亦同。若同一范围已经被移除、禁用、缩小或 fail-soft，且有证据表明它不再满足
blocking 定义，则风险转为 residual/advisory 后可由人接受并继续。这两条路径必须在
Prompt 合同和人工场景检查中产生不同路由结果。

### AC5 — 人收束后不自动复审

给定 Auditor 报告一个非关键内部合同未知项，且人已记录接受风险或安全降级，Main 不得
自动派发 fresh audit；新的 Auditor 不得把同一观察换名升级。只有新的重大后果证据或
实质变更经人判断值得重开时，才能发起带有先前决定和限定问题的新复审。

给定人考虑改变既有不可牺牲边界，Main 不得把原 `FAIL`/重大 `NEEDS_EVIDENCE` 直接改写
为可执行的 accepted risk；它必须返回 Brainstorm/Design 记录新的价值边界。若该变化会
实质改变问题内核、权限/数据安全或不可恢复后果，则可进行 human-first targeted Grill，
并让最终 human decision 明确选择确认、修改或放弃边界变化；这一路径同样不自动授权
fresh audit 或实现。

### AC6 — 三 Harness 语义与分发同步

focused tests 验证：

- `templates/.omp-flow/workflow.md` 与部署 `.omp-flow/workflow.md` 一致；
- `omp-flow`、`omp-flow-brainstorm`、`omp-flow-research`、`omp-flow-qbd` 四个 canonical
  Shared Skill 与所有已选择 Harness 的部署副本字节一致；
- OMP、Codex、Claude 的 Research 与 QbD Agent canonical/deployed 对一致，OMP
  Orchestrator 对也一致；
- 上述资源包含 material decision、counter-case、revision/falsifier、decision consequence、
  safe degradation、human calibration 和 scoped re-audit 的相应角色合同，并移除“任何
  缺失或矛盾证据必为 `NEEDS_EVIDENCE`”及“失败后自动 fresh audit”的泛化语义；
- `npm run build`、`npm test`、`npm pack --dry-run` 与 `git diff --check` 通过，包清单包含
  更新后的 templates，`package.json` 与 `package-lock.json` 均为 `0.2.3`。

## 已解决的产品决定

- 第一性锚定默认用于非琐碎任务，但属于 Explore 内的可跳过、可修订推理动作，不是
  lifecycle Gate。
- 默认 Brainstorm 使用 material frontier 和一次 shared-understanding checkpoint；只有
  用户明确选择或未决问题确实改变结果时才进入高强度 Grill。
- 人拥有价值、风险与停止权；模型拥有事实调查、假设暴露和独立挑战职责。
- 重要性采用因果链和具体后果判断，不固化为风险分数、枚举或任务规模算法。
- 本轮实现是 Prompt/文档/测试/版本同步，不修改机械 runtime、Hooks 或 Flow Status。
