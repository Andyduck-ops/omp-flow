---
type: "Work"
title: "恢复初始化交互与 Git 名称"
---

# 恢复初始化交互与 Git 名称

## Objective

实现 [PRD](../prd.md) 与 [Design](../design.md) 的完整 `0.2.4` 补丁，使 npm 安装后的
`omp-flow init -u <name>` 在 TTY 中显示 Banner 和成熟 checkbox，并把名称写入当前仓库
local Git 配置。

## Scope

- `src/cli/` 中 init 参数、交互与 Git boundary；
- `package.json` / lockfile 的版本和 Inquirer runtime dependency；
- `tests/` 的参数、prompt、Git、dry-run 与回归覆盖；
- CLI 使用说明与项目 Wiki `.omp-flow/wiki/knowhow/interactive-cli-contracts.md`；
- expected handoff: `work/restore-init-experience-handoff.md`。

不创建身份文件、workspace、自定义 raw-mode TUI 或通用参数框架；不修改其他命令行为。

## Done and verification

- `-u` / `--user`、未知参数、缺值、重复值和显式 Harness flags 有直接测试；
- 注入 prompt adapter 验证 defaults、选择、空选择与绕过交互；
- 临时 Git repo 证明只写 local `user.name`，dry-run 不写，仓库外失败；
- build、npm test、Python compile、pack dry-run、diff check 通过；
- 从生成 tarball 做 production install/bin smoke test，证明 npm 会安装交互依赖。
