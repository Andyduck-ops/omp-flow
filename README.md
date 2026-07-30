# omp-flow

omp-flow 是一个项目本地、调查优先、面向多 Agent 开发的工作流。

它不替代 OMP、Codex、Claude 或其他 Harness 的原生 Agent 系统。它提供一套可移植的方法、
项目知识结构和最小机械 runtime：任务语义由 Git 可见的 Open Knowledge Format v0.2 Bundle
承载，模型、派发、并发、进度、取消和 UI 继续由宿主平台负责。

> 没有调查就没有发言权。调查优于设计，设计优于实现。

## 设计哲学

1. **先调查，后设计。** Brainstorm 用于理解和重构问题，Research 用证据回答问题，Design
   才负责形成接受的方向。
2. **调查是螺旋，不是流水线。** 问题驱动调查，证据也可以反过来改变问题；brainstorm 与
   research 是不同动作，但可以在同一个 Explore 空间中往返。
3. **富文档本身就是架构。** Markdown 的标题、正文、列表、位置和链接可以表达关系、限制、
   证据和决策，不需要先投影成封闭 schema。
4. **聊天不是持久知识。** 有继续价值的 framing、Reference、finding、decision、work、
   handoff、review 和 human decision 应进入任务 Bundle 或项目 Wiki。
5. **语义归文档，机械保证归 runtime。** Agent 直接理解 Concept；Python 只处理 session、
   路径、actor、锁、receipt 和目录操作等无法靠文字可靠保证的事实。
6. **使用 Harness 原生能力。** 不重复实现模型选择、Agent spawn、batch、进度、取消、隔离或
   UI，也不维护自定义 dispatcher。
7. **审查必须独立。** Implementer 的成功结果只是 handoff，不是 Review；Reviewer 必须关联
   已完成实现 operation，并使用不同 actor。
8. **模型 PASS 不是人类批准。** QbD 是独立挑战，人类决定仍由人类以可读 Concept 记录。
9. **失败必须可见。** 缺少必要 entry、身份、receipt、predecessor 或输出时停止，不通过猜测、
   fallback 或制造状态继续。
10. **验证与风险成比例。** 机械保证用聚焦测试验证，语义结构通过真实 Bundle、链接和独立审查
    直接判断，不把 Markdown 重新变成测试驱动的 DSL。

完整的工作流语义见 [workflow.md](templates/.omp-flow/workflow.md)，通用设计原则见项目 Wiki
中的 [Semantic knowledge, mechanical control](.omp-flow/wiki/philosophy/semantic-knowledge-mechanical-control.md)。

## 系统边界

```text
┌──────────────────────────────────────────────────────────────┐
│ Harness                                                      │
│ OMP / Codex / Claude                                         │
│ models · native agents · batch · progress · cancel · UI      │
└──────────────────────────────┬───────────────────────────────┘
                               │ native task / agent
┌──────────────────────────────▼───────────────────────────────┐
│ Skills + Agent definitions                                   │
│ route reasoning · bind role · define scope · verify handoff  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Bundle / entry / output paths
┌──────────────────────────────▼───────────────────────────────┐
│ Knowledge plane                                              │
│ Task Bundles · Concepts · links · Project Wiki · Git history │
└──────────────────────────────┬───────────────────────────────┘
                               │ minimal mechanical commands
┌──────────────────────────────▼───────────────────────────────┐
│ .omp-flow runtime kernel                                     │
│ session · safe paths · actor · lock · operation · receipt    │
└──────────────────────────────────────────────────────────────┘
```

各层的责任只有一个方向：

| 层 | 负责 | 不负责 |
|---|---|---|
| Bundle / Wiki | framing、来源、证据、设计、工作、复核、决定和导航 | 进程锁与原生身份 |
| Skills | 推理过程、入口选择、退出条件和 red flags | 保存业务状态 |
| Agent definitions | 子 Agent 身份、工具、写入边界、验证和 handoff | 项目生命周期 |
| Runtime | session、路径、actor、锁、receipt、原子目录操作 | 理解 Markdown 语义 |
| Hooks / Adapter | 平台事件、身份和路径桥接、机械校验 | 生成语义 context package |
| Harness | 模型、派发、并发、进度、取消、隔离和 UI | omp-flow 的任务知识 |

## 完整方法流程

```text
用户方向
   │
   ▼
Task Bundle
   │
   ▼
brainstorm Concept ◄──────────────┐
   │                              │ evidence reframes question
   ├────────► research / Reference┘
   │
   ▼
selected synthesis
   │
   ▼
PRD / Design / linked decisions and interfaces
   │
   ▼
independent QbD 1 audit
   │
   ▼
human decision
   │ accepted
   ▼
authored work map + bounded work Concepts
   │
   ▼
independent QbD 2 audit
   │
   ▼
human decision
   │ accepted
   ▼
native implementation ──► linked handoff
   │
   ▼
independent review ──────► linked Review Concept
   │
   ├── substantive finding ──► repair owning work/design ──► fresh review
   │
   ▼
integration verification
   │
   ▼
Wiki harvest when useful ──► commit ──► archive
```

这是一条正常的推理方向，不是 Python 状态机。证据可以让 Explore 回到 framing，执行发现也可以
让工作返回 Design 和相应的人类 gate。文件组织帮助人和 Agent 导航，但不会被 runtime 解析成
phase、topology、status 或 verdict。

## 知识结构

### 项目结构

初始化到目标项目中的受管结构：

```text
project/
├── .omp-flow/
│   ├── .gitignore                          # runtime/cache/受管安装文件的忽略边界
│   ├── .template-hashes.json               # init/update 的受管资源 hash
│   ├── config.json                         # 已选择的 Harness
│   ├── workflow.md                         # Harness-neutral 方法
│   ├── scripts/omp_flow.py                 # 稳定 CLI 入口
│   ├── scripts/common/<runtime-module>.py  # session/path/task/operation/io
│   ├── tasks/
│   │   ├── <task>/                         # Git 可见的 OKF Task Bundle
│   │   │   ├── index.md
│   │   │   ├── task.md
│   │   │   ├── brainstorm.md
│   │   │   ├── research/                    # 按需
│   │   │   │   ├── index.md                 # 按需的局部导航
│   │   │   │   └── <topic>.md
│   │   │   ├── reference/                   # 按需
│   │   │   │   ├── index.md                 # 按需的局部导航
│   │   │   │   ├── <source>.md
│   │   │   │   └── assets/
│   │   │   ├── context/                     # 按需
│   │   │   │   ├── index.md                 # 按需的局部导航
│   │   │   │   ├── brief/<brief>.md
│   │   │   │   ├── decision/<decision>.md
│   │   │   │   ├── finding/<finding>.md
│   │   │   │   └── interface/<interface>.md
│   │   │   ├── prd.md                       # 按需
│   │   │   ├── design.md                    # 按需
│   │   │   ├── work/                        # 按需
│   │   │   │   ├── index.md               # 顺序、并行组与工作入口
│   │   │   │   ├── <work>.md
│   │   │   │   └── <handoff>.md
│   │   │   ├── review/                      # 按需
│   │   │   │   ├── index.md                 # 按需的局部导航
│   │   │   │   └── <review>.md
│   │   │   └── qbd/                         # 按需
│   │   │       ├── index.md                 # 按需的局部导航
│   │   │       ├── <audit>.md
│   │   │       └── <human-decision>.md
│   │   └── archive/
│   │       └── <YYYY-MM>/<task>/           # Git 可见的归档 Bundle
│   ├── wiki/
│   │   ├── index.md                        # 项目长期知识入口
│   │   ├── philosophy/
│   │   │   ├── index.md
│   │   │   └── <principle>.md
│   │   ├── specs/
│   │   │   ├── index.md
│   │   │   └── <contract>.md
│   │   ├── knowhow/
│   │   │   ├── index.md
│   │   │   └── <diagnostic-or-repair>.md
│   │   └── <topic>/...                     # 可继续按项目需要增长
│   ├── .runtime/                           # 忽略的 session/operation/lock/receipt
│   └── cache/
│       └── repos/<repository>/             # 忽略的外部 clone cache
├── .agents/
│   └── skills/<shared-skill>/SKILL.md          # 通用 Agent Skills 入口
├── .omp/
│   ├── settings.json
│   ├── agents/<role>.md                      # OMP 原生角色卡
│   └── skills/<shared-skill>/SKILL.md
├── .codex/
│   ├── config.toml
│   ├── agents/omp-flow-<role>.toml
│   └── skills/<shared-skill>/SKILL.md
└── .claude/
    ├── settings.json
    ├── agents/omp-flow-<role>.md
    ├── hooks/
    │   ├── inject-agent-identity.py
    │   ├── protect-runtime.py
    │   └── session-start.py
    └── skills/<shared-skill>/SKILL.md
```

`.omp-flow/tasks/` 和 `.omp-flow/wiki/` 属于知识平面并进入正常 Git 历史。
`.omp-flow/.runtime/` 和 `.omp-flow/cache/repos/` 属于本地机械状态或 acquisition cache，
保持忽略。

omp-flow 源码仓库中的 canonical source 与发布结构：

```text
omp-flow/
├── bin/
│   └── omp-flow.js
├── src/
│   ├── index.ts
│   ├── cli/{harness,index,init,template-hash,update}.ts
│   └── omp/{agent-loader,extension-entry,extension}.ts
├── templates/
│   ├── .omp-flow/
│   │   ├── gitignore
│   │   ├── workflow.md
│   │   └── scripts/                          # 上方最小 Python runtime 的 canonical source
│   ├── common/skills/<skill>/SKILL.md        # 唯一 Shared Skill source
│   ├── omp/{settings.json,agents/<role>.md}
│   ├── codex/{config.toml,agents/omp-flow-<role>.toml}
│   └── claude/
│       ├── settings.json
│       ├── agents/omp-flow-<role>.md
│       └── hooks/{inject-agent-identity,protect-runtime,session-start}.py
├── tests/omp-flow.test.ts
├── package.json
└── tsconfig.json
```

`templates/common/skills/` 是四套 Skill 入口的唯一 Shared Skill source。通用
`.agents/skills/` 始终部署；`.omp/skills/`、`.codex/skills/` 和 `.claude/skills/` 随
`.omp-flow/config.json` 中选择的 Harness 部署。`templates/omp/`、`templates/codex/` 和
`templates/claude/` 只保存各平台真正不同的 Agent、config、settings、extension 或 Hook 资源。

### Task Bundle

新任务只创建最小起点：

```text
.omp-flow/tasks/<task>/
├── index.md
├── task.md
└── brainstorm.md
```

`index.md` 声明 `okf_version: "0.2"`，并作为面向下一位读者的 authored map。任务增长后可以
按需要增长为上方项目树中展开的 research、Reference、Context、work、review 和 QbD 空间。
尖括号表示作者选择的描述性名称，例如 `work/rewrite-readme-methodology.md`，不是编码 ID 或
固定 filename grammar。

这些目录和局部 index 是描述性组织，不是强制 schema。小任务可以直接从根 index 链接少量
Concept；大任务再增加有助于发现的层次。Index 用于 progressive disclosure，不要求完整
membership、反向链接或 link closure。

Task Bundle 保存本次任务的语义记录和决策链，而不是全部聊天历史。Agent 从相关 entry Concept
进入，只沿当前工作有用的链接阅读。

### Project Wiki

`.omp-flow/wiki/` 保存经过证实、值得跨任务复用的项目知识，例如：

- 稳定的架构边界；
- 已确认的行为契约；
- 项目约定；
- 重复出现的失败模式与修复 knowhow；
- 重新发现成本很高的设计理由。

本仓库当前的 Wiki 展示了这种按知识用途增长、但不封闭 taxonomy 的方式：

```text
.omp-flow/wiki/
├── index.md
├── philosophy/
│   ├── index.md
│   ├── evidence-led-exploration.md
│   └── semantic-knowledge-mechanical-control.md
├── specs/
│   ├── index.md
│   └── verifiable-claim.md
└── knowhow/
    ├── index.md
    └── detector-pathologies.md
```

`omp-flow init` 会在 Wiki 不存在时创建最小 `wiki/index.md`。`omp-flow-wiki` Skill 负责查阅、
初始化、提炼和维护；Skill 自身只保存操作方法，具体项目知识始终留在仓库根 Wiki。

临时调查、一次性交接和未确认解释继续留在 Task Bundle，不为了“完成流程”机械提升到 Wiki。

## 调查与 Reference

Brainstorm 和 Research 在同一连接知识空间中工作：

```text
question / hypothesis
        ↓
brainstorm Concept
        ↓
repository or external investigation
        ↓
research / Reference Concepts
        ↓
evidence, caveats, alternatives
        ↺ reframe the question when needed
```

外部仓库 clone 是只读 acquisition cache，放在 `.omp-flow/cache/repos/`，不是任务知识。
任务内的 Reference Concept 可以集中记录上游 URL、精确 revision、有效 anchors、本地解释、
限制以及它影响的问题或决定。Exact attachment 只在链接与 revision 不足以保证访问时保留。

这些内容不是固定字段协议。不要生成配对 metadata、Reference selector grammar 或 mandatory
Reference index，也不要为了“晋级”在不同 tier 间复制同一段结论。

## Skills 与 Agents

Shared Skills 的 canonical source 位于 `templates/common/skills/`。初始化时始终部署一份到
通用 `.agents/skills/`，并部署到所选 Harness 的原生目录。四套入口共享同一内容，不各自演化。
当前职责地图是：

```text
main-session routing
└── omp-flow
    ├── omp-flow-brainstorm
    ├── omp-flow-research
    ├── omp-flow-design
    ├── omp-flow-qbd
    ├── omp-flow-decompose
    ├── omp-flow-execute
    └── omp-flow-finish

role-level work
├── omp-flow-implement
└── omp-flow-check

supporting procedures
├── omp-flow-debug
├── omp-flow-ui-designer
└── omp-flow-wiki
```

- `omp-flow` 选择当前 Bundle，并路由下一种有用的推理动作。
- `brainstorm` 与 `research` 形成 Explore 螺旋。
- `design` 把选择的 synthesis 变成 PRD、Design 和链接的 decisions/interfaces。
- `qbd` 组织独立挑战和人类校准。
- `decompose` 编写描述性 work Concepts 和 authored grouping。
- `execute` 协调原生 implementation 与 independent review。
- `implement` 执行一个 bounded work Concept 并写 handoff。
- `check` 独立检查 work、handoff、真实 diff 和验证结果，写 Review Concept。
- `finish` 做集成、知识收获判断、提交与归档。
- `debug`、`ui-designer` 和 `wiki` 提供按需能力，不构成额外生命周期。

原生 Agent definition 负责 Required Inputs、工具、递归保护、写入范围、验证和最终 handoff。
子 Agent 不继续派发下一层 workflow Agent。

## QbD、工作与独立复核

### QbD

QbD 1 挑战问题、synthesis、需求、设计、来源和接口；QbD 2 挑战 authored work map 和每个
bounded work Concept 是否能够实现接受的设计。

Auditor 只写独立 Audit Concept。人类决定写成链接的 Human Decision Concept；runtime 不把
它复制为 phase、gate pointer、digest 或隐藏 frontmatter 状态。

### Work map

`work/index.md` 可以用普通语言表达顺序、并行组和关注点。主会话理解这个 authored view，
再让 Harness 并行派发边界不冲突的工作。

正常工作不需要 exact-topology ID、`dependsOn`、`plan.json` 或第二套 DAG。只有真实案例证明
普通分组无法表达时，才讨论更强的机械结构。

### Independent Review

Implementer 根据 work Concept 修改代码并写链接的 handoff。Reviewer 从同一个 work Concept、
predecessor output、真实 diff 和必要的 design links 进入，写出包含 subject、findings、
commands/results 和 verdict 的 Review Concept。

Python 只验证 actor 与 predecessor 的机械关联，不解析 Review 的语义，也不生成 Evidence
ledger。实质性 FAIL 回到 owning work/design，修复后由 fresh Reviewer 再次检查。

## Runtime 与原生 assignment

稳定 runtime 接口是路径式的：

```text
operation start  task entry role actor-id objective output [predecessor]
operation show   receipt
operation list   [task]
operation finish receipt actor-id state [external-receipt]
```

每次 native assignment 明确提供：

1. Task Bundle root；
2. role 与 bounded objective；
3. relevant entry Concept；
4. output Concept path 或 code scope；
5. native actor ID；
6. opaque operation receipt；
7. 需要关联时的 predecessor receipt；
8. verification 与 completion conditions。

`operation start` 是 executable assignment 的唯一生产者。调用方必须把返回的完整 assignment
原样交给 native task item，使 strict v1 `ompFlowDispatch` JSON 保持第一条非空行。不要解析、
重新序列化、添加前后 prose、推断或丢弃字段。

Native item 的 `id` 必须等于 operation 的 `actor_id`/descriptor `actorId`，role 必须匹配。
Batch 中每个 item 都创建独立 operation，并保持各自 `(id, role, assignment)` 配对。

Review operation 必须关联同任务中已完成的 predecessor，且 reviewer actor 与 implementer
不同。`operation finish` 绑定原 actor。对于确实需要外部/native action receipt 的操作，
使用 `--require-external-receipt`，runtime 会在成功完成前要求 receipt，并原子认领它以阻止
重复 claim；runtime 不声称让外部动作本身具备事务原子性。

## Harness

### OMP

OMP Adapter：

- 安装 orchestrator 的原生 tool belt；
- 在 session start/compaction 后注入 path-only runtime orientation；
- 把 session identity 传入根级 Bash 调用；
- 校验 native task item、strict descriptor 和 runtime operation 的机械绑定；
- 保护 `.omp-flow/config.json` 与 `.omp-flow/.runtime/` 的直接 Write/Edit。

OMP 的 native task 继续拥有 batch、进度、取消、递归深度和结果交付。

### Codex

Codex 使用项目 TOML agents、Shared Skills 和项目 `config.toml`。主会话调用稳定 CLI 获得
Bundle path 与 operation assignment，再使用 Codex 原生协作能力派发。Codex Adapter 不依赖
OMP 或 Claude 文件，也不重建生成式 context package。

### Claude

Claude Adapter 保留三类机械 Hook：

- SessionStart：桥接原生 session identity，注入 path-only orientation；
- SubagentStart：为五个 managed Agent 注入原生 identity；
- PreToolUse(Write|Edit)：保护 `.omp-flow/.runtime/`，允许普通 Bundle Concept 写作。

五个 managed Agent 是 Researcher、Architect、QbD Auditor、Executor 和 Reviewer。它们直接
读取 `operation start` 返回的 strict descriptor 与 entry path，不依赖 prompt-replacement
Hook 或 legacy context rendering。

当前 Claude 结论来自模板、静态契约和隔离 seam 验证，不代表已经完成真实 Claude 平台运行捕获。
这些 Hook 是标准工具的完整性边界，不是操作系统 sandbox。

## 安装与更新

在源码仓库开发：

```text
npm install
npm run build
node bin/omp-flow.js init --omp
node bin/omp-flow.js init --codex
node bin/omp-flow.js init --claude
node bin/omp-flow.js init --omp --codex --claude
```

安装后的 CLI：

```text
omp-flow init --omp
omp-flow init --codex
omp-flow init --claude
omp-flow init --omp --codex --claude
omp-flow update
omp-flow update --dry-run
```

交互环境可以运行不带 Harness 参数的 `omp-flow init` 进行选择；非交互环境必须显式选择至少
一个 Harness。配置保存在 `.omp-flow/config.json`，`update` 只维护已配置 Harness 的资源。

Shared Skills 部署到各 Harness 的原生目录；OMP、Codex、Claude 各自在自身目录保留所需的
agent、config、settings、extension 或 Hook 资源，不互相引用另一套 Adapter 文件。

## 稳定命令

```text
omp-flow status
omp-flow workflow state

omp-flow task create "Investigate cache behavior"
omp-flow task create "Offline planning" --no-start
omp-flow task list
omp-flow task current
omp-flow task select <task>
omp-flow task show [task]
omp-flow task archive [task]
omp-flow task clear

omp-flow operation start \
  --entry work/cache.md \
  --output src/cache \
  --role executor \
  --actor-id <native-id> \
  --objective "Implement the linked work" \
  [--predecessor <receipt>] \
  [--require-external-receipt]

omp-flow operation show <receipt>
omp-flow operation list
omp-flow operation finish <receipt> \
  --state completed \
  --actor-id <native-id> \
  [--external-receipt <native-receipt>]
```

`task create` 默认选择当前 session 的新任务；普通终端没有 `OMP_FLOW_CONTEXT_ID` 时可以使用
`--no-start`，随后在 Harness session 中显式 `task select`。

## Fail-Closed 与 Best-Effort

以下机械问题必须停止：

- 没有有效 session identity 或 active task；
- required entry Concept 不存在；
- task、entry 或 output path 越界；
- native actor、role、descriptor 或 operation receipt 不匹配；
- review 缺少 completed predecessor，或 reviewer 与 implementer 是同一 actor；
- operation 已终止、正在被并发更新，或 external receipt 已被其他 operation claim；
- archive 时仍有 active operation。

语义问题采用另一种边界：

- 缺少当前决定必需的知识时，Agent 明确报告 blocker；
- 可选链接损坏、未知 Concept type 和额外 frontmatter 可以 best-effort 阅读；
- prose 有歧义时改进 Concept 或向用户澄清，不增加 Markdown parser；
- 不回退到 `task.json`、CSV/JSONL、generated context、Reference selector 或聊天重建。

## 验证

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

测试聚焦仍需机械执行的契约：路径限制、session 选择、operation identity、独立 reviewer、
descriptor seam、重复 receipt claim、原子 create/archive、Adapter 资源同步，以及
task/runtime/cache 的 Git 边界。

Markdown 语义通过真实 Bundle dogfood、链接检查、QbD 和独立 Review 直接验证，不建立永久的
格式闭包测试。任何 Harness 的真实平台支持声明都必须以对应平台的实际运行证据为准。

## 明确不采用

当前架构不再维护：

- JSON/CSV/JSONL 对 Markdown 知识的同步投影；
- Python-owned lifecycle、phase、topology、gate 或 verdict；
- exact-topology filename grammar；
- Evidence ledger；
- paired Reference metadata 与 selector grammar；
- generated context package；
- Markdown headings/lists 的正则状态解析；
- permanent legacy reader、dual-write 或 schema 对照迁移；
- custom dispatcher、model aliases、progress renderer 或第二套 Harness。

这不是删除 omp-flow 的方法论，而是让方法论回到最适合承载它的层：知识由 Bundle、Wiki 和
Agent 理解，机械事实由最小 runtime 与原生 Harness 保证。
