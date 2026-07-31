---
type: "QbD 1 Audit"
title: "init TUI 与 Git 名称设计材料性审计"
verdict: "PASS"
---

# init TUI 与 Git 名称设计材料性审计

## 审计对象

- [PRD](../prd.md)
- [Design](../design.md)
- [Selected synthesis](../research/init-tui-trellis.md)

## 结论

**PASS** — 当前范围内没有未解决的材料性 blocker。设计可实现、可验证，并且没有引入
越权身份状态或不可逆副作用。

## 材料性检查

### 运行时依赖约束

历史归档材料曾要求零运行时依赖，但当前工程指南、当前 package contract 与现行 Wiki 没有
把它保留为不可更改边界；相反，本次已记录的实践证据表明，裁掉成熟 selector 后主路径实际
退化。只恢复一个 Inquirer runtime dependency 不构成错误授权或数据边界破坏，也不会让核心
路径不可实现。旧约束因此不是 blocker。

### Git 名称与授权边界

`-u/--user` 是用户显式写入请求，目标被限制为当前 worktree 的 local `user.name`，参数数组
调用 Git，不修改 global/system 配置，也不把个人身份复制进 Git 跟踪的 omp-flow 文件。
仓库 preflight、空值拒绝和写入失败显式传播足以保护授权与数据边界。写入后仍可用标准 Git
命令检查或修改，不是不可逆效果。

### TTY、非 TTY 与 dry-run

TTY checkbox 与显式 flags 绕过交互形成完整的人工/自动化双路径；非 TTY 无 flags 时
fail-closed，不会猜测选择。参数和 Git preflight 均先于 prompt/部署，`--dry-run -u` 只读取并
预览而跳过 Git 和项目写入。因此不存在由交互检测或预览模式造成的材料性副作用路径。

### 发布可移植性

项目使用 Node ESM/NodeNext，选定的 Inquirer 9 ESM 入口与该构建形态一致；依赖由 npm
manifest/lockfile 随包安装，而不是依赖全局或 Harness 私有模块。现有跨平台边界仍由
Inquirer 和 `execFileSync` 参数调用承担，核心路径可在支持的 Node 平台实现。

## Advisory（不阻塞）

- 在发布前用干净临时目录对 `npm pack` 产物执行一次 production install 和 bin smoke test，
  直接验证依赖被安装且 `omp-flow init --dry-run --codex` 可启动。
- 保留设计中的回归测试：dry-run 不改 local Git 值、仓库外显式 `-u` 失败、非 TTY 显式
  Harness 不加载 prompt。它们是发布验证义务，不是当前设计缺少材料性证据。
