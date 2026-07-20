# channel-driven workflow 切换的两个 UX bug

> 记账任务。来自 Discussion #344（SuperCC25513, v0.6.2）。维护者已在 discussion 确认"是 ux bug，我来处理"。

## Bug 1：切到 channel-driven workflow 后 dispatch_mode 不自动设置

**现象**：用户 `trellis init --workflow channel-driven-subagent-dispatch`（或 `trellis workflow` 切换）后，`.trellis/config.yaml` 默认**没有** `codex.dispatch_mode`，所以仍是 inline 模式 → Channel-Driven Sub-Agent Dispatch Workflow 一直不生效。

**根因（待证）**：切 workflow 模板和设 `codex.dispatch_mode` 是两个脱节的动作。channel-driven 这个 workflow 本质要求 sub-agent 派发，但切模板时没联动把 config 的 dispatch_mode 设成 sub-agent（或没提示用户去设）。

**修法方向**：
- 切到 channel-driven workflow 时，自动在 config.yaml 写 `codex.dispatch_mode: sub-agent`（或对应启用项），或
- 至少在切换后打印明确提示："channel-driven 需要 dispatch_mode: sub-agent，请在 .trellis/config.yaml 启用"

## Bug 2：trellis update 每次都问 workflow.md 覆盖/跳过（用户没改过）

**现象**：切了 channel-driven workflow 后，每次 `trellis update` 都提示 "workflow.md 有更新，覆盖还是跳过"，但用户没动过它。

**根因（已定位线索）**：见 `packages/cli/src/utils/workflow-resolver.ts` `NATIVE_WORKFLOW_ID` 注释——设计本意是：选非 native workflow 时，`.trellis/workflow.md` 应**从 `.template-hashes.json` 移除**（变 user-managed，update 不再追踪）。楼主现象说明这个"移除 hash"逻辑没真正生效 → update 仍拿 native 的 hash 比对 channel-driven 的内容 → 永远 mismatch → 每次 prompt。

**修法方向**：
- 确认 `init --workflow <非native>` / `trellis workflow` 切换时，是否真的把 workflow.md 从 `.template-hashes.json` 删掉了
- 若没删 → 补上（按 workflow-resolver.ts 注释里的 durable-state contract）
- 验证：切 channel-driven 后跑 `trellis update`，不应再提示 workflow.md

## 影响面

- `packages/cli/src/utils/workflow-resolver.ts`（hash-tracking 契约）
- `packages/cli/src/configurators/workflow.ts`
- `packages/cli/src/commands/update.ts`（workflow.md hash 比对）
- `packages/cli/src/commands/init.ts` / `trellis workflow` 命令（切换时的 config 联动）
- `.template-hashes.json` 处理逻辑

## 验收

- [ ] Bug1：切 channel-driven workflow 后，dispatch_mode 被设置或有明确提示，Channel-Driven 模式能生效
- [ ] Bug2：切非 native workflow 后，`.trellis/workflow.md` 从 .template-hashes.json 移除；后续 `trellis update` 不再反复提示 workflow.md 覆盖/跳过
- [ ] dogfood：临时项目切 channel-driven → update 两次，第二次干净
- [ ] 实现后在 Discussion #344 回复并标最佳答案

## 状态

planning（记账，后续排期）。关联 Discussion #344。维护者已确认是 ux bug。
