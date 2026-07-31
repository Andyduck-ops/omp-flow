---
type: "Handoff"
title: "恢复 init 交互与 Git 名称实现交接"
---

# 恢复 init 交互与 Git 名称实现交接

Status: **DONE**

Implements [恢复初始化交互与 Git 名称](restore-init-experience.md).

## Delivered

- `src/cli/index.ts` 新增严格的 init-only parser，支持 `-u/--user`、Harness flags 和既有
  init flags；缺值、空名称、重复 user、未知 option、位置参数以及互斥的
  `--force --skip-existing` 在 Banner 和副作用前失败。
- `src/cli/init.ts` 用 Inquirer checkbox 取代逗号 readline；新项目默认全选，已有配置默认
  勾选当前 Harness，显式 flags 绕过 prompt，非 TTY 无 flags 继续 fail closed。prompt 只通过
  一个最小 adapter seam 注入。
- TTY init 主路径展示现有 responsive Banner；非 TTY 保持无装饰输出。
- `-u/--user` 先验证 Git worktree，再用参数数组写当前仓库 `git config --local user.name`；
  dry-run 只 preflight/展示，不修改 Git 或项目文件。未创建身份文件或 workspace。
- package/lockfile 升至 `0.2.4`，恢复 `inquirer@^9.3.7` runtime dependency，并加入纯开发期
  `@types/inquirer`。
- README、交互 CLI Wiki 和直接测试覆盖同步更新。

## Changed files

- `src/cli/index.ts`
- `src/cli/init.ts`
- `package.json`
- `package-lock.json`
- `tests/init-cli.test.ts`
- `tests/omp-flow.test.ts`
- `README.md`
- `.omp-flow/wiki/knowhow/interactive-cli-contracts.md`
- this handoff

## Verification

- `npm run build` — PASS
- `npm test` — PASS, 378 focused checks（含 init parser、prompt defaults/空选/取消/绕过、
  Git local/dry-run/仓库外、TTY Banner 与非 TTY）
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS
- `npm pack --dry-run` — PASS, `omp-flow-0.2.4.tgz`, 117 files
- `git diff --check` — PASS（仅既有 CRLF conversion warnings）
- 真实 tarball smoke — PASS：`npm pack` 后以 `npm install --omit=dev` 安装；production tree
  含 `omp-flow@0.2.4 -> inquirer@9.3.8`；npm bin 执行
  `init -u package-smoke --codex` 成功，local Git name 回读为 `package-smoke`，Harness config
  回读为 `codex`。

## Decisions and caveats

- 保留 Git 为唯一开发者名称 authority；没有恢复 Trellis 的 `.developer` 或 workspace 状态层。
- 保留显式 Harness flags 作为自动化接口；成熟依赖是产品交互的一部分，不因依赖数量删除。
- 仓库原有无关脏改动均未触碰。烟测目录位于已忽略的 `.test-omp-flow-workspace/`；验证后
  环境策略拒绝递归清理命令，因此三个 `init-0.2.4-*` 临时目录仍在，但不会进入 Git 或 npm 包。

## Independent review repair

[独立 Review](../review/restore-init-experience-review.md) 发现初版会在
`--force --skip-existing` 的部署冲突报错前先写 local Git name。修复后：

- CLI parser 直接拒绝互斥 flags，因此 TTY Banner 尚未输出；
- `interactiveInit()` 和 `deployInitResources()` 也在入口执行同一校验，直接调用不会绕过；
- 回归测试从 local `user.name=before` 开始，证明 CLI/direct 两条路径均不调用 prompt、不写
  `.omp-flow`，且 Git name 保持 `before`；
- repair 后 `npm run build`、`npm test`（378 checks）和 scoped `git diff --check` 通过。

Initial actor ID: `implement-init-tui-v1`

Initial dispatch receipt: `bd947a72ca364aa4976a5c4614c02528`

Repair actor ID: `implement-init-tui-v2`

Repair dispatch receipt: `bf51902c5b6b4ab8bfb3acb3bded8bb9`

Repair predecessor receipt: `fc5e34f3bf6e4874912ac808e9437be5`
