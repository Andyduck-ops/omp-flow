
# omp-flow

omp-flow 是一个项目级、多 Harness 的研发工作流。它把 Brainstorm、调查、Reference 消化、设计、双 QbD、精确拓扑执行和独立审查持久化到仓库中，同时复用 Oh-My-Pi（OMP）、Codex 等 Harness 已有的模型、Agent、并发、进度、取消和隔离能力。

当前版本：`0.1.6`。

> 没有调查就没有发言权。调查优于设计，设计优于实现。

## 目录

- [它解决什么问题](#它解决什么问题)
- [核心边界](#核心边界)
- [五分钟开始](#五分钟开始)
- [三层架构](#三层架构)
- [完整工作流](#完整工作流)
- [一次完整任务](#一次完整任务)
- [任务工作区](#任务工作区)
- [精确拓扑](#精确拓扑)
- [Research 与 Reference](#research-与-reference)
- [QbD 质量门](#qbd-质量门)
- [原生 Task 派发](#原生-task-派发)
- [角色上下文](#角色上下文)
- [Session Active Task](#session-active-task)
- [OMP 与 Codex](#omp-与-codex)
- [Fail-Closed 规则](#fail-closed-规则)
- [命令参考](#命令参考)
- [更新与旧版本诊断](#更新与旧版本诊断)
- [故障排查](#故障排查)
- [开发与发布验证](#开发与发布验证)

## 它解决什么问题

普通 Agent 对话容易出现以下问题：

- Brainstorm 还没有收敛就直接开始实现。
- 调研结果只留在聊天记录中，压缩或换会话后丢失。
- 外部项目被“参考过”，但没有保存准确源码锚点和 provenance。
- PRD、设计、任务拆分和执行状态混在同一份计划里。
- 多 Agent 并发只有粗粒度 wave，没有精确到 row 的因果依赖。
- Executor 自己宣布完成，没有独立 Reviewer 和可验证证据。
- 插件重复实现 Harness 已有的模型、调度、进度和取消。
- 为了“继续运行”加入 fallback，反而隐藏缺失工件和错误状态。

omp-flow 的处理方式：

1. 让项目文件而不是聊天成为事实来源。
2. 让 Python 处理确定性状态、校验和证据写入。
3. 让 Agent 处理研究、设计、实现和审查内容。
4. 让 Harness 原生负责模型与 Agent 调度。
5. 缺少必要输入时立即失败，不猜测、不伪造 PASS。

## 核心边界

omp-flow 不是另一套 Agent Runtime，也不替代 OMP 原生 `task`。

| 层 | 负责 | 不负责 |
|---|---|---|
| Harness（OMP/Codex） | 模型、Agent、并发、进度、取消、IRC、隔离、UI | 业务生命周期和项目证据 |
| Python Control Plane | Task、Session、Reference、Topology、QbD、Evidence、Archive | 自己生成设计或代码 |
| Project Artifacts | 保存调查、决策、契约、brief、审查报告 | 隐式推进状态 |
| Agent | 研究、设计、实现、独立审查 | 直接篡改 Python 所有的状态文件 |

OMP 扩展不注册 `omp_flow_dispatch`、`omp_flow_task`、`omp_flow_reference`、`omp_flow_execute`、`omp_flow_qbd` 或自定义 verdict 工具。这些能力分别由 OMP 原生 `task` 和项目内 `omp_flow.py` 承担。

环境要求：

- Python 3.10 或更高版本。
- Node.js 和 npm，用于安装、初始化和更新模板。
- OMP 模式需要可用的 `omp` CLI。
- 对外 Reference 调研通常需要 Git。
- OMP isolation 是否可用由 OMP 自身环境决定。

## 五分钟开始

### 1. 安装

```bash
npm install -g omp-flow
omp plugin install omp-flow
```

第一条安装 `omp-flow` CLI；第二条让 OMP Plugin Manager 加载扩展、Agents 和 Skills。

本地开发版本：

```bash
omp plugin link D:/path/to/omp-flow
```

### 2. 初始化目标项目

在目标项目根目录执行：

```bash
omp-flow init
```

部署内容：

```text
.omp/agents/*.md
.omp/settings.json
.omp-flow/workflow.md
.omp-flow/scripts/omp_flow.py
.omp-flow/scripts/common/*.py
.codex/hooks.json
.codex/hooks/inject-workflow-state.py
```

初始化不会创建虚假的任务、审计或 PASS。

### 3. 创建任务

在 OMP Main 会话中：

```bash
omp-flow task create "Add project update command" --slug cli-update
```

OMP 扩展通过原生 `bash.env` 把 Main session ID 传给 Python，因此任务会成为当前会话的 active task。

在普通终端、CI 或没有 Harness session identity 的环境中：

```bash
omp-flow task create "Add project update command" --slug cli-update --no-start
```

之后在有明确 identity 的环境中选择：

```bash
OMP_FLOW_CONTEXT_ID=my-session omp-flow task select 07-10-cli-update
```

PowerShell：

```powershell
$env:OMP_FLOW_CONTEXT_ID = "my-session"
omp-flow task select 07-10-cli-update
```

查看状态：

```bash
omp-flow status
omp-flow workflow state
```

接下来不要直接实现。先与用户 Brainstorm，再进入 Research Gate。

## 三层架构

```text
┌───────────────────────────────────────────────────────────────┐
│ Harness: OMP / Codex                                          │
│ models · native task · batch · progress · cancel · IRC · UI   │
└──────────────────────────────┬────────────────────────────────┘
                               │ Hook / CLI
┌──────────────────────────────▼────────────────────────────────┐
│ Python Control Plane                                          │
│ .omp-flow/scripts/omp_flow.py                                 │
│ session · lifecycle · context · reference · topology          │
│ gate digest · evidence · archive                              │
└──────────────────────────────┬────────────────────────────────┘
                               │ deterministic reads/writes
┌──────────────────────────────▼────────────────────────────────┐
│ Project Artifacts                                             │
│ .omp-flow/tasks/<taskId>/                                     │
│ brainstorm · research · reference · context · PRD · design    │
│ tasks.csv · row briefs · audits · review · evidence           │
└───────────────────────────────────────────────────────────────┘
```

`.omp-flow/workflow.md` 是流程语义来源。Python 从中读取 `workflow-state` 块；OMP/Codex Hook 只负责把当前状态送入会话，不维护另一套 FSM。

## 完整工作流

```text
┌─────────────────────┐
│ Project Init        │
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Task Seed           │ task.json + 完整空目录/模板
└──────────┬──────────┘
           ▼
┌─────────────────────┐
│ Brainstorm          │ 用户方向、分歧、开放问题
└──────────┬──────────┘
           ▼
┌───────────────────────────────────────────────┐
│ Research Gate                                 │
│ Internal Research ─┐                          │
│ External Research ─┼─► Comparison/Validation  │
│ Tier 1 clone ──────┘          │               │
└───────────────────────────────┼───────────────┘
                                ▼
                  ┌─────────────────────────┐
                  │ Tier 2 Digestion       │ 可跳过：没有合适源码锚点
                  └────────────┬────────────┘
                               ▼
                  ┌─────────────────────────┐
                  │ selected 90-synthesis  │
                  └────────────┬────────────┘
                               ▼
┌───────────────────────────────────────────────┐
│ Architect: PRD + Design + Tier 3 Context      │
└───────────────────────────────┬───────────────┘
                                ▼
┌───────────────────────────────────────────────┐
│ QbD 1                                         │
│ validation -> model audit -> human PASS       │
└───────────────────────────────┬───────────────┘
                                ▼
┌───────────────────────────────────────────────┐
│ Exact tasks.csv + row implementation briefs   │
└───────────────────────────────┬───────────────┘
                                ▼
┌───────────────────────────────────────────────┐
│ QbD 2 -> human PASS -> topologyFrozen=true    │
└───────────────────────────────┬───────────────┘
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Execute Loop                                                  │
│ topology ready -> native executor -> status=review            │
│       ▲                                      │                │
│       │                                      ▼                │
│ needs_fix <── evidence FAIL <── native reviewer               │
│                                              │                │
│                                    evidence PASS              │
│                                              │                │
│                                      status=completed         │
│                                              │                │
│                              unlock exact dependents          │
└───────────────────────────────┬───────────────────────────────┘
                                ▼
┌───────────────────────────────────────────────┐
│ Integration Check / Deliberate Harvest        │
└───────────────────────────────┬───────────────┘
                                ▼
┌───────────────────────────────────────────────┐
│ Finish -> Archive                             │
└───────────────────────────────────────────────┘
```

### 阶段与进入条件

| Phase | 主要工作 | 进入下一阶段的条件 |
|---|---|---|
| `explore` | Brainstorm、内外调研、Reference、验证 | 显式选择 `research/90-synthesis-*.md` |
| `design` | PRD、Design、Tier 3 Context | QbD 1 prepare |
| `qbd1` | 已承诺设计的对抗审计 | Model PASS + Human PASS |
| `decompose` | 精确 tasks.csv 和 row brief | QbD 2 prepare |
| `qbd2` | 拓扑、brief、binding 审计 | Model PASS + Human PASS |
| `ready` | 已冻结，等待启动 | `task start` |
| `execute` | 实现与独立审查循环 | 全部 row 有当前 PASS evidence |
| `finish` | 集成验证与 deliberate harvest | `task finish` |
| `completed` | 完成，等待归档 | `task archive` |

三条不能混淆的规则：

- Research synthesis 不是 PRD/Design。
- QbD Model PASS 不是 Human PASS。
- Executor success 不是 row completed。

## 一次完整任务

下面用 `07-10-cli-update` 展示主路径。实际 ID 由日期和 slug 生成。

### 1. Task Seed 与 Brainstorm

```bash
omp-flow task create "Add project update command" --slug cli-update
omp-flow task current
```

Main 与用户讨论后更新：

```text
.omp-flow/tasks/07-10-cli-update/brainstorm.md
.omp-flow/tasks/07-10-cli-update/guidance-specification.md
```

Brainstorm 可以杂乱、发散；此时不要把某个方向提前写成已接受设计。

### 2. 派发 Research

OMP 原生 `task` 默认支持 batch。下面是模型工具调用示意，不是终端命令：

```json
{
  "agent": "researcher",
  "context": "Research Gate for task 07-10-cli-update.",
  "tasks": [
    {
      "id": "research-internal-cli",
      "description": "Internal CLI inventory",
      "assignment": "Investigate current CLI/update behavior and write research/30-internal-001-cli.md."
    },
    {
      "id": "research-external-trellis",
      "description": "Trellis update research",
      "assignment": "Investigate Trellis init/update and write research/40-external-001-trellis.md."
    }
  ]
}
```

OMP 原生负责 Agent discovery、模型、并发、进度、Token/Request、取消、`agent://<id>` 输出、`history://<id>` transcript 和 IRC follow-up。

omp-flow Hook 为 recognized role 装配当前任务的 Brainstorm、Guidance 和 Research。装配失败时 task 调用被阻断。

### 3. 对外 Reference 消化

先 clone 只读 Tier 1：

```bash
git clone <repository-url> reference/Trellis
```

Researcher 只报告值得消化的准确锚点。Main 确认后执行：

```bash
omp-flow reference digest-file \
  --source-repo reference/Trellis \
  --source-path packages/cli/src/templates/trellis/scripts/task.py \
  --line-start 1 \
  --line-end 120 \
  --summary "Task lifecycle entry" \
  --intent "Compare deterministic lifecycle design"
```

输出进入当前任务 `reference/`，包含源码切片和 `meta.json` provenance。如果没有值得复用的源码，可以不做 Tier 2 digestion，但应在 synthesis 中说明原因。

### 4. 研究收敛

建议命名：

```text
research/30-internal-001-current-runtime.md
research/40-external-001-trellis.md
research/50-comparison-001-options.md
research/70-validation-001-spike.md
research/90-synthesis-001-handoff.md
```

显式选择接受的 synthesis：

```bash
omp-flow workflow select-synthesis \
  --path research/90-synthesis-001-handoff.md
```

这是唯一合法的 `explore -> design` 转换。不要直接手改 `task.json`。

### 5. Architect 设计

```json
{
  "agent": "architect",
  "context": "Design phase for 07-10-cli-update.",
  "tasks": [
    {
      "id": "architect-cli-update",
      "description": "Commit PRD and design",
      "assignment": "Produce prd.md, design.md, and required context ADR/interface entries. Do not decompose executable rows yet."
    }
  ]
}
```

Architect 写 `prd.md`、`design.md`、`context/index.json` 及必要 ADR/Interface。

### 6. QbD 1

```bash
omp-flow gate prepare qbd1
```

Python 会校验 phase 和未提交模板，收集 synthesis、PRD、Design、Context 与 Reference，计算 `evidenceDigest`，预留 `qbd/qbd-1/audit-NNN.md`，并返回 bounded prompt。

把返回 prompt 原样派发给 `qbd-auditor`：

```json
{
  "agent": "qbd-auditor",
  "context": "Use only the bounded gate evidence.",
  "tasks": [
    {
      "id": "qbd1-cli-update-001",
      "description": "QbD 1 design audit",
      "assignment": "<exact prompt returned by gate prepare>"
    }
  ]
}
```

报告 frontmatter：

```yaml
---
gate: qbd1
verdict: PASS
risk: medium
evidenceDigest: sha256:...
---
```

检查模型报告：

```bash
omp-flow gate inspect qbd1
```

- `FAIL` / `NEEDS_EVIDENCE`：回到 `design`。
- `PASS`：进入 `awaiting_human`，仍未批准。

Human 决策：

```bash
omp-flow gate decide qbd1 --decision pass --note "Accepted after risk review."
```

或：

```bash
omp-flow gate decide qbd1 --decision reject --note "Migration boundary remains unclear."
```

### 7. 精确任务分解

QbD 1 Human PASS 后，Architect 写固定 11 列 CSV：

```csv
id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd
A-001,1,P0,Add update analyzer,src/cli/update.ts,implement,"ref:trellis-update-py#L1-80","decision:ADR-001",pending,task,.task/A-001.implement.md
B-001,1,P0,Add update tests,tests/omp-flow.test.ts,implement,,,pending,task,.task/B-001.implement.md
C-A001B001--003,2,P0,Integrate CLI,src/cli/index.ts,implement,,"interface:update-api",pending,task,.task/C-A001B001--003.implement.md
```

每行对应一个 brief：

```text
.task/A-001.implement.md
.task/B-001.implement.md
.task/C-A001B001--003.implement.md
```

验证：

```bash
omp-flow topology validate
```

### 8. QbD 2

```bash
omp-flow gate prepare qbd2
```

QbD 2 会先确认 QbD 1 的设计、Reference 和 Context 没有变化，再审计精确 ID、依赖、wave、taskMd、全部 brief、bindings 和验证方案。

派发 auditor 后执行：

```bash
omp-flow gate inspect qbd2
omp-flow gate decide qbd2 --decision pass --note "Topology accepted."
```

Human PASS 后 `phase=ready` 且 `topologyFrozen=true`。QbD digest 排除合法变化的 `tasks.csv.status`，其他拓扑列和冻结工件仍受校验。

### 9. Executor

```bash
omp-flow task start
omp-flow topology ready --role executor
```

Python 只返回依赖已完成的 `pending` / `needs_fix` rows。

```json
{
  "agent": "executor",
  "context": "Execute the currently ready omp-flow wave.",
  "tasks": [
    {
      "id": "exec-A-001",
      "description": "Implement A-001",
      "assignment": "Implement row A-001."
    },
    {
      "id": "exec-B-001",
      "description": "Implement B-001",
      "assignment": "Implement row B-001."
    }
  ]
}
```

Hook 按 row 注入 committed design、CSV row、manifests、Reference、Context 和 `.task/{fullId}.implement.md`。

Executor 成功后：

```bash
omp-flow topology mark-result --row A-001 --result success
```

这只把 row 改成 `review`。执行失败则：

```bash
omp-flow topology mark-result --row A-001 --result failure
```

row 进入 `needs_fix`。

### 10. 独立 Reviewer

```bash
omp-flow topology ready --role reviewer
```

```json
{
  "agent": "reviewer",
  "context": "Independently review rows currently in review.",
  "tasks": [
    {
      "id": "review-A-001",
      "description": "Review A-001",
      "assignment": "Review row A-001. Your native reviewer agent id is review-A-001."
    }
  ]
}
```

Reviewer 检查真实 diff、独立运行验证、写 `.task/A-001.review.md`，然后显式携带父 task ID 和 native reviewer ID：

```bash
omp-flow evidence submit \
  --task 07-10-cli-update \
  --row A-001 \
  --verdict pass \
  --tests-run 12 \
  --tests-failed 0 \
  --report .task/A-001.review.md \
  --evidence "Build and focused tests passed." \
  --reviewer-agent-id review-A-001
```

Python 验证 identity、row 状态、报告路径和 test counts：

```text
PASS -> verdict JSON -> append evidence.csv -> status=completed
FAIL -> verdict JSON -> append evidence.csv -> status=needs_fix
```

只有全部精确上游 row 都是 `completed`，下游才会解锁。

### 11. Finish、Harvest 与 Archive

全部 rows 完成后：

1. 运行项目级集成验证。
2. 检查是否存在可跨任务复用的稳定知识。
3. 有证据时更新 `.omp-flow/specs/` 或 `.omp-flow/knowhow/`。
4. 没有时明确记录“不需要 harvest”，不要制造默认 learning。

`harvest` 当前是流程动作，不是独立 CLI。

```bash
omp-flow task finish
omp-flow task archive
```

任务移动到 `.omp-flow/tasks/archive/YYYY-MM/<taskId>/`，所有指向它的 session pointers 被清除。

## 任务工作区

```text
.omp-flow/tasks/07-10-cli-update/
├── task.json
├── brainstorm.md
├── guidance-specification.md
├── prd.md
├── design.md
├── tasks.csv
├── implement.jsonl
├── check.jsonl
├── evidence.csv
├── research/
├── reference/
├── context/
│   ├── index.json
│   ├── brief/
│   ├── interface/
│   ├── decision/
│   └── finding/
├── qbd/
│   ├── qbd-1/
│   └── qbd-2/
├── .task/
└── .summaries/
```

Seed 时 `tasks.csv` 只有表头，`.task/` 和 `qbd/` 没有具体结果，不生成 verdict、approval 或 PASS。PRD/Design 只是待填模板。

### 工件所有权

| 工件 | 内容 Owner | 状态写入 Owner |
|---|---|---|
| `brainstorm.md` | Main / Human | Main / Human |
| `research/*.md` | Researcher / Main | Researcher / Main |
| `reference/*` + metadata | Python digestion | Python |
| `context/*`、PRD、Design | Architect | Architect |
| `tasks.csv` 定义列 | Architect | Architect |
| `tasks.csv.status` | Python | Python |
| `.task/*.implement.md` | Architect | Architect |
| `.task/*.review.md` | Reviewer | Reviewer |
| QbD audit Markdown | QbD Auditor | QbD Auditor |
| Human decision | Human input | Python |
| verdict JSON / `evidence.csv` | Reviewer evidence | Python |
| `task.json` lifecycle | Python | Python |
| session pointer | Python | Python |

OMP Hook 会阻止 Agent 直接写 `task.json`、`evidence.csv`、verdict JSON、Human decision 和 session pointer。

## 精确拓扑

`tasks.csv` 是唯一执行 DAG：

```text
id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd
```

语法：

```text
RootId        := Unit "-" Seq
DependentId   := Unit "-" DependencyRef+ "--" Seq
DependencyRef := Unit Seq
Unit          := [A-Z]
Seq           := [0-9]{3}
```

示例：

```text
A-001                无依赖
A-A002--003          A-003 依赖 A-002
C-A002B001--003      C-003 依赖 A-002 与 B-001
```

错误形式：

```text
C-AB-001             只表达 Unit，不能定位准确上游
TASK-001             旧任务编号
C-003 + dependsOn    第二套可能漂移的 DAG
```

`wave` 由依赖推导。Python 检测非法 ID、重复 canonical row、缺失依赖、自依赖、环、wave 和 taskMd 不匹配。

`modelSlot` 只是调度提示，不是 omp-flow 模型别名，也不会覆盖 OMP。实际模型由 `.omp/agents/<role>.md` frontmatter、OMP 原生槽位和 `/model` UI 决定。

## Research 与 Reference

Research 保存调查过程、候选方案、证据、反证、未知项和选择依据；它不等于接受后的设计。

三级 Reference：

```text
Tier 1: reference/<repo>/                           全量只读项目
                    │ exact source anchor
                    ▼
Tier 2: tasks/<taskId>/reference/<slug> + meta.json 源码切片
                    │ distillation
                    ▼
Tier 3: context/{decision,interface,brief,finding}/ 接受的契约
```

Tier 1 必须位于根目录 `reference/`。Tier 2 metadata 保存 `sourceRepo`、`sourcePath`、`sourceLines`、`summary`、`intent` 和 `extractedAt`。

CSV binding：

```text
reference = ref:<slug>#L1-40;ref:<other-slug>
context   = decision:ADR-001;interface:update-api
```

绑定无法解析时 Executor/Reviewer dispatch 被阻断。

## QbD 质量门

只有两个权威 Gate：

| Gate | 审查对象 |
|---|---|
| QbD 1 | selected synthesis、PRD、Design、Reference、Tier 3 Context |
| QbD 2 | 已批准设计、精确 tasks.csv、全部 row briefs、bindings、验证方案 |

预 PRD 问题挑战属于 `research/validation`，不是第三个 Gate。

```text
Deterministic Validation
          │
          ▼
Adversarial Model Audit
          │
          ▼
Human Calibration
```

三层不能互相替代。Gate 保存 evidence paths 和 digest；冻结工件变化会让 `inspect`、QbD 2 prepare、task start 或 row context 明确报 stale。

## 原生 Task 派发

OMP 原生 task 已提供：

- 项目 Agent discovery 与 frontmatter tools/model。
- batch fan-out、concurrency 和 async jobs。
- 实时 progress、request/token usage 和取消。
- isolation、patch/branch。
- `agent://` 输出和 `history://` transcript。
- IRC follow-up 和 idle lifecycle。

omp-flow 只在 `tool_call` Hook 中装配业务上下文，不接管这些能力，也不实现额外进度 renderer。

默认 batch shape：

```json
{
  "agent": "executor",
  "context": "Shared background.",
  "tasks": [
    {
      "id": "exec-A-001",
      "description": "UI label",
      "assignment": "Implement row A-001.",
      "isolated": false
    }
  ]
}
```

| 字段 | 含义 |
|---|---|
| `agent` | `.omp/agents/<agent>.md` 中的角色 |
| `context` | batch 共享背景 |
| `tasks[].id` | 原生 Agent ID 和 artifact identity |
| `description` | UI 标签，子 Agent 不读取 |
| `assignment` | 每个 Agent 的任务 |
| `isolated` | OMP 原生隔离开关，是否可用取决于 OMP 设置 |

同一 batch 只能有一个 agent 类型。不同角色分开派发。

## 角色上下文

Python 不使用一份万能 prompt：

| 角色 | 必需上下文 |
|---|---|
| researcher | Task、Brainstorm、Guidance、已有 Research |
| explore / oracle / planner | 当前意图和调查材料 |
| architect | selected synthesis、Research、已有 PRD/Design |
| qbd-auditor | gate prepare 返回的 bounded prompt |
| executor | committed design、exact row、bindings、implement manifest/brief |
| reviewer | committed design、exact row、bindings、check manifest/brief |

Hook 流程：

```text
Main calls native task
        │
        ▼
tool_call Hook -> detect role -> active task -> exact row
        │
        ▼
Python context assembly
        │
        ▼
replace assignment -> OMP native spawn
```

`qbd-auditor` 必须收到原始 bounded prompt，因此 Hook 不再次包装它。

## Session Active Task

Active task 是 session scoped：

```text
.omp-flow/.runtime/sessions/<context-key>.json
```

identity 来源：

- `OMP_FLOW_CONTEXT_ID`
- `CODEX_THREAD_ID` / `CODEX_SESSION_ID`
- `OMP_SESSION_ID` / `PI_SESSION_ID`
- Hook payload 中的 session/thread/conversation ID

不同窗口可选择不同任务。常用命令：

```bash
omp-flow task current
omp-flow task list
omp-flow task select <taskId>
omp-flow task clear
```

旧 `.omp-flow/tasks/.active-task` 只由 doctor 报告，不参与读取。

## OMP 与 Codex

### OMP

OMP 是完整多 Agent 路径：

- Plugin extension 自动加载。
- Main 使用 orchestrator tool belt。
- Main bash 通过原生 `env` 自动获得 session identity。
- 原生 task 派发项目 Agents。
- Hook 按角色装配上下文。
- OMP 提供模型、进度、并发、IRC、artifact 和 isolation。

### Codex v1

Codex 当前采用 inline 自举路径：

- `UserPromptSubmit` Hook 注入 session-scoped workflow state。
- Main 调用同一套 Python task/context/topology/gate/evidence 命令。
- 不虚构不存在或不稳定的 Codex sub-agent API。
- 未来可增加薄 adapter，而不修改 Python 核心。

若 Codex shell 没有稳定 session 环境变量，显式设置：

```bash
export OMP_FLOW_CONTEXT_ID=codex-project-session
```

PowerShell：

```powershell
$env:OMP_FLOW_CONTEXT_ID = "codex-project-session"
```

## Fail-Closed 规则

以下情况必须停止：

- 没有 session identity 却创建并激活任务。
- 没有 active task 且没有显式 `--task`。
- pointer 指向不存在的任务。
- selected synthesis 不存在或命名不正确。
- PRD/Design 仍是未提交模板。
- topology ID、依赖、wave 或 taskMd 非法。
- context/reference binding 无法解析。
- QbD evidence 已变化。
- Model PASS 尚未获得 Human PASS。
- Executor/Reviewer row status 不匹配。
- Review report 路径不准确。
- PASS 但 tests_failed 非零。
- reviewer identity 缺失。
- 直接写 Python-owned control files。

禁止用另一个 session 的 task、旧 `.active-task`、自动创建缺失 brief、空 PASS、默认 evidence 或捕获异常后继续来“修复”。

## 命令参考

### Bootstrap

```bash
omp-flow init [--dry-run | --force | --skip-existing]
omp-flow update [--dry-run | --force | --skip-all | --create-new]
```

### Task

```bash
omp-flow task create "Title" [--slug name] [--parent taskId] [--no-start]
omp-flow task current
omp-flow task list
omp-flow task select <taskId>
omp-flow task clear
omp-flow task start [taskId]
omp-flow task finish [taskId]
omp-flow task archive [taskId]
```

### Workflow / Context

```bash
omp-flow workflow state
omp-flow workflow select-synthesis --path research/90-synthesis-001-name.md [--task taskId]
omp-flow context --role <role> [--task taskId] [--row fullId] [--prompt text]
```

### Reference / Topology

```bash
omp-flow reference digest-file --source-repo reference/<repo> --source-path <path> [options]
omp-flow reference list [--task taskId]
omp-flow reference render --refs "ref:<slug>#L1-20" [--task taskId]

omp-flow topology validate [--task taskId]
omp-flow topology ready --role executor|reviewer [--task taskId]
omp-flow topology mark-result --row <fullId> --result success|failure [--task taskId]
```

### QbD / Evidence

```bash
omp-flow gate prepare qbd1|qbd2 [--task taskId]
omp-flow gate inspect qbd1|qbd2 [--task taskId]
omp-flow gate decide qbd1|qbd2 --decision pass|reject [--note text] [--task taskId]

omp-flow evidence submit \
  --task <taskId> \
  --row <fullId> \
  --verdict pass|fail \
  --tests-run <count> \
  --tests-failed <count> \
  --report .task/<fullId>.review.md \
  --evidence <summary> \
  --reviewer-agent-id <native-agent-id>
```

### Diagnostics

```bash
omp-flow status
omp-flow doctor
```

所有 workflow 命令委托项目本地 `python .omp-flow/scripts/omp_flow.py ...`。Windows 默认使用 `python`，其他系统模板使用 `python3`。

## 更新与旧版本诊断

```bash
omp-flow update --dry-run
omp-flow update
```

Update 根据 `.omp-flow/.template-hashes.json` 分类：

| 状态 | 行为 |
|---|---|
| `new` | 创建 |
| `unchanged` | 跳过 |
| `autoUpdate` | 未被用户修改，自动更新 |
| `changed` | 要求 overwrite/skip/create-new |
| `userDeleted` | 尊重用户删除 |
| `obsolete` | 内容仍等于旧托管 hash，安全删除 |

旧 `get_context.py` 只有在内容仍等于托管 hash 时才删除；用户改过的版本不会被猜测性删除。损坏 hash 文件会明确报错。

```bash
omp-flow doctor
```

Doctor 报告旧项目级 `.active-task`、`plan.json` 和含 `dependsOn` 的 CSV，但不把旧 DAG 混入新流程。

## 故障排查

### No session identity

- OMP Main：确认插件已加载，Main bash Hook 应注入 identity。
- 普通终端：使用 `--no-start`。
- 或显式设置 `OMP_FLOW_CONTEXT_ID`。

### No active task

```bash
omp-flow task list
omp-flow task select <taskId>
```

Reviewer evidence 使用 handoff 中显式的 `--task`。

### Context assembly failed

检查 row ID、row status、brief、Reference 和 Context binding。Executor 只接受 `pending/needs_fix`；Reviewer 只接受 `review`。不要绕过 Hook。

### QbD evidence is stale

冻结工件在 Gate 后变化。根据对象回到 design 或 decompose，重新 prepare、audit、inspect 和 human decide。

### Native task 参数失败

Batch 必须有顶层 `agent`、非空 `context`、非空 `tasks[]`，每项有 assignment，ID 唯一；不要同时传顶层 assignment。

### 子 Agent 失败但已有输出

查看 `agent://<id>` 和 `history://<id>`，用 job 查看 async 状态，或通过 IRC 追问 idle/parked Agent。不要因 inline preview 截断就判定没有输出。

### 仍看到旧 omp-* 模型

0.1.6 不安装自定义模型 aliases。检查用户级旧配置、旧 plugin link、未重启会话及 `~/.omp/` 历史配置：

```bash
omp plugin list
omp plugin doctor
```

## 开发与发布验证

```bash
npm install
python -X utf8 -m compileall -q templates/.omp-flow/scripts
npm run build
npm test
npm pack --dry-run
```

`npm run build` 会先清空 `dist`，防止已删除的 Ralph/custom-tool 文件进入 npm 包。

测试覆盖 init/update、Task Scaffold、session isolation、workflow Hook、精确拓扑、Reference provenance、QbD stale、角色上下文、review evidence、原生 task 和 Main bash session tunneling。

发布前确认：

1. package 与 lockfile 版本一致。
2. build/test 通过。
3. pack 不含旧 `dist/core`、`dist/tools` 或自定义 dispatch/QbD/lifecycle 工具。
4. 没有生成的 tgz 或 `__pycache__` 被提交。
