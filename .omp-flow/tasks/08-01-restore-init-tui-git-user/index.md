---
okf_version: "0.2"
---

# 恢复 init TUI 与 Git 用户初始化

- [Task](task.md) — purpose and durable task identity.
- [Brainstorm](brainstorm.md) — questions, hypotheses, and reframing.
- [Trellis init Reference](reference/trellis-init.md) — 固定 revision 的 checkbox、`-u`、Git
  fallback 与严格 option 模式。
- [初始化回归与 Trellis 适配](research/init-tui-trellis.md) — selected synthesis；恢复成熟
  TTY 交互，以 Git 为身份单一事实源，不恢复退役 workspace。
- [PRD](prd.md) — 可观察的初始化体验与验收条件。
- [Design](design.md) — checkbox、严格参数、Git local 身份与发布验证设计。
- [QbD 1 Audit](qbd/init-tui-qbd1.md) — PASS；无材料性 blocker。
- [Human QbD 1 Decision](decisions/qbd1-human-pass.md) — 接受审计并授权进入实现。
- [Work](work/index.md) — 单一、小型、可独立检查的实现工作。
- [QbD 2 Audit](qbd/init-tui-qbd2.md) — PASS；工作边界与验证完整。
- [Human QbD 2 Decision](decisions/qbd2-human-pass.md) — 低风险补丁无需再次停顿，授权执行。
- [Implementation handoff](work/restore-init-experience-handoff.md) — `0.2.4` 实现与验证交接。
- [Initial review](review/restore-init-experience-review.md) — FAIL；发现冲突 flags 先写 Git 的副作用。
- [Repair review](review/restore-init-experience-rereview.md) — PASS；问题关闭且 378 项检查通过。
- [Completion](completion.md) — 集成验证、知识收割与发布就绪结论。

Add and link Concepts as the task grows. This index is navigation, not a closed manifest.
