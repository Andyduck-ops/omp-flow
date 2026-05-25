# PRD: Add OMP (Oh My Pi) Platform Support to Trellis

## 1. 概述

在 Trellis CLI 中新增 `omp` 作为第 15 个 AI 编程平台。用户执行 `trellis init --omp` 时，CLI 在项目根生成 `.omp/` 下的所有必要文件，使 OMP 能通过原生 provider 自动发现并加载 Trellis 的工作流系统。

OMP 是 Pi 的进化版本，拥有更先进的 ExtensionAPI、原生 task tool、多源能力发现系统。OMP 原生覆盖了 Pi 插件中最复杂的部分（sub-agent 派生、bash 上下文注入、Agent 定义加载），使 Trellis 集成代码量相比 Pi 减少约 65%（~1173 行 → ~400 行）。

OMP extension（`.omp/extensions/trellis/index.ts`）需实现约 280 行 TypeScript，核心组件：

- `resolveActiveTaskStatus()` — 读取 `.trellis/.runtime/sessions/` 解析活跃任务状态
- `buildTaskContext()` — 读取 prd.md + info.md + JSONL 引用的 spec/research 文件
- `buildSessionOverview()` — spawn `python3 get_context.py --mode session-overview`，5s 超时，失败回退静态文本（必须使用 `--mode session-overview` 以满足 spec Cross-platform consistency invariant 的 parity 要求）
- `TurnContextCache` — 1.5s TTL 防止同 turn 的 `input` + `before_agent_start` 双重 spawn
- `before_agent_start` handler — 注入 workflow-state + task context + session overview
- `input` handler — per-turn 刷新 workflow-state + session overview

## 2. 背景

Trellis 已支持 14 个 AI 编程平台（Claude Code、Cursor、Codex、Gemini、Pi 等）。每个平台通过统一的 `AI_TOOLS` 注册表 + `configurators/` 调度机制接入。

**OMP vs Pi 架构差异决定插件策略**：

| | Pi | OMP |
|---|---|---|
| Extension 运行位置 | 独立 wrapper 进程 | OMP 进程内 |
| Sub-agent 机制 | 插件自己 spawn `pi --mode text`（~500 行） | OMP 原生 task tool |
| 上下文注入方式 | `systemPrompt` 字段直接拼接 | `customType` custom message |
| 跨进程上下文 | 需要 TRELLIS_CONTEXT_ID 环境变量 + tool_call 拦截 | 单进程内文件系统直接读，不需要 |

这些差异意味着移植 Pi 逻辑时要**简化而非照搬**：context key 管理链路（`resolveContextKey` / `adoptExistingContextKey` / `createProcessContextKey`）全部可省略，sub-agent 工具注册和 bash 拦截也不需要。但核心的上下文注入逻辑（任务内容 + session overview）必须保留，不能因 OMP 的便利性而省略。

相关规范：
- `.trellis/spec/cli/backend/platform-integration.md` — 平台接入架构与检查清单

## 3. 目标与范围

### 目标
- `trellis init --omp` 生成正确的 `.omp/` 目录结构（commands、skills、agents、extension）
- `trellis update` 正确追踪 OMP 产物文件
- OMP 启动后自动发现 Trellis extension 并加载所有能力
- AI 在每轮 turn 获得 `<workflow-state>` breadcrumb，根据阶段触发对应 skill
- **AI 获得当前任务上下文**（prd.md + info.md + jsonl spec context），通过 `before_agent_start` 以 custom message 注入
- **AI 获得完整 session overview**（`get_context.py` 输出），包含开发者信息、git 分支、活跃任务摘要
- **添加 `input` handler**，确保 per-turn 注入的 breadcrumb 和 session overview 在长对话中保持新鲜
- AI 通过 OMP 原生 `task` tool 调用 `trellis-implement` / `trellis-check` / `trellis-research` 子 agent

### 非目标 (MVP)
- TTSR 规则（流式拦截工作流违规）
- 自定义 slash command（如 `/trellis:status`）
- `tool_result` 后处理（截断、注入链接）
- `context` 事件 handler（Pi 的 passthrough 本身是空操作，无需移植）
- `tool_call` 事件 handler（OMP 单进程内不需要 TRELLIS_CONTEXT_ID 环境变量注入）
- Sub-agent 工具注册 `registerTool("subagent", ...)`（OMP 原生 task tool 覆盖）
- Agent 定义加载（`.pi/agents/*.md`）（OMP skills/agents 自动发现覆盖）

## 4. 关键设计决策

### 4.1 不生成 `settings.json`

OMP 的 native provider 在启动时自动扫描 `.omp/` 下的标准子目录（`extensions/`、`commands/`、`skills/`、`agents/`），无需任何显式配置。这与 Pi 不同，Pi 需要在 `settings.json` 中显式声明所有能力路径和 npm 包依赖。

### 4.2 Extension 核心功能

OMP extension 实现以下注入能力（无需子 agent 调度和 bash 拦截，OMP 原生 task tool 覆盖）：

| 功能 | Pi extension (1173 行) | OMP extension (~400 行) |
|---|---|---|
| Workflow-state 面包屑 | before_agent_start + input | before_agent_start + input |
| 任务上下文（prd/info/jsonl） | before_agent_start systemPrompt 拼接 | before_agent_start custom message |
| Session overview | get_context.py 子进程 | get_context.py 子进程 |
| Sub-agent 调度 | 500+ 行 spawn 逻辑 | OMP task tool 原生处理 |
| Bash 上下文注入 | tool_call 拦截 TRELLIS_CONTEXT_ID | 不需要（单进程） |
| Context key 管理 | resolveContextKey + adoptExistingContextKey 链路 | 不需要（单进程） |

与 Pi 的关键简化：
- **不需要跨进程 context key**：OMP extension 运行在 OMP 进程内，直接通过文件系统读取 session 文件获取当前任务，无需 `TRELLIS_CONTEXT_ID` 环境变量传递链路
- **不需要 sub-agent 工具注册**：OMP 原生 `task` tool 覆盖 sub-agent 派生，不需要 `registerTool("subagent")` + `runPi()` spawn 逻辑
- **注入方式改为 custom message**：OMP ExtensionAPI 不支持 `systemPrompt` 直接拼接，改为 `customType` custom message 注入，对模型行为的引导效果相当

### 4.3 Agent 不使用 pull-based prelude

OMP 是真正的 class-1 平台：task tool 子 session 会重新加载 extensions，`before_agent_start` 自动触发并注入 breadcrumb。不需要 class-2 平台的 pull-based prelude 补偿机制。

### 4.4 Agent 工具名使用 OMP 原生命名

| Pi 工具名 | OMP 工具名 |
|---|---|
| Read, Write, Edit, Bash | read, write, edit, bash |
| Glob, Grep | find, search |
| (不存在) | ast_grep, lsp |

### 4.5 不生成 `start` 命令

`agentCapable: true` → `filterCommands()` 自动过滤 `start`。Extension 在 session 启动时自动注入 workflow 上下文。

## 5. 实现计划

分两阶段执行：**Phase 1** 先手动生成 `.omp/` 产物文件用于 OMP 端验证，验证通过后 **Phase 2** 再适配 Trellis CLI 使其通过 `trellis init --omp` 自动化生成。

### Phase 1: 手动生成 .omp/ 产物（先行验证）

直接在 Trellis 项目根创建 `.omp/` 目录及所有文件，用于在 OMP 中实际测试：

1. **commands** — 2 个斜杠命令
2. **skills** — 5 个技能 + 2 个多文件技能
3. **agents** — 3 个 agent 定义
4. **extensions** — 1 个 extension 入口

目标：确认 OMP 能正确加载 extension、技能被发现、agent 可通过 task tool 调用、workflow-state breadcrumb 注入生效。

验证通过后进入 Phase 2。

### Phase 2: 适配 Trellis CLI

#### 5.2.1 `types/ai-tools.ts` — 新增 OMP 平台注册

```typescript
omp: {
  name: "Oh My Pi",
  templateDirs: ["common", "omp"],
  configDir: ".omp",
  cliFlag: "omp",
  defaultChecked: false,
  hasPythonHooks: false,
  templateContext: {
    cmdRefPrefix: "/trellis:",
    executorAI: "Bash scripts or Task calls",
    userActionLabel: "Slash commands",
    agentCapable: true,      // class-1: extension 注入 context
    hasHooks: true,
    cliFlag: "omp",
  },
},
```

`AITool`、`TemplateDir`、`CliFlag` 联合类型各增加 `"omp"` 字面量。

#### 5.2.2 `templates/omp/` — 新建模板目录

将 Phase 1 验证通过的产物文件搬入模板目录：

```
templates/omp/
├── index.ts                          # 导出 getAllAgents() + getExtensionTemplate()
├── agents/
│   ├── trellis-implement.md          # OMP 原生工具名, 无 pull-based prelude
│   ├── trellis-check.md              # OMP 原生工具名, 无 pull-based prelude
│   └── trellis-research.md           # 含 web_search 工具
└── extensions/
    └── trellis/
        └── index.ts.txt              # ExtensionAPI 模板源（.txt 后缀防止 tsc 编译，与 Pi 一致）
```

> **重要约定**：Extension 模板文件必须使用 `.ts.txt` 后缀（参照 Pi 的 `index.ts.txt`），原因：
> 1. 防止 `tsc` 在 production build 时将其编译为 `.js` 并输出到 `dist/templates/omp/extensions/`
> 2. 与 Pi 模式保持一致（spec `platform-integration.md` Step 4 "TypeScript extension pattern" 明确要求 `.ts.txt`）
> 3. `readTemplate("extensions/trellis/index.ts.txt")` 读取，configurator 写入时去掉 `.txt` 后缀

#### 5.2.3 `configurators/omp.ts` — 新建配置器

```
export configureOmp(cwd): 写入 commands、skills、agents、extension
export collectOmpTemplates(): 返回所有产物文件 Map (供 trellis update 哈希比对)
```

参照 Pi 配置器，简化点：
- 无 `settings.json`
- Agent 不调用 `applyPullBasedPreludeMarkdown`
- 命令输出到 `.omp/commands/`（非 `.pi/prompts/`）

> **关键规则：`collectOmpTemplates()` 必须对 extension 模板应用与 `configureOmp()` 相同的内容变换**。
> 具体而言：`configureOmp()` 写入 extension 时调用 `replacePythonCommandLiterals(getExtensionTemplate())`，`collectOmpTemplates()` 返回同一文件内容时也必须包裹 `replacePythonCommandLiterals()`。
> 否则 Windows 上 `trellis update` 每次运行都会误报 extension 文件变更（因为 `python3` vs `python` 不一致导致哈希不匹配）。
> 参见 spec `platform-integration.md` → Common Mistakes → "Template placeholder not resolved in collectTemplates"。

#### 5.2.4 `configurators/index.ts` — 注册 OMP

```typescript
PLATFORM_FUNCTIONS.omp = {
  configure: configureOmp,
  collectTemplates: () => collectOmpTemplates(),
};
```

#### 5.2.5 CLI + InitOptions

- `cli/index.ts`：添加 `--omp` flag
- `commands/init.ts`：`InitOptions` 添加 `omp?: boolean`

#### 5.2.6 Extension 核心逻辑 (`templates/omp/extensions/trellis/index.ts`)

```
session_start → 发现项目根 (.trellis 存在) → 通知 UI
before_agent_start → 注入 workflow-state breadcrumb + task context (prd/info/jsonl) + session overview
input → per-turn 刷新 workflow-state + session overview (TurnContextCache 1.5s TTL)
```

约 280 行 TypeScript。依赖关系：`ExtensionAPI` from `@oh-my-pi/pi-coding-agent`。

## 6. 产物文件完整清单

```
.omp/
├── commands/
│   ├── trellis-continue.md
│   └── trellis-finish-work.md
├── skills/
│   ├── trellis-brainstorm/SKILL.md
│   ├── trellis-before-dev/SKILL.md
│   ├── trellis-check/SKILL.md
│   ├── trellis-break-loop/SKILL.md
│   ├── trellis-update-spec/SKILL.md
│   ├── trellis-meta/...        (多文件)
│   └── trellis-spec-bootstarp/... (多文件)
├── agents/
│   ├── trellis-implement.md
│   ├── trellis-check.md
│   └── trellis-research.md
└── extensions/
    └── trellis/
        └── index.ts
```

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `findAllNearestProjectConfigDirs` walk-up 行为导致 `.omp/` 在错误层级生成 | 确保 init 时 cwd 为 workspace 根 |
| 用户已禁用多个 provider（opencode, codex, gemini, cursor），但 native provider 未被禁用 | 验证 native provider 仍加载 `.omp/` 内容 |
| `skills.enablePiUser` / `enablePiProject` 遗留开关可能 gate native skill source | 文档提醒用户检查此项 |
| `ast_grep` 工具名是否与 OMP 实际注册名一致 | 在真实 OMP 环境验证 agent 工具列表 |
| Agent 发现是每次执行时重新扫描，模板变更可能不生效 | 需 OMP session 重载才能捕获 agent 变更 |

## 8. 验证计划

### Phase 1 验证 (OMP 端)
1. 手动创建 `.omp/` 目录结构，检查产物文件内容格式正确
2. 启动 OMP，确认 extension 加载且技能被发现
3. AI 获得 `<workflow-state>` breadcrumb，能根据阶段触发对应 skill
4. AI 能通过 `task` tool 调用 `trellis-implement` / `trellis-check` / `trellis-research`

### Phase 2 验证 (CLI 端)
5. `trellis init --omp` 生成与 Phase 1 一致的 `.omp/` 目录结构
6. `trellis update` 正确追踪 OMP 产物文件
7. 回归验证：Phase 1 中通过的 OMP 端测试在 `trellis init --omp` 产物上再次通过

## 9. 工作量估算

### Phase 1
| 组件 | 内容 | 复杂度 |
|---|---|---|
| `.omp/commands/` | 2 个命令文件 | 低 |
| `.omp/skills/` | 5 个技能 + 2 个多文件技能 | 低 |
| `.omp/agents/` | 3 个 agent 定义 | 低 |
| `.omp/extensions/trellis/index.ts` | extension 入口 | 中 |
| **Phase 1 总计** | — | — |

### Phase 2
| 组件 | 代码量 | 复杂度 |
|---|---|---|
| `types/ai-tools.ts` 修改 | 3 行 + 1 条目 | 低 |
| `configurators/omp.ts` | ~80 行 | 中 |
| `templates/omp/` (从 Phase 1 产物搬入) | 6+ 文件 | 低 |
| `templates/omp/index.ts` | ~15 行 | 低 |
| `configurators/index.ts` | 4 行 | 低 |
| CLI + InitOptions | ~10 行 | 低 |
| **Phase 2 总计** | **~110 行新代码** + 模板搬运 | — |

## 10. 开发命令

```bash
# 构建（在 packages/cli 下执行）
cd packages/cli && pnpm run build

# 一次性测试（回到仓库根目录执行，不影响已安装的 trellis）
cd ../.. && node ./packages/cli/bin/trellis.js init --omp
```
