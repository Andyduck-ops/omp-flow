---
type: "Completion"
title: "init TUI 与 Git 名称修复完成"
---

# init TUI 与 Git 名称修复完成

## Result

`omp-flow@0.2.4` 恢复 TTY Banner 与 Inquirer checkbox；`-u/--user` 严格解析并只写当前
仓库 local `git user.name`。显式 Harness flags 保持非交互接口，dry-run 不写 Git 或项目文件，
未知、缺值、重复和互斥参数均在可见交互与副作用前失败。

独立初审发现并复现了互斥 flags 先写 Git 的问题；修复后独立复审 PASS。

## Final verification

- `npm run build` — PASS；
- `npm test` — PASS，378 focused checks；
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS；
- `npm pack --dry-run` — PASS，`omp-flow-0.2.4.tgz`，117 files；
- `git diff --check` — PASS（仅工作区既有 line-ending warnings）；
- 两次独立真实 tarball production install/bin smoke — PASS；production tree 含
  `inquirer@9.3.8`，打包 bin 可执行 `init -u <name> --codex` 并读回 local Git 名称与 Harness。

## Knowledge harvest

项目 Wiki `.omp-flow/wiki/knowhow/interactive-cli-contracts.md` 已记录依赖瘦身、主路径可达性、
npm tarball smoke，以及互斥参数必须早于所有副作用校验的可复用经验。
