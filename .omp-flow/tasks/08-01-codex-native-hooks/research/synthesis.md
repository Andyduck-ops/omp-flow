---
type: "Synthesis"
title: "Selected native Skill and Hook boundary"
---

# Selected native Skill and Hook boundary

本综合连接 [内部契约](internal-harness-contracts.md) 与
[平台规范](native-platform-specs.md)，并选择下一步 Design 的输入。

证据确认平台能力对等应由不同原生表面实现：Claude 使用 `settings.json` Hooks，Oh My Pi 使用
package extension，Codex 使用 `.codex/hooks.json`；共享方法论只有一个 canonical source，但
Codex 项目发现入口应收敛到官方 `.agents/skills`，不再复制到 `.codex/skills`。

三个 Hook 载体中选择 project `.codex/hooks.json`：它与用户的普通 Codex defaults 分离、官方
直接支持、适合 `omp-flow init/update` 的 exact-file ownership。Inline `[hooks]` 会要求解析和
改写用户 TOML；plugin 适合跨仓库 marketplace 分发，却不会消除 enable 与 hash trust。本轮均
不采用。若目标文件已存在，安装器保持现有保守语义：普通 init 不覆盖，update 把修改视为冲突，
不解析、合并或重写 foreign Hook。

首版只接两个有确定收益的事件：

1. `SessionStart` 读取官方 `session_id`/`cwd`，用现有 runtime 输出 path-only mechanical
   orientation；失败只给出明确 unavailable，不阻塞普通 Codex 工作。
2. `PreToolUse` 只匹配 `apply_patch`，解析其机械 patch path 并拒绝直接写
   `.omp-flow/.runtime/`；普通 Bundle/源码 patch 放行。它是 defense-in-depth，不替代 Python
   runtime 校验，也不声称覆盖 Bash、hosted 或 opt-out tool path。

不使用 `UserPromptSubmit`、transcript、自然语言 stop message 或目录形状推断 Task、Flow、
approval、verdict、Work total。暂不观察 native task/progress，因为 Codex Hook 没提供已证实的
complete task baseline；单个 spawn/stop 事件不足以制造总数。

该选择确认并修订了第一性锚定：问题不是 Codex 缺原生能力，而是 omp-flow 的 Codex Adapter
尚未遵守当前原生入口。剩余不确定性只影响支持声明和测试矩阵，不阻塞最小项目本地设计。
