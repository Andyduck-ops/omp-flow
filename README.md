# omp-flow

omp-flow 是一个项目本地、调查优先、面向多 Agent 开发的工作流。

它不替代 OMP、Codex 或其他 Harness 的原生 Agent 系统。它提供一套可移植的 Python 控制面，用文件保存任务状态、调查证据、设计决策、精确依赖、质量门和审查证据；模型派发、并发、进度、取消、模型选择和 UI 继续由宿主平台负责。

> 没有调查就没有发言权。调查优于设计，设计优于实现。

## 设计哲学

1. **先调查，后设计。** Brainstorm 用于理解方向，Research 用证据回答问题，Design 才负责做决定。
2. **站在巨人的肩膀上。** 外部成熟项目先作为 Tier 1 全量库考察，再把真正有价值的源码锚点消化成任务专属 Tier 2 Reference。
3. **聊天不是事实来源。** 需求、研究、Reference、决策、拓扑、审查和 Evidence 都落在任务目录里。
4. **确定性状态交给 Python。** 模型不直接写生命周期、Gate、Evidence 或 session pointer。
5. **使用 Harness 原生能力。** 子 Agent 通过 OMP/Codex 原生机制运行，不维护自定义 dispatcher、模型别名或进度渲染器。
6. **审查必须独立。** Executor 成功只进入 Review；只有独立 Reviewer 提交的当前 PASS Evidence 才能完成 row。
7. **失败必须可见。** 缺失上下文、陈旧 digest、无效拓扑或身份不明都直接失败，不用兜底隐藏流程问题。

## 系统边界

```text
┌──────────────────────────────────────────────────────────────┐
│ Harness                                                      │
│ OMP / Codex / future adapters                                │
│ models · native agents · batch · progress · cancel · UI      │
└──────────────────────────────┬───────────────────────────────┘
                               │ native task / agent
┌──────────────────────────────▼───────────────────────────────┐
│ Skills + Agent Prompts                                       │
│ route the phase · shape behavior · enforce role boundaries   │
└──────────────────────────────┬───────────────────────────────┘
                               │ Python commands
┌──────────────────────────────▼───────────────────────────────┐
│ .omp-flow Python control plane                               │
│ session · lifecycle · context · reference · topology         │
│ QbD digest · evidence · archive                              │
└──────────────────────────────┬───────────────────────────────┘
                               │ project artifacts
┌──────────────────────────────▼───────────────────────────────┐
│ Task workspace                                               │
│ brainstorm · research · reference · context · PRD · Design   │
│ tasks.csv · row briefs · audits · reviews · evidence          │
└──────────────────────────────────────────────────────────────┘
```

职责只有一个方向：

| 层 | 负责 | 不负责 |
|---|---|---|
| Python | 状态、校验、provenance、digest、Evidence、归档 | 研究与设计判断 |
| Skills | 主 Agent 当前阶段的操作程序和路由 | 写确定性状态 |
| Agent prompts | 子 Agent 身份、输入、边界、验证和 handoff | 项目生命周期 |
| Hooks | 平台事件翻译、上下文传递、机械保护 | 工作流语义 |
| Harness | 模型、派发、并发、进度、取消、隔离和 UI | omp-flow 业务状态 |

## 完整流程

```text
用户方向
   │
   ▼
Task Seed ──► Brainstorm
                 │
                 ▼
        ┌── Research Gate ──────────────────────────────┐
        │ internal repository research                 │
        │ external mature-project research             │
        │ Tier 1 clone -> Tier 2 digestion              │
        └───────────────────┬───────────────────────────┘
                            ▼
                  selected 90-synthesis
                            │
                            ▼
               PRD + Design + Tier 3 Context
                            │
                            ▼
                 QbD 1 model audit
                            │
                     human calibration
                            │ PASS
                            ▼
             exact-topology tasks.csv + row briefs
                            │
                            ▼
                 QbD 2 model audit
                            │
                     human calibration
                            │ PASS / freeze
                            ▼
                   native execution waves
                  ┌─────────┴─────────┐
                  ▼                   │
              Implement              │
                  │                   │
                  ▼                   │
          independent Review         │
             │             │         │
          FAIL             PASS      │
             └── needs_fix   └────────┘ unlock dependents
                            │
                            ▼
             integration verification
                            │
                            ▼
             deliberate harvest + archive
```

Research Gate 可以跳过，但必须记录明确理由，例如用户显式拒绝、变更完全机械且已有接受的 Context，或现有研究已经充分。QbD 的模型 PASS 不能代替用户批准。

拓扑在 QbD 2 人类批准后 append-only 冻结。执行阶段发现需要修正时不解冻拓扑，而是走一份经审批的变更单（amendment / change order）：`topology amend` 循环在 `phase=execute` 内完成，已完成 row 的 Evidence 保持不变。详见下面的「变更单 / Amendment」。

## 安装与初始化

```bash
npm install -g omp-flow
```

在目标仓库中选择需要的 Harness：

```bash
omp-flow init --omp
omp-flow init --codex
omp-flow init --claude
omp-flow init --omp --codex --claude
```

交互式终端也可以直接运行 `omp-flow init` 选择 Harness（逗号分隔 `omp,codex,claude`）。非交互环境必须显式传 `--omp`、`--codex` 和/或 `--claude`。

初始化结果记录在：

```json
{
  "schemaVersion": 1,
  "harnesses": ["omp", "codex", "claude"]
}
```

该文件位于 `.omp-flow/config.json`。后续 `omp-flow update` 只更新已配置的 Adapter，不会给 Codex-only 项目安装 `.omp/`，也不会反向污染 OMP-only 项目；Claude 同理只落在 `.claude/`。

## 项目目录

```text
project/
├── .omp-flow/                         # 平台中立控制面与任务数据
│   ├── config.json                    # 已启用 Harness
│   ├── workflow.md                    # 工作流语义
│   ├── scripts/omp_flow.py            # Python CLI
│   ├── .runtime/sessions/<key>.json   # session-scoped active task
│   └── tasks/
│       └── <task-id>/
│           ├── task.json
│           ├── brainstorm.md
│           ├── guidance.md
│           ├── prd.md
│           ├── design.md
│           ├── research/
│           ├── reference/
│           ├── context/
│           ├── qbd/qbd-1/
│           ├── qbd/qbd-2/
│           ├── tasks.csv
│           ├── evidence.csv
│           ├── .task/
│           └── .summaries/
├── .omp/                              # OMP 原生 Adapter
│   ├── agents/
│   ├── skills/
│   └── settings.json
├── .codex/                            # Codex 原生 Adapter
│   ├── agents/
│   ├── skills/
│   ├── hooks/
│   ├── hooks.json
│   └── config.toml
└── .claude/                           # Claude Code 原生 Adapter
    ├── settings.json                  # Hook 事件注册（无 permissions allowlist，无 plugin）
    ├── agents/                        # 五个 omp-flow-* 项目 Agent
    ├── hooks/                         # 五个 Python Hook wrapper
    └── skills/
```

共享 Skill 的 npm 模板源在 `templates/common/skills/`，OMP/Codex/Claude Adapter 源分别位于 `templates/omp/`、`templates/codex/` 和 `templates/claude/`。初始化时资源复制到各 Harness 的原生目录；运行时不存在 `.omp` 向 `.codex` 或 `.claude` 提供资源的依赖，Claude 运行时也不读取 `.omp/` 或 `.codex/` 的文件。

## Skills 与 Agents

Skill 按阶段组织，不按角色重复 Agent 配置：

```text
omp-flow                       router / current-state dispatch
├── omp-flow-brainstorm
├── omp-flow-research
├── omp-flow-design
├── omp-flow-qbd
├── omp-flow-decompose
├── omp-flow-execute
├── omp-flow-finish
└── omp-flow-debug

inline or role-level behavior
├── omp-flow-implement
├── omp-flow-check
└── omp-flow-ui-designer
```

每个阶段 Skill 只包含当前阶段需要的 Preconditions、Procedure、Exit Gate、Handoff 和 Red Flags。完整状态语义仍以 `.omp-flow/workflow.md` 为准。

原生 Agent 则按角色组织：Researcher、Architect、QbD Auditor、Executor 和 Reviewer。Agent prompt 负责 Required Inputs、递归保护、写入边界、验证和最终 handoff。子 Agent 不再继承主流程指令后继续派发下一层工作流 Agent。

## 从一个任务开始

创建任务：

```bash
omp-flow task create "Add project update command" --slug cli-update
omp-flow workflow state
```

任务创建只生成空白工作区，不预造具体 row、审计、verdict、批准或 PASS。主 Agent 先与用户 Brainstorm，再派发内部/外部 Research。

研究收敛后选择一个综合结论：

```bash
omp-flow workflow select-synthesis \
  --path research/90-synthesis-001-update-design.md
```

Architect 根据该 synthesis 产出 PRD、Design 和 Tier 3 Context，然后进入 QbD 1：

```bash
omp-flow gate prepare qbd1
omp-flow gate inspect qbd1
omp-flow gate decide qbd1 --decision pass --note "Accepted after risk review."
```

QbD 1 人类 PASS 后，创建 `tasks.csv` 和一一对应的 `.task/<fullId>.implement.md`：

```bash
omp-flow topology validate
omp-flow gate prepare qbd2
omp-flow gate inspect qbd2
omp-flow gate decide qbd2 --decision pass --note "Topology and row briefs accepted."
```

QbD 2 PASS 会冻结拓扑并进入 `ready`。执行阶段：

```bash
omp-flow task start
omp-flow topology ready --role executor
omp-flow topology mark-result --row A-001 --result success
omp-flow topology ready --role reviewer
```

派发本身使用 Harness 原生 Agent/task。Reviewer 写 `.task/A-001.review.md` 后，通过 Python 提交 Evidence：

```bash
omp-flow evidence submit \
  --task <task-id> \
  --row A-001 \
  --verdict pass \
  --tests-passed 12 \
  --tests-failed 0 \
  --report .task/A-001.review.md \
  --evidence "Focused and integration checks passed." \
  --reviewer-agent-id <native-agent-id>
```

所有 row 完成并通过集成验证后：

```bash
omp-flow task finish
omp-flow task archive
```

## 变更单 / Amendment

QbD 2 冻结后，拓扑不再解冻。执行阶段的修正按范围分成三级，各自对应一种变更操作：

| 问题范围 | 变更操作 |
|---|---|
| 某个未完成 row 的 brief 写错 | `edit-brief` |
| 需要新增 row，或退役某个未完成 row | `add-row` / `supersede` |
| PRD/Design 本身写错 | `edit-design`（附 `valid-completed:` 影响声明） |

同一时间只允许一份 amendment 处于打开状态。命令序列：

```bash
omp-flow topology amend propose --reason "..."      # 生成 qbd/qbd-2/amend-NNN/proposal.md
# 填写 proposal 的 Change Set 与 Impact Statement，先在磁盘上改好 brief / prd.md / design.md
omp-flow topology amend set-change --change '[{"op":"edit-brief","id":"B-001"}]'
omp-flow topology amend prepare                     # 打包 scoped delta 证据，预留 audit-NNN.md
omp-flow topology amend inspect                     # 解析 qbd2-delta 裁定
omp-flow topology amend decide --decision pass --note "..."
```

delta 审计的证据束 = proposal + 变更的 brief + 完整当前 tasks.csv + 断言的 designDigest；报告 frontmatter 为 `gate: qbd2-delta`。PASS 后应用变更：已完成 row 的 Evidence 被保留，受影响的 per-row digest 与 designDigest 重算；一次 `edit-design` 会把未列入 `valid-completed:` 的已完成 row 降级为 `needs_fix` 重新审查。编辑已完成 row 的 brief 被禁止；supersede 已完成 row 需要填写 Impact Statement。

变更单不会无限累积：一旦超过 3 份已批准 amendment，或 supersede + edited 的 row 超过当前拓扑的三分之一，`amend propose` 会失败并要求走一次完整的 `task rework` 重审。qbd 门卡死（stale、needs_revision 或 attempt≥3）时用 `gate reset <qbd1|qbd2> --reason "..."` 退出；已批准的门不可 reset，出现已完成 row 后 qbd2 也不可 reset。

## 精确拓扑

`tasks.csv` 是唯一执行 DAG，固定为 11 列：

```csv
id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd
```

无依赖 row：

```text
A-001
```

有依赖 row：

```text
A-A002--003       # A-003 depends on A-002
C-A002B001--003   # C-003 depends on A-002 and B-001
```

依赖只编码在完整 ID 中。`wave` 由拓扑推导；禁止增加 `dependsOn`、`plan.json` 或第二套 DAG。完整 ID 同时命名 row brief、review 和 verdict 工件。

## Reference 分层

```text
Tier 1 full clone
reference/<repo>/
        │ exact source anchors
        ▼
Tier 2 digested slices
.omp-flow/tasks/<task>/reference/
        │ distilled decisions and contracts
        ▼
Tier 3 context
.omp-flow/tasks/<task>/context/{decision,interface,brief,finding}/
```

Tier 1 是只读、gitignored 的外部全量库。Tier 2 必须由 Python Reference 命令生成内容和 provenance，不能手写 metadata。Tier 3 是 Architect 从调查和 Reference 中提炼的项目约束，不是源码复制。

## OMP 与 Codex

OMP 使用 push-based Adapter：

```text
Main native task call
   -> OMP tool_call Hook identifies role/task/row
   -> Python assembles authoritative context
   -> enriched assignment enters native child Agent
```

Codex 使用 pull-based Agent prelude：

```text
Main dispatches project TOML Agent
   -> child receives explicit task/row identity
   -> Agent calls Python context command
   -> missing input fails before work starts
```

Codex 项目 Hook 需要用户配置中启用：

```toml
[features]
hooks = true
```

首次进入项目时通过 `/hooks` 批准项目 Hook。Codex Agent 配置会关闭子 Agent 的继续协作能力，避免递归派发。

## Claude Code 适配器

> 状态：**仅经模板 / 固定 fixture 验证（template/fixture-validated only）。** 尚未针对任何真实 Claude Code 运行做过实时验证。参见下方「未验证边界」。

Claude 使用严格 push-based Adapter：与 OMP 类似，`PreToolUse` Hook 在子 Agent spawn *之前* 把确定性 Python 上下文推入 Claude 原生 `Agent` 派发；派发描述符缺失、别名、陈旧或不匹配时在子 Agent 启动前 deny，不做任何 pull 兜底。

```text
Main 原生 Agent 调用
   -> PreToolUse(Agent) Hook 解析首行 v1 dispatch 描述符（role/task/row/gate）
   -> Python 校验 task/phase/row/binding/gate digest 后组装权威上下文
   -> 仅替换 tool_input.prompt 并前置 <!-- omp-flow-claude-dispatch:v1 --> 标记
   -> 校验失败则返回 permissionDecision:"deny"（或 exit 2），无 pull 兜底
```

### 五个原生 Agent

Adapter 只安装五个 Claude 项目 Agent，frontmatter `name` 必须精确等于文件所声明的名字（不接受别名或文件名推导身份）：

| Agent name | 角色 |
|---|---|
| `omp-flow-research` | Researcher |
| `omp-flow-architect` | Architect |
| `omp-flow-qbd` | QbD Auditor |
| `omp-flow-implement` | Executor |
| `omp-flow-check` | Reviewer |

工作流子 Agent 不授予 `Agent`/`Task` 工具，无法递归派发下一层工作流 Agent。

### Hook 事件

`.claude/settings.json` 为以下事件注册命令 Hook（Python stdlib-only、`-X utf8`、单条 JSON 输出、`$CLAUDE_PROJECT_DIR` 受限根）：

- `SessionStart`：`startup`/`resume`/`clear`/`compact` 各一个精确 matcher，注入 session 级 workflow-state，并向 `CLAUDE_ENV_FILE` 追加 shell-quoted `OMP_FLOW_CONTEXT_ID=<raw session_id>` 供后续 Bash 命令解析同一 session（该桥不依赖到达其他 Hook）。
- `UserPromptSubmit`：每次提交注入当前 workflow-state。
- `PreToolUse(Agent)` 与 `PreToolUse(Task)`（兼容别名，独立精确 matcher）：严格派发校验。
- `PreToolUse(Write|Edit|Bash)`：机械写保护。
- `SubagentStart`：为五个 Agent name 各一个精确 matcher，注入恰好一次身份 `<!-- omp-flow-claude-identity:v1 -->`，其 `agent_type` 必须精确等于 matcher name。Reviewer 把注入的原生 `agentId` 原样作为 `--reviewer-agent-id` 传入 Evidence 提交。

`SubagentStart` 与 `SessionStart` 不能 block，因此 `PreToolUse(Agent)` 是 fail-closed 的 pre-spawn 边界；两个标记缺失时工作流 Agent 必须在动工前停下。

### 版本下限与前置条件

Adapter 面向 **Claude Code >= 2.1.199**（该版本让 startup/subagent Hook 的 exit-2 失败可见，并强化 name-to-agent 身份行为）。这是使用本 Adapter 前你**必须自行满足**的前置条件；当前 `omp-flow init --claude` 只复制模板，**尚未**自动调用 `claude --version` 做版本 preflight，`doctor` 也**不**报告 Claude 版本或 settings/Hook 漂移（`doctor` 目前只报告 legacy 工件）。因此低于下限的运行时不会被工具阻止 —— 请手动确认本地版本。

### 未验证边界（重要 · 诚实声明）

本任务交付的是模板、fixture、包检查和文档。**它不建立任何实时运行时结论。** 具体地，本 Adapter **未**验证也**不得**被理解为已验证：

- 交互式项目 workspace trust 加载（非交互 print mode **不**构成 trust 证据）；
- 任何超出所记录下限（2.1.199）的「受支持 / 已测试」Claude 版本；
- Windows / macOS / Linux 的运行时支持；
- 真实 Hook 行为、真实 payload 字段、`CLAUDE_ENV_FILE` 的实际 Bash sourcing、非 ASCII 项目路径下的 Windows 命令引用。

committed fixtures 是**手写**到所记录的 2.1.199 契约的（`capturedFromLiveRun:false`），不是从真实运行捕获。若日后捕获的 payload 与之不同，只允许改变严格 parser 的字段名或 settings 记录，**绝不**放松 fail-closed 语义、**绝不**新增猜测别名，也**绝不**引入 pull 兜底。完整的待验证清单见 [docs/claude-adapter-verification.md](docs/claude-adapter-verification.md)。

### 保护边界的限制

`Write`/`Edit`/`Bash` 保护是**标准工具的完整性边界，不是操作系统级 sandbox**。QbD Agent 的受保护 report 例外只对 `Write` 生效、从不对 `Edit` 生效，且对每次 Write 从同一 payload 重算（非空 `session_id`、精确 `agent_type: omp-flow-qbd`、非空 `agent_id`、其 session 的 active task，以及 Python 当前只读的 prepared gate / digest / report / 归一化路径全部一致），不创建任何持久派发或授权绑定。**刻意混淆的 shell 变异是已记录的残余风险**，Hook 不声称能阻止恶意 shell、外部进程、MCP 或带外文件变异。

## 核心命令

```text
omp-flow init [--omp] [--codex] [--claude]
omp-flow update

omp-flow task create|current|list|select|clear|start|finish|archive
omp-flow workflow state|select-synthesis
omp-flow context
omp-flow reference digest-file|list|render
omp-flow topology validate|ready|mark-result
omp-flow topology amend propose|set-change|prepare|inspect|decide
omp-flow gate prepare|inspect|decide|reset
omp-flow evidence submit
```

这些命令最终委托项目本地 `.omp-flow/scripts/omp_flow.py`。项目因此可以固定自己的工作流版本，并在不同 Harness 之间共享同一任务状态。

## Fail-Closed

以下情况必须停止而不是猜测：

- 没有 session identity 或 active task；
- active task 指向不存在或已归档任务；
- phase/status 与请求角色不匹配；
- selected synthesis、row brief、Reference 或 Context binding 缺失；
- exact topology 无效或 QbD digest 已陈旧；
- Reviewer identity、测试计数或 report path 无效；
- Hook/Agent 上下文组装失败。

禁止通过全局 `.active-task`、自动创建缺失工件、空 PASS、默认 Evidence、吞掉异常或手写控制面文件来继续。

## 更新与开发

更新目标项目的受管模板：

```bash
omp-flow update
```

本仓库验证：

```bash
python -X utf8 -m compileall -q templates/.omp-flow/scripts
npm run build
npm test
npm pack --dry-run
```

工作流的完整状态块、工件所有权和约束见 [workflow.md](templates/.omp-flow/workflow.md)。维护者规则见 [AGENTS.md](AGENTS.md)。
