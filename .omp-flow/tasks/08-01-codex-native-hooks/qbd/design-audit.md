---
type: "QbD Audit"
title: "QbD 1: Minimal Codex-native Skill and Hook adapter"
---

# QbD 1: Minimal Codex-native Skill and Hook adapter

## Verdict

**PASS** — risk **medium**; blocking findings: **0**.

本结论只覆盖 [PRD](../prd.md)、[Design](../design.md)、
[Selected synthesis](../research/synthesis.md) 及其链接的两份研究证据。PASS 表示当前范围内没有未解决的
decision-critical finding，不代表人类批准，也不授权 implementation 或自动进入 Decompose。

## Audit boundary and decision challenged

审计挑战的是：是否可以把 Codex project integration 收敛为 `.agents/skills` 单一共享 Skill 入口、
exact-owned `.codex/hooks.json`、`SessionStart` mechanical orientation 与
`PreToolUse(apply_patch)` runtime guard，同时保留用户配置所有权、runtime 最终 authority、路径安全和
跨平台可实现性。未扩展事件、plugin、native task observation 或 IDE parity。

不可接受后果是：覆盖或静默信任 foreign/modified 用户配置；把可缺席 Hook 冒充最终授权边界；从
runtime orientation 推断 Bundle 语义；无法验证 patch path 时 fail open；或给出无法通过 Windows/POSIX
真实命令验证的正面 coverage 声明。

## Confirmed evidence

- [Native platform specifications](../research/native-platform-specs.md) 记录了当前官方 project Skill
  discovery、project Hook/trust、事件载荷、deny shape、tool coverage 和 `commandWindows` 约束；其最强
  反证是 Hook 可未信任、被禁用、被特殊 tool path 绕过，并且 script 内容变化不一定改变 definition
  hash。
- [Internal harness contracts](../research/internal-harness-contracts.md) 证明 runtime 已拥有 session、path、
  identity 与 receipt mechanics；installer/update 已采用 whole-file hash、backup、modified-file preserve
  语义，无需也不应新增 Hook registry、JSON merger 或状态存储。
- 当前 `templates/.omp-flow/scripts/common/active_task.py` 明确识别 `CODEX_THREAD_ID`，且
  `OMP_FLOW_CONTEXT_ID` 优先；Design 在 child environment 中移除后者并设置前者，能够避免继承 override
  把 SessionStart 绑定到错误 context。
- 当前 `src/cli/init.ts` 把 shared Skills 部署到 `.agents/skills`，同时仍把 Codex duplicate 部署到
  `.codex/skills`；`src/cli/update.ts` 只在 stored hash 等于 disk hash 时 auto-update/delete，否则保留为
  visible conflict。所选迁移与现有 ownership 模型相容。
- Design 对 handler 未启动与 handler 已启动但无法判断作了正确区分：orientation fail-soft；已启动的
  patch guard 对 malformed/unverifiable input deny；Python/runtime 继续是最终校验边界。

## Assumptions and strongest counter-evidence

- 假设目标 Codex build 保持研究记录的 `tool_input.command`、native output shape、POSIX shell command 与
  Windows `commandWindows` 行为。最强反证是这些仍需真实 CLI capture；Design 已把偏离闭合 input shape
  定义为 deny，并禁止在 smoke 之前宣称对应 coverage，因此未知没有形成错误 authority。
- 假设 `resolve(strict=False)`、platform-normalized containment 与 existing-symlink 检查会按 Design
  逐路径实现，而不是只做字符串前缀比较。验证矩阵已覆盖 absolute、UNC、drive-relative、`..`、case、
  symlink、move source/destination；实现偏差应由 work verification/review 拦截。
- 最强产品反方仍是“exact-owned Hook 会挤占已有用户 Hook，且 trust/opt-out 会让保护缺席”。Design 对
  foreign/modified file 选择 preserve + conflict，对未 trust/disabled/unsupported 选择明确 unavailable，
  并保留 Skill/CLI 降级；因此反方限制了声明范围，但没有使最小设计不可实现。

## Findings

### Advisory A1 — reused `session-start.py` must leave the obsolete set

Design 明确要求把 `.codex/hooks.json` 从 `OBSOLETE_MANAGED_PATHS` 移回 managed resources，但当前
`src/cli/init.ts` 也把 `.codex/hooks/session-start.py` 列为 obsolete，而正文没有同样明确写出该路径必须
移出 obsolete set。若实现只照字面移动 `hooks.json`，同一路径会同时出现在 managed 与 obsolete plan：
旧文件可先被 auto-update、随后又被 obsolete delete，留下引用缺失 handler 的 Hook 配置。

最小修复是在 work Concept/done condition 中明确：新增 managed resource 时，同时从 obsolete set 移除
`.codex/hooks/session-start.py` 和 `.codex/hooks.json`，并以 legacy unmodified update fixture 断言二者最终
存在且 hashes 正确。该问题不阻断本设计：handler 缺失会使 orientation unavailable，Skills/CLI 仍可用，
Hook 也不承担最终 authority；它是必须验证的迁移缺陷风险，而不是无法安全降级的核心架构失败。

### Advisory A2 — trust statement must distinguish definition review from script review

Hook definition hash 不保证递归覆盖被引用 script。README/update UX 若只提示 `/hooks` hash trusted，用户
可能误以为升级后的 Python handler 内容也已重新审阅。Design 已记录该风险并要求检查 actual scripts；
work map 应把这条文档断言与 update fixture/人工 smoke 分开验证。由于设计没有声称 installer 会写 trust
store 或自动激活 guard，当前不存在 decision-critical false authority。

### Residual verification risk

Windows launcher argv/quoting、含空格和非 ASCII repo、子目录启动，以及目标 build 的实际
`apply_patch` payload 尚未由真实 smoke 关闭。按照当前 Design，失败时 SessionStart 可安全 unavailable，
guard 对无法验证输入 deny，且未 capture surface 不获得正面 coverage 声明；所以这是后续验证义务，
不是 QbD 1 evidence blocker。

## Accepted risk

本次审计未发现已记录的人类风险接受决定。Design 自带的 Hook trust、coverage 与 smoke residual risks
仍需人类校准；不能从本次 PASS 推断接受。

## Exact next decision

需要人类在 linked decision Concept 中选择其一：

1. **批准当前 QbD 1 PASS**，将 A1/A2 和真实跨平台 smoke 写入 work map 的边界、done conditions 与
   verification，然后进入 Decompose；
2. 先返回 Design，显式补写 A1 的双路径 obsolete-to-managed 迁移约束，再决定是否进入 Decompose；
3. defer 或 stop 当前 Hook scope。

## Operation correlation

- Actor ID: `hook_qbd1`
- Dispatch receipt: `48869f6946b54af6a949570dae8e8fd8`
- Entry: `.omp-flow/tasks/08-01-codex-native-hooks/design.md`
- Output: `.omp-flow/tasks/08-01-codex-native-hooks/qbd/design-audit.md`
- Predecessor: none
