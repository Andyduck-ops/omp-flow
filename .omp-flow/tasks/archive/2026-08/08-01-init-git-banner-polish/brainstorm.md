---
type: "Brainstorm"
title: "Brainstorm: 首次 Git 初始化与大 Banner"
---

# Brainstorm: 首次 Git 初始化与大 Banner

## 现场事实

- Linux 普通目录中 `omp-flow init -u sikjmyhre` 显示 Banner 后失败：`outside a Git worktree`；
- 用户手动 `git init` 后可继续，证明缺口只是首次 Git bootstrap；
- 80 列输出采用 `src/cli/banner.ts` 的三行 art，用户明确认为过小；
- `0.2.4` 已发布使用，因此补丁版本必须为 `0.2.5`。

## 选定方向

这是机械、低歧义修复，无需外部 Research：显式 `-u/--user` 表达了创建 repository-local
Git identity 的意图。在非 worktree 中，成功完成 Harness 选择后执行静默 `git init`，随后写
local `user.name`；dry-run 只报告，不创建 `.git`。Git 缺失或 init 失败继续显式失败。

Banner 在至少 76 列时使用五行大字，52–75 列保留现有三行版本，28–51 与更窄终端保留现有
降级。大字不是图片或外部字体依赖，继续由现有 Unicode/ANSI renderer 生成。

强反方是自动 `git init` 属于额外副作用；但它只在用户显式传 `-u` 且当前无 worktree 时发生，
否则 local Git 配置本身无法成立。无 `-u` 的 `omp-flow init` 不自动创建 Git 仓库。
