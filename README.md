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
│   ├── scripts/common/<runtime-module>.py  # session/path/task/operation/io/flow-status cache
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
│   └── skills/<shared-skill>/SKILL.md       # 通用 Agent Skills 与 $flow-status
├── .omp/
│   ├── settings.json
│   ├── agents/<role>.md                      # OMP 原生角色卡
│   └── skills/<shared-skill>/SKILL.md
├── .codex/
│   ├── config.toml
│   ├── agents/omp-flow-<role>.toml
│   ├── hooks.json                           # exact-owned Codex native Hook definitions
│   └── hooks/{session-start,protect-runtime}.py
├── .claude/
│   ├── settings.json
│   ├── agents/omp-flow-<role>.md
│   ├── hooks/
│   │   ├── flow-status-observe.py
│   │   ├── inject-agent-identity.py
│   │   ├── protect-runtime.py
│   │   └── session-start.py
│   └── skills/<shared-skill>/SKILL.md
├── .snow/
│   ├── agents/omp-flow-<role>.md
│   └── hooks/{onSessionStart,beforeToolCall}.json
│       + hooks/{session-start,protect-runtime}.py
└── .cursor/
    ├── agents/omp-flow-<role>.md
    ├── hooks.json
    └── hooks/{session-start,protect-runtime}.py
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
│   ├── cli/{flow-status-setup,harness,index,init,template-hash,update}.ts
│   └── omp/{agent-loader,extension-entry,extension,flow-status}.ts
├── integrations/ccstatusline/                # 固定 revision、reviewed patch 与 build manifest
├── templates/
│   ├── .omp-flow/
│   │   ├── gitignore
│   │   ├── workflow.md
│   │   └── scripts/                          # 上方最小 Python runtime 的 canonical source
│   ├── common/skills/<skill>/SKILL.md        # 唯一 Shared Skill source
│   ├── omp/{settings.json,agents/<role>.md}
│   ├── codex/
│   │   ├── config.toml
│   │   ├── hooks.json
│   │   ├── hooks/{session-start,protect-runtime}.py
│   │   └── agents/omp-flow-<role>.toml
│   ├── claude/
│   │   ├── settings.json
│   │   ├── agents/omp-flow-<role>.md
│   │   └── hooks/{flow-status-observe,inject-agent-identity,protect-runtime,session-start}.py
│   ├── snow/{agents,hook definitions,hook handlers}
│   └── cursor/{agents,hooks.json,hook handlers}
├── tests/{flow-status-installed,omp-flow}.*
├── package.json
└── tsconfig.json
```

`templates/common/skills/` 是 Shared Skill 的唯一 source。通用 `.agents/skills/` 始终部署，
也是 Codex、Snow 和 Cursor 唯一的 project Skill root；不会生成 `.codex/skills`、
`.snow/skills` 或 `.cursor/skills` duplicate。`.omp/skills/` 和 `.claude/skills/` 随
`.omp-flow/config.json` 中选择的 Harness 部署。各 `templates/<harness>/` 目录只保存平台真正
不同的 Agent、config、settings、extension 或 Hook 资源；Cursor 不安装重复 rule。

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

Codex 使用项目 TOML agents、`.agents/skills` Shared Skills、项目 `config.toml` 和 exact-owned
`.codex/hooks.json`。后者只注册两个原生事件：`SessionStart` 从现有 runtime `status` 返回有界、
path-only 的机械定向；`PreToolUse(apply_patch)` 拒绝直接修改 `.omp-flow/.runtime/`，并在 payload、
patch envelope 或路径无法验证时 fail closed。它允许普通源码、Task Bundle 和 Wiki patch，既不
解析 Markdown，也不生成语义 context package。

Project Hook 必须先由用户信任才会运行。安装或升级后在 Codex `/hooks` 中检查 definition source
与 hash，并审阅 `hooks.json` 实际引用的两个 Python script；definition hash 的确认**不会递归证明**
所引用 script 内容已被审阅。若 project 未信任、`[features].hooks=false`、当前 surface 不执行
Hooks、Hook 超时或写入不经过 `apply_patch`，这些 adapter 不提供 enforcement。此时 Skills、
`$flow-status` 与显式 `.omp-flow/scripts/omp_flow.py` CLI 仍可用，Python runtime 的路径、身份和
receipt 校验继续是最终边界。当前只验证 CLI Hook contract 和可用 host command，不宣称 IDE/App
parity 或 OS sandbox。

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

### Snow

`init --snow` 安装五个项目 Agent card 到 `.snow/agents/`，并安装
`.snow/hooks/onSessionStart.json`、`.snow/hooks/beforeToolCall.json` 及其两个 Python handler。
该 adapter 面向 Bundle 固定的 `snow-ai@0.8.24` contract，使用 `SNOW_SESSION_ID` 隔离
task selection，并复用 `.agents/skills`；不创建 `.snow/skills`。这些 JSON 是
exact-owned managed resource，init/update 不与已有文件合并。当前可取得并完成
released-runtime 检查的 `snow-ai@0.7.23` 在 resume 时只传入 `messages` 和
`messageCount`，缺少 handler 定向所需的 native session identity 与 `cwd`，因此该版本的
native session orientation 不可用。`snow-ai@0.8.24` 本身尚未进行 released-runtime
verification，不把它的 runtime 行为声明为已验证。

Snow 对同一事件只加载一个 project 文件；非空 project `onSessionStart` 或 `beforeToolCall`
会遮蔽同事件的 global rules，而不是与它们组合。选择 `--snow` 前应审阅现有 global Hook，安装后
也应审阅这两个 project 文件。保护只覆盖已注册的已知写工具；terminal、任意 MCP mutator、Hook
缺失/超时以及 Snow 已知的 fail-open 路径不在保证范围内。

`snow-ai@0.8.24` 没有证明调用方能在 `operation start` 前选择唯一 native execution ID。因此五个
card 虽可安装和发现，但 receipt-bound Research/Design/QbD/Implement/Review dispatch 当前明确
不可用：card 会在 strict descriptor 检查后停止，不执行、不写 handoff，也不 finish receipt。
omp-flow 不用 agent type/name alias 或事后改 receipt 来伪造这条绑定。

### Cursor

`init --cursor` 安装五个项目 Agent card 到 `.cursor/agents/`，以及一个 exact-owned
`.cursor/hooks.json` 和 `.cursor/hooks/{session-start,protect-runtime}.py`。Cursor 同样只使用
`.agents/skills`；不会创建 `.cursor/skills` 或重复 Cursor rule，也不会 merge 外部 `hooks.json`。

已验证的 fixture 要求 `sessionStart` 的 `conversation_id`，并注入同值的
`OMP_FLOW_CONTEXT_ID` 与 `OMP_FLOW_HOST=cursor`；缺失或无效 identity 时不制造 project-global
task selection。静态 handler/fixture 不等于 released Cursor lifecycle 证明：真实顶层 shell 的
env 传播、并发 conversation、reopen/resume、subagent inheritance，以及各 surface 对 write deny
的执行仍未验证，因此这些路径当前不可用，不作为支持能力声明。

Cursor 的 `subagentStart` 也没有证明调用方可在提交 assignment 前令 native `subagent_id = actorId`。
所以五种 native receipt-bound operation dispatch 均保持不可用；不注册用观察到的 ID 冒充预选
identity 的 Hook，也不增加 dispatcher 或 alias。

### Flow Status 状态栏

Flow Status v2 把“当前立项的根 Task”和“方法论当前 Flow 位置”作为主语；Harness 原生 task
只作为独立的 `nativeActivity` 分支，绝不冒充根 Task 或 Work 进度。语义由主会话在读过 Bundle
后显式发布，Python 只校验闭合结构、scope、CAS、lease 和原子缓存，不解析 Markdown、Git、
token 或耗时来猜阶段。默认没有 `OMP`、`omp:`、logo 或 Bundle 缩写，且最多只有一条有标签的
图形进度条。

预期的 Claude 两行 Powerline 效果是：

```text
 TUI 状态栏返工  Opus  ctx 42%  main* 
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

五种 Harness 的可用性不同：

- **Claude Code**：`init --claude` 安装结构化 Task observer，但不会替换现有 status renderer。
  丰富 Powerline 行需要 reviewed compatible build
  `@omp-flow/ccstatusline@2.2.27-flowstatus.2`，capability 必须返回完整 v2 quartet 和固定
  upstream revision `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`。显式 setup 只会在
  package、capability、revision 与 Claude TaskUpdate guard 全部匹配后，安装
  `root-task`（第一行）和 `flow`（第二行）两个原生 view；两个 view 在同一 frame 共用一次缓存读。
- **Oh My Pi**：仅在公开 API 与固定的 17.2.1 capability 完全匹配时注册原生
  `flow-status` key 和只读 `/flow-status`；旧版、冲突或未知版本保持 semantic empty，可直接运行
  `omp-flow status inspect --host oh-my-pi --session <id>`。
- **Codex**：当前只安装按需 `$flow-status` Skill / `status inspect` detail。omp-flow 不修改
  `tui.status_line`，也不声称 stock Codex TUI 已有第三方持久 footer。
- **Snow**：使用 `SNOW_SESSION_ID` 与 host `snow` 读取同一只读 snapshot；不安装原生持久状态栏。
- **Cursor**：仅在 session Hook 已注入明确的 `OMP_FLOW_HOST=cursor` 和 matching context 时读取；
  不从已配置 Harness 顺序推断当前 host，也不宣称 reopen/subagent lifecycle 已受支持。

初始化以后可以只读检查各表面的真实状态：

```text
omp-flow flow-status doctor
omp-flow flow-status doctor \
  --ccstatusline-bin <explicit-executable-or-js> \
  --ccstatusline-package-json <package.json> \
  --ccstatusline-config <settings.json> \
  --claude-settings <settings.json>
omp-flow status inspect --host <claude|codex|oh-my-pi|snow|cursor> [--session <id>]
omp-flow status inspect --host <claude|codex|oh-my-pi|snow|cursor> [--session <id>] --json
```

`doctor` 绝不执行 `.claude/settings.json` 里的 shell command；只有显式传入的 executable 才会
以参数数组、3 秒 deadline 运行 `--capabilities --json`。外部 renderer、错误 revision、缺少
capability 或 probe 失败都报告 conflict/unsupported，并保持已安装代码和配置不变。

发布包包含 `integrations/ccstatusline/` 下的固定 manifest、reviewed patch 和构建程序。
CLI 不下载或 hot-patch renderer；先显式构建并安装 compatible build，再预览和确认结构化放置：

```text
node node_modules/omp-flow/integrations/ccstatusline/build.mjs --output <artifact-dir>
# 安装生成的 @omp-flow/ccstatusline-2.2.27-flowstatus.2 tarball

omp-flow flow-status setup \
  --scope project \
  --ccstatusline-bin <installed dist/ccstatusline.js> \
  --ccstatusline-package-json <installed package.json> \
  --ccstatusline-config <explicit settings.json> \
  --claude-settings <explicit settings.json> \
  --root-task-line 1 \
  --root-task-position 1 \
  --flow-line 2 \
  --flow-position 1 \
  --dry-run

# 检查计划后，把 --dry-run 改为 --yes；不带 --yes 不会写文件
```

该 reviewed 构建路径要求 Git、Bun，以及可供 `bun install --offline` 使用的固定依赖缓存；它
不会 hot-patch 任意安装，也不会用 Custom Command 传递完整 Claude payload。`--scope
project` 要求两个设置路径都位于当前仓库；`--scope user` 仍要求显式绝对路径。重复 setup
幂等；再次运行 `flow-status update` 可移动未修改的两个 owned view。已存在外部 renderer、
额外/修改/交换过的 Flow Status view、错误 package、capability 或 guard 都 fail closed。

根 Task/Flow publication 使用 10–15 分钟 lease；主会话在语义仍然成立时至多每 5 分钟显式
renew，task 切换、归档、session 结束或 publisher shutdown 时显式 clear。renderer、provider
和 observer 都不能续租。Explore 的 Brainstorm/Research 是一个可反复迭代的阶段；Explore
round、QbD attempt、Work review/rework round 都只在各自有方法论意义的边界上递增。Wave 只在
detail 中展示，不占用常驻状态栏。

项目级受管文件可预览并精确移除：

```text
omp-flow flow-status remove \
  --scope project \
  --ccstatusline-config <same explicit path> \
  --claude-settings <same explicit path> \
  --dry-run

# 检查计划后，把 --dry-run 改为 --yes
```

setup 用一个 ignored ownership record 记录精确 config、command、widget identity、line 和
position。移除只删除该 exact owned widget，以及 template hash 仍完全匹配的 `$flow-status`
Skill、Claude observer、statusLine/hook；有用户修改时 fail closed。settings、ownership 和
hash 使用同目录临时文件、file fsync、rename，并在多文件提交失败时恢复上一组完整文档。它不
卸载 ccstatusline、不改 Codex status line，也不卸载包级 Oh My Pi extension；后两者需在各自
原生配置/包生命周期中显式移除并重启 Harness。`init --force` 可以明确恢复项目受管资源。

## 安装与更新

首次安装：

```text
npm install -g omp-flow@latest
cd <project>
omp-flow init -u "Your Name"
```

`init` 会显示 Harness 选择面板；新项目默认选中 OMP、Codex、Claude、Snow 和 Cursor，按需取消
即可。`-u` 设置当前仓库的 local Git `user.name`，不会修改 global Git 配置。

更新 npm 包和已有项目：

```text
npm install -g omp-flow@latest
cd <project>
omp-flow update
```

CI 等非交互环境才需要显式传入 `--omp`、`--codex`、`--claude`、`--snow` 或 `--cursor`；可组合
多个参数。`omp-flow update --dry-run` 可以只预览更新。

## 稳定命令

```text
omp-flow status
omp-flow status inspect --host <claude|codex|oh-my-pi|snow|cursor> [--session <id>] [--json]
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
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/codex/hooks templates/claude/hooks
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
