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

## 安装与初始化

```bash
npm install -g omp-flow
```

在目标仓库中选择需要的 Harness：

```bash
omp-flow init --omp
omp-flow init --codex
omp-flow init --omp --codex
```

交互式终端也可以直接运行 `omp-flow init` 选择 Harness。非交互环境必须显式传 `--omp` 和/或 `--codex`。

初始化结果记录在：

```json
{
  "schemaVersion": 1,
  "harnesses": ["omp", "codex"]
}
```

该文件位于 `.omp-flow/config.json`。后续 `omp-flow update` 只更新已配置的 Adapter，不会给 Codex-only 项目安装 `.omp/`，也不会反向污染 OMP-only 项目。

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
└── .codex/                            # Codex 原生 Adapter
    ├── agents/
    ├── skills/
    ├── hooks/
    ├── hooks.json
    └── config.toml
```

共享 Skill 的 npm 模板源在 `templates/common/skills/`，OMP/Codex Adapter 源分别位于 `templates/omp/` 和 `templates/codex/`。初始化时资源复制到各 Harness 的原生目录；运行时不存在 `.omp` 向 `.codex` 提供资源的依赖。

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

## 核心命令

```text
omp-flow init [--omp] [--codex]
omp-flow update

omp-flow task create|current|list|select|clear|start|finish|archive
omp-flow workflow state|select-synthesis
omp-flow context
omp-flow reference digest-file|list|render
omp-flow topology validate|ready|mark-result
omp-flow gate prepare|inspect|decide
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
