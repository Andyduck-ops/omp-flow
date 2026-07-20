# PR #345 合并裁决 — Pi mem adapter（社区贡献 by GowayLee）

> 5 维度评审综合：pi-session-parsing / mem-core-integration / tests / docs-and-conflict / regression-safety

## 总判定

**SHIP: YELLOW（小修后合并）**

核心适配器质量过硬、集成完全 exhaustive、1232 测试全绿、对现有平台零回归、零合并冲突；唯一需要在合并动作里顺手处理的是 15 个本地 dogfood skill 安装副本与源模板失同步（破坏 source==installed 不变量），这是维护者侧的 refresh sweep，而非贡献者代码缺陷。

## 按维度小结

| 维度 | Verdict | 一句话结论 |
|------|---------|-----------|
| pi-session-parsing | **CONCERN** | 两个硬机制（compaction 切片、active-branch 遍历）实现正确且忠于研究 spec；但评审 prompt 的前提（"保留废弃分支 branch_summary"）与 PR 自己的 PRD（"废弃分支必须丢弃"）冲突——代码做的是后者，内部自洽。无 blocker，是 spec brief 与 PR 契约的口径冲突，需确认意图。 |
| mem-core-integration | **PASS** | Pi 接入共享 dispatch 干净且穷尽：`MemSourceKind` 加 `"pi"`，三处 `switch` + `listAll` + `by_platform` + CLI 全部覆盖；无 `default` 分支意味着漏 case 会编译失败，而 `pnpm typecheck` 通过即为穷尽性证明。无 blocker。 |
| tests | **PASS** | 实跑 pr-345：core 构建干净，`pnpm test` = 47 文件 / 1232 通过 / 0 失败 / 0 skip；5 个 Pi/mem 测试文件全过；fixture 复刻真实 Pi v3 树形 JSONL，active-branch 与 compaction 均含真·负断言（true-negative），非 happy-path。无 blocker。 |
| docs-and-conflict | **MINOR** | 无合并冲突——pr-345 是 main 的严格后继（merge-base == main HEAD），`merge-tree`/`--no-commit` 均干净；"HIGH conflict risk" 前提不成立。Trellis 仓内文档对 Pi 覆盖完整；真实缺口在 PR diff 之外：15 个安装副本失同步 + docs-site/marketplace 两个子模块未 bump。 |
| regression-safety | **PASS** | Pi 纯增量。claude/codex/opencode 三个旧适配器 diff 为空（逐字节未动）；共享 dispatch/search/aggregation 只新增 pi 分支，无签名/guard/旧 case 改动；-226 删除全在文档与 pi-context 测试重构，零删除触及旧平台可执行逻辑或测试覆盖。无 blocker。 |

## 必须处理（blockers / should-fix）

### 合并前必须处理（must fix before merge）

**无硬 blocker。** 5 个维度中没有任何 must-fix 级别的代码缺陷会阻断合并。下列 should-fix 均可在合并动作中顺手解决或转为合并后跟进。

### 合并时顺手处理（维护者侧，建议合并前一并提交）

1. **15 个本地 dogfood skill 安装副本失同步** — `docs-and-conflict`
   - what：PR 只改了源模板 `packages/cli/src/templates/common/bundled-skills/{trellis-meta,trellis-session-insight}/`，未重新生成 `.claude/ .pi/ .cursor/ .opencode/ .agents/` 下 5×3 个安装副本（仍写 "Claude Code and Codex"，无 Pi）。
   - file：`.claude/`、`.pi/`、`.cursor/`、`.opencode/`、`.agents/` 下各自的 `trellis-meta/SKILL.md`、`trellis-session-insight/SKILL.md`（共 15 份）。
   - how：在本地跑一次 `trellis update` / "chore(skills): refresh local dispatch copies" 刷新 sweep（参考 main 上既有的 `1fd56ba7` 类提交），把安装副本对齐源模板。这是维护者职责（贡献者无法预知本仓 dogfood 约定），建议合并前同提交以保持 source==installed 不变量。

### 合并后跟进即可（fix-after-merge ok，跨仓，PR 内无法修）

2. **docs-site 子模块用户页未含 Pi** — `docs-and-conflict`
   - what：`docs-site/skills-market/mem-recall.mdx`（及 `zh/` 镜像）"Where data comes from" 表只列 Claude/Codex/OpenCode，无 Pi 行；子模块指针 `81de9943` 在两个分支上一致、未 bump。
   - file：`docs-site/skills-market/mem-recall.mdx`（lines 88-90）+ 中文镜像。
   - how：单独提一个 docs-site bump，补 Pi Agent 行。（`v0.6.0-beta.0.mdx:20` 的版本钉死历史 changelog 可不动。）

3. **marketplace 子模块 mem-recall skill 失同步** — `docs-and-conflict`
   - what：`marketplace/skills/mem-recall/SKILL.md`（子模块 `56a8e727`，两分支一致未动）仍是旧描述："for Claude Code and Codex CLI"、`--platform claude|codex|opencode|all`（line 196，无 pi）、数据来源表无 Pi 行。
   - file：`marketplace/skills/mem-recall/SKILL.md`（lines 196, 218-222）。
   - how：跟进一个 marketplace 仓 PR，让已发布 skill 匹配新 Pi 适配器。

### 建议确认/可选硬化（非阻断）

4. **Spec brief 与 PR 契约口径冲突，需确认意图** — `pi-session-parsing`
   - what：评审 prompt 要求验证 adapter "保留废弃分支的 branch_summary 作为 summary turn"，但代码只沿 leaf→root active spine 收集，off-spine 的 branch_summary 永不进入 `effective`；这恰好符合 PR 自己 PRD 的验收标准（"不得让废弃分支对话泄漏进 search/extract"）。属于评审 brief 与 PR 文档意图的冲突，不是实现缺陷。
   - file：`packages/core/src/mem/adapters/pi.ts` → `effectiveActivePath()` / `turnFromEntry()`。
   - how：确认期望行为即可——若确需 surface 废弃 summary，需额外扫描 off-spine `branch_summary` 节点；否则 prompt 前提本身有误，无需改码。建议：维持现状（与 PRD 一致）。

5. **Leaf 选择缺防御性 fallback（依赖未验证的 Pi 不变量）** — `pi-session-parsing`
   - what：`effectiveActivePath` 直接信任 `entries[entries.length-1]` 为 active tip，无 fallback。若 Pi 把 `branch_summary` 写为最后一行且其 `parentId` 指向它所总结的废弃分支，walk 会跟进废弃分支——active 丢失且废弃对话泄漏（正是 PRD 禁止的失败）。研究文档未钉死 trailing `branch_summary` 的写序，故为真实但概率取决于未验证不变量的隐患。
   - file：`packages/core/src/mem/adapters/pi.ts` → `effectiveActivePath()`。
   - how（可选硬化，合并后跟进）：选 leaf 时"优先取最后一个 message-type 条目" / "跳过尾部纯 metadata 条目"。
   - 备注：`pi-session-parsing` 还提出"无适配器测试"，但被 `tests` 维度实跑推翻——5 个 Pi/mem 测试文件确实存在并全过（含 active-branch 真·负断言与 compaction discard 语义）。该 finding 视为已解决。

6. **nits（不阻断，记录即可）**：
   - session-root 扫描 roots 并集而非 Pi 单赢者优先级，可能让 `mem list` 多列出非当前配置写入的 session（`pi-session-parsing`，加注释说明刻意分歧即可）。
   - env-var session-root（`PI_CODING_AGENT_SESSION_DIR`/`PI_CODING_AGENT_DIR`）无专门测试，仅 settings.json 路径被覆盖（`tests`）。
   - 多个 `session_info` 时"取最新 name 为 title"未用双竞争名 fixture 显式断言（`tests`）。
   - `cli-quick-reference.md` 夹带表格列对齐重排（23 ins/24 del 几乎全空白 churn），是最易与未来 main 冲突的文件（`docs-and-conflict`）。

## 合并建议

### 谁来改

- **贡献者无需再改。** 代码、集成、测试、文档（仓内）均达标；剩余 should-fix 全是维护者侧（dogfood refresh sweep）或跨仓子模块跟进（PR 内无法修）。
- **维护者侧合并时顺手做**：跑一次 skill refresh sweep 对齐 15 个安装副本（blocker #1）。
- **个人 workspace / dogfood 产物：保留，不要剥离。** `.trellis/tasks/archive/2026-06/06-18-pi-mem-adapter/{prd,design,implement,check,research,task.json}` 与 169 个既有归档任务目录同构；`.trellis/workspace/hauryn/{index.md,journal-1.md}` 与 main 上 5 个既有贡献者 workspace（bamboo-pan/jdjingdian/jobbrown/kleinhe/taosu）同构——剥离反而违反本仓约定。`hauryn/journal-1.md` 是半填的 auto-template（留有 `(Add details)` 占位），低价值但无害、切题，保留即可。

### 推荐合并方式

- **可直接本地合并（参照 #333 的处理）**：pr-345 是 main 严格后继（领先 3 commits：`bfd9fff6` feat / `3e0775b9` archive / `dd0ccc3d` journal），`git merge --no-commit --no-ff` 报 "Automatic merge went well"，无冲突，无需本地解冲突。
- **建议流程**：本地 checkout pr-345 → 跑 skill refresh sweep 生成对齐安装副本的 commit → merge 进 main（非 squash，保留贡献者 3 commit 署名与归档/journal 历史，与本仓既有社区贡献保留方式一致）。
- 合并后另开两个跟进项：docs-site bump（blocker #2）+ marketplace skill 更新（blocker #3）。

### 给贡献者的中文回复 draft

> @GowayLee 感谢这个高质量的贡献！这是我们见过完成度最高的社区 PR 之一 👏
>
> 已通过 5 个维度评审，结论是 **可以合并**：
> - Pi 适配器的两个最难机制——compaction 切片（summary → 保留近况 → 后续，废弃前置内容丢弃）和 active-branch 遍历（leaf 沿 parentId 回溯到 root 再反转，带环检测）——实现正确，且忠实复刻了你研究文档里的 Pi spec。
> - 接入共享 mem dispatch 非常干净、穷尽：`MemSourceKind` 扩展后所有 switch / `listAll` / `by_platform` / CLI 全部覆盖，`pnpm typecheck` 通过即证明无遗漏 case。
> - 对现有 claude/codex/opencode 三个适配器**零改动、零回归**（diff 为空）。
> - 测试质量高：5 个 Pi/mem 测试文件、fixture 复刻真实 Pi v3 树形 JSONL，active-branch 和 compaction 都写了"废弃内容不得出现"的负断言。本地实跑 1232 测试全绿。
>
> 合并由我们维护者侧处理两件你不必管的小事：(1) 刷新本仓 dogfood skill 的安装副本（你只改了源模板，安装副本需我们跑一次 refresh sweep）；(2) 同步 docs-site / marketplace 两个独立子模块里的 mem-recall 页面到含 Pi（这俩在你的 PR 里改不到，我们另开跟进）。
>
> 一个想跟你确认的点（非阻断）：当前实现是**丢弃**废弃分支（含其 `branch_summary`），这与你 PRD 的验收标准一致、我们也认为正确。如果未来想反过来"保留废弃分支摘要"再告诉我们。
>
> 另外一个可选的健壮性建议：`effectiveActivePath` 目前直接取最后一行作为 active leaf，如果 Pi 把 `branch_summary` 写成最后一行可能会跟错分支。加一个"跳过尾部纯 metadata 条目"的 fallback 会更稳——不阻断合并，可后续再补。
>
> 再次感谢，准备合并了 🚀

## 亮点

- **两个最难的机制都对**：compaction 切片（`findLastIndex` 取 active path 上最后一次 compaction，`keptBeforeCompaction = slice(firstKeptIdx, compactionIdx)`，输出顺序 summary → 保留近况 → 后续，前置丢弃，边界 case 全 sane）；active-branch 遍历用 leaf→root spine + 环检测（`pi-session-parsing` 评为 good）。
- **task-event turnIndex 一致性比 claude/codex 更干净**：Pi 用**结构化**方式处理 compaction（events 只从 post-compaction 的 `effective` 收集），从构造上杜绝陈旧 turnIndex，无需像 claude/codex 那样显式 reset（`pi-session-parsing` good）。
- **集成穷尽性由编译器保证**：所有 switch 无 `default` 分支，漏 case 即编译失败，`pnpm typecheck` 通过 = 穷尽性证明；`git grep` 确认 `Record<MemSourceKind>` 只有 types.ts:139 + projects.ts:31 两处且都已处理（`mem-core-integration` good）。
- **测试写法符合本仓反模式规范**：fixture 复刻真实 Pi v3 shape（非臆造），active-branch 与 compaction 都有 true-negative 断言（`piSearch(s,'abandoned-only').count===0`、`piSearch(s,'discarded').count===0`），无对增长数据集的脆性硬编码计数（`tests` good，呼应 `spec/unit-test/conventions.md`）。
- **纯增量、零回归**：三个旧适配器逐字节未动，共享 helper（dialogue/filter/phase/jsonl）diff 全空，`pi.ts` 只 import 共享模块、从不 import 兄弟适配器——零跨适配器耦合（`regression-safety` good）。
- **防御性细节扎实**：parentId walk 的环检测 seen-set、`0x7b` 字节前缀的宽松 JSONL 解析、cwd 编码逐字复刻 Pi 的 `--${cwd...}--` 规则——对一个不可信外部格式是稳的选择（`pi-session-parsing` good）。
- **CLI 接线完整**：`VALID_PLATforms` 加 pi、help 文本 `claude|codex|opencode|pi|all`、`by_platform` 用 `Object.entries` 动态渲染（无硬编码列表可漏）、`maybeWarnOpencode` 正确保持 opencode-only（Pi 不误报警告）（`mem-core-integration` good）。
- **dogfood 产物遵循本仓约定**：归档任务目录 + 贡献者 workspace 都与 main 既有 169 个归档 / 5 个贡献者目录同构——是"按本仓规范交付"的体现（`docs-and-conflict` good）。
