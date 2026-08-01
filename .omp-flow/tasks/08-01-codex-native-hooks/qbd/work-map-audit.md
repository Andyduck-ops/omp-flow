---
type: "QbD Audit"
title: "QbD 2: Codex native adapter work map"
---

# QbD 2: Codex native adapter work map

## Verdict

**PASS** — risk **medium**; blocking findings: **0**.

本结论只覆盖 [Work map](../work/index.md) 与其中唯一的
[native adapter Work](../work/codex-native-adapter.md)，并以已批准的 [PRD](../prd.md)、
[Design](../design.md)、[QbD 1 audit](design-audit.md) 和
[human QbD 1 decision](../decisions/qbd1-approved.md) 为边界。PASS 表示当前 authored work map 没有
未解决的 decision-critical finding；它不等于人类批准，也不自行授权 Execute。

## Audit boundary and decision challenged

本次只挑战五件事：批准范围是否完整落入 Work、文件所有权是否冲突、QbD 1 的 A1/A2 是否被带入、
验证是否可实现，以及实现与独立 Review 是否保持不同 actor 的边界。没有重新挑战已批准架构，也没有
拆分 Work、增加事件、扩大平台声明或引入新状态。

不可接受后果是：实现遗漏使 managed Hook 又被 obsolete 删除；覆盖 foreign/modified 用户文件；把
Hook trust 或未执行的平台 smoke 写成已证实 coverage；无法验证 runtime path 时放行；或让实现者以
自己的 handoff/tests 代替独立 Review。

## Confirmed evidence

- [Work map](../work/index.md) 将 installer ownership、canonical/deployed Hook resources、Skill
  migration、tests、docs 与 patch version 作为一个可发布行为处理。当前组件共享同一 managed-resource
  列表和迁移结果；强行拆分会制造中间态引用缺失，因此一个 bounded Work 是合理边界，而不是遗漏排序。
- [Work Concept](../work/codex-native-adapter.md) 覆盖 PRD/Design 的全部当前范围：`src/cli/init.ts`、
  `templates/codex/**` 及 owned deployed copies、approved `.codex/skills/**` removal、直接相关 tests、
  README/Wiki、package metadata 和 linked handoff。它同时明确排除 observer、额外事件、plugin、foreign
  JSON merge、lifecycle state 与未经 capture 的 parity 声明。
- 文件所有权与现有实现相容：Codex managed resources 与 `OBSOLETE_MANAGED_PATHS` 都由
  `src/cli/init.ts` 导出，`src/cli/update.ts` 消费这些定义执行既有 whole-file hash、backup、preserve、
  overwrite/delete plan；Work 无需拥有或重写 update engine。未相关 dirty files 也被显式排除。
- A1 已被逐路径带入：`.codex/hooks.json` 与 `.codex/hooks/session-start.py` 必须一起从 obsolete set
  移入 managed resources，`protect-runtime.py` 新增为 managed；legacy update done condition 明确禁止
  “先 managed update、再 obsolete delete”，并要求最终文件存在。
- A2 已被带入 README/Wiki 与验收边界：文档必须区分 Hook definition hash review 与 referenced
  script review，说明 `/hooks`、disabled/untrusted fallback 和 coverage limit；未运行的 surface 不获得
  正面声明。
- Verification 同时包含 focused handler fixtures、installer/update/package contracts、当前可用的
  POSIX/Windows launcher smoke，以及 compile/build/full tests/pack/diff gates。handoff 必须记录 exact
  commands、results、未运行项及原因，因此尚未取得的实践证据不会被静默当作成功。
- [Work map](../work/index.md) 要求完成后由不同 actor 读取 handoff、真实 diff 与测试结果并写 linked
  Review Concept；Work 的 expected handoff 还要求 actor ID 与 operation receipt，从 authored evidence
  和 mechanical correlation 两侧保留独立复核边界。

## Assumptions and strongest counter-evidence

- 假设实现操作会遵守 Work 的 allowed boundary，并由后续 review operation 以 completed predecessor 和
  不同 actor 进行机械关联。最强反证是 Work 没有预先固定 Review 文件名；但 linked Review Concept 的
  内容和输出边界应由实际 review assignment 产生，预先制造路径不会增强独立性。
- 假设 focused fixtures 能在现有 TypeScript test harness 或独立 Python fixture 中接入，而不需要改动
  产品边界。当前已有 installer test surface，两个 handler 又是 stdlib-only stdin/stdout 程序；Work
  允许直接相关的 `tests/**`，所以验证路径可实现。
- 最强实践反证仍是目标 Codex build 的 Windows argv/quoting、POSIX command、Hook trust 和实际
  `tool_input.command` wire shape 尚未 capture。Work 没有把未知写成成功：可用 host 必须 smoke，未运行
  surface 必须记录且不得获得正面声明；SessionStart 可 fail-soft，无法验证的 guard input 必须 deny，
  runtime 保持最终 authority。因此该未知限制发布声明，但不使当前 Work 不可安全实现。

## Findings

### No blocking findings

没有发现 scope gap、ownership collision、A1/A2 丢失、不可实现的核心验证路径或自审替代独立 Review。
所有可能导致错误 authority 或 runtime fail-open 的后果，都已由 preserve/conflict、deny、unavailable、
不宣称 coverage 或不同 actor Review 约束为可安全降级路径。

### Advisory — preserve platform evidence granularity in the handoff

handoff 应按 Work 已规定的格式，把 fixture 结果、真实 launcher command smoke、`/hooks` trust/manual
observation 和未运行 surface 分开记录。原因是 fixture 或 definition review 不能替代目标 build 的 argv、
wire payload 与 script 内容观察。该建议不新增 scope：Work 已要求 exact commands/results/unrun reasons，
Design 也已禁止对未 capture surface 作正面声明。

## Accepted and residual risk

[Human QbD 1 decision](../decisions/qbd1-approved.md) 已接受在实现中携带 A1/A2 与 Linux/Windows smoke
义务，但没有接受任何 false-authority、用户配置越权或 fail-open blocker。当前残余风险仍是某个平台或
目标 Codex build 的真实 Hook 行为可能与 fixture 不同；允许的结果是修正范围内 launcher/fixture，或对
未证实 surface 明确 unavailable/不声明 coverage。若实践证据显示无法安全降级的核心失败，则必须停止
并重新进行人类校准。

## Exact next decision

需要人类选择并记录其一：

1. **批准当前 QbD 2 PASS**，按唯一 Work 进入 implementation，并在完成后派发 completed-predecessor、
   different-actor 的独立 Review；
2. 要求在 Execute 前仅修订现有 Work 的验证表述或 handoff 证据粒度，再决定是否实施；
3. defer 或 stop 当前 Hook scope。

## Operation correlation

- Actor ID: `hook_qbd2`
- Dispatch receipt: `931f61ce5a864baca9dac81c87b9a731`
- Entry: `.omp-flow/tasks/08-01-codex-native-hooks/work/index.md`
- Output: `.omp-flow/tasks/08-01-codex-native-hooks/qbd/work-map-audit.md`
- Predecessor: none
