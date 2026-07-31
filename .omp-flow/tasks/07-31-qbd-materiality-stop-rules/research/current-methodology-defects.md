---
type: "Research"
title: "现有 QbD 与工作流方法论缺陷调查"
---

# 现有 QbD 与工作流方法论缺陷调查

## 调查边界

本轮采用内部调查：以当前 authoritative Workflow、canonical Shared Skills、三个 Harness
的 Agent 定义、相关测试与 Git 历史为证据。用户已经提供一次真实行为观察：Agent 围绕
不会改变核心体验的内部合同细节反复启动 QbD 返工循环。

暂不借助外部工作流项目为现有缺陷定性。外部资料只有在仓库证据不足以选择修正方向时
才有决策价值。

## 待回答的问题

1. 哪些现有指令直接把“仍有未知项”转化为 `NEEDS_EVIDENCE` 和新一轮审计？
2. 缺陷只存在于 QbD，还是 Router、Workflow 与其他角色也在奖励流程完备而非实践结果？
3. 人类当前实际拥有哪些决策权，哪些文字使 Agent 事实上取得了返工或延长流程的权力？
4. 哪些严格约束确实防止越权、数据损坏或虚假完成，不应以反形式主义之名削弱？
5. 现有测试验证了什么，又遗漏了什么可观察的行为合同？

## 判断基准

采用项目 Wiki 的 [实践导向的推理](../../../wiki/philosophy/practice-led-reasoning.md)：每个
候选缺陷必须说明它诱发的行为、对用户决定或交付的具体后果，以及为什么现有较轻机制
不足。单纯“不够完整”“措辞可以更漂亮”不计为缺陷。

## 证据与综合

### 可观察事实

1. **现行文字把未知项直接接到返工循环。** canonical QbD Skill 要求报告携带
   `blocking findings` 与 `required remediation`，并规定 `FAIL`、`NEEDS_EVIDENCE` 或
   human reject 都回到原知识、修复并 fresh audit
   （`templates/common/skills/omp-flow-qbd/SKILL.md:27-38`）。authoritative Workflow 同样
   规定 audit fail 后修复并 fresh operation
   （`templates/.omp-flow/workflow.md:163-171`）。这里没有接受残余风险、缩小范围、转交
   实现验证或停止的分支。
2. **三个 Harness 的审计目标一致地过宽。** OMP Auditor 把缺失或矛盾的 required
   evidence 一律定为 `NEEDS_EVIDENCE`，同时要求 QbD 1 挑战 problem、synthesis、
   requirements、architecture、boundaries、alternatives、sources、interfaces，QbD 2
   挑战每个相关 Work，并返回 blocking count 和 exact next action
   （`templates/omp/agents/qbd-auditor.md:14-33`）。Codex 与 Claude 定义具有同一语义
   （`templates/codex/agents/omp-flow-qbd.toml:13-32`；
   `templates/claude/agents/omp-flow-qbd.md:31-51`）。哈希检查确认 canonical Shared Skill
   与 `.agents`、`.codex`、`.claude`、`.omp` 部署副本相同，三个 Agent canonical 与各自
   部署副本也相同；这不是某个 Harness 的适配漂移。
3. **accepted risk 被要求记录，却没有决策效力。** Auditor 需要分开 accepted risk
   （`templates/omp/agents/qbd-auditor.md:20-27`），但 Skill 的 transition 只有 human PASS
   或 repair/fresh audit（`templates/common/skills/omp-flow-qbd/SKILL.md:33-38`）。因此
   accepted risk 更像报告栏目，而不是人可以据此收束的治理动作。
4. **人的校准出现在模型 verdict 之后。** Skill 写着 only the user decides calibration
   （`templates/common/skills/omp-flow-qbd/SKILL.md:28-31`），却没有要求人在审计前声明
   不可接受后果，也没有要求 `FAIL`/`NEEDS_EVIDENCE` 后先由人决定是否值得修复。实际的
   TUI Bundle 中，QbD 目录包含 21 个文件名带 audit 的文档、共 3262 行，但只有 3 个
   human-decision 文档；Bundle index 记录了多组连续 FAIL/NEEDS_EVIDENCE/fresh audit
   （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/index.md:50-127`）。数量本身
   不能证明每轮都无价值，但 21:3 的治理不对称与自动 transition 一致。
5. **人必须在流程外显式制止，方法论才收束。** Root Task/Flow v2 的 human decision
   最终引用了用户“停止重复设计审计并继续交付”的明确方向
   （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/flow-status-v2-human-decision.md:9-17`）。
   这说明现有 `human calibration` 没有在前面的 FAIL 循环中真正充当风险治理。
6. **fresh independence 容易变成重新开题。** Root Task/Flow v2 第一次审计列出六类
   blocker，包括 publication schema、accepted Work、transition authority、v1/v2 cutover、
   双视图 ownership 和 width/detail
   （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/flow-status-v2-audit-1.md:25-49`）。
   第二次确认大部分已关闭后，又以 production publisher、所有 Work 的旧 revision 和
   30 秒 lease 为三个 release blocker
   （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/flow-status-v2-audit-2.md:27-49`）。
   第三次 PASS 以完整 Work catalog 与 10–15 分钟可续租 lease 为关闭条件
   （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/flow-status-v2-audit-3.md:23-46`）。
   当前 Skill 没有要求继承 accepted risk、关闭项和“本轮唯一待改变的决定”。
7. **设计审计承担了部分本可降级或后移的证明责任。** 例如 FlowStatus QbD 1 因缺少
   Oh My Pi flat-call fixture 返回 `NEEDS_EVIDENCE`，并要求补 fixture 或缩小 batch-only
   合同后 fresh audit
   （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/qbd-1/flowstatus-audit-4.md:8-44`）。
   这不是虚构问题，但“补证据、缩范围、推迟到实现验证、接受风险”之间没有人的决策
   节点，Agent 只拥有继续审计的默认路径。
8. **上位方法论没有下沉到执行提示。** 当前 Workflow 与 Router 主要描述顺序、所有权
   和机械 Gate；`proportional to risk` 只明确出现在 Reviewer/Check，Wiki 要求验证与决定
   成比例，QbD 仅出现没有后续效力的 accepted risk。仓库搜索没有找到 QbD 对
   decision value、risk tolerance、safe degradation 或“下一轮改变什么决定”的要求。
9. **测试保护了管道，没有保护判断方式。** focused test 验证 Claude Agent 部署副本
   byte-identical、strict descriptor 和 native role/actor seam
   （`tests/omp-flow.test.ts:417-451`；`tests/omp-flow.test.ts:504-576`），但测试中没有
   `NEEDS_EVIDENCE`、accepted risk、blocking finding、materiality 或 human calibration
   的语义合同断言。同步缺陷因此可以稳定跨 Harness 发布。
10. **缺陷是历史继承，不是本次 TUI 偶发。** `git blame` 显示 QbD Skill 的 verdict、
    blocker、remediation 结构自 `cbc83a0`（2026-07-11）存在；OKF refactor `584810b`
    （2026-07-30）删除了旧 Workflow 的三次 attempt cap 和机器 Gate 状态，却保留了
    `NEEDS_EVIDENCE -> repair -> fresh audit`。移除硬编码次数符合新的 ownership 边界，
    但没有补上语义 materiality 与人的停止判断，形成无界空档。

### 机制解释

现有系统的目标函数实际是“使审计对象足够完备，直到独立模型愿意 PASS”。复杂设计总有
未知项，而 Auditor 寻找新疑点的成本很低；`NEEDS_EVIDENCE` 又比带残余风险 PASS 更符合
其明确指令。fresh actor 为体现独立性会重新覆盖全部维度，Main 随后按 transition 自动
修复。人虽然名义上拥有 approval，却通常只在最终 PASS 后签字，因此无法在成本开始失衡
时及时决定降级、接受风险或停止。

这正是本本主义和形式主义在 Agent 工作流中的具体机制：规则不是用于帮助一个现实决定，
而是把“文档与证据还能继续完善”本身变成了继续工作的理由。

### 反证与应保留的严格性

- QbD 并非总体无效。TUI completion audit 发现 `PermissionRequest` 实际没有设计所假定
  的 `tool_use_id`
  （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/completion-repair-audit.md:33-45`），第二轮发现仅给 Agent
  `TaskUpdate` 工具并不能限制参数级 mutation authority
  （`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control/qbd/completion-repair-audit-2.md:34-45`）。这些会导致错误权限模型或不可实现合同，
  是值得阻塞的真实问题。
- 独立 actor、模型 PASS 不等于人类批准、真实 diff/Review、缺失机械身份 fail-closed，
  都保护了权限、数据和虚假完成，不能以“反形式主义”为由删除。
- Brainstorm 已禁止 false menu 和强迫收敛
  （`templates/common/skills/omp-flow-brainstorm/SKILL.md:21-29,43-50`）；Research 允许有理由
  地 skip（`templates/common/skills/omp-flow-research/SKILL.md:15-24`）；Reviewer 已要求检查
  与风险成比例（`templates/common/skills/omp-flow-check/SKILL.md:19-33`）。因此不是所有
  角色都需要推倒重写，而是缺少共同原则和 QbD 的关键落地。

### 仍然未知

- 修改后的提示在不同模型上的实际收敛程度只能通过后续真实任务和有代表性的场景回归
  观察，静态字符串测试无法证明 Agent 一定做出好判断。
- 人类校准应采用多轻的记录形式，需要在设计时平衡可追溯性与新仪式风险；不应先发明
  固定表格或必填字段。
- 内部证据已经足以选择方法论修正方向；外部样本只用于校正 Prompt 技术，不能替代本地
  缺陷因果链。若后续设计遇到具体 Agent-eval 或风险分级实现问题，再进行有边界的调查。

### 外部样本带来的校正

用户随后指定 [mattpocock/skills](../reference/matt-pocock-skills.md) 作为成熟 Skill 样本。
它支持“小型、可组合、人的控制权、事实与决定分权、实践反馈和提示剪枝”的方向，并提供
no-op、sediment、sprawl、positive steering、fixed review axis 等可直接用于 Prompt 设计的
技术。它也包含 relentless grilling、every branch 和 extremely extensive user stories，
证明“严谨”同样可能被形式化；因此本任务择取其减法与控制权机制，不照搬其完整流程。
Grill 系列的具体适配见 [Grill Skill 对 omp-flow 的适配分析](grill-skill-fit.md)。

## 结论

根缺陷不是“QbD 太多”，而是 QbD 没有被绑定到一个具体的人类决定和重要性边界：未知
默认成为 blocker，模型 verdict 默认触发下一轮，人类只在 PASS 后出现，fresh audit 又
缺少范围连续性。应保留独立审计和真实安全边界，同时把实践导向原则下沉到 Workflow、
Router、QbD Skill 与三个 Harness Agent。具体选定方向见
[实践导向的 QbD 修正方向](practice-led-qbd-direction.md)。
