# omp-flow

omp-flow 是一个项目级、多 Harness 的研发工作流。它把调查、Reference 消化、设计、双 QbD、精确拓扑执行和独立审查持久化到仓库中，同时复用 Codex、Oh-My-Pi 等平台原生的 Agent、模型、任务进度与取消能力。

核心原则：

- 没有调查就没有发言权。
- 调查优于设计，设计优于实现。
- Python 管确定性状态和工件；模型负责研究、设计、实现与审查。
- Harness 管原生模型、Agent 派发、进度、任务结果、IRC 和 isolation。
- 缺少必要状态时明确失败，不制造 PASS、审批、证据或 fallback。

## 安装与初始化

安装 npm 插件后，在目标项目根目录执行：

    npm install -g omp-flow
    omp plugin install omp-flow
    omp-flow init

本地开发：

    omp plugin link D:\path\to\omp-flow
    omp-flow init --force

init 部署：

    .omp/agents/*.md
    .omp/settings.json
    .omp-flow/workflow.md
    .omp-flow/scripts/omp_flow.py
    .omp-flow/scripts/common/*.py
    .codex/hooks.json
    .codex/hooks/inject-workflow-state.py

npm CLI 只负责首次 bootstrap 和受哈希保护的 update。初始化后，生命周期命令统一委托项目内 Python 核心。

## 架构

    .omp-flow/workflow.md
             |
    .omp-flow/scripts/omp_flow.py
             |
      deterministic project state
             |
       +-----+------+
       |            |
    Codex Hook    OMP Extension Hook
    inline v1     native task

workflow.md 是流程语义的单一来源。Python 解析 workflow-state 块，读写 task.json、tasks.csv、QbD、Reference 和 Evidence。Harness adapter 只翻译事件和 task 参数。

OMP 扩展不再注册 omp_flow_task、omp_flow_reference、omp_flow_execute、omp_flow_dispatch 或 verdict 工具。主会话使用 bash/write 和原生 task；子 Agent 工具和模型由 .omp/agents frontmatter 原生控制。

## 完整工作流

    Project Init
      -> 用户讨论与任务创建
      -> Brainstorm
      -> Internal / External Research
      -> Tier 1 clone + Tier 2 reference digestion
      -> Comparison / Hypothesis / Minimal Validation
      -> selected research/90-synthesis-*
      -> PRD + Design + Tier 3 Context
      -> QbD 1 model audit + human calibration
      -> exact-topology tasks.csv + row briefs
      -> QbD 2 model audit + human calibration
      -> topology-ready native execution waves
      -> independent reviewer + Python evidence submit
      -> integration check + harvest + archive

预 PRD 的对抗性问题审查可以作为 research/validation 执行，但不是第三个强制宿主 Gate。两个权威 Gate 分别审查已承诺设计和执行分解。

## Task Workspace

创建任务会一次性生成完整目录和待填模板：

    .omp-flow/tasks/07-10-example/
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

Seed 时 tasks.csv 只有表头，qbd/ 与 .task/ 为空。不会生成具体 row、brief、audit、human decision、verdict 或 PASS。模板存在不等于阶段通过。

## Research 与 Reference

Research 建议按可排序名称持久化：

    research/30-internal-001-current-runtime.md
    research/40-external-001-trellis.md
    research/50-comparison-001-options.md
    research/70-validation-001-spike.md
    research/90-synthesis-001-handoff.md

Reference 使用三级模型：

1. Tier 1：根目录 reference/<repo> 全量只读 clone。
2. Tier 2：任务 reference/ 中的源码切片和 meta.json provenance。
3. Tier 3：context/ 中接受的 ADR、Interface、Brief 和 Finding。

消化文件：

    omp-flow reference digest-file \
      --source-repo reference/Trellis \
      --source-path packages/cli/src/templates/trellis/scripts/task.py \
      --line-start 1 --line-end 120 \
      --summary "Task lifecycle entry"

tasks.csv 的 reference 列使用 ref:<slug>#Lx-y；context 列使用明确的 context entry ID。

## 精确拓扑

tasks.csv 固定为 11 列：

    id,wave,priority,title,scope,action,reference,context,status,modelSlot,taskMd

ID 直接编码精确上游 row：

    A-001                当前 A-001，无依赖
    A-A002--003          当前 A-003，依赖 A-002
    C-A002B001--003      当前 C-003，依赖 A-002 与 B-001

规则：

- Unit 是一个大写字母，表达领域或隔离单元。
- Seq 是三位数字。
- DependencyRef 把 A-002 压缩为 A002。
- 完整 ID 必须命名对应 .task 工件。
- wave 由依赖图推导并校验，不是第二份依赖真相。
- 新任务不写 dependsOn、plan.json 或 TASK-NNN.json。
- QbD 2 + human PASS 后 topologyFrozen=true。

验证：

    omp-flow topology validate
    omp-flow topology ready --role executor

## QbD

准备 QbD 1：

    omp-flow gate prepare qbd1

命令返回 evidenceDigest、边界化 prompt 和准确报告路径，例如：

    qbd/qbd-1/audit-001.md

主 Agent 使用 Harness 原生 qbd-auditor。Auditor 报告 frontmatter：

    ---
    gate: qbd1
    verdict: PASS
    risk: medium
    evidenceDigest: sha256:...
    ---

随后：

    omp-flow gate inspect qbd1
    omp-flow gate decide qbd1 --decision pass --note "accepted risk..."

QbD 2 同理。被审文件变化会使旧 digest stale。模型 PASS 不能替代 human decision。

## 执行与审查

OMP：

1. Python 选择 topology-ready rows 并装配 row context。
2. 主 Agent 调用 OMP 原生 task batch。
3. OMP 原生渲染模型、请求、Token、工具、进度、结果和 agent:// artifact。
4. Executor 成功只把 row 移到 review。
5. 独立 Reviewer 写 .task/{fullId}.review.md。
6. Reviewer 调 Python evidence submit。

    omp-flow evidence submit \
      --row C-A002B001--003 \
      --verdict pass \
      --tests-run 12 \
      --tests-failed 0 \
      --report .task/C-A002B001--003.review.md \
      --evidence "build and focused tests passed" \
      --reviewer-agent-id <native-agent-id>

Python 写 verdict JSON、append evidence.csv，并把 row 改为 completed 或 needs_fix。下游只有在所有精确依赖均有当前 PASS evidence 时才解锁。

Codex v1 默认 inline：UserPromptSubmit Hook 注入 session-scoped workflow state；主 Agent 调用同一 Python context/topology/evidence 命令直接完成当前 row。这样先在 Codex 中自举，不虚构不可用的 sub-agent API。

## Session Active Task

active task 按 Harness session 存储：

    .omp-flow/.runtime/sessions/<context-key>.json

支持 CODEX_THREAD_ID、CODEX_SESSION_ID、OMP/Pi session ID 和显式 OMP_FLOW_CONTEXT_ID。多个窗口可以选择不同 task。旧 .omp-flow/tasks/.active-task 仅由 doctor 诊断，不参与新 writer。

## 常用命令

    omp-flow init
    omp-flow update
    omp-flow status
    omp-flow doctor

    omp-flow task create "Title" --slug title
    omp-flow task current
    omp-flow workflow select-synthesis --path research/90-synthesis-001-handoff.md
    omp-flow task select <taskId>
    omp-flow task start
    omp-flow task finish
    omp-flow task archive

    omp-flow context --role architect
    omp-flow context --role executor --row A-001
    omp-flow topology validate
    omp-flow topology ready --role executor
    omp-flow topology mark-result --row A-001 --result success

    omp-flow gate prepare qbd1
    omp-flow gate inspect qbd1
    omp-flow gate decide qbd1 --decision pass --note "..."
    omp-flow evidence submit ...

Windows 使用 python；其他系统若 Python 3 命令为 python3，init 生成对应 Codex Hook。

## Legacy 诊断

    omp-flow doctor

doctor 会报告旧全局 active pointer、plan.json 和 dependsOn CSV。新核心不会静默混合两套 DAG。迁移必须显式执行并先预览。

## 开发

    npm install
    npm run build
    npm test

测试覆盖 init、完整 scaffold、session 隔离、workflow Hook、精确拓扑、双 QbD、角色 context、review evidence 和薄 OMP adapter。
