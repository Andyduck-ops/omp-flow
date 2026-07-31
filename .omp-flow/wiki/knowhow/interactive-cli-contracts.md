---
type: "Diagnostic Knowhow"
title: "交互式 CLI 的可达性与瘦身回归"
description: "避免在依赖瘦身时删掉产品交互，并用主路径测试保护 TTY、flags 与参数语义。"
---

# 交互式 CLI 的可达性与瘦身回归

## 已观察故障

`omp-flow@0.2.3` 已有 responsive 艺术 Banner，却只从 help 路径调用；`init` 在 TTY 中退化为
comma-separated `readline`。同时参数解析只寻找已知 boolean flags，`-u <name>` 等未知参数
被静默吞掉。Linux 用户看到的是文本框和全角逗号错误，而不是设计过的多选界面。

根因模式是把交互库看成“可以删除的依赖”，却没有把它承载的方向键、checkbox、取消、
严格 option 与 TTY fallback 当作产品合同。组件单测证明 Banner 能渲染，也不能证明 init
主路径实际可达。

## 可复用规则

- 依赖瘦身前先列出它承载的用户行为；只有存在等价主路径验证时才能删除。
- TTY 主路径用成熟 prompt 组件；显式 flags 是自动化接口，不是交互界面的替代品。
- 非 TTY 缺少必需选择时 fail closed，并给出可复制的 flags。
- 未知 option 和缺值必须立即报错，不能被手写参数扫描静默忽略。
- 互斥 option 也是输入错误，必须在 Banner、prompt、Git 配置或文件写入前统一校验；不要等
  到部署循环才拒绝，否则失败命令仍可能留下较早发生的副作用。
- Banner、选择器和完成摘要必须从真实 `init` 入口做集成测试，不能只测 renderer。
- 个人身份不要写进 Git 跟踪的项目配置。优先使用已有 local authority（本项目为 Git
  repository-local config），避免复制成第二份身份状态。
- 外部成熟项目只提供模式证据；不要连同其退役状态层一起照搬。

## 本次修复形成的合同

`0.2.4` 将 Inquirer checkbox 恢复为 npm runtime dependency，并给选择器保留一个小型可注入
adapter 供主路径测试使用。`init` 在任何副作用前严格解析自己的 options：未知参数、缺值、
空名称、重复 `-u/--user` 都直接失败；显式 Harness flags 仍绕过交互。

TTY 才展示艺术 Banner 和 selector，非 TTY 保持可复制的 flags 接口。`-u/--user` 通过参数
数组写入 `git config --local user.name`；dry-run 只做仓库 preflight，不写 Git 或项目文件。
发布验证必须从生成的 tarball 做 production install/bin smoke test，避免源码树里存在依赖却在
npm 安装物中缺失的假阳性。

独立审查曾复现 `--force --skip-existing -u after` 先修改 local Git 名称、再由部署层报错；修复
后 CLI parser、`interactiveInit` 与直接部署入口共用同一互斥校验，并由回归测试证明失败时
Git 名称、prompt 次数和项目文件均保持不变。

## 证据与适用边界

本条来自 2026-08-01 Linux npm 用户现场、`omp-flow@0.2.3` 源码/包依赖历史，以及 Trellis
revision `51a5674ce6ce5a12cb585c5dcb21e7b76a51bdbc` 的 init checkbox、`-u` 和 Git fallback
实现。适用于 CLI 初始化、升级、卸载和任何同时提供 TTY 与自动化 flags 的命令。
