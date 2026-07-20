# 执行计划 — Kiro 工作流激活(hook 路线,两表面)

> 目标:CLI + IDE 都用 hook 做动态 per-turn 注入,并验证通。schema 见 design.md「决定」。

## 1. shared-hooks 能力表 → verify: typecheck
- [ ] `templates/shared-hooks/index.ts`:`SHARED_HOOKS_BY_PLATFORM.kiro` 改为含 `session-start.py` + `inject-workflow-state.py` + `inject-subagent-context.py`。
- [ ] 删/改正 "Kiro supports only agentSpawn..." 错误注释 → 写明 Kiro 支持 userPromptSubmit/agentSpawn(CLI)+ promptSubmit `.kiro.hook`(IDE)。
- 验证:`pnpm typecheck`。

## 2. 脚本认 Kiro 输出契约(核心验证点 2)
- [ ] 读 `inject-workflow-state.py` / `session-start.py` 现有输出:为 Claude 输出的 JSON 包裹。
- [ ] 加 Kiro 分支:检测平台(env / `hook_event_name` in (`userPromptSubmit`,`promptSubmit`))→ 输出 Kiro 接受的形态(优先**纯文本到 stdout**,CLI 文档说 output 进上下文)。**不破坏其它平台分支。**
- 验证:本地用模拟 Kiro stdin(`{hook_event_name:"userPromptSubmit",cwd,session_id,prompt}`)跑脚本,断言 stdout 是预期纯文本面包屑。

## 3. CLI 主 agent(`templates/kiro/agents/trellis.json`)
- [ ] 新增主会话 agent:`resources:["file://.trellis/workflow.md"]` + `hooks.userPromptSubmit→inject-workflow-state.py` + `hooks.agentSpawn→session-start.py`;tools/allowedTools 给主会话合适集。
- [ ] `templates/kiro/index.ts`:纳入输出,但**与 3 个子代理区分**(子代理带 inject-subagent-context,主 agent 带 workflow-state/session-start)。
- [ ] `configurators/kiro.ts`:`resolvePlaceholders` 解析 `{{PYTHON_CMD}}`,写 `.kiro/agents/trellis.json`。
- 验证:`JSON.parse` 合法;`{{PYTHON_CMD}}` 已解析;3 子代理 hook 不变。

## 4. IDE hook(`templates/kiro/hooks/trellis-workflow-state.kiro.hook`)
- [ ] 新增 `.kiro.hook`(schema 见 design.md):`when.type=promptSubmit`,`then.type=runCommand`,command 跑 `inject-workflow-state.py`,`enabled:true`。
- [ ] `configurators/kiro.ts`:写到 `.kiro/hooks/trellis-workflow-state.kiro.hook`(命令里 `{{PYTHON_CMD}}` 解析)。
- 验证:JSON 合法;字段名对(version/enabled/name/when/then)。

## 5. 测试 → verify: pnpm test 绿
- [ ] `test/templates/kiro.test.ts`:断言 trellis 主 agent(userPromptSubmit/agentSpawn/resources)、`.kiro.hook`(promptSubmit/runCommand)、3 子代理仍 inject-subagent-context。
- [ ] `test/configurators/platforms.test.ts`:`configurePlatform('kiro')` 写出新文件;hooks 目录含 inject-workflow-state.py + session-start.py。
- [ ] 脚本 Kiro 输出分支的单测(模拟 stdin → 断言纯文本 stdout)。
- [ ] 回归:其它平台 shared-hooks / 脚本输出不受影响。

## 6. 文档站(必做,否则配了白配)
- [ ] kiro 平台页 + 中英:**启用步骤** —— CLI 设 `kiro-cli settings chat.defaultAgent trellis`(或 `/agent swap trellis`);IDE 确保 `.kiro/hooks/*.kiro.hook` 启用/信任。
- [ ] 标注:IDE `runCommand` stdout 注入为**待真机确认**;若不生效则回退 askAgent 静态指引。

## 7. dogfood + 收尾
- [ ] dogfood `npx trellis init --kiro`,核对 `.kiro/{agents,hooks,skills}` 生成物;`trellis update` 幂等。
- [ ] **真机验证(核心)**:有 Kiro 环境则实测 CLI userPromptSubmit + IDE promptSubmit 是否真把脚本输出喂给模型;无则 PR 标注待社区 Kiro 用户验证。
- [ ] trellis-check → spec 更新(platform-integration.md 改正 Kiro 能力)→ commit。

## 验证点小结(本任务"验证"目标)
1. Kiro 接受的 stdout 格式(步骤 2,可本地模拟)。
2. IDE `promptSubmit+runCommand` 是否注入(步骤 7,需真机)。
3. CLI trellis agent 激活后 userPromptSubmit 是否每轮触发(步骤 7,需真机)。

## Rollback
单平台改动 + 脚本内 Kiro 分支(条件隔离),`git revert` 即可,不影响其它平台。
