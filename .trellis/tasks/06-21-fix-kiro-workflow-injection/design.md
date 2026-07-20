# 技术设计 — Kiro 工作流激活

## 两个表面(机制不同)

| 表面 | 配置载体 | 常驻上下文 | per-turn 注入 | 默认是否生效 |
|---|---|---|---|---|
| **Kiro CLI** (`kiro-cli`) | `.kiro/agents/<name>.json` | agent 的 `resources: ["file://..."]`(启动注入) | agent 的 `hooks.userPromptSubmit`(每 prompt) | 否 —— 默认 `kiro_default`,自定义 agent 需 `/agent swap` 或 `chat.defaultAgent` |
| **Kiro IDE** | `.kiro/steering/*.md` + GUI Agent Hooks | steering 文件**永远加载**,零激活 | GUI 配的 `PromptSubmit` hook(非文件可控) | steering 默认生效;hook 需用户 GUI 配 |

关键约束:CLI 的 hook 只对**当前激活的 agent** 生效,而默认是内置 `kiro_default`。我们没法纯靠写文件让自定义 agent 的 hook 自动作用到主会话(除非用户激活)。IDE 的 steering 反而零激活、最稳。

## 方案(分层,按"零摩擦 → 完整动态"递进)

### L1 — steering 文件(两表面通吃的地板,零激活,**必做**)
新增模板 → 生成 `.kiro/steering/trellis.md`:静态指引"本项目用 Trellis,先读 `.trellis/workflow.md` 按工作流走;当前任务指针见 `.trellis/.runtime/sessions/` 或 `task.py current`"。
- IDE:永远加载 → 立刻解决"没用似的"。
- CLI:作为下面 trellis agent 的 `resources` 一并注入(CLI 不自动读 steering,需经 resources 引用)。
- 局限:静态,给不出 per-turn 的动态 phase/task 面包屑。

### L2 — CLI trellis 主 agent(动态 per-turn,需一次性激活)
新增模板 → `.kiro/agents/trellis.json`(主会话用,区别于 3 个子代理):
```json
{
  "name": "trellis",
  "description": "Trellis workflow agent",
  "prompt": "...(指向 workflow.md 的精简引导)",
  "tools": [...], "allowedTools": [...],
  "resources": ["file://.trellis/workflow.md", "file://.kiro/steering/trellis.md"],
  "hooks": {
    "agentSpawn":      [{ "command": "{{PYTHON_CMD}} .kiro/hooks/session-start.py" }],
    "userPromptSubmit":[{ "command": "{{PYTHON_CMD}} .kiro/hooks/inject-workflow-state.py" }]
  }
}
```
- `userPromptSubmit → inject-workflow-state.py` = 与 Claude 完全同款的每回合面包屑(动态当前任务/phase)。
- `agentSpawn → session-start.py` = 开场工作流总览。
- 激活:文档指导用户 `kiro-cli settings chat.defaultAgent trellis`(一次)或 `/agent swap trellis`。

### 配套改动(必做)
- `SHARED_HOOKS_BY_PLATFORM.kiro` 从 `["inject-subagent-context.py"]` 改为含 `session-start.py` + `inject-workflow-state.py` + `inject-subagent-context.py`,并**改正/删除**那条 "only agentSpawn" 错误注释。
- `inject-workflow-state.py` / `session-start.py` 需认 Kiro 的 stdin 事件结构(`{hook_event_name, cwd, session_id, prompt}`)与输出契约(stdout 注入对话上下文)。**待验证**脚本现有输出格式是否被 Kiro 直接接受(可能需 Kiro 分支)。
- 子代理 3 个 JSON 的 `agentSpawn → inject-subagent-context.py` 保持不动。

## 开放问题(review gate 拍)
1. **范围**:只做 CLI(L1+L2),还是 CLI + IDE steering 都做?(IDE steering 几乎免费,建议都做。)
2. **kiro_default 能否被本地 `.kiro/agents/kiro_default.json` 覆盖?** 若能 → CLI 零摩擦(不用让用户 swap)。文档未确认,需有 Kiro 环境 dogfood 验证;不确认就走"文档指导设 defaultAgent"。
3. **`inject-workflow-state.py` 的 stdout 是否直接被 Kiro `userPromptSubmit` 当上下文吃掉?** Claude 用特定 JSON 包裹;Kiro 文档说"output 加入对话上下文",格式可能不同 → 可能要给脚本加 Kiro 输出分支。无 Kiro 环境则按文档 best-effort + 标注待真机验证。

## 决定(2026-06-21,用户拍板:**两表面都走 hook,目标是把它验证通**)

放弃"只做静态 steering"。两表面都用 hook 做**动态 per-turn 注入**(等价 Claude `UserPromptSubmit → inject-workflow-state.py`),并把验证点显式列出来跑通。

**确认的 schema**(来自官方文档 + GitHub 真实样本):
- **CLI**:agent JSON `hooks.userPromptSubmit: [{ "command": "<py> .kiro/hooks/inject-workflow-state.py" }]` + `hooks.agentSpawn: [{ "command": "<py> .kiro/hooks/session-start.py" }]`。CLI 文档明确 *"userPromptSubmit: Output gets added to conversation context"* → stdout 进上下文(✅ 文档背书)。事件 stdin:`{hook_event_name,cwd,session_id,prompt}`。
- **IDE**:`.kiro/hooks/trellis-workflow-state.kiro.hook`:
  ```json
  { "version":"1.0.0", "enabled":true, "name":"trellis-workflow-state",
    "description":"Inject Trellis workflow state each prompt",
    "when": {"type":"promptSubmit"},
    "then": {"type":"runCommand","command":"<py> .kiro/hooks/inject-workflow-state.py","timeout":30} }
  ```
  IDE `then` 仅 `askAgent`(静态 prompt) | `runCommand`(shell)。

**必须真机验证的两点(本任务核心"验证"目标)**:
1. **IDE `promptSubmit + runCommand` 的 stdout 是否注入模型?** 文档未写;IDE 文档里 promptSubmit 的确定注入路径是 `askAgent`(静态)。
   - 若 runCommand stdout 不注入 → 退化为 `askAgent` + 静态 prompt(指向 workflow.md;失去动态面包屑),或保留 runCommand 仅做副作用 + 另用静态 steering 补。
2. **CLI / IDE 接受的 stdout 格式**:`inject-workflow-state.py` 现在为 Claude 输出特定 JSON 包裹。Kiro 文档只说"output 加入上下文" → 很可能要给脚本加 **Kiro 输出分支**(纯文本 or Kiro 期望的结构),否则注了也被忽略。

**激活注意(文档要写)**:
- CLI:trellis 主 agent 非默认(默认 `kiro_default`)→ 用户需 `kiro-cli settings chat.defaultAgent trellis` 或 `/agent swap trellis`。
- IDE:`.kiro/hooks/*.kiro.hook` 需 `enabled:true`,且 Kiro 可能要求用户在 UI 信任/启用一次。

**范围**:CLI hook + IDE hook 都做;静态 steering/AGENTS.md 作为 hook 不生效时的兜底(次要,可后置)。`agentSpawn → inject-subagent-context.py` 的 3 个子代理保持不动。
