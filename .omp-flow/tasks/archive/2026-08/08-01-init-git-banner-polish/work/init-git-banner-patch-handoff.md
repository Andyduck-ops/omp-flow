---
type: "Handoff"
title: "0.2.5 init Git bootstrap 与响应式 Banner 实现交接"
implements: "init-git-banner-patch.md"
status: "DONE"
actor_id: "implement-init-polish-v1"
receipt: "01505623e6f747c79952811d1d906109"
---

# 0.2.5 init Git bootstrap 与响应式 Banner 实现交接

实现 [完成首次初始化与宽屏品牌展示](init-git-banner-patch.md)，状态：`DONE`。

## Changed files

- `src/cli/init.ts`
  - 将 Git 副作用移到 Harness 成功选择之后；
  - 显式 user 且非 dry-run 时，先用无 shell Git runner 检查 worktree；普通目录执行
    `git init --quiet`，然后写 local `user.name`；
  - Git 启动、init、local config 失败均带可操作错误向上传播；
  - dry-run、取消/空选择和无 user 路径不 bootstrap Git。
- `src/cli/banner.ts`
  - 新增 `>=76` 列五行 `OMP ◆ FLOW` 大字；保留 52/28/27 列已有回退合同；
  - 最宽无色渲染的所有行均不超过 76 个字符，沿用既有渐变与颜色判定。
- `tests/init-cli.test.ts`
  - 覆盖真实 no-Git bootstrap、选择前无副作用、existing repo、dry-run、无 user、
    Git 启动/init/config 失败以及部署完成。
- `tests/omp-flow.test.ts`
  - 精确覆盖 76、52、28、27 列四档 Banner 和 76 列不溢出。
- `README.md`
  - 说明 `-u/--user` 会在 Harness 选择成功后按需静默 `git init`，dry-run 不创建 `.git`。
- `package.json`、`package-lock.json`
  - 版本同步为 `0.2.5`；runtime dependency 合同未改变。

## Verification

- `npm run build` — PASS。
- `npm test` — PASS，`393 focused checks`。
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS。
- `npm pack --dry-run` — PASS，生成清单标识 `omp-flow-0.2.5.tgz`，117 files。
- `git diff --check` — PASS。
- package、lock root 与 lock package entry 三处版本检查 — PASS，均为 `0.2.5`。
- production tarball smoke — PASS：从临时 tarball 仅安装生产依赖，在普通无 Git 目录执行
  `omp-flow init -u tarball-user --codex`，验证 `.git`、local `user.name`、
  `.omp-flow/config.json` 与 `.codex/config.toml` 均存在且正确。

## Decisions and caveats

- Git runner 作为 `InitOptions` 的可选测试接缝；默认生产实现仍固定调用 `spawnSync('git',
  args)`，`shell: false`，没有字符串拼接或 global config 写入。
- 成功 `git init` 后若 local config 失败，不删除 `.git`，遵循 Design 的可诊断现场与非破坏性边界。
- 未修改 Codex/OMP Hook、Harness Adapter、Flow Status 或 identity 状态模型。
- 工作树中既存 `.omp-flow/.gitignore`、`templates/.omp-flow/scripts/common/disposition.py`
  修改及其他未跟踪 Bundle 未纳入本实现。
- 生产烟测临时目录位于 OS temp；执行环境策略拒绝递归清理，但它不在仓库内，也不影响产物。

## Dispatch identity

- Actor ID: `implement-init-polish-v1`
- Receipt: `01505623e6f747c79952811d1d906109`
- Output: `.omp-flow/tasks/08-01-init-git-banner-polish/work/init-git-banner-patch-handoff.md`
