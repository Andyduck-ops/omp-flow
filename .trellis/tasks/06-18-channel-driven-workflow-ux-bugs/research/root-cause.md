# 根因调研 — #344 两个 channel-driven workflow UX bug

调研于 2026-06-18(main @ v0.6.3)。两个 bug 根因 + 修法均已在源码定位。

## Bug 1：切到 channel-driven workflow 后 `codex.dispatch_mode` 不自动设置

**根因(确认)**:全仓 `grep dispatch_mode` —— **没有任何代码在 workflow 切换/init 时写 `codex.dispatch_mode` 到 `.trellis/config.yaml`**。
- `dispatch_mode` 只被 hook `templates/shared-hooks/inject-workflow-state.py:222-268` **读取**,默认 `inline`(0.5.9/0.6.0-beta.1 把默认从 sub-agent 翻成 inline)。
- `init --workflow <id>`(`init.ts:1880-1916`)与 `trellis workflow`(`commands/workflow.ts`)都只处理 workflow.md 内容 + hash 契约,**都不碰 dispatch_mode**。
- channel-driven-subagent-dispatch 这个 workflow 本质要求 sub-agent 派发,但 config 默认 inline → workflow 不生效。

**修法方向**:切到 `channel-driven-subagent-dispatch`(或任何需要 sub-agent 的非 native workflow)时:
- 选项 A:自动在 config.yaml 写 `codex.dispatch_mode: sub-agent`(注意只对 codex 平台有意义;需想清楚多平台语义)。
- 选项 B(更稳):切换后打印明确提示 "channel-driven 需要 `codex.dispatch_mode: sub-agent`,请在 .trellis/config.yaml 启用"。
- 落点:`commands/workflow.ts`(switch)+ `commands/init.ts`(init --workflow 路径)。决策点:workflow 模板要不要声明"需要哪种 dispatch_mode",避免在命令里硬编码 workflow id。

## Bug 2：`trellis update` 每次都问 workflow.md 覆盖/跳过(用户没改过)

**契约(已实现且正确)**:非 native workflow = 用户管理内容,应从 `.template-hashes.json` 移除 hash → update 视为 user-managed、不追踪。
- `workflow-resolver.ts:36-40`:契约说明 + `NATIVE_WORKFLOW_ID`。
- `commands/workflow.ts:144-158` `applyHashContract`:非 native → `removeHash`,在 identical(:192)和 overwrite(:227)两分支都调。✅ 切换命令正确。
- `init.ts:1987-1989`:`workflowMdOverride !== undefined && workflowId !== NATIVE` → `removeHash`。✅ init 正确(`workflowMdOverride` 在 :1891 由 resolveWorkflowTemplate 设)。

**根因(确认)**:契约在写入侧没问题,**坑在 update 侧**。`commands/update.ts:773-780`:
```
// workflow.md is included here because it is runtime-parsed by get_context.py ...
files.set(`${DIR_NAMES.WORKFLOW}/workflow.md`, workflowMdTemplate);  // 始终是 native 模板
```
update **无条件**把 native workflow.md 加入 managed-file 比对集。对一个切了非 native workflow 的项目:
- hash 已被移除(契约) → workflow.md 无 tracked hash;
- 但 update 仍把 native 内容塞进 files → modified-file 检测拿 native 内容 vs 已装的 channel-driven 内容 → 永远不同 → 归类 "modified by you" → 每次 `trellis update` 都 prompt。

→ **update 没有兑现 durable-state 契约**:契约说"移除 hash = 停止追踪",但 :780 又把它拉回比对。

**修法方向**:`update.ts` 构建 `files` 时对 workflow.md 加条件:
- 仅当 `.template-hashes.json` **存在** `WORKFLOW_GUIDE_FILE` 条目(= 项目在 native 轨道)才 `files.set(workflow.md, native)`;
- hash 缺失(= 用户管理的非 native workflow)→ **不加入比对集**,update 完全跳过 workflow.md。

该 gate 正确区分三种情形:
| 情形 | hash | 期望 | gate 后行为 |
|---|---|---|---|
| native 未改 | 在,且匹配 | 自动更新 | files 含 → auto-update ✓ |
| native 被用户手改 | 在,内容不同 | 提示(正确的 modified 流程) | files 含 → prompt ✓ |
| 切了非 native workflow | 缺失 | 跳过、别烦 | files 不含 → skip ✓(修复) |

## 影响面 / 测试

- 改动:`commands/update.ts`(Bug 2 gate)、`commands/workflow.ts` + `commands/init.ts`(Bug 1 dispatch_mode 联动/提示)。
- 测试:`test/commands/update.integration.test.ts` 加用例 —— 切非 native workflow 后 update 不再把 workflow.md 标 modified;Bug 1 加用例 —— 切 channel-driven 后 config.yaml 有 dispatch_mode: sub-agent(或断言提示输出)。
- 注意 dogfood 副本同步(本仓若切过 workflow 可顺带验证)。

## 复杂度判断

两个 bug 边界清晰、改动集中(3 文件)、根因已证。属**中等复杂任务**:建议补轻量 design.md(Bug 1 的 dispatch_mode 联动语义是唯一需定的设计点:workflow 模板声明 needs-dispatch vs 命令硬编码)+ implement.md 勾选清单,然后 start。
