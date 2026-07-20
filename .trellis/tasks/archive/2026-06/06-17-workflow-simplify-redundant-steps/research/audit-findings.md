# Workflow Step Audit Findings

**Date**: 2026-06-17
**Source audited**: `packages/cli/src/templates/trellis/workflow.md` (710 lines, 14 action steps)
**Framework**: design.md 5-question test per step (独有能力 / 触发判定 / 认知成本 / 折叠路径 / 保留理由)

---

## Scope discovery (correcting PRD)

Phase A surveying turned up more touch points than PRD assumed:

| 位置 | 引用形态 | 处理 |
|---|---|---|
| `packages/cli/src/templates/trellis/workflow.md` | **主源**（710 行） | 必改 |
| `.trellis/workflow.md` | dogfood 副本（byte-identical 主源） | `trellis update` 自动跟随 |
| `marketplace/workflows/native/workflow.md` | 独立 workflow 变体（用户可 `trellis init --workflow native` 选） | 必改（同源问题） |
| `marketplace/workflows/tdd/workflow.md` | 独立 workflow 变体 | 必改 |
| `marketplace/workflows/channel-driven-subagent-dispatch/workflow.md` | 独立 workflow 变体 | 必改 |
| `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-workflow.md:58` | 引用 "Phase 3.1 (verify quality + spec update)" 作 status transition 例子 | 改文案，或保留作"历史示例"标注 |
| `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/how-to-modify/add-phase.md:94` | "check: Quality verification" 作 phase 例子 | 不破语义 (它说的是 "check 类 phase 的概念"，不是 "3.1" 字面)，可保留 |
| `packages/cli/src/templates/copilot/prompts/finish-work.prompt.md:82` | "3.1 Quality verification" 在 Copilot 的 finish-work prompt | 必改（步骤号变了，prompt 也要跟着改） |
| trellis-meta skill 的 dispatched copies (`.claude/skills/`, `.cursor/skills/`, `.opencode/skills/`, `.agents/skills/`, `.codebuddy/skills/`) | 自动 dispatch 自 source | 改 source 即可，`trellis update` 自动覆盖 |

PRD 里说的"14 个平台"概念不太对——14 个平台都从 `templates/trellis/workflow.md` 单源派生（无 inline 分支），但 marketplace 变体是另一套独立 source。

---

## Per-step audit (14 steps)

### Phase 1: Plan (5 steps)

#### 1.0 Create task `[required · once]`
- **独有能力**：调用 `task.py create` 创建任务目录 + 种子文件 (prd.md / task.json / jsonl)
- **触发判定**：required-once 正确，每个 task 只创建一次
- **认知成本**：极低，机械动作
- **折叠路径**：无意义（这是 task lifecycle 起点）
- **保留理由**：lifecycle 起点，删除等于禁用 Trellis 任务系统
- **推荐**：**保留**

#### 1.1 Requirement exploration `[required · repeatable]`
- **独有能力**：和用户来回澄清写 prd.md (+ 复杂任务的 design.md / implement.md)
- **触发判定**：repeatable 因为 prd 可能多轮迭代，标注正确
- **认知成本**：高（这是真要写东西的步骤）但价值同等高
- **折叠路径**：无
- **保留理由**：planning 阶段的核心动作
- **推荐**：**保留**

#### 1.2 Research `[optional · repeatable]`
- **独有能力**：把"研究"作为显式步骤，产物落 `research/` 目录
- **触发判定**：optional 因为简单任务用不上
- **认知成本**：低（optional 不强制 AI 读细节）
- **折叠路径**：理论上可以省（直接把研究嵌进 1.1），但显式分离让"产物落地 + sub-agent 复用"有明确锚点
- **保留理由**：sub-agent dispatch 复用 research/ 产物的载体
- **推荐**：**保留**

#### 1.3 Configure context `[conditional · once]`
- **独有能力**：把"配置 jsonl / context 注入"作为独立准备步
- **触发判定**：`conditional` 是非标准标签（其它都是 required / optional / on demand）。其实是"如果用了 sub-agent dispatch 才需要"
- **认知成本**：中等（platform 矩阵复杂）
- **折叠路径**：可以并入 1.4 (Activate)
- **保留理由**：jsonl 配置是 sub-agent 的运行时输入，跟 task.py start 是不同动作
- **推荐**：**保留**（但触发条件文案可清晰化："仅当本任务使用 sub-agent dispatch 时跑"）
- **疑问**：`conditional` 标签是否值得标准化？目前只此一处

#### 1.4 Activate task `[required · once]`
- **独有能力**：跑 `task.py start`，触发 status: planning → in_progress
- **触发判定**：required-once 正确
- **认知成本**：低
- **折叠路径**：理论上跟 1.0 合？— 不行，1.0 在 PRD 没写前就发生，1.4 是 review gate
- **保留理由**：review gate（用户必须确认 PRD/design/implement 满足后才 start）
- **推荐**：**保留**

#### 1.5 Completion criteria （**非 action step**）
- 这是 Phase 1 的 exit gate 表格，不是 step
- 不计入 14 步
- **推荐**：**保留**（PRD 已声明 out of scope）

### Phase 2: Execute (3 steps)

#### 2.1 Implement `[required · repeatable]`
- **独有能力**：写代码（dispatch trellis-implement sub-agent 或主线程 implement）
- **触发判定**：repeatable 正确（implement-check 循环）
- **认知成本**：高但不可避
- **保留理由**：执行的核心
- **推荐**：**保留**

#### 2.2 Quality check `[required · repeatable]`
- **独有能力**：跑 trellis-check（spec 合规 + lint/typecheck/test）
- **触发判定**：repeatable 正确
- **认知成本**：中
- **保留理由**：execute 阶段的质量循环锚点
- **推荐**：**保留 + 增强**（吸收 3.1 的"末次全量 check"语义——明确"最后一段 implement 完成后必须再跑一次 2.2，scope 用 `--mode packages` 列全部受影响 package"）

#### 2.3 Rollback `[on demand]`
- **独有能力**：实现走不通时把代码 rollback
- **触发判定**：on demand 正确（少数任务才用）
- **认知成本**：极低（不出问题就不读）
- **折叠路径**：不需要（escape valve）
- **推荐**：**保留**

### Phase 3: Finish (5 steps — 这是审计重点)

#### 3.1 Quality verification `[required · repeatable]` ⚠️
- **独有能力**：**没有**——跟 2.2 同源（都加载 trellis-check skill）
- **触发判定**：required-repeatable，但它跟 2.2 的"最后一次"重合
- **认知成本**：每个 task 都要被读一次，但读完发现"跟刚才一样"
- **折叠路径**：
  - "全量 package 视图" → 写进 2.2 的描述（"末次 2.2 必须 full-scope"）
  - "Spec Sync 提醒" → 3.4 commit preamble（"commit 前问自己：要写进 spec 吗？"）
- **保留理由**：唯一软理由 = "commit gate 仪式感"。不够硬
- **推荐**：**删除**

#### 3.2 Debug retrospective `[on demand]`
- **独有能力**：加载 trellis-break-loop skill 做 debug 复盘（root cause / 为啥前面 fix 没用 / 怎么防）
- **触发判定**：on demand 正确（只有 fix-fix-fix 循环的任务才用）
- **认知成本**：极低（on demand）
- **折叠路径**：跟 3.3 (Spec update) 有依赖：3.2 出 lessons → 3.3 落 spec。可以合？— 不建议，3.2 是元认知，3.3 是执行
- **保留理由**：on demand + 高价值（生产 lessons）
- **推荐**：**保留**

#### 3.3 Spec update `[required · once]`
- **独有能力**：用户 confirm + 把 lessons 写进 `.trellis/spec/`
- **触发判定**：required-once 正确（每个 task 都问一次"要不要更新 spec"）
- **认知成本**：中（要思考"我学到了啥要沉淀"）
- **保留理由**：spec 系统的写入锚点
- **推荐**：**保留**

#### 3.4 Commit changes `[required · once]`
- **独有能力**：把改动 commit
- **触发判定**：required-once 正确
- **保留理由**：lifecycle 必经
- **推荐**：**保留 + 增强**（开头加 1 行 spec-sync preamble，吸收 3.1 的提醒职责）

#### 3.5 Wrap-up reminder
- **独有能力**：提醒用户跑 `/finish-work`（archive + record session）
- **触发判定**：无标签
- **认知成本**：低（就一行 reminder）
- **折叠路径**：可以合并到 3.4 末尾？— 边界清楚：3.4 是 commit，3.5 是 archive，两件事
- **保留理由**：archive 是 wrap-up 的最后一步，跟 commit 在不同 git 操作中（archive 触发 auto-commit）
- **推荐**：**保留**

---

## 推荐清单

### 必删 (1)
- **3.1 Quality verification** — 真冗余，迁移路径已设计好

### 必增强 (2)
- **2.2 Quality check** — 描述里加"末次 2.2 必须 full-scope 用 `--mode packages` 列全部受影响 package 逐一 check"
- **3.4 Commit changes** — 开头加 1 行 spec-sync preamble: "commit 前问自己：是否修了 bug 或学到非显然知识需要沉淀进 `.trellis/spec/`？是 → 先走 Phase 3.3 再回到 3.4。"

### 保留但文案可优化 (1)
- **1.3 Configure context** — `[conditional · once]` 标签是单点用法，触发条件文案可改为更明确："仅当本任务使用 sub-agent dispatch 时跑"

### 完全保留 (10)
- 1.0, 1.1, 1.2, 1.4, 2.1, 2.3, 3.2, 3.3, 3.5
- 还有 1.5 Completion criteria（非 action step，PRD 已声明 out of scope）

### 跨文件同步项
- `marketplace/workflows/native/workflow.md`（独立变体）— 同步删 3.1
- `marketplace/workflows/tdd/workflow.md`（独立变体）— 同步删 3.1
- `marketplace/workflows/channel-driven-subagent-dispatch/workflow.md`（独立变体）— 同步删 3.1
- `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-workflow.md` line 58 — 改文案
- `packages/cli/src/templates/copilot/prompts/finish-work.prompt.md` line 82 — 改"3.1 Quality verification" → "末次 2.2 Quality check 的 full-scope 复检"或类似
- `add-phase.md` line 94 "check: Quality verification" — 说的是 phase 概念，可保留不动

### 不 renumber 决策保留
- 3.2 → 3.1 / 3.3 → 3.2 / 3.4 → 3.3 / 3.5 → 3.4 这种 renumber **不做**
- 留空洞 3.1，文档里加 1 行说明："3.1 已合并入 2.2 + 3.4，编号空洞保留以兼容第三方引用"

### 触发判定标签的清晰化（可选 followup）
- `1.3 conditional · once` 是独有标签——要么改成 `[required · once · conditional]` 或 `[optional · once]`，要么保留并在 spec 里定义 `conditional`
- 建议另开任务处理，不在本任务范围

---

## User gate decisions（要你定）

| Q | 选项 | 我建议 |
|---|---|---|
| 范围扩到 marketplace 3 个变体？ | A: 扩 / B: 只改主源 | **A（扩）**——同样的冗余在 3 个变体里都存在，一刀切到位 |
| `change-workflow.md:58` 那行怎么改？ | A: 删 3.1 例子改为 2.2 / B: 留作历史示例标注"已合并" | **A**——用户读的是当下 workflow，不是历史 |
| `finish-work.prompt.md:82` Copilot 提到 3.1 怎么改？ | A: 改为 "末次 2.2 + spec sync 提醒" / B: 整段重写 | **A**——最小改动 |
| `add-phase.md:94` "check: Quality verification" 改不改？ | A: 不改（讲 phase 概念）/ B: 改为别的例子 | **A**——它说的是"如何加一个 check 类 phase"的范例，跟 3.1 字面无关 |
| 是否一并优化 1.3 的 `conditional` 标签？ | A: 本任务一并 / B: 单独开任务 | **B**——本任务保持减法纯净 |

确认后我跑 Phase B 实际删 3.1 + Phase C 跨文件同步。
