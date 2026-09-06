<div align="center">

# omp-flow

**把调查、设计、实现与独立复核沉淀为项目本地、Git 可追踪的知识。**

中文 · [English](README_EN.md)

[![npm](https://img.shields.io/npm/v/omp-flow?label=npm)](https://www.npmjs.com/package/omp-flow)
[![GitHub](https://img.shields.io/github/stars/Andyduck-ops/omp-flow?style=flat&label=GitHub)](https://github.com/Andyduck-ops/omp-flow)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="docs/assets/omp-flow-hero.webp" alt="五个 Harness 通过项目本地 Markdown 知识协同工作" width="100%">

<sub>任务知识留在 Git 可见的 Markdown 中；模型、原生 Agent、并发与 UI 留在你的 Harness 中。</sub>

</div>

## 快速开始

全局安装 CLI：

```bash
npm install -g omp-flow@latest
```

进入项目并初始化。`-u` 只设置当前仓库的 Git `user.name`：

```bash
cd <your-project>
omp-flow init -u "Your Name"
```

以后更新全局 CLI 和项目内受管文件：

```bash
npm install -g omp-flow@latest
cd <your-project>
omp-flow update
```

建议先预览：

```bash
omp-flow update --dry-run
```

`--dry-run` 只打印计划，不写文件。计划中的 `new` 会创建新模板，`autoUpdate` 表示项目副本
仍等于上次安装版本、可以安全升级，`unchanged` 会跳过；`changed` 表示项目副本已经有本地
差异，默认询问覆盖、保留或另存为 `.new`。如果希望保留全部本地差异，同时继续创建 `new`
并执行 `autoUpdate`，使用：

```bash
omp-flow update --skip-all
```

只要计划会写文件，更新前会把现有受管文件备份到 `.omp-flow/.backup-<timestamp>/`。
Task Bundle、Wiki 中的用户内容，以及运行时数据都不是模板覆盖目标。被用户主动删除的
受管文件会保持删除，除非显式选择重新创建。`--force`
会覆盖所有 `changed` 文件，不建议作为日常更新命令。

无交互环境才需要 `--omp`、`--codex`、`--claude`、`--snow` 或 `--cursor`；日常使用不必记这些参数。

### 从 0.4.x 升级到 0.5.0

`0.5.0` 完成 Task-first WorkScope 切换。每个需要 Task 的命令都必须明确打开一个 Task 与工作区：

```bash
npm install -g omp-flow@0.5.0
cd <your-project>
omp-flow update
omp-flow task open <task> --workspace <path>
omp-flow task show <task> --workspace <path>
```

`--workspace` 省略时使用当前仓库；需要替换现有 WorkScope 标记时显式添加 `--replace`。
更新会备份并仅在模板哈希仍匹配时移除已退役的 `active_task.py`；本地改过的旧文件会报告冲突并保留，需手工处理。Task Bundle、Wiki、运行时数据和用户自有指令文件不会被迁移覆盖。
operation descriptor 仍为 v1；模型判断、执行成功和 receipt 完成也不等于人工批准。

## omp-flow 做什么

omp-flow 为多 Agent 开发提供可移植的方法与很小的机械内核，同时保留每个 Harness 的原生执行体验。

| 边界 | 所有者 | 职责 |
| --- | --- | --- |
| Task Bundle 与 Concepts | Git 可追踪的 Markdown | 保存问题、来源、需求、设计、决定、工作、交接与复核 |
| `.omp-flow` Python runtime | omp-flow | 只保证 session、路径、actor、锁、原子操作和不透明 receipt |
| 原生执行 | 你的 Harness | 继续负责模型、Agent 派发、并发、进度、取消、隔离与 UI |

因此，omp-flow 不会把 Markdown 解析成生命周期数据库，也不会接管平台的模型或调度系统。

## 支持的 Harness

| Harness | 项目本地集成 |
| --- | --- |
| Oh My Pi | 扩展、原生 Agent、Skills 与设置 |
| Codex | 原生 Agent、Hooks 与共享 Skills |
| Claude Code | 原生 Agent、Hooks、Skills 与设置 |
| Snow | 原生 Agent、Hooks 与共享 Skills |
| Cursor | 原生 Agent、Hooks 与共享 Skills |

初始化只安装你选择的集成；任务知识仍是一套可移植的 Bundle。

## 工作流概览

```text
brainstorm ↔ research → design → QbD → work map → QbD → implementation → review → finish
```

这是一条推理方向，不是 runtime phase state。证据可以让工作回到 framing 或 design；实现结果也必须经过不同 actor 的独立复核。完整语义见 [workflow.md](templates/.omp-flow/workflow.md)。

## 项目知识与文档系统

omp-flow 把不同生命周期和可信度的知识分开放置，但全部保持为普通 Markdown：

| 位置 | 用途 | 边界 |
| --- | --- | --- |
| `.omp-flow/tasks/<task>/` | 当前任务的问题、来源、需求、设计、决定、交接与复核 | 属于一个具体 Task Bundle；完成后可归档 |
| `.omp-flow/wiki/` | 跨任务复用的架构、约定、经验与项目事实 | 只保存已有证据支持、值得长期维护的知识 |
| `.omp-flow/sleep/` | 从已归档 Task 提炼出的跨任务知识候选 | Candidate 必须复核后才能进入 Wiki，不会自动晋升 |

`omp-flow init` 和 `omp-flow update` 会安装并维护这些目录所需的模板、Skills 与运行时。

### 开局地图注入

支持的 Harness 在会话开始、恢复或压缩后，会读取并注入两张小地图：当前 Task 的
`index.md` 与项目 Wiki 的 `.omp-flow/wiki/index.md`。地图只提供导航和普通 Markdown 链接；
模型应先认真阅读地图，再按当前问题选择需要的 Concept，不需要把整个 Task 或 Wiki 历史
一次性载入上下文。地图正文有大小上限，缺失或超限会明确显示 unavailable，不会制造替代
状态。完成持久性工作后，Agent 应检查 Task/Wiki index 是否仍能找到最新 handoff、Review 和
恢复入口。

任务完成并归档后，Sleep 可以读取那个精确的 Git checkpoint，生成零个或多个可审查的
Candidate。它不会读取原始 Harness transcript，也不会使用向量聚类自动改写 Wiki；最终是否
沉淀为长期项目知识仍由人和 Agent 根据证据判断。

```text
Task Bundle → finish / archive → Sleep Candidate ──人工复核──→ Wiki
```

`0.5.0` 同时更新了共享 Workflow Skills 与各 Harness 的原生 Agent 指令，使 Brainstorm、
Research、Design、QbD、Implementation、Review 和 Finish 更强调实践证据、独立复核、
可恢复 assignment，以及人类决定与模型判断之间的边界。

## 致谢



## 许可证

omp-flow 采用 [MIT License](LICENSE)，版权声明为 `Copyright (c) 2026 Andyduck-ops`。

## 友情链接

[Linux DO](https://linux.do/)
