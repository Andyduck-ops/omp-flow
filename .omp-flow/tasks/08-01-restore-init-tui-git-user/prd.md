---
type: "PRD"
title: "恢复 init TUI 与 Git 用户初始化"
---

# 恢复 init TUI 与 Git 用户初始化

## 问题

`omp-flow@0.2.3` 的 `init` 首次体验退化成手写英文逗号列表，艺术 Banner 又只在 help
可达；同时 `-u/--user` 和未知参数会被静默忽略。Linux 用户因此既看不到已设计的初始化
界面，也无法按 Trellis 已形成的命令习惯初始化当前 Git 仓库名称。

## 目标体验

运行 `omp-flow init -u sikjmyhre` 时：

1. TTY 显示现有 responsive 艺术 Banner；
2. 未给 Harness flags 时出现 `omp`、`codex`、`claude` 的键盘 checkbox，多选后回车确认；
3. `sikjmyhre` 写入当前仓库的 local `git config user.name`；
4. 选中的项目资源按现有 init 计划部署，并给出原有逐项结果与完成提示。

显式 `--omp`、`--codex`、`--claude` 继续绕过 selector，供自动化和快速初始化使用。非 TTY
且没有显式 Harness flags 时继续失败并提示 flags，不猜测默认值。

## 产品要求

- `-u <name>` 与 `--user <name>` 等价；名称缺失或 trim 后为空时失败。
- `-u` 只修改当前仓库 local `user.name`，不修改 global/system Git 配置。
- 未传 `-u` 时可读取并显示现有有效 Git 名称，但不复制到 omp-flow 文件。
- `--dry-run -u <name>` 只预览资源部署，不修改 Git 配置或项目文件。
- 未知 init option 或多余位置参数必须在交互和写入前失败。
- checkbox 默认勾选已有 Harness 配置；新项目默认勾选全部三个 Harness。空选择失败。
- 现有 `--force`、`--skip-existing` 及显式 Harness flags 行为保持。
- package 版本更新到 `0.2.4`，发布物带上交互运行时依赖。

## 不在范围

- 不创建 `.developer`、`workspace/<name>`、runtime identity 或新的身份配置文件；
- 不把个人身份加入 Git 跟踪的 `.omp-flow/config.json`；
- 不重做 Banner 字形、update、Flow Status 或其他命令的参数系统；
- 不实现自有 raw-mode TTY 控件。

## 验收

- Linux/macOS/Windows 支持的普通 TTY 中可用方向键、空格和回车完成 Harness 多选；
- `omp-flow init -u alice --codex` 无交互完成，并可由 `git config --local user.name` 读回
  `alice`；
- `omp-flow init --wat`、`omp-flow init -u` 与非 TTY 裸 `init` 均在产生副作用前清晰失败；
- `npm test` 覆盖参数、prompt adapter、Git local scope 和现有初始化回归；
- build、Python compile、pack dry-run 与 `git diff --check` 通过。
