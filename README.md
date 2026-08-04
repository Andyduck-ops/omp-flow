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

交互面板会列出 Oh My Pi、Codex、Claude Code、Snow 和 Cursor，首次初始化默认全选；用空格切换，回车确认。然后在项目中打开任一已选 Harness，像平常一样描述要完成的工作，项目本地指令会引导它使用 omp-flow。

以后更新全局 CLI 和项目内受管文件：

```bash
npm install -g omp-flow@latest
cd <your-project>
omp-flow update
```

无交互环境才需要 `--omp`、`--codex`、`--claude`、`--snow` 或 `--cursor`；日常使用不必记这些参数。

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

## 致谢

- [pi-maestro-flow](https://github.com/catlog22/pi-maestro-flow/blob/089f067ca669b90de7b80b38251ae3d9dfddad98/README.md) 提供了公开 README 的呈现灵感。
- 项目保留并修改了固定版本的 [ccstatusline](https://github.com/sirmalloc/ccstatusline/tree/83c8ffd551ec700fceeed98fe9ab50de84cb49fa) 软件；其上游授权与声明随集成一同保存。

## 许可证

omp-flow 采用 [MIT License](LICENSE)，版权声明为 `Copyright (c) 2026 Andyduck-ops`。

ccstatusline 集成继续适用其独立的 [LICENSE](integrations/ccstatusline/LICENSE) 与 [NOTICE](integrations/ccstatusline/NOTICE)。

## 友情链接

[Linux DO](https://linux.do/)
