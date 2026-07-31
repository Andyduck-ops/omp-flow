---
type: "Reference"
title: "Trellis init 交互与开发者身份"
---

# Trellis init 交互与开发者身份

- Repository: https://github.com/mindfold-ai/Trellis.git
- Revision: `51a5674ce6ce5a12cb585c5dcb21e7b76a51bdbc`
- Local read-only source: `reference/Trellis`

## 有用锚点

- [`packages/cli/src/cli/index.ts`](https://github.com/mindfold-ai/Trellis/blob/51a5674ce6ce5a12cb585c5dcb21e7b76a51bdbc/packages/cli/src/cli/index.ts)：
  `init` 用 Commander 声明平台 flags、`-y`、`-u/--user <name>` 及严格 option 语义。
- [`packages/cli/src/commands/init.ts`](https://github.com/mindfold-ai/Trellis/blob/51a5674ce6ce5a12cb585c5dcb21e7b76a51bdbc/packages/cli/src/commands/init.ts)：
  首次初始化在无显式平台 flags 时使用 Inquirer `checkbox`；显式 flags 直接选定平台；
  `options.user` 优先，否则读取 `git config user.name`，缺失时才询问。
- `packages/cli/package.json`：当前使用 `inquirer ^9.3.7`、`chalk`、`figlet`、`commander`。

## 适配边界

采用成熟 checkbox、flags 优先、Git identity fallback 和严格 option 的交互模式。不照搬
Trellis `.developer` 与 `workspace/<name>`，因为 omp-flow 当前 Bundle/runtime 所有权已明确
退役该状态层。Git 本地配置本身足以承载本次 `-u` 语义。
