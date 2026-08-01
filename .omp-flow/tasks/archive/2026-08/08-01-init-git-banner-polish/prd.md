---
type: "PRD"
title: "0.2.5 首次 Git 初始化与响应式 Banner"
---

# 0.2.5 首次 Git 初始化与响应式 Banner

本补丁落实 [选定方向](finding.md)：让用户在普通目录直接执行
`omp-flow init -u <name>`，并让宽终端的品牌展示与可用空间匹配。

## 需求

- 显式传入 `-u/--user` 时，如果当前目录不在 Git worktree 内，必须在 Harness
  选择成功后静默执行 `git init`，再将用户名写入该仓库的 local
  `user.name`。
- 已有 Git worktree 的 `-u/--user` 路径继续只更新 local `user.name`，不重新初始化。
- 未传 `-u/--user` 时不得为普通目录自动创建 Git 仓库。
- `--dry-run -u <name>` 必须展示预览身份，但不创建 `.git`、不写 Git
  config，也不写 omp-flow 项目资源。
- Git 可执行文件缺失、`git init` 失败或 local config 写入失败必须显式报错，
  不制造 omp-flow identity 替代文件。
- Banner 按终端列宽选择四档：`>=76` 使用五行大字，`52–75` 保留现有三行字形，
  `28–51` 保留现有两行紧凑版，`<28` 保留现有单行版。
- 版本升至 `0.2.5`；现有严格 init 参数解析、TTY checkbox、非 TTY 显式
  Harness flags 和 Git 身份归属均保持不变。

## 验收标准

- 在无 `.git` 的临时目录选定 Harness 后执行 init，可观察到 `.git` 被创建、
  local `user.name` 等于输入值且 omp-flow 资源完成部署。
- 同一场景使用 `--dry-run`，命令完成预览后临时目录仍无 `.git`、
  `.omp-flow` 和 Harness 资源。
- 在已有仓库中执行时，仓库元数据保留且 local `user.name` 更新。
- 可控 Git 失败测试证明错误向上传递，且不会在 Harness 选择前创建 `.git`。
- 对 76、52、28、27 列的精确渲染测试分别命中五行、三行、两行、单行字形。

## 非目标

- 不为未显式传入 `-u/--user` 的用户推断创建 Git 仓库的意图。
- 不写 global Git config，不恢复 `.developer`、workspace 或其他退役 identity 状态。
- 不在本补丁中实现 Codex/OMP Hook parity，也不引入图片或字体运行时依赖。
