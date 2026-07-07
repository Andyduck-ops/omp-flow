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
 clone 全量外部项目      omp-flow-researcher 提取       Architect 归纳 ADR /          reference/context     精准注入
 (reference/<repo>)     核心代码切片与 file:line 锚点     接口契约 (context/)           列显式绑定             代码参考+红线
```

1. **一级库 (Tier 1 Primary Storage)**：全量外部/成熟框架代码库（直接 clone 至根目录 `reference/<repo>`，如 `reference/pi-dynamic-workflows`）。全量只读。
2. **二级库 (Tier 2 Digested References)**：`omp-flow-researcher` 对一级库执行“消化（Digestion）”后，提取最关键的代码切片与配置保存至 Task 专属 `reference/` 目录（`.omp-flow/tasks/{taskId}/reference/`），每条结论附带一级库的 `file:line` 物理锚点。
3. **三级库 (Tier 3 Distilled Context)**：从二级切片中归纳提炼出的 ADR 决策（`context/decision/`）与接口契约（`context/interface/`），制定 `MUST`/`MUST NOT` 规则。
4. **CSV 双列索引**：`tasks.csv` 同时提供 `reference` 与 `context` 索引列：

```csv
id,wave,priority,title,scope,action,reference,context,status,tier,taskMd
T1,1,P0,Shared Store,src/core/store.ts,implement store,"src/core/shared-context-store.ts,src/core/context-resolver.ts","decision:ADR-001;interface:store-api",pending,default,.task/T1.md
```

- `reference` 列（逗号分隔路径）➔ 读取工作区文件内容注入 `<omp-flow-references>` 供 Agent 继承最佳实践。
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
  agent: AgentDefinition;   // agent 定义（从 .omp-flow/agents/ 加载）
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
  agent: loadedAgentDef,    // 从 .omp-flow/agents/{role}.md 加载
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