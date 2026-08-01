---
type: "Brainstorm"
title: "Brainstorm: Codex Native Hook Adapter"
---

# Brainstorm: Codex Native Hook Adapter

## 已确认现状

- Claude Adapter 安装 `.claude/hooks/*.py` 并通过 `settings.json` 绑定生命周期；
- Oh My Pi 没有同名 hooks 目录，但 package extension 在
  `src/omp/extension-entry.ts` 注册 `session_start`、`tool_call`、`context`、
  `session_compact` 和 `agent_end`，属于平台原生等价接入；
- Codex Adapter 当前只有 project config、agents 与 skills。README 明确把 Flow Status 限制为
  按需 `$flow-status` / `status inspect`，没有自动 observer；
- 当前 Codex 官方支持项目级 `.codex/hooks.json` 或 `config.toml [hooks]`，事件包括
  `SessionStart`、`PreToolUse`、`PostToolUse`、`PreCompact/PostCompact`、`SubagentStart/Stop`、
  `Stop` 与 `SessionEnd`，并要求项目信任及 Hook hash 审阅。

官方入口：https://learn.chatgpt.com/docs/hooks

## 第一性锚定（经实践检验修订）

主要矛盾不是“三个平台目录长得不一样”，也不是 Codex 平台缺少 Hook。Codex Hooks 已经是
Stable 且默认开启；真正的问题是 omp-flow 尚未接入这个原生入口，同时把 Codex Project Skill
重复部署到了非官方的 `.codex/skills`。目标是让每个 Harness 使用自己的原生 Skill/Hook/
extension 规范获得能力对等，而不是逐文件复制 Claude Hook。

不可约结果是：Codex 使用 `.agents/skills` 发现共享方法论，使用受信任项目中的
`.codex/hooks.json` 承载薄机械适配；Hook 可缺席、可被禁用、可因 hash 未信任而跳过，因此只能
作为 defense-in-depth 与定向入口，不能成为唯一授权边界或语义状态机。

最强反方是“不应增加 Codex Hook，因为 trust、跨平台命令和不完整 tool coverage 会造成虚假
安全感”。该反方成立一半：因此最小范围只保留有明确事件契约和可测试降级的 session 定向与
`apply_patch` runtime 写保护；不做 prompt/transcript 解析，不从 subagent/Stop 推断工作流含义，
不宣称覆盖 hosted/specialized tool path。

## 研究结论与选择

- [内部 Harness 契约](research/internal-harness-contracts.md)确认现有 runtime、Agent、状态读取和
  Bundle 语义无需重建；历史 `UserPromptSubmit` 状态注入不得复活。
- [原生平台规范](research/native-platform-specs.md)确认 Codex 官方 Project Skill 根是
  `.agents/skills`，Project Hook 可用 `.codex/hooks.json` 或 inline `[hooks]`，同层不应混用；
  plugin 对当前项目本地交付没有额外价值。
- 选择 `.agents/skills` 单一 Codex Skill 入口和 exact-owned `.codex/hooks.json`。已有 foreign
  Hook 文件时普通 init/update 不覆盖、不自动合并；用户修改的 managed Hook 也保持冲突可见。
- 选择最小事件集：`SessionStart(startup|resume|clear|compact)` 注入 path-only mechanical
  orientation，`PreToolUse(apply_patch)` 拒绝直接修改 `.omp-flow/.runtime/`。
- 暂不实现 native task total、PostToolUse observer、SubagentStart/Stop correlation 或 SessionEnd
  清理；缺少 complete baseline、不可撤销副作用或短 advisory timeout 时，它们不会改善当前
  核心结果。

## 已关闭与保留的验证问题

- 已关闭：Codex 事件足以提供 session/tool/subagent correlation；`PreToolUse` 可 deny，但不是完整
  enforcement；`.codex/hooks.json`、inline 和 plugin 会组合加载且非受管 Hook 需要 hash trust。
- 保留验证：Linux/Windows 命令、空格/非 ASCII 路径、子目录启动、malformed payload、普通
  Bundle patch、runtime patch，以及 foreign/modified Hook 的 init/update 行为。
- 保留产品限制：当前只对官方明确支持的 CLI 行为做正面承诺；IDE/App 若未完成真实 capture，
  文档必须标为未验证，而不是推断 parity。

不把 Hook 当作语义工作流数据库，不从 Markdown、目录或角色推断 phase/verdict/task meaning。
