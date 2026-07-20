# 修复 Kiro 工作流不激活

> 来源:社区反馈(微信)"我感觉对 Kiro 的支持非常差呀,好像没有用似的"。调研于 2026-06-21。

## 问题

Kiro 用户装了 Trellis 后,工作流**从不主动激活** —— 看起来"没用似的"。

**根因(已查证)**:Trellis 给 Kiro 的主会话**没有任何确定性激活机制**。
- 现状(`configurators/kiro.ts` + `SHARED_HOOKS_BY_PLATFORM.kiro`):只装了
  - `.kiro/skills/trellis-*/SKILL.md`(靠 Kiro AI 自己匹配、主动调用 —— 不确定、常不触发)
  - 3 个子代理 JSON,各挂 `agentSpawn → inject-subagent-context.py`(只在 spawn 子代理时)
  - shared hooks 只有 `inject-subagent-context.py`
- 主会话 **0 个 hook**:没有 session-start 注入工作流总览,没有 per-turn 注入 workflow-state。
- 对比 Claude/Codex/Gemini/Qoder:它们每回合被 `inject-workflow-state.py` 注入"你在 Trellis 项目、当前任务 X、走这个工作流",所以工作流确定性激活。Kiro 缺这一层。

**错误假设**:`shared-hooks/index.ts` 注释写 `"Kiro supports only agentSpawn (no SessionStart / UserPromptSubmit event)"` —— **不成立**。

**Kiro 实际能力(官方文档已查证)**:
- Kiro CLI hooks 事件:`userPromptSubmit`(用户每次提交 prompt,输出注入对话上下文)、`agentSpawn`(agent 激活时)、`stop`、`preToolUse`、`postToolUse`。来源 https://kiro.dev/docs/cli/hooks/
- agent JSON `hooks` schema 支持上述全部 key;`resources: ["file://..."]` 在 agent 启动时把文件常驻注入上下文。来源 https://kiro.dev/docs/cli/custom-agents/configuration-reference/
- Kiro CLI 默认 agent 是内置 `kiro_default`;自定义 agent 经 `/agent swap <name>` 或设置 `chat.defaultAgent` 激活。来源 https://kiro.dev/docs/cli/reference/settings/
- Kiro IDE 另有 steering 文件(`.kiro/steering/*.md`,常驻上下文)+ GUI 配置的 Agent Hooks(`PromptSubmit` 等)。来源 https://kiro.dev/docs/hooks/types/

## 目标

让 Kiro 用户的 Trellis 工作流像其它 agent-capable 平台一样**确定性激活** —— 每个新会话/每回合都知道自己在 Trellis 项目里、当前任务、该走的工作流,无需 AI 偶然命中 skill。

## 验收

- [ ] Kiro 主会话每回合能拿到 workflow-state 注入(等价 Claude `UserPromptSubmit` → `inject-workflow-state.py`)。
- [ ] 会话开场能拿到工作流总览(session-start 等价)。
- [ ] `SHARED_HOOKS_BY_PLATFORM.kiro` 正确反映 Kiro 真实能力;删除/改正错误注释。
- [ ] 子代理上下文注入(现有 `agentSpawn → inject-subagent-context.py`)保持有效,不回归。
- [ ] 决定并实现激活路径(default-agent / swap / steering),且**文档站说明 Kiro 用户怎么启用**(否则配了也白配)。
- [ ] 测试:`platforms.test.ts` / `templates/kiro.test.ts` 覆盖新增 hook 与 agent 配置;dogfood `--kiro` 验证生成物。
- [ ] CLI vs IDE 两个表面的处理范围明确(design.md 定;至少覆盖 CLI;IDE steering 视情况)。

## 不做

- 不改其它平台的注入逻辑。
- `inject-workflow-state.py` 本身已存在且跨平台通用,原则上不改脚本逻辑,只新增 Kiro 触发线。
