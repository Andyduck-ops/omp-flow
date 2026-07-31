---
type: "Design"
title: "init 交互与 Git 名称技术设计"
---

# init 交互与 Git 名称技术设计

## 设计原则

复用成熟终端控件，但保持 omp-flow 的状态边界极小：Inquirer 只负责瞬时选择，Git 负责
开发者名称，现有 Harness config 只负责项目适配器选择。三者不互相复制语义。

## 命令入口

在 `src/cli/index.ts` 为 init 增加一个独立、严格的参数解析边界。它只接受：

```text
--omp --codex --claude
--dry-run --force --skip-existing
-u <name> | --user <name>
```

parser 返回结构化 init options；缺值、空名称、未知 `-` option、未知位置参数和重复的
`-u/--user` 立即抛错。支持 short/long form 即可，不借本次补丁迁移其他命令到 Commander。
任何解析错误发生在 Banner、prompt、Git 或文件写入之前。

TTY 中调用 `renderCliBanner()` 后再进入 init；非 TTY 不打印装饰 Banner，保持机器日志简洁。
help usage 同步加入 `[-u|--user <name>]`。

## Harness selector

删除 `readline` 逗号协议，引入 `inquirer@^9.3.7` 的 `checkbox`：

- choices 固定来自 `HARNESSES`，展示名称和值均不靠自由文本解析；
- 已有 config 时将其中 Harness 设为 checked，新项目将全部设为 checked；
- 返回值仍经 `normalizeHarnesses()` 和现有 `requireHarnesses()` 校验；
- 显式 Harness flags 非空时完全跳过 prompt；
- stdin 或 stdout 非 TTY 且无显式 flags 时沿用当前 fail-closed 错误。

给 `interactiveInit` 增加一个最小可选 prompt adapter seam，生产默认实现调用 Inquirer，测试
直接注入返回值或取消错误。该 seam 只抽象“选择 Harness”，不建立通用 UI 框架。

## Git 名称

给 init options 增加可选 `userName`。使用 `execFileSync`/`spawnSync` 的参数数组调用 Git，
不拼 shell 字符串：

- 显式名称：先验证当前目录属于 Git worktree；非 dry-run 执行
  `git config --local user.name <name>`；
- 未显式名称：best-effort 读取 `git config user.name`，只用于一行 `Git user: <name>` 展示；
- 不在 Git 仓库内却显式传 `-u` 时清晰失败；未传 `-u` 且读不到名称不阻塞 init；
- Git 可执行文件缺失、local 写入失败等显式请求失败不得吞掉。

Git preflight 在 prompt 和部署前完成，避免用户选完后才发现 `-u` 无法实现；实际 local 写入
在成功选择 Harness 后、资源部署前执行。dry-run 复用同样的 preflight，但跳过写入，并显示
将采用的名称。

## 依赖与版本

`inquirer` 是本次唯一新增 runtime dependency；锁文件随 `package.json` 更新。版本提升为
`0.2.4`。不恢复 `figlet`、`chalk` 或 Commander：现有 Banner 已由项目内 renderer 完成，
严格 init parser 的范围很小。

## 测试设计

- 纯参数测试：short/long user、flags 组合、缺值、重复、未知 option、位置参数；
- prompt adapter：默认值来源、选中值规范化、空选择和取消传播、显式 flags 不调用 prompt；
- 临时 Git repo：显式名称只出现在 `--local user.name`；dry-run 保持原值；仓库外显式名称失败；
- CLI/TTY seam：TTY init 输出 Banner，非 TTY 显式 flags 不输出装饰内容；
- 现有 deploy/update/hash 测试继续证明资源契约未变。

## 失败与恢复

所有输入错误和 Git preflight 错误均先于副作用。prompt 取消按普通 CLI 错误返回，不部署。
实际 Git 写入后若现有部署逻辑失败，错误保持可见；local Git 名称仍可用标准
`git config --local user.name` 检查或修改，不需要 omp-flow 专用恢复状态。
