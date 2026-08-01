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

## 第一性锚定

主要矛盾不是“三个平台目录长得不一样”，而是 Codex 缺少自动、结构化、可审查的机械观测与
保护入口。目标是平台能力对等，而不是逐文件复制 Claude Hook。

## 后续研究问题

- 哪些 Codex events/payload 能提供结构化 task、attention、subagent 与 session correlation；
- 哪些边界属于 fail-closed（runtime 写保护、dispatch identity），哪些必须 fail-soft（状态展示）；
- project Hook 的首次 trust UX、升级 hash 变化和用户自有 Hook 合并策略；
- 使用 `.codex/hooks.json`、inline config 还是可安装 plugin 的最小可维护边界；
- 如何验证 Linux/Windows、CLI/IDE，以及 Hook 不可用时的显式降级。

不把 Hook 当作语义工作流数据库，不从 Markdown、目录或角色推断 phase/verdict/task meaning。
