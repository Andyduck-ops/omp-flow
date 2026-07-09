# AGENTS.md — omp-flow 项目指南

> AI 助手工作指南。本文件是 omp-flow 项目的唯一权威上下文入口。

---

## 项目定位

omp-flow 是基于 Oh-My-Pi (OMP) 运行时的多 Agent 工作流编排框架,融合 Trellis 分层规约上下文与 Maestro Ralph FSM 引擎。

- **运行时**: OMP (Pi 的 fork,编译型 Rust+TS 二进制,安装在 `~/.omp/`)
- **运行时参考源码**: `reference/oh-my-pi/` (gitignored,不可提交)
- **生态参考项目**: `reference/superpowers/`、`reference/pi-dynamic-workflows/` (gitignored)

---

## OMP 运行时机制 (Agent 必读)

OMP 的扩展加载、Hook 系统、Plugin 生命周期是 omp-flow 运行的基础设施。以下内容来自 `reference/oh-my-pi/docs/` 的实际文档。

### 分级 Reference 数据库与“消化”工作流 (Multi-Tier Reference & Digestion Pipeline)

“没有调查就没有发言权”。omp-flow 借鉴生物学一级/二级数据库分级思想，建立完整的参考消化流水线：

```text
[一级全量库 Tier 1] ──► [二级消化切片 Tier 2] ──► [三级结构化契约 Tier 3] ──► [CSV 调度器] ──► [Worker 落地]
 clone 全量外部项目      omp_flow_reference 消化        Architect 归纳 ADR /          reference/context     精准注入
 (reference/<repo>)     核心代码切片与 file:line 锚点     接口契约 (context/)           列显式绑定             代码参考+红线
```

1. **一级库 (Tier 1 Primary Storage)**：全量外部/成熟框架代码库（直接 clone 至根目录 `reference/<repo>`，如 `reference/pi-dynamic-workflows`）。全量只读。
2. **二级库 (Tier 2 Digested References)**：`omp-flow-researcher` 识别值得复用的一级库源码锚点，`omp_flow_reference` / `ReferenceDigester` 执行“消化（Digestion）”，把最关键的代码切片与配置保存至 Task 专属 `reference/` 目录（`.omp-flow/tasks/{taskId}/reference/`），每条结论附带一级库的 `file:line` 物理锚点。
3. **三级库 (Tier 3 Distilled Context)**：从二级切片中归纳提炼出的 ADR 决策（`context/decision/`）与接口契约（`context/interface/`），制定 `MUST`/`MUST NOT` 规则。
4. **CSV 双列索引**：`tasks.csv` 同时提供 `reference` 与 `context` 索引列：

### Research Gate：调查优于设计，设计优于实现

omp-flow 的默认哲学是：**没有调查就没有发言权；调查优于设计，设计优于实现**。Brainstorm 不是直接进入 PRD/Design；在设计收敛前，主 Agent 必须先判断是否需要 Research Gate。

Research Gate 是可跳过的，但跳过必须有明确理由：用户显式指定“不需要调研”、任务只是在已有已接受 context 内做机械变更、或相关 reference/context 已经足够。否则，主 Agent 应优先组织调研，再进入 Architect 设计。

Research 分两类：

1. **对内调研（Internal Research）**：审视当前仓库、`.omp-flow/specs/`、`.omp-flow/knowhow/`、既有 `context/`、历史 findings、现有实现模式。产出写入 `.omp-flow/tasks/{taskId}/research/{role-or-topic}.md`。
2. **对外调研（External Research）**：围绕当前需求寻找成熟项目、框架、插件或前人优雅实现；用户也可以直接指定参考对象。候选项目经确认后 clone 到根目录 `reference/<repo>` 作为 Tier 1 全量库，再由 `omp_flow_reference` / `ReferenceDigester` 消化为 Task 专属 `reference/` Tier 2 切片。

Research Gate 的输出不等于最终设计：

- `research/{role-or-topic}.md` 保存调查过程、比较、开放问题、候选方案和取舍依据。
- `reference/` 保存从 Tier 1 全量库消化出的可复用代码/配置/模式切片，必须带 `sourceRepo/sourcePath/sourceLines` provenance。
- `context/` 保存 Architect 从 research/reference 中提炼出的稳定 ADR、接口契约、Brief 和 Finding。

正确顺序是：

```text
seed task workspace
  -> brainstorm / user direction discussion
  -> Research Gate (internal and/or external)
  -> reference digestion
  -> architect distills context + PRD/design
  -> decompose tasks.csv + .task/*.implement.md
  -> executor/reviewer dispatch
```

用户指定 reference 时，主 Agent 应优先把指定对象纳入 Research Gate；用户未指定时，主 Agent 可先做对内调研，再建议是否需要对外调研和 clone 哪些候选项目。

```csv
id,wave,priority,title,scope,action,reference,context,status,tier,taskMd
T1,1,P0,Shared Store,src/core/store.ts,implement store,"ref:pdw-shared-store#L1-55","decision:ADR-001;interface:store-api",pending,default,.task/T1.implement.md
```

- `reference` 列（分号分隔 `ref:<slug>#Lx-y`）➔ 读取 Task 专属 `reference/` 消化切片注入 `<omp-flow-references>` 供 Agent 继承最佳实践。
- `context` 列（分号分隔 type:id 对）➔ 读取 `context/decision/ADR-001.md` 注入 `<omp-flow-context-pack>` 约束行为红线。

### 扩展加载 (4 条发现路径)

OMP 启动时通过 `discoverAndLoadExtensions()` 按以下顺序发现并加载扩展 (`docs/extension-loading.md`):

1. **原生自动发现** — 扫描 `<cwd>/.omp/extensions/` (项目级) 和 `~/.omp/agent/extensions/` (用户级) 的 `.ts`/`.js` 文件
2. **JS/TS Hook 工厂** — `.omp/hooks/pre/*.ts` 通过 `hookCapability` 发现,作为扩展模块加载
3. **已安装插件的扩展入口** — 来自 npm 安装或 `omp plugin link` 的插件的 `package.json` `omp.extensions` (或 legacy `pi.extensions`) 声明
4. **显式配置路径** — `~/.omp/agent/config.yml` 的 `extensions:` 数组,或 `<cwd>/.omp/settings.json`,或 CLI `--extension/-e`

**关键**: Marketplace 安装的插件**不加载扩展模块** — 只有 npm 安装或 `omp plugin link` 的插件才会。

### `package.json` 声明式扩展注册

包通过 `package.json` 声明扩展入口:
```json
{
  "omp": {
    "extensions": ["./src/omp/extension-entry.ts"],
    "skills": ["./skills"]
  }
}
```
Legacy `pi.extensions` / `pi.skills` 同样被接受。OMP 遇到含此字段的 `package.json` 时,自动加载声明的入口文件。

- **superpowers** (`reference/superpowers/package.json:15-22`): `pi.extensions` + `pi.skills` 声明式注册,无需 installer 生成胶水层
- **pi-dynamic-workflows** (`reference/pi-dynamic-workflows/package.json:52-55`): `pi.extensions` 声明 `extensions/workflow.ts`,`files` 包含 `dist/` + `extensions/` + `src/`
- **Trellis** (`reference/Trellis/packages/cli/src/templates/pi/extensions/trellis/index.ts.txt:70-89`): `pi.extensions` + `pi.skills` 声明式加载,并在 `resources_discover` hook 中动态贡献 skills 目录路径,无需拷贝物理文件

**对 omp-flow 的意义**: `OMPFlowInstaller.install()` 生成的 `.omp/extensions/omp-flow.ts` 胶水层在 npm 安装或 `omp plugin link` 场景下是冗余的 — OMP 直接读 `package.json` 的 `omp.extensions` 字段。
### 扩展工厂契约

扩展模块导出一个默认工厂函数 (`docs/extensions.md`):
```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
  // 注册阶段: pi.on(), pi.registerTool(), pi.registerCommand() 可用
  // 运行时动作: pi.sendMessage() 等在 ExtensionRunner.initialize() 后才可用
}
```

### Hook 系统 (事件面与返回值契约)

Hook 是事件拦截子系统,与扩展共享 `EventBus` 和 `ExtensionRunner` (`docs/hooks.md`)。

| 类别 | 事件 | 可返回 |
|---|---|---|
| **Session** | `session_start`, `session_before_switch/branch/compact/tree` (可取消), `session_switch/branch/compact/tree`, `session_shutdown` | `{ cancel?: boolean }` 在 `before_*` 事件 |
| **Prompt/Turn** | `input`, `before_agent_start`, `context`, `agent_start`, `agent_end`, `turn_start`, `turn_end` | `before_agent_start`: `{ message? }`; `context`: `{ messages? }` |
| **Tool** | `tool_call` (执行前), `tool_result` (执行后) | `tool_call`: `{ block?: boolean; reason?: string }`; `tool_result`: `{ content?; details?; isError? }` |
| **Reliability** | `auto_compaction_start/end`, `auto_retry_start/end`, `ttsr_triggered`, `todo_reminder`, `goal_updated` | — |
| **Session stop** | `session_stop` (仅主会话,非子代理) | `{ continue: true, additionalContext }` 或 `{ decision: "block", reason }` — 最多 8 次连续续行 |

#### 冲突解决规则
- `tool_call`: 首个 `{ block: true }` 短路;否则最后结果生效
- `tool_result`: 最后覆盖生效 (无短路)
- `context`: 链式 — 每个 handler 接收前一个的输出
- `before_agent_start`: 首个返回 message 生效;后续忽略
- `session_before_*`: `cancel: true` 立即短路

### Plugin Manager (`omp plugin`)

```bash
omp plugin install <npm-spec|git-spec>   # npm 或 git 插件安装
omp plugin link <local-path>              # 本地开发符号链接
omp plugin list                           # 列出已安装插件
omp plugin enable/disable <name>          # 切换运行时状态
omp plugin doctor [--fix]                 # 诊断漂移
```

插件存储在 `~/.omp/plugins/`(`package.json`、`node_modules/`、`omp-plugins.lock.json`)。项目覆盖在 `<cwd>/.omp/plugin-overrides.json`。

#### Manifest 解析优先级
1. `package.json.omp` — 首选
2. `package.json.pi` — legacy 回退
3. `{ version: package.version }` — 最小默认

无 `omp`/`pi` manifest 的包可安装但在运行时发现时被跳过。

#### Feature 选择语法
- `pkg` — 默认 features
- `pkg[*]` — 所有 features
- `pkg[feat-a,feat-b]` — 显式 features
- `@scope/pkg@1.2.3[feat]` — scoped + 版本 + features

### Marketplace 系统

OMP 兼容 Claude Code 插件注册格式:
```bash
omp plugin marketplace add <github-repo|url|local-dir>
omp plugin install name@marketplace
```
Marketplace 目录在 `.omp-plugin/marketplace.json` (首选) 或 `.claude-plugin/marketplace.json` (回退)。

### OMP vs Pi 关键差异
- OMP 使用 `.omp/` 目录;Pi 使用 `.pi/` (OMP 接受 legacy `pi.extensions` manifest,但 `.pi/extensions` 不是原生发现根)
- OMP 扩展 API: `@oh-my-pi/pi-coding-agent` (Pi: `@earendil-works/pi-coding-agent`)
- OMP 使用 `omp.extensions` manifest key (Pi: `pi.extensions` — 两者都被 OMP 接受)
- OMP CLI 是编译型 Rust+TS 二进制;Pi 是纯 TS

---

## 成熟生态模式 (Agent 设计参考)

以下模式来自 `reference/superpowers/` 和 `reference/pi-dynamic-workflows/` 的实际实现,均经 file:line 验证。

### 模式 1: 声明式打包 — 无需 installer 胶水层

**superpowers** (`reference/superpowers/package.json:15-22`):
```json
{
  "pi": {
    "extensions": ["./.pi/extensions/superpowers.ts"],
    "skills": ["./skills"]
  }
}
```
**pi-dynamic-workflows** (`reference/pi-dynamic-workflows/package.json:52-55`):
```json
{
  "pi": {
    "extensions": ["extensions/workflow.ts"]
  }
}
```
两者都不生成 `.omp/extensions/*.ts` 胶水层 — OMP 直接从 `package.json` 加载。

### 模式 2: Hook 驱动的上下文注入

**superpowers** 的上下文注入机制 (`reference/superpowers/.pi/extensions/superpowers.ts`):
- `resources_discover` → 贡献 `skillPaths: [skillsDir]` 让运行时发现 skills (:15-17)
- `session_start` → 设置 `injectBootstrap = true` (:23-25)
- `session_compact` → 重新设置 `injectBootstrap = true` (压缩后重新注入) (:27-29)
- `agent_end` → 设置 `injectBootstrap = false` (agent 回合后停止注入) (:31-33)
- `context` → 检查 `injectBootstrap` flag,扫描已有消息避免重复注入,插入 bootstrap 消息在 compaction summary 之后 (:35-56)

**注入内容**: 一个合成的 `user` 消息,包裹在 `<EXTREMELY_IMPORTANT>` 中,包含完整 bootstrap skill 内容。**不是 FSM 事件,是自然语言指令消息**。

**去重**: 基于 marker 字符串扫描已有消息,而非状态机持久化 (`:84-104`)。

### 模式 3: 注册原生工具让 LLM 调用

**pi-dynamic-workflows** (`reference/pi-dynamic-workflows/extensions/workflow.ts:19-34`):
```ts
const workflowTool = createWorkflowTool({ cwd, manager, storage });
pi.registerTool(workflowTool);
```
工具通过 `promptGuidelines` 教 LLM 使用编排 DSL (`workflow-tool.ts:163-197`):
- 参数 schema: `script` (必需), `args`, `background`, `maxAgents`, `concurrency`, `agentTimeoutMs`, `tokenBudget`
- guidelines 注入 system prompt,解释 `agent()`/`parallel()`/`pipeline()`/`phase()` 语义、模型路由规则、质量原语

### 模式 4: `session_start` 统一引导

**pi-dynamic-workflows** 在单个 `session_start` hook 中完成 (`extensions/workflow.ts:49-86`):
1. 记录主模型到 manager (tier 路由)
2. 共享 modelRegistry 给 manager
3. 确保 workflow tool 已激活
4. 通过 `sessionManager.getSessionId()` 限定会话范围
5. 安装后台结果交付 (`installResultDelivery`)
6. 安装实时任务面板 (`installTaskPanel`)
7. 安装 workflow 编辑器 (`installWorkflowEditor`)


### 模式 7: Skill 驱动的行为塑造 (无 FSM)

**superpowers** 的核心洞察 (`reference/superpowers/CLAUDE.md:72-91`):
- Skill 文本即"行为塑造代码",不是散文
- Bootstrap skill 在 session_start 注入,让 agent 在任何动作前先加载 skill
- 流程顺序由 skill 内容定义 (brainstorming → TDD → debugging),而非运行时状态机
- Red Flags 表阻止常见 rationalization ("这只是个简单问题" → 停,先读 skill)

### 模式 8: 多 Harness 兼容

**superpowers** 用一套实现支持 Pi / Claude Code / Cursor / Copilot:
- Pi: `.pi/extensions/superpowers.ts` (extension API)
- Claude Code: `hooks/hooks.json` (SessionStart command hook)
- Cursor: `hooks/hooks-cursor.json`
- Copilot: SDK 标准 `additionalContext`
- 共享一个 `session-start` 脚本,仅 JSON 输出格式不同 (`hooks/session-start:24-47`)

### 模式 9: Trellis 环境上下文锁传递 (Context-ID Tunneling)

**Trellis** (`reference/Trellis/.pi/extensions/trellis/index.ts:442-446`, `:1575-1585`):
- `tool_call` hook 拦截所有 `bash` 命令调用。
- **自动在命令前注入 `export TRELLIS_CONTEXT_ID=<taskId>;`** (除非已存在)。
- 这使得所有子进程、派生 agent、或外部 shell 脚本执行时，能物理级共享相同的 active task 状态，实现环境级锁定传递。

### 模式 10: 压缩重新激活与时间局部性缓存

**Trellis** (`reference/Trellis/packages/cli/src/templates/opencode/plugins/session-start.js:23-27`):
- 监听 `session_compact` 事件，压缩后立即重置 `injectContext` / `processed` 状态，确保在压缩后的下一轮 prompt 中重新注入核心 ADR/引导信息，防失忆。
- `before_agent_start` 缓存生成的 context 块 1.5 秒 (`getTurnCtx()`, `:1370-1388`)，避免在一轮调用（包含多次 tool 交互）中重复读盘和重新运行生成器。

### 模式 11: 预制腰带 - Per-Agent 工具隔离 (2026-07-08)

**背景**: OMP 的 extension 工具默认对所有 Agent 全局可见（`sdk.ts:2386-2397` 的 `alwaysInclude` 逻辑），`AgentDefinition.tools` 白名单无法隐藏非 `defaultInactive` 的 extension 工具。这导致 executor 子 agent 能调用 `omp_flow_submit_verdict` 伪造审查证据。

**核心洞察**: OMP 缺乏"角色（Role）"的头等公民定义，extension tool execute 收到的是 `ExtensionContext`（无 `agentId`/`taskDepth`/`role`），而非内置工具的 `AgentToolContext`（有完整身份信息）。`RegisteredToolAdapter.execute()`（`wrapper.ts:52-60`）丢弃了 `AgentToolContext`，只传 `ExtensionContext`。因此 extension tool **无法在 execute 内做动态鉴权**。

**解决方案**: "预制腰带"模式 -- 静态定义角色工具白名单 + `defaultInactive` 撤销插件特权 + 编排者按角色派发腰带。

```text
1. 预制腰带（静态设计图）
   .omp/agents/executor.md:
     tools: [read, write, edit, bash, grep, glob, lsp, ast_grep]
     // 不包含 omp_flow_submit_verdict -> executor 物理上看不到该工具

   .omp/agents/reviewer.md:
     tools: [read, bash, grep, glob, lsp, ast_grep, omp_flow_submit_verdict]
     // 包含 submit_verdict -> reviewer 可以调用

2. 撤销插件特权
   pi.registerTool({ name: "omp_flow_submit_verdict", defaultInactive: true, ... })
   // defaultInactive=true -> OMP 不再自动塞进所有 session 的工具腰带
   // 退化成和内置工具一样，遵循 AgentDefinition.tools 白名单

3. 编排者发腰带（动态派发）
   Main Agent 调用 dispatch(role="reviewer")
   -> runSubprocess 加载 .omp/agents/reviewer.md
   -> OMP 按白名单组装工具腰带 -> reviewer 拿到 submit_verdict
   -> executor 的腰带里没有 submit_verdict，物理隔离完成
```

**三层防御**:
| 层 | 机制 | 保护对象 |
 |---|------|---------|
 | 1. 物理隔离 | `defaultInactive: true` + agent tools 白名单 | executor 看不到 verdict 工具 |
 | 2. 激活控制 | `setActiveTools()` 只在 Main session 激活 dispatch | 子 agent 无法派发子 agent |
 | 3. 控制面 block | `onToolCall` ABSOLUTE_NO_WRITE | 所有角色无法 write 控制面文件 |

**参考源码**:
- `reference/oh-my-pi/packages/coding-agent/src/sdk.ts:2386-2397` - `alwaysInclude` 逻辑（非 defaultInactive 插件工具被强行注入所有 session）
- `reference/oh-my-pi/packages/coding-agent/src/sdk.ts:2344-2351` - `defaultInactive` 过滤逻辑
- `reference/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts:437-441` - `defaultInactive` 字段定义
- `reference/oh-my-pi/packages/coding-agent/src/extensibility/extensions/wrapper.ts:52-60` - `RegisteredToolAdapter.execute` 丢弃 `AgentToolContext`
- `reference/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts:333-364` - `ExtensionContext` 无 agent 身份字段
- `reference/pi/packages/coding-agent/test/suite/regressions/2835-tools-allowlist-filters-extension-tools.test.ts` - Pi 官方回归测试：tools 白名单应过滤插件工具

### 模式 12: OMP 运行时模块的 import 策略 (2026-07-08)

**背景**: `@oh-my-pi/pi-coding-agent` 包未安装在工作区 `node_modules` 中（architecture-constraints.md §1 要求零运行时依赖）。它是 OMP 运行时在进程内提供的宿主模块。静态 `import { runSubprocess } from '@oh-my-pi/pi-coding-agent/task/executor'` 在 `npx tsc` 时通过（有 ambient `.d.ts`），但在 `npx tsx` 运行测试时因 Node ESM 解析器找不到包而崩溃 (`ERR_MODULE_NOT_FOUND`)。

**约束**:
- 项目规则禁止动态 `await import()`（`ts-no-dynamic-import` 规则）
- 项目规则禁止内联 `import("pkg").Type`（`ts-import-type` 规则）
- `npx tsc` 必须零错误（ambient `.d.ts` 解决编译期类型）
- `npx tsx` 测试必须能运行（不能让 import 在模块加载时崩溃）

**解决方案**: `createRequire` + lazy require

```ts
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 在函数内部 lazy require，不在模块加载时执行
const { runSubprocess } = require('@oh-my-pi/pi-coding-agent/task/executor');
```

**原理**:
- `createRequire` 是 Node.js 标准 API，不算动态 import（不违反 `ts-no-dynamic-import`）
- lazy require 只在函数被调用时执行，测试不调用 dispatch 的 execute 就不会触发模块解析
- ambient `.d.ts` (`src/types/oh-my-pi-ambient.d.ts`) 让 tsc 识别类型
- 在 OMP 运行时进程内，`require` 能解析到真实的 `@oh-my-pi/pi-coding-agent` 模块

**ambient 声明文件**: `src/types/oh-my-pi-ambient.d.ts` 声明了 `@oh-my-pi/pi-coding-agent/task/executor` 和 `@oh-my-pi/pi-coding-agent/task/types` 两个模块的类型。tsc 识别这些声明，不报 `Cannot find module` 错误。

**已知限制** (TODO: task 07-09-omp-import-strategy):
- `AgentDefinition` 类型在 dispatch-tool.ts 中本地定义而非从 ambient import，因为 `import type` 也会触发 tsx 解析
- 未来考虑 tsconfig path mapping 或将 ambient 声明改为可被 tsx 解析的虚拟模块

### 模式 13: 轻量编排者 (Lite Orchestrator) — 禁用 bash/代码智能工具 (2026-07-08)

**背景**: 多 Agent 协同系统（omp-flow）中，Main Agent（编排层）的职责是“控制、协调、决策”，而非具体实现。但在默认 OMP 环境下，主进程加载了全量内置工具（包括 `bash`, `lsp`, `ast_grep`, `browser` 等）及全部 MCP 工具。这会导致：
1. **环境漂移风险**: 编排者擅自运行 `bash` 进行代码修改或编译，破坏环境一致性。
2. **角色越权**: 编排者试图自己写代码解决问题，而非派发 `executor`。
3. **网关超限 (400 错误)**: 35+ 个工具的参数 schema 累加超过 LiteLLM 网关 100 参数上限。

**解决方案**: 物理剪裁 Main Agent 的工具腰带。

1. **禁用 task 工具，强制使用 dispatch**:
   在 `session_start` hook 中，从 active 列表中剔除 `task` 工具，使 LLM 无法看到或调用它：
   ```ts
   pi.on('session_start', async (event, ctx) => {
     if (isMainSession && pi.getActiveTools && pi.setActiveTools) {
       const active = pi.getActiveTools();
       const next = [...active.filter(t => t !== 'task'), 'omp_flow_dispatch'];
       await pi.setActiveTools(next);
     }
   });
   ```

2. **剔除 `bash` 与代码智能工具**:
   在 Main 进程中禁用 `bash`, `lsp`, `ast_grep`, `ast_edit`, `browser` 编码级工具。主进程只保留：
   +- **状态读取**: `read`, `grep`, `glob` (只读控制面和日志)
   +- **流程控制**: `omp_flow_dispatch`, `job`, `irc`, `todo`
   +- **交互决策**: `ask`, `resolve`

**优势**:
**- 绝对安全**: 编排层物理无法运行 `bash`，杜绝环境污染。
**- 逼迫协作**: 编排层遇到代码问题，由于没有编辑/运行工具，**必须且只能**派发 `executor` 子 Agent 完成。
**- Token 极省**: 移除 20+ 个复杂工具 of JSON schema，极大降低 Prompt 消耗并规避网关参数超限风险。

### 模式 14: Hook 正则动态裁剪工具腰带 (2026-07-08)

**背景**: OMP 原生的 `task` 工具派发子 Agent 时，默认使子进程继承主进程的所有工具集（包括 35+ 个内置、MCP 和插件工具），绕过了 `AgentDefinition.tools` 白名单。这导致子 Agent 因参数超限（400 错误）崩溃，且无法实现角色隔离。

**核心洞察**: 既然我们无法魔改 OMP 内置的 `task` 工具源码，我们可以在子会话启动时的 `session_start` Hook 阶段进行**逆向物理拦截**。通过读取系统 Prompt 识别当前 Agent 角色，解析其配置白名单并强行剔除无用工具。

**解决方案**:

1. **正则捕获 Agent 角色**:
   在 `session_start` 里，通过 `ctx.getSystemPrompt()` 拿到的系统 Prompt 数组，正则匹配我们自定义的标志：
   ```ts
   const promptText = ctx.getSystemPrompt().join('\n');
   const match = promptText.match(/# (Executor|Reviewer|Architect|QbD Auditor|Explore|Planner|Oracle) Agent/i);
   ```

2. **读取配置并裁剪**:
   如果匹配到了角色（例如 `Executor`）：
   - 读 `.omp/agents/executor.md` 的 frontmatter，解析 `tools` 字段作为 whitelist
   - 获取当前 active 的全部工具：`const active = pi.getActiveTools()`
   - 过滤 active 列表，强行剔除不在 whitelist 内的工具，调 `pi.setActiveTools()` 写入

**优势**:
**- 零侵入接管**: 完美兼容原生 `task` 工具和 `runSubprocess`，在 OMP 进程启动的最初阶段完成物理级裁剪。
**- 零污染**: 子 Agent 根本不会在 Available tools 里看到 `generate_image` 或多余的 MCP 工具，避免 400 错误，节省 Token。
**- 高内聚**: 白名单仍然静态配置在 `.omp/agents/*.md` 中，Hook 仅作为动态执行器。

---

## 关键发现：runSubprocess 直接调用 (2026-07-07)

### 背景

在设计 dispatch 工具的 subagent spawn 机制时，调研了三种方案：

| 方案 | 机制 | 硬门控 | IRC/trace/custom tool | 启动开销 |
|------|------|--------|----------------------|---------|
| A. pi.exec 子进程 | `pi.exec("omp", ["--print", ...])` | ✅ | ❌ 全部丢失 | ❌ 大 |
| B. 包装原生 task | dispatch 装配 → LLM 再调 task | ❌ 可绕过 | ✅ | ✅ 小 |
| C. **runSubprocess 直接调用** | `import { runSubprocess } from "@oh-my-pi/pi-coding-agent/task/executor"` | ✅ | ✅ | ✅ |

### 结论：方案 C 完胜

`runSubprocess` 是 OMP 内部 task 工具用来 spawn subagent 的核心函数（`reference/oh-my-pi/packages/coding-agent/src/task/executor.ts:1834`）。它被 `export`，且通过 `@oh-my-pi/pi-coding-agent/task/executor` 包路径可 import（`package.json` 的 `"./task/*"` exports 映射）。

### 访问方式

```ts
// 方式 1：直接 import（extension 运行在同一个 Node 进程里）
import { runSubprocess } from "@oh-my-pi/pi-coding-agent/task/executor";

// 方式 2：通过 pi.pi（ExtensionAPI 的 package exports 访问）
const { runSubprocess } = pi.pi["@oh-my-pi/pi-coding-agent/task/executor"];
```

### ExecutorOptions 关键字段

```ts
interface ExecutorOptions {
  cwd: string;              // 工作区路径
  agent: AgentDefinition;   // agent 定义（从 .omp/agents/ 加载）
  task: string;             // 五层装配的完整 prompt
  assignment?: string;      // 不单独传（已包含在 task 里）
  context?: string;         // 传空字符串（不重复注入）
  role?: string;            // 角色标识（executor / reviewer）
  index: number;            // 0
  id: string;               // 唯一 ID（如 "A-001-1700000000"）
  signal?: AbortSignal;     // 取消信号
  onProgress?: (p: AgentProgress) => void;  // 进度回调
  modelOverride?: string;   // 模型覆盖（如 "pi/slow"）
  taskDepth?: number;       // 递归深度
  // ... 其他可选字段见 executor.ts:265-395
}
```

### 对 dispatch 工具的意义

dispatch 工具的 `execute` 函数内部直接调用 `runSubprocess`：

```ts
const result = await runSubprocess({
  cwd: workspaceDir,
  agent: loadedAgentDef,    // 从 .omp/agents/{role}.md 加载
  task: assembledPrompt,     // 五层装配的完整 prompt
  context: '',              // 不重复注入
  role: input.role,
  index: 0,
  id: `${input.rowId}-${Date.now()}`,
  signal,
  onProgress: (p) => onUpdate?.({ text: p.text }),
});
return { content: [{ type: 'text', text: result.output }] };
```

### 为什么这改变了设计

1. **不需要 pi.exec 子进程** — 之前的 `omp --mode json --print --no-session` 方案废弃，不再有 stdin 限制、JSONL 解析、进程管理开销
2. **保留全部 OMP 原生能力** — IRC、tool trace、usage 统计、custom tool（submit_verdict）、结构化输出、agent keep-alive、local:// 共享全部可用
3. **硬门控仍成立** — dispatch 工具是 LLM 的唯一调用入口（`pi.registerTool`），LLM 无法绕过它直接调 `runSubprocess`
4. **Recursion Guard 仍需要** — 子 agent 内部如果也能调 dispatch 工具，需要通过 `taskDepth` 或环境变量阻止递归

### 参考文件

- `reference/oh-my-pi/packages/coding-agent/src/task/executor.ts:265-395` — ExecutorOptions 接口
- `reference/oh-my-pi/packages/coding-agent/src/task/executor.ts:1834` — runSubprocess 函数
- `reference/oh-my-pi/packages/coding-agent/package.json:534-541` — `./task/*` exports 映射
- `reference/oh-my-pi/docs/extensions.md:134` — `pi.pi`（package exports）说明
- `reference/Trellis/.pi/extensions/trellis/index.ts:1092-1204` — Trellis 的 runPi() 对比（用 spawnSync 子进程，因为我们当时还没发现 runSubprocess）
