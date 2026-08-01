---
type: "PRD"
title: "Native Codex Skill and Hook integration"
---

# Native Codex Skill and Hook integration

## Outcome

`omp-flow init/update --codex` 按 Codex 当前原生规范安装共享 Skills 和一个薄 Hook Adapter：
Project Skills 只通过 `.agents/skills` 发现，`.codex/hooks.json` 提供可审查的 session 定向与
runtime patch 保护。Hook 未信任、被禁用或不受当前 surface 支持时，工作流仍可通过 Skills 与
稳定 CLI 使用，并且文档不宣称保护或自动状态可用。

## Requirements

- Codex 资源不再创建 `.codex/skills/<name>/SKILL.md`；既有未修改的 managed duplicate 在
  `update` 中按现有 obsolete/hash 规则可逆清理，用户修改内容保持冲突可见且不删除。
- `.agents/skills` 继续是 shared Skill canonical deployment，内容仍来自
  `templates/common/skills`，Claude 与 Oh My Pi 的原生 Skill 根不受影响。
- 新安装在目标不存在时写入 exact-owned `.codex/hooks.json` 和所引用的 Codex Hook scripts；
  foreign 或用户修改的同路径文件在普通 init/update 中不得被覆盖、解析合并或静默信任。
- Hook 配置只注册 `SessionStart(startup|resume|clear|compact)` 和
  `PreToolUse(apply_patch)`，同一 `.codex` layer 不增加 inline `[hooks]`。
- SessionStart 使用结构化 `session_id`/`cwd` 与现有 runtime `status` 输出 path-only mechanical
  orientation；不得解析 Markdown、prompt、transcript 或推断 Task/Flow/approval/verdict。
- Runtime guard 从结构化 `apply_patch` 输入提取 patch file paths；命中
  `.omp-flow/.runtime/` 时返回 Codex 当前原生 deny shape，普通源码和 Bundle Concept patch 放行。
- Hook payload malformed、路径越界或 guard 自身无法验证时 fail closed；Session orientation
  或展示不可用时 fail soft，并提供短且明确的 unavailable 信息。
- POSIX 与 Windows 使用各自明确的 command/`commandWindows`，支持从 repository 子目录启动，
  repository path 含空格或非 ASCII 字符时脚本仍能定位 Git root。
- README、Wiki 与验证命令说明 Hook trust/hash review、`/hooks` 操作、Hook coverage 限制和
  `$flow-status`/CLI 降级路径。

## Non-goals

- 不新增 lifecycle database、Markdown parser、generated context、第二套 status cache 或 renderer。
- 不恢复历史 `UserPromptSubmit` / `inject-workflow-state.py`。
- 不从 `PostToolUse`、Subagent、Stop 或 transcript 合成 native task total、Work progress 或
  reviewer acceptance。
- 不把 Hook 当 OS sandbox、唯一 authorization boundary，或声称覆盖 hosted/specialized tools。
- 本轮不打包 Codex plugin，不修改 stock Codex `tui.status_line`，不承诺未经 capture 的 IDE/App
  parity。

## Acceptance

- Fresh Codex install 只有一份可发现的 omp-flow Project Skill，并包含 exact-owned Hook 文件。
- Focused Hook fixtures 证明 startup/resume/clear/compact 定向、runtime add/update/delete/move deny、
  普通 patch allow、malformed fail-closed，以及 UTF-8/space/subdirectory path 行为。
- Init/update fixtures 证明 foreign Hook preserve、managed Hook idempotence、modified Hook preserve、
  unmodified `.codex/skills` duplicates cleanup 和 modified duplicate preservation。
- `python -X utf8 -m compileall`、build、focused/full tests、pack dry-run 与 `git diff --check` 全部通过。
- Packaged tarball 含 Codex Hook canonical resources，不再含 `.codex/skills` deployment source 的
  Harness-specific副本。
