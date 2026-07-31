---
type: "Review"
title: "Harness 角色合同独立 Review"
verdict: "ACCEPTED"
---

# Harness 角色合同独立 Review

## 关联与独立性

- Reviews：[Harness 角色合同](../work/harness-agent-contracts.md)
- Implementation handoff：[Harness 角色合同实现](../handoff/harness-agent-contracts.md)
- Design：[Technical Design](../design.md)
- Reviewer actor：`review-harness-contracts-v1`
- Review dispatch receipt：`2669123f366644158bb545b4bef2bdf6`
- Implementation predecessor receipt：`8ac8561f61894726beaaa17edb68ada6`
- Implementation actor：`implement-harness-contracts-v1`

运行时记录确认 predecessor operation 已 `completed`，其 output 正是 linked handoff；Review
operation 使用不同 actor，entry、output 与 predecessor 均匹配本次 assignment。

## Verdict

**ACCEPTED — 无 blocking、high、medium 或 low severity finding；本 Work 的全部完成条件满足。**

## Severity-ordered findings

没有发现需要返工的 substantive finding。

### Advisory observations

1. Prompt 静态合同只能证明角色收到正确方向，不能保证模型在所有真实任务中都能正确判断
   materiality；实现已正确把后续校准留给独立 Review、人的决定和实践反馈，而未增加新的
   runtime Gate。
2. scoped diff 检查会显示仓库既有的 Windows LF/CRLF checkout 提示；这不是 whitespace
   error，也没有破坏七组 canonical/deployed 字节一致性。

## Scope 与语义检查

### Research 等价性

OMP、Codex、Claude 三套 Research 角色均执行同一个最小合同：读取当前问题/决定和可修订
的“第一性锚定 / 主要矛盾”，以“实事求是”寻找 strongest counter-evidence，并明确证据
会 confirm、revise 或 falsify 什么锚或决定。三者都把 `decision impact` 纳入 handoff，且
禁止替人改写价值/风险排序；证据改变问题时只建议返回 Brainstorm。

这些少量方法论名词紧邻可执行动作，没有扩写成固定轮数、完整 decision tree、强制文件、
phase 或模型微观思考步骤，符合 QbD 2 Human PASS 的认知锚要求。

### QbD 等价性与治理边界

三套 QbD 角色均：

- 区分 decision-critical finding 与 advisory observation；
- 只在证据缺口阻止判断重大后果时使用 `NEEDS_EVIDENCE`，同时保持缺 assignment 或机械
  授权为 hard blocker；
- 要求 blocker 给出 cause → consequence → decision、最小修复与 safe-degradation 不足
  的理由；
- 返回 exact next decision/options 交 human calibration，不自行命令 fresh audit；
- 不把未解决 `FAIL` 或 decision-critical `NEEDS_EVIDENCE` 重命名为可继续执行的 accepted
  residual risk。

OMP Orchestrator 的新增控制规则同时保持 targeted Grill 为后果值得时的限定互动：人若考虑
改变不可牺牲边界，先返回 Brainstorm/Design；Grill 不是自动复审或 blocker 豁免。

### Harness 原生边界

- OMP `role`、`model`、`tools`、native task tuple、strict descriptor 原样转发和不允许角色
  自行 spawn 的边界仍在；diff 未触碰 YAML metadata 或 assignment seam。
- Codex 两个 TOML 均可由 Python `tomllib` 解析，保留 `sandbox_mode = "workspace-write"`、
  `multi_agent = false` 与 `multi_agent_v2.enabled = false`。
- Claude 两个角色保留 strict-v1 first-non-blank descriptor、identity marker、binding request、
  binding `TaskUpdate`、immutable progress 约束及无 `Agent`/`Task` 工具边界；diff 只修改角色
  Workflow/Required Assignment/Handoff 的语义文本。
- 七组 Harness canonical/deployed 文件逐对 SHA-256 相等。

## 独立验证

1. `Get-Content` 读取 work、handoff、design、QbD 2 audit 与 human PASS：**PASS**；范围、
   接口和人的方法论名词校准一致。
2. 只读检查 `.omp-flow/.runtime/operations/8ac8561f61894726beaaa17edb68ada6.json`
   与 `2669123f366644158bb545b4bef2bdf6.json`：**PASS**；实现为 `completed`，Review 为
   `active`，actor 不同且 predecessor/output 对应。当前 shell 无 active task，故
   `omp_flow.py operation show` 返回 `No active task for this session`；未据此修改 runtime。
3. 七对 `Get-FileHash -Algorithm SHA256` canonical/deployed 比较：**PASS，7/7**。
4. PowerShell 定向 Research/QbD 语义断言：**PASS，6/6**；覆盖第一性锚、主要矛盾、
   strongest counter-evidence、confirm/revise/falsify、decision impact、human value/risk
   ownership、decision-critical/advisory、consequence chain、safe degradation、human options、
   禁止 fresh audit 与 active-blocker accepted-risk 边界。
5. PowerShell Harness 固有边界断言：**PASS，4/4**；覆盖两个 Codex Agent 与两个 Claude
   Agent。OMP metadata/descriptor seam 同时由真实 zero-context diff 人工核对为未改动。
6. `python -X utf8` + `tomllib` 解析两个 Codex Agent TOML：**PASS，2/2**；两代
   multi-agent 开关均为 false。
7. `git diff --check -- <14 Harness canonical/deployed files>`：**PASS**；仅 LF/CRLF checkout
   warning，无 whitespace error。
8. `npm test`：**PASS**；`276 focused checks`，Node TAP `3/3`，无失败、取消或跳过。

## 结论

实现满足已批准 Design 与 Work 合同，且没有破坏三套 Harness 的身份、授权、descriptor、
TaskUpdate 或 multi-agent 边界。可以把本 Work 作为 **ACCEPTED** handoff 交给后续分发与
0.2.3 集成 Work；若集成 Work 修改这些 Prompt，应把限定修改纳入其自身独立 Review。
