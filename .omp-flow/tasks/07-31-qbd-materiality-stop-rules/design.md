---
type: "Technical Design"
title: "实践导向 Explore 与 QbD 提示合同设计"
---

# 实践导向 Explore 与 QbD 提示合同设计

## 设计摘要

本设计通过既有 Markdown/Prompt 所有权修正 Agent 的默认判断方式，不增加新的执行系统。
[PRD](prd.md)中的第一性锚、Research 修订、审计重要性、accepted risk 和人的停止决定都
继续由普通 Bundle Concepts 与对话承载；Python、Hooks、Flow Status 和 Harness native
task 不读取或推断这些语义。

上位资源说明“为什么”，角色资源只说明本角色每次必须“做什么”。数据流为：

```text
human values/risk ─┐
repository + Wiki ─┼→ provisional first-principles anchor
Agent countercase ─┘                 │
                                     ↓
                         Research ↔ Brainstorm
                         confirm / revise / falsify
                                     │
                                     ↓
                          selected synthesis / design
                                     │
                                     ↓
                    scoped independent QbD report
                                     │
                                     ↓
                     linked human decision → next action
```

运行时只在最外层继续关联 Bundle path、actor 与 opaque receipt；图中语义均不进入 runtime。

## 所有权与同步矩阵

| 责任 | Canonical source | 当前仓库部署目标 | 修改责任 |
|---|---|---|---|
| 共同方法论与正常推理方向 | `templates/.omp-flow/workflow.md` | `.omp-flow/workflow.md` | 定义第一性锚、实践循环、QbD 重要性和人的治理，不写角色细节 |
| 主会话路由 | `templates/common/skills/omp-flow/SKILL.md` | `.agents/skills/omp-flow/`、`.omp/skills/omp-flow/`、`.codex/skills/omp-flow/`、`.claude/skills/omp-flow/` | 选择所需深度、阻止自动复审、保留机械 fail-closed |
| Brainstorm | `templates/common/skills/omp-flow-brainstorm/SKILL.md` | 四个 Skill roots 的同名副本 | 形成/修订锚、互动顺序、material frontier、shared-understanding exit |
| Research | `templates/common/skills/omp-flow-research/SKILL.md` | 四个 Skill roots 的同名副本 | 把调查绑定到锚/决定，报告 confirm/revise/falsify |
| QbD coordinator | `templates/common/skills/omp-flow-qbd/SKILL.md` | 四个 Skill roots 的同名副本 | audit brief、verdict 分类、human options、scoped re-audit、停止规则 |
| OMP Main | `templates/omp/agents/orchestrator.md` | `.omp/agents/orchestrator.md` | 用短规则保持人类治理，不重复整套哲学 |
| OMP role Agents | `templates/omp/agents/researcher.md`、`qbd-auditor.md` | `.omp/agents/` 同名文件 | 执行 Research/QbD 角色合同 |
| Codex role Agents | `templates/codex/agents/omp-flow-research.toml`、`omp-flow-qbd.toml` | `.codex/agents/` 同名文件 | 执行同等角色合同，保留 Codex native 边界 |
| Claude role Agents | `templates/claude/agents/omp-flow-research.md`、`omp-flow-qbd.md` | `.claude/agents/` 同名文件 | 执行同等角色合同，保留 strict descriptor、identity 与 TaskUpdate gate |
| 安装/更新映射 | `src/cli/init.ts`、`src/cli/update.ts` | 按选择 Harness 部署 | 现有映射已覆盖所有目标，无需修改 |
| 回归合同 | `tests/omp-flow.test.ts` | 临时安装根及当前 source/deployed 对 | 增加 parity、正向语义和旧泛化语义消失检查 |

`templates/common/skills/` 是 Shared Skill 唯一来源。实现时先改 canonical，再把同一内容同步
到四个当前已部署 Skill roots；不得独立编辑四份语义。Harness Agent 采用各 Harness 的
canonical 定义，随后同步各自部署副本。安装器继续通过 `getManagedResources` 复制资源，
不需要新的 renderer 或模板变量。

## 组件设计

### Workflow

在 Principles/Normal Flow/QbD 语义中加入最小共同合同：

```text
provisional first-principles anchor → brainstorm ↔ research
                                      confirm / revise / falsify
```

文本明确：这是 Explore 内可修订方向；非琐碎任务默认进行，机械低歧义任务可直接推进；
它不是 Python phase、固定 Concept 或完成标记。QbD 章节定义重大后果因果链、safe
degradation、模型建议与人类治理的边界。Guardrails 补充“不把价值、风险或 materiality
编码进 runtime/Hook/parser”。

### Router

Request Classification 与 Operation Routing 不增加新 Skill 或新行。用户同意创建非琐碎
Bundle 后，Router 仍加载 `omp-flow-brainstorm`，但要求先形成 provisional anchor；若已选
Bundle 的证据推翻锚，则路由回 Brainstorm。Router 在调用 QbD 前确认 authored entry 已能
表达本轮决定、不可接受后果和相关既有 human decisions；信息不足且属于人的风险偏好时
只问人一个决定问题。

QbD 返回后，Router 必须先呈现并记录 human calibration。`FAIL`/`NEEDS_EVIDENCE` 本身
不构成新操作授权。advisory、`PASS` residual risk，或经移除、禁用、缩范围、fail-soft
后不再满足 blocking 定义的风险，可由人接受后继续；未解决的 `FAIL` 只路由到修复、
移除/安全降级原范围、推迟或停止，重大 `NEEDS_EVIDENCE` 只路由到补证据、移除/安全降级
不确定范围、推迟或停止。两者都不能仅凭“接受风险”让原范围进入 Decompose/Execute。
机械身份、路径和 receipt 错误仍直接阻塞，不受 semantic materiality 判断影响。

若人考虑改变既有不可牺牲边界，Router 返回 Brainstorm/Design，将其作为价值和问题定义
的实质变化记录。只有在该变化可能改变问题内核、权限/数据安全或不可恢复后果时，Main
才进行 targeted Grill：先取得人的目的、价值和风险理由，再由 Agent 给 strongest
counter-case、具体后果和更轻降级方案，最后由人确认、修改或放弃；它不自动触发复审，
也不能把旧 blocker 直接改名为可执行的 residual risk。

### Brainstorm

在 Interview Contract 前部增加 `First-principles orientation`：读取最小 Wiki/仓库证据，
提出候选现象和张力，但不替人排序价值。一次只处理一个会改变问题内核的决定：

1. 人先说明目的、风险容忍和不可牺牲结果；
2. Agent 给出 strongest counter-case、反例或替代解释；
3. 技术问题若证据倾向明确，Agent 给 recommendation + strongest counter-case + falsifier；
4. 双方形成 provisional contradiction、counter-hypothesis 和 revision evidence；
5. 人确认当前理解足以决定下一次 Research 或进入 Design。

这不是固定问题清单。Skill 的 Exit Gate 增加“关键默认假设已公开”“人确认 shared
understanding”“重大未知已链接到能修订锚或改变决定的 Research”。若动作没有改善决策，
允许记录轻量任务 skip reason，而不是创建空 `anchor.md`。

### Research

`Decide Research Scope` 要求每个 consequential question 说明其可能改变的锚假设、主要
矛盾或实际决定；这只存在于 authored prose，不进入 assignment descriptor。Procedure
要求结论显式说明 `confirm`、`revise` 或 `falsify` 的语义，并链接回 framing。若证据改变
问题，Researcher 不自行改 Brainstorm，而在输出中明确建议 Main 返回 Brainstorm；若未
改变，则说明剩余未知为什么不妨碍下一决定。

三个 Harness Research Agent 增加同等的短动作：读取当前锚/问题、寻找最强反证、报告对
锚和决定的影响。它们仍只能写 assigned Research/Reference Concept，不能替人重写价值
取舍，也不能 spawn。

### QbD coordinator

QbD Skill 将现有 Procedure 重组为四步语义：

1. **Bind scope**：从 design/work-map entry 及普通链接中取得当前决定、不可接受后果、
   当前范围、prior closed findings、accepted risks 和本轮变更；首轮没有 prior 内容是正常
   情况，不要求固定 audit brief 文件。
2. **Independent audit**：dispatch 机制保持原样；Auditor 依据证据挑战，但先区分
   decision-critical 与 advisory。
3. **Classify and explain**：按 PRD R3 给出 `PASS`/`FAIL`/`NEEDS_EVIDENCE`。blocking
   finding 必须包含 cause → consequence → decision、最小修复和 safe degradation 不足的
   理由；PASS 可以携带非阻塞项。
4. **Human calibration**：Main 按风险状态展示选项并记录链接的 human decision：非阻塞
   或已安全降级风险可以接受继续；未解决 `FAIL` 只能修复、移除/安全降级、推迟或停止；
   重大 `NEEDS_EVIDENCE` 只能补证据、移除/安全降级、推迟或停止。若人考虑改变既有
   不可牺牲边界，先返回 Brainstorm/Design，必要时使用 human-first targeted Grill。

Transitions 删除 `FAIL/NEEDS_EVIDENCE -> repair -> fresh audit` 的自动语义，改为
“human decision 指定下一步”。复审 entry 应链接先前 audit/human decision 或在当前设计
中保留其语义；Skill 不规定文件名/标题。Auditor 可以挑战 accepted risk 的证据是否发生
实质变化，但不能把“我不同意人的风险偏好”当作 blocker。人的决定拥有治理下一步的
权力，却不把仍满足 blocking 定义的原范围制造为 `PASS`；只有风险状态因修复、取证、
移除或安全降级而改变，或价值边界经 Brainstorm/Design 实质重构后，才重新判断后续授权。

### Harness QbD Agents

三套 QbD Agent 的角色语义保持等价：

- 删除泛化的“missing or contradictory evidence is always `NEEDS_EVIDENCE`”；改为只有
  缺失证据阻止判断重大后果时才是 `NEEDS_EVIDENCE`，缺失 required assignment/机械授权
  仍是 hard blocker。
- 读取 scope、decision、unacceptable consequences、closed findings、accepted risks 和
  当前 change；没有固定字段时从 entry 的普通链接取得，不解析 Markdown。
- 输出 decision-critical findings 与 advisory observations；blocking finding 采用明确
  因果链，并评价 safe degradation。
- 返回 exact next decision/options，而不是自行命令 fresh audit；model PASS 仍需 human
  decision。

Harness 固有启动与授权合同不得改变：OMP role/tools、Codex `multi_agent = false`、Claude
strict-v1 descriptor、identity marker 和 binding `TaskUpdate` 都保持原样。

### OMP Orchestrator

只增加一段短控制规则：初始非琐碎 Explore 先由 Brainstorm 形成可修订锚；QbD verdict
先交人校准，不能自动重派。Codex/Claude 主会话由 Shared Router Skill 承担相同责任，
不存在需要新增的 main Agent 文件。

## 状态、接口与兼容性

### Authored semantic interface

Prompt 期待 Concepts 能以自由 Markdown 传递以下语义：

- provisional anchor 与 falsifier；
- current decision 与 unacceptable consequences；
- prior audit、closed findings、accepted risks 和 current change；
- linked human decision。

这是人类可读接口，不是 schema。缺少固定标题、frontmatter key 或专用文件不构成错误；
Agent 只判断当前链接内容是否足以完成被分配的推理。如果人的价值/风险边界确实未知，Main
提问；如果 repository fact 未知，Researcher 调查；两者都不由 runtime 制造默认值。

### Mechanical interface

`ompFlowDispatch` strict v1、operation receipt、predecessor correlation、actor identity、
path confinement、Claude binding request 和 native task dispatch 完全不变。实现不得给
descriptor 增加 anchor、risk、verdict 或 audit-scope 字段。

### Existing Bundles

旧 Bundle 不迁移、不补字段。恢复一个复杂旧任务时，Main 根据已读 Concepts 判断是否
需要一次轻量锚定/重构；已有清楚 synthesis/design 的任务不会因没有 `anchor.md` 失效。
旧 audit/human decision 仍是普通链接证据。更新安装继续使用既有 hash-aware 行为：未改
部署副本可自动更新，用户自定义副本按现有 conflict 策略保留/覆盖/生成 `.new`。

## 错误与降级行为

| 情况 | 行为 |
|---|---|
| 缺 Bundle、entry、output、actor、receipt 或路径越界 | 维持现有机械 fail-closed；不应用 materiality 降级 |
| 人的价值/风险偏好会改变问题但尚未知 | Main 一次问一个决定问题；Agent 不先给价值答案 |
| 技术事实未知但可调查 | 建立 bounded Research，说明它可能修订的锚/决定 |
| 可选体验事实未知且可诚实隐藏/标 unavailable | 记录非阻塞风险或后续验证，不阻塞主链路 |
| 缺失证据阻止判断权限、数据、错误事实或不可恢复风险 | `NEEDS_EVIDENCE`，说明最小取证与受影响决定 |
| 已有证据证明重大后果且无安全降级 | `FAIL`，给最小修复与因果链 |
| 人接受 advisory、`PASS` residual risk 或已不再 blocking 的降级风险 | 记录 linked decision；可继续，不自动 fresh audit |
| 人试图接受仍未解决的 `FAIL` | 不让原危险范围进入 Decompose/Execute；选择修复、移除/安全降级、推迟或停止 |
| 人试图接受仍重大的 `NEEDS_EVIDENCE` | 不让不确定范围进入 Decompose/Execute；选择补证据、移除/安全降级、推迟或停止 |
| 人考虑改变既有不可牺牲边界 | 返回 Brainstorm/Design；必要时 human-first targeted Grill，Agent 提供最强反方、具体后果和更轻降级方案 |
| 人选择推迟或停止 | 记录 linked decision，停止本轮；不自动 fresh audit |
| 新证据实质改变风险或主要矛盾 | 由人决定返回 Brainstorm/Design 或限定范围复审 |

## 验证设计

### 静态与分发测试

扩展 `tests/omp-flow.test.ts`：

1. 对 Workflow、四个受影响 Shared Skills、OMP Orchestrator、三套 Research Agents 和三套
   QbD Agents 建立 canonical/current-source/current-deployment parity 检查；临时安装根也
   验证选定 Harness 的 byte-identical deployment。
2. 对上位/角色资源分别断言少量行为词组，保护意图而不过拟合整段文案。例如 Brainstorm
   同时包含 human-first value/risk、strongest counter-case、revision evidence 与 shared
   understanding；Research 包含 decision impact 与 revise/confirm；QbD 包含 decision
   consequence、safe degradation、human calibration 与 scoped re-audit。
3. 加负向检查，确保 QbD Skill/Agents 不再包含泛化的“missing or contradictory required
   evidence is `NEEDS_EVIDENCE`, never PASS”，Router/QbD 不再包含无条件
   `FAIL, NEEDS_EVIDENCE -> fresh audit`。
4. 保留并运行既有 strict descriptor、Claude identity/TaskUpdate、operation、archive 与
   Flow Status 测试，证明方法论修改没有扩大机械接口。

### 场景合同检查

使用 [PRD AC1–AC5](prd.md#验收标准) 作为 QbD 1 与实现后 Review 的固定语义场景：

- 当前任务锚必须包含主要矛盾、最强反假设和可推翻条件；Research 结果能触发
  confirm/revise/falsify 之一。
- TUI 可选字段缺证据且可隐藏时不阻塞。
- 权限越界、数据损坏和虚假权威显示仍阻塞。
- 重大风险证据不足时才使用 `NEEDS_EVIDENCE`。
- advisory/已安全降级风险被人接受后可继续且不自动复审；未变化的权限/数据 `FAIL` 或
  重大证据缺口即使被称为 accepted risk，也不能让原范围进入 Decompose/Execute。
- 人改变不可牺牲边界时先返回 Brainstorm/Design，必要时经 human-first targeted Grill
  显式确认；真正的新重大证据仍可由人决定限定范围重开。

静态测试只证明 Prompt 合同已部署，不能证明模型必然判断正确；上述场景必须在独立 QbD
与实现后 Review 中用实际修改后的文本复核。后续真实任务若观察到同类循环，证据返回
Brainstorm 修订本设计，而不是新增计数器掩盖问题。

### 发布验证

实现完成后运行仓库工程指南中的全套命令，并确认版本：

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

此外读取 `npm pack --dry-run` 清单，确认更新的 Workflow、Shared Skills 与三 Harness Agent
templates 均进入包；确认 `package.json`、`package-lock.json` 为 `0.2.3`。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 第一性锚定变成新形式主义 | 不设 phase/schema/固定问题数；允许机械任务跳过；以能否改变 Research/决定为 no-op test |
| human-first 让模型不敢给专业意见 | 只约束价值/风险排序；技术问题明确要求 recommendation + counter-case + falsifier |
| materiality 被模型用来迎合式 PASS | 保留独立 actor；明确重大后果分类、因果链和 `NEEDS_EVIDENCE`；用 fail-closed 场景回归 |
| accepted risk 被误作重大 blocker 的豁免或掩盖后来新事实 | 只允许接受非阻塞/已安全降级风险；原 `FAIL`/重大证据缺口不继续；scoped re-audit 继承旧决定但允许新的重大后果证据交人重开 |
| Prompt 膨胀和跨 Harness 漂移 | 哲学集中在 Workflow/Router；角色只写动作；canonical-first 与 parity tests |
| 静态字符串测试制造虚假安全感 | 同时执行独立 QbD/Review 场景检查，并让真实任务反馈可修订方法论 |
| 修改误触 Claude/operation 机械合同 | Agent 文件只改 Workflow 段；保留现有 startup/binding/descriptor 文本并跑全套回归 |

## 拒绝的方案

- **新增 `FirstPrinciples` runtime phase 或强制 `anchor.md`。** 会把可修订认识变成机器状态，
  违反 Bundle ownership，并立即制造新的 Gate 仪式。
- **用风险分数/枚举自动决定 blocker。** 风险取舍依赖具体后果和人的判断，硬编码会把
  当前形式主义换成另一套形式主义。
- **固定最多 N 次 QbD。** 次数只能止损，既可能放过重大问题，也不能解释为什么下一轮
  有决策价值。
- **取消 QbD 或让 PASS 成为默认。** 会失去已证明有价值的权限、数据、不可实现接口和
  虚假完成挑战。
- **默认 relentless Grill 并遍历完整 decision tree。** 模型决定树本身包含 framing 和
  anchoring bias，且会让低价值分支消耗人类注意力。
- **把完整哲学复制到每个 Agent。** 增加 Prompt sediment 和 Harness 漂移；角色需要的是
  可执行的局部动作。
- **让 Hooks/Flow Status 从 Markdown 或 verdict 推断继续/停止。** 平台层无权解释任务
  语义，也会引入 Markdown parser 和隐藏状态。

## 分解边界

后续 Work 可按互不重叠的所有权分为：共同 Workflow/Shared Skills、Harness Agent 同步、
focused tests 与版本发布同步。实现顺序先 canonical 语义，再 Harness 角色适配，再部署
副本与 parity tests，最后版本/包验证。任何 Work 都不得修改 runtime、Hooks 或 Flow
Status；若实现证据显示机械合同确实必须变化，应返回 Design 并由人重新批准范围。
