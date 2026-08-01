---
type: "Work Map"
title: "Codex native adapter work map"
---

# Codex native adapter work map

当前批准设计可以作为一个独立实现与复核单元完成；installer ownership、Hook scripts、Skill
migration、tests 和 docs 共同组成同一个可发布行为，拆开会产生暂时引用缺失或重复发现状态。

- [Implement the native Codex adapter](codex-native-adapter.md) — canonical/deployed resources,
  migration, verification, docs, and patch release preparation.
- [Implementation handoff](codex-native-adapter-handoff.md) — landed behavior, migration and
  package evidence, verification commands, and residual platform coverage limits.
- [Initial independent review](../review/codex-native-adapter-review.md) — found one material
  closed-parser gap.
- [Parser rework handoff](codex-native-adapter-rework-handoff.md) — repairs that single finding.
- [Independent re-review](../review/codex-native-adapter-rework-review.md) — PASS with the finding
  closed and no material blocker.

该 Work 已由不同 actor 读取 handoff、真实 diff 与测试结果并复审通过。
