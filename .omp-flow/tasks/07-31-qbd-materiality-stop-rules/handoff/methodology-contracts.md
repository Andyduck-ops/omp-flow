---
type: "Implementation Handoff"
title: "共同 Workflow 与 Shared Skills 实现交接"
status: "DONE"
---

# 共同 Workflow 与 Shared Skills 实现交接

## 关联与身份

- Work：[共同 Workflow 与 Shared Skills](../work/methodology-contracts.md)
- PRD：[实践导向 Explore 与 QbD 收敛](../prd.md)
- Design：[实践导向 Explore 与 QbD 提示合同设计](../design.md)
- Actor ID：`implement-methodology-contracts-v1`
- Dispatch receipt：`4fff08e0682d4128a49b5929d565a1f5`
- Predecessor receipt：`ce3ae7b4d2cf4e4ebb2e4e20c9a6122e`
- Result：`DONE`

## 实现结果

共同 Workflow 现在把非琐碎 Explore 定义为可修订的第一性锚定：问题的可观察现象、
主要矛盾、不可约减结果、人的边界、反假设和修订证据。它明确是 authored direction，
不是固定文件、检查清单或 runtime phase；低歧义机械工作可以直接推进。`第一性锚定`、
`主要矛盾`、`实践检验`、`反形式主义` 四个方法论名词只在上位语义和对应动作附近出现，
没有复制成各角色的哲学全文。

四个 Shared Skills 落实了以下合同：

- Router：证据实质改变问题时返回 Brainstorm；QbD 前绑定当前决定、重大后果与既有人的
  决定；verdict 后先由人校准，不自动 repair/re-audit；active blocker 不能以普通
  accepted risk 原样进入 Decompose/Execute。
- Brainstorm：非琐碎任务围绕 material decision frontier 形成/修订问题锚；价值和风险由
  人先表态，Agent 再挑战；证据明确的技术建议同时提供 strongest counter-case 和
  falsifier；进入 Research/Design 前取得 shared-understanding checkpoint。
- Research：每个 consequential question 连接锚假设、主要矛盾或实际决定；主动寻找最强
  反证；综合明确报告 `confirm`、`revise` 或 `falsify` 及其决策影响，实质重构时建议返回
  Brainstorm。
- QbD：以 evidence -> consequence -> affected decision 判断 material blocker，明确
  `PASS`/`FAIL`/`NEEDS_EVIDENCE`、safe degradation 和 advisory 边界；人的决定拥有下一步
  治理权；复审只针对经人校准的新重大证据或实质变化，并继承既有关闭项和人的决定。

## 删除或改写的旧约束

- 删除 Workflow 中“audit fail/user reject 就 repair 并 fresh independent operation”的
  自动语义。
- 删除 QbD Transition 中无条件
  `FAIL, NEEDS_EVIDENCE, or human reject -> repair -> fresh independent audit`。
- 把“要求 verdict + remediation”的宽泛合同改为 materiality 定义：只有证据已支持重大
  后果，或证据缺口阻止判断该重大后果时才阻塞；一般未知和 craft improvement 为 advisory。
- 把 Brainstorm 的泛化 recommendation-first 改为稳定的责任顺序：价值/风险 human-first；
  技术建议必须携带 strongest counter-case 与 falsifier。
- 明确 Research 在实际决定已经被支持或推翻后，不为了完成想象中的 evidence inventory
  继续调查。

## 保留的硬边界

- Bundle、普通 Markdown 与人继续拥有任务含义、风险、verdict 和 human decision；不增加
  parser、schema、固定 `anchor.md`、risk enum 或 lifecycle state。
- 缺 Bundle/entry/output、路径越界、actor/receipt/assignment identity 等机械错误继续
  fail-closed；semantic materiality 不能将其降级。
- 模型 `PASS` 不是人类批准，作者不能审计自己的产出，独立 actor 语义保持不变。
- 未解决的权限/数据/虚假权威/不可恢复后果 blocker 不能被 accepted-risk 标签绕过。
- 人改变不可牺牲边界时返回 Brainstorm/Design；必要时进行 human-first targeted Grill，
  但不规定固定轮数或穷尽分支，也不自动授权复审。

## 修改范围

- Canonical Workflow：`templates/.omp-flow/workflow.md`
- 当前部署 Workflow：`.omp-flow/workflow.md`
- Canonical Shared Skills：`templates/common/skills/{omp-flow,omp-flow-brainstorm,omp-flow-research,omp-flow-qbd}/SKILL.md`
- 四个当前部署 Skill roots 中上述四个同名 Skill：`.agents/skills/`、`.omp/skills/`、
  `.codex/skills/`、`.claude/skills/`
- 本 handoff Concept

未修改 Harness Agent、focused tests、package version、Python/runtime、Hooks、Flow Status 或
TUI。工作区中原有的 `.omp-flow/.gitignore`、Wiki、`disposition.py` 和其他任务/归档改动
均未由本 Work 改写。

## 验证

- SHA-256 parity：Workflow canonical/deployed 1 组与四个 Shared Skills × 四个部署 roots
  共 16 组全部 byte-identical。
- 正向合同检查：第一性锚定、主要矛盾、实践检验、反形式主义、human-first、strongest
  counter-case、falsifier、shared understanding、Research revision/decision impact、QbD
  consequence/safe degradation/human calibration/scoped re-audit 全部命中预期 canonical。
- 负向合同检查：旧的无条件 `FAIL, NEEDS_EVIDENCE, or human reject` transition、自动
  repair/fresh-audit 语义和泛化 missing-evidence verdict 词组在本 Work 目标中均不存在。
- `git diff --check -- <本 Work 目标>`：PASS（仅 Git 的 Windows LF/CRLF 提示，无 whitespace
  error）。
- `npm test` 第一次运行：FAIL，提前停在 Flow Status V2 supervisor 的
  `cleanup receipt records bounded-output overflow`；失败文件和 runtime 均在本 Work 范围外。
- `npm test` 原样第二次运行：PASS，`276 focused checks`；Flow Status v2、归档链接、Claude
  Hook 与 Node 子测试同时通过。首次结果判定为未稳定复现的时序性失败，没有越界修改测试
  或 supervisor。

## 剩余集成责任

最终分发 Work 仍需按已批准 Work Map 增加/调整 focused contract tests、更新 `0.2.3` 版本，
并运行 compile/build/test/pack/diff-check 全套发布验证。本 handoff 需要由不同 actor 独立
Review；这里的 `DONE` 不代表 reviewer acceptance。
