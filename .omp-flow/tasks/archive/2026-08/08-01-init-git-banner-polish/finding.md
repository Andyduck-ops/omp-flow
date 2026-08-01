---
type: "Selected Synthesis"
title: "首次初始化与响应式 Banner 修复方向"
---

# 首次初始化与响应式 Banner 修复方向

[Brainstorm](brainstorm.md) 与现有代码已经给出实现所需证据。选择以下合同：

- `-u/--user` + 非 Git worktree + 非 dry-run：Harness 选择成功后静默 `git init`，再写 local name；
- 同一路径 dry-run：不创建 `.git`、不写项目文件，只显示预览身份；
- Git executable 缺失或 `git init`/local config 失败：清晰失败，不制造 omp-flow identity 文件；
- ≥76 列：五行大 Banner；52–75 列：原三行 Banner；更窄保持原降级；
- `0.2.5`，测试覆盖普通目录 bootstrap、dry-run、已有 repo、失败副作用与四档宽度。

Codex Hook parity 是本轮同时发现的独立 Adapter 议题，不混入该发布补丁。
