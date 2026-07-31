---
type: "Selected Synthesis"
title: "初始化回归与 Trellis 适配"
---

# 初始化回归与 Trellis 适配

## 内部证据

- `src/cli/init.ts:resolveInteractiveHarnesses` 使用 `readline.question` 和 `split(',')`，因此
  TTY 也只是文本协议；全角逗号被当作一个未知 Harness。
- `src/cli/index.ts:runCLI` 只在 `help` 的 `printHelp()` 调用 `renderCliBanner()`；`init`
  分支直接进入 `interactiveInit()`，所以发布的艺术 Banner 不可能出现。
- `src/cli/index.ts:selectedHarnesses` 只检查三个 long flags；`-u` 和其他未知参数没有验证，
  因而被静默忽略。
- `src/cli/harness.ts:HarnessConfig` 只保存 Git 跟踪的项目 Harness 选择；把个人开发者身份
  写进去会造成团队成员互相覆盖。
- npm registry 显示 `omp-flow@0.2.0` 曾依赖 `inquirer`、`figlet`、`chalk`、`commander`；
  `0.2.2/0.2.3` dependencies 为空。用户升级时观察到 `removed 57 packages`，与交互依赖
  被裁掉一致。

## 外部证据

[Trellis Reference](../reference/trellis-init.md) 在当前 revision 继续使用：

- TTY checkbox 选择平台；
- 显式 platform flags 绕过交互；
- `-u/--user` 优先，随后回退 `git config user.name`；
- CLI parser 对 option 有声明，不会静默吞掉未知参数。

## 综合判断

证据**确认**第一性锚：这不是 Linux、Unicode 分隔符或用户操作问题，而是瘦身重构把产品
交互当成内部依赖一起删除，后续 Banner 又只接到 help，形成“组件存在但主路径不可达”。

选择恢复 `inquirer@^9.3.7` checkbox，而不是自写 raw-mode 键盘循环。后者表面零依赖，
实际会重新承担 Windows/Linux TTY、取消、重绘、Unicode 和测试注入等成熟库已解决的问题。

身份语义采用 Git 单一事实源：显式 `-u` 执行 repository-local `git config user.name`；未传
时只读取现有有效值。不创建 `.developer`、workspace、runtime identity 或 config.json 个人
字段。这个适配保留用户可见设计，同时服从当前架构边界。

## 验证义务

- 交互选择可以通过注入 prompt adapter 测试选择结果、取消和空选择；
- CLI 测试覆盖 `-u`、long form、缺值和未知 option；
- fresh temporary Git repo 验证 `-u` 只写 local `user.name`；
- explicit Harness flags 与非 TTY fail-closed 路径保持；
- `init` 输出 Banner，窄终端仍使用现有 responsive 版本；
- `npm pack --dry-run` 包含新依赖/构建产物，版本更新到 `0.2.4`。
