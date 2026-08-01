---
type: "Decision"
title: "Human approval after QbD 1"
---

# Human approval after QbD 1

2026-08-01，用户在阅读主会话给出的最小设计摘要、[Design](../design.md) 与
[QbD 1 audit](../qbd/design-audit.md) 的 PASS/0-blocker 结论后回复 `pass`。

该批准选择审计选项 1：保持 `.agents/skills` 单一 Codex Project Skill 入口、exact-owned
`.codex/hooks.json`、`SessionStart` orientation 与 `PreToolUse(apply_patch)` runtime guard，携带
A1/A2 和 Linux/Windows smoke 进入 Decompose 与 implementation。

实现授权限定在当前设计范围；若 QbD 2 或实践证据发现新的 material blocker、用户配置越权、
错误 authority 或无法安全降级的跨平台失败，必须停止并重新校准。非阻塞 advisory、fixture
修订和范围内的机械实现不要求重复开启设计循环。
