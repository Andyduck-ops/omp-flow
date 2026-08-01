---
type: "Review"
title: "0.2.5 init Git bootstrap 与响应式 Banner 独立复核"
reviews: "../work/init-git-banner-patch.md"
handoff: "../work/init-git-banner-patch-handoff.md"
verdict: "PASS"
actor_id: "review-init-polish-v1"
receipt: "a5594941c38a47af87a0dc1232056c73"
predecessor_receipt: "01505623e6f747c79952811d1d906109"
---

# 0.2.5 init Git bootstrap 与响应式 Banner 独立复核

复核 [Work](../work/init-git-banner-patch.md) 及其
[Handoff](../work/init-git-banner-patch-handoff.md)，并对照 [PRD](../prd.md)、
[Design](../design.md) 与当前真实 diff。

## Verdict

**PASS** — 无 blocking、major 或 minor finding；要求范围全部满足，独立验证无失败。

## Findings

无。

## Scope and contract verification

- Git 副作用时序：显式 user 的 Git 检查/bootstrap/config 位于 Harness 成功选择之后；
  空选择和取消测试证明不会创建 `.git`。参数互斥校验位于 prompt 和 Git 之前。
- 副作用边界：`--dry-run -u` 仅输出预览，不调用 Git 写路径且不部署资源；
  无 `-u` 只做可选的用户名读取，不 bootstrap。
- Git 行为：无 Git 普通目录使用 `git init --quiet` 后写 `git config --local
  user.name`；已有 worktree 跳过 init 并仅更新 local name。默认 runner 使用
  `spawnSync('git', args)` 且 `shell: false`，用户输入没有 shell 拼接，不写 global config。
- 失败分类：Git 进程无法启动、`git init` 非零退出、local config 非零退出
  分别传播不同可操作错误；在这些失败下不写 omp-flow 资源。按 Design，init 已成功而
  config 失败时保留 `.git` 作为可诊断现场。
- 严格参数和兼容性：未知参数、意外位置参数、user 缺值/空值/重复和
  `force + skipExisting` 依旧 fail closed；TTY checkbox 与非 TTY 显式 Harness 合同保持。
- Banner：76 列精确命中五行 art，去除 ANSI 后六行可见宽度为
  `67,67,67,67,67,45`，均不溢出；52/28/27 列分别精确保留三行/两行/单行回退。
  颜色仍由既有 TTY/`NO_COLOR`/`FORCE_COLOR` 逻辑控制。
- 发布包：package 与 lock 均为 `0.2.5`，pack 清单为 117 files，包含新
  `dist/cli/init.js` 和 `dist/cli/banner.js`。从实际 tarball 仅安装 production dependencies 后，
  无 Git 目录执行 `init -u review-tarball-user --codex` 成功创建 `.git`，local name、
  `.omp-flow/config.json` 和 `.codex/config.toml` 均正确，且 runtime `inquirer` 已安装。
- 范围纯度：产品 diff 只涉及 init、Banner、直接测试、README 和版本。
  工作树中 `.omp-flow/.gitignore` 及 `templates/.omp-flow/scripts/common/disposition.py` 是既存无关修改，
  未用于支持本 Review 结论；Codex Hooks 明确不在本 Work 范围。

## Independent verification

- `npm run build` — PASS。
- `npm test` — PASS，`393 focused checks`。
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS。
- `npm pack --dry-run --json` — PASS，`omp-flow@0.2.5`，117 files。
- `git diff --check` — PASS。
- 彩色 76 列 Banner 渲染后去 ANSI 并计数可见字符 — PASS，最宽 67。
- 实际 `npm pack` → `npm install --omit=dev --ignore-scripts` → 无 Git 目录的 packaged CLI
  init smoke — PASS；安装版本 `0.2.5`、Git dir `.git`、local name
  `review-tarball-user`、Harness `codex`。

## Dispatch identity

- Reviewer actor: `review-init-polish-v1`
- Review receipt: `a5594941c38a47af87a0dc1232056c73`
- Predecessor receipt: `01505623e6f747c79952811d1d906109`
