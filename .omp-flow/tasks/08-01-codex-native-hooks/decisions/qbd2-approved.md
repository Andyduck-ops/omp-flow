---
type: "Decision"
title: "Human authorization carried through QbD 2"
---

# Human authorization carried through QbD 2

用户在 QbD 1 PASS 后回复 `pass`，批准主会话所说明的后续动作：Decompose、实施、独立 Review、
全量验证与提交；主会话同时明确只有出现新的 material blocker 才再次停下校准。

[QbD 2 audit](../qbd/work-map-audit.md) 随后对唯一 [Work](../work/codex-native-adapter.md)
给出 PASS、0 blocking findings，未改变批准范围，也未发现用户配置越权、false authority、fail-open
或不可安全降级的风险。因此该先前明确的条件式实施授权在本次 QbD 2 结果下成立：进入 Execute，
并携带其证据粒度 advisory；若实践验证出现 material blocker，则本决定不授权绕过。
