---
type: "Design"
title: "0.2.5 Git bootstrap 与 Banner 宽度分流"
---

# 0.2.5 Git bootstrap 与 Banner 宽度分流

## 组件与所有权

- `src/cli/index.ts` 继续负责严格解析 init 参数与 TTY Banner 触发，无需改变参数合同。
- `src/cli/init.ts` 负责 Harness 选择后的 Git 预检、bootstrap 和 local
  `user.name` 写入。Git 仍是身份的单一事实源。
- `src/cli/banner.ts` 继续是纯渲染器；新增内嵌五行 Unicode art，不读写文件或调用外部进程。

## init 数据流

1. 解析并验证所有 CLI 参数；互斥、缺值和未知参数在任何副作用前失败。
2. 使用显式 flags 或 TTY checkbox 获得至少一个 Harness。取消或空选择不创建 Git 仓库。
3. 正规化显式 user name。若为 dry-run，跳过所有 Git 写操作，仅将它用于预览输出。
4. 非 dry-run 且有 user name 时，通过无 shell 的 `spawnSync` 检查当前目录：
   - 已在 worktree 内：直接继续；
   - 不在 worktree 内且 Git 可调用：执行 `git init --quiet`；
   - 进程无法启动或 init 非零退出：带 stderr 摘要抛出错误。
5. bootstrap 成功后执行 `git config --local user.name <name>`；写入失败显式报错。
6. Git 身份路径成功后，按现有 plan/deploy 合同部署 omp-flow 资源。

不尝试回滚已成功的 `git init`：`.git` 是用户显式 `-u` 意图下的目标副作用，
删除它比保留可诊断现场更危险。但在 Git 成功前不部署 omp-flow 资源，避免伪造完成状态。

## Banner 渲染

`renderCliBanner({ columns, color })` 保持纯函数界面，仅增加最宽档：

| 列宽 | 输出 |
|---|---|
| `>=76` | 五行 `OMP` + connector + `FLOW` 大字，加现有 tagline |
| `52–75` | 现有三行 art，加 tagline |
| `28–51` | 现有两行紧凑版 |
| `<28` | 现有单行版 |

五行字形使用现有 ANSI 着色和渐变函数；`NO_COLOR`、`TERM=dumb`、
`FORCE_COLOR` 和非 TTY 行为不变。每个字符行在 76 列窗口内必须完整容纳。

## 错误与兼容性

- 用户可操作的 Git 错误包含是否无法启动、init 失败或 local config 失败；
  不吞掉 stderr，不调用 shell 拼接用户名。
- 已有仓库、无 `-u`、非 TTY 和所有现有宽度档位是兼容性基线。
- npm runtime dependency 策略不变；本设计不为 Banner 添加字体库。

## 验证

- 单元测试覆盖 Git worktree 检测、静默 bootstrap、existing-repo、dry-run 和失败传播。
- CLI 测试覆盖 Harness 选择发生在 Git 副作用之前，以及无 `-u` 不 bootstrap。
- Banner 快照/精确字符串测试覆盖 76、52、28、27 列和无色模式。
- 完整执行 TypeScript build、项目测试、`npm pack --dry-run`、Python compile 与
  `git diff --check`，再做一次从生产 tarball 安装的无 Git 目录 init smoke。

## 拒绝的替代方案

- **继续要求用户先 `git init`**：与首次 init 的产品语义相冲突。
- **无条件创建 Git 仓库**：没有 `-u` 时缺少明确意图，副作用过宽。
- **写 global Git identity 或 omp-flow identity 文件**：违反 repository-local
  单一事实源。
- **引入 figlet/图片资源**：固定五行字形足以满足需求，新依赖没有额外价值。
