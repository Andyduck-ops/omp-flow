---
type: "Task"
title: "恢复 init TUI 与 Git 用户初始化"
---

# 恢复 init TUI 与 Git 用户初始化

Task directory: `08-01-restore-init-tui-git-user`.

修复 `omp-flow@0.2.3` 初始化体验回归：TTY 中恢复艺术 Banner 与键盘多选 Harness，恢复
`-u/--user <name>` 的 Git 身份初始化语义，并为非交互调用保留显式 Harness flags。

目标补丁版本为 `0.2.4`。不恢复已退役的 `.developer`、`workspace/<name>` 或生命周期状态。
