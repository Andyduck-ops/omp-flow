# Trellis Issue 三态分诊行动报告

> 仓库 `mindfold-ai/Trellis` · 当前版本 **0.6.2** · 共 18 个 issue
> 按「行动类型」分组，便于一次性批处理。每条均附证据与可直接粘贴的 draft 回复。

---

## 🔴 已修但没关 / 没回复（最优先 —「代码做过但 issue 没动」）

这两个的根因修复**已合入并发布**，issue 仍 OPEN，应优先回复并关闭。

### #278 使用 codex 生图流程太过复杂（enhancement · ALREADY-FIXED）
- **在哪修的**：consent 式 triage 在 **v0.6.0-beta.8** 引入、**v0.6.0 GA** 发布（squash commit `3c3bb027`）。
  - 旧根因 (v0.5.12)：`workflow.md` 三段式 A/B/C triage，非纯问答的请求（如生图）默认归入 B「建任务」，唯一逃逸口 C 必须用户说固定口令（"skip trellis"/"跳过 trellis"）才能触发。
  - 现状 (`workflow.md:152-180`)：无任务时 AI 先分类并征求建任务同意，用户回「不用」即跳过整套流程，不再需要口令。文档：`docs-site/changelog/v0.6.0-beta.8.mdx:8-17`、`v0.6.0.mdx:125-127`。
  - **CAVEAT**：未做生图/视频专属流程（grep 无 media-specific 分支），落地的是更通用的 opt-out，但已解决「被强制走流程」的根本痛点。
- **建议**：**close-with-reply**（reporter 与 3 位评论者均 authorAssociation=NONE，确认升级到 0.6.2 即可关闭）。
- **Draft 回复**：
  > 感谢反馈！0.5.x 当时的三段式 triage 默认会把"非纯问答"的请求(比如生图)归入"建任务"流程，只能靠在对话里说"跳过 trellis"这类固定口令绕过。从 0.6.0 起这块已重做为 consent 式 triage(见 v0.6.0 changelog "Task triage consent gates"):无任务时 AI 会先判断本轮请求,简单/非编码的事只会先问你"要不要建 Trellis 任务",你直接回"不用"即可跳过整套流程,不再需要记口令。我们没有为生图单独建一条流程,而是用这个更通用的机制解决了"被强制走流程"的问题。请升级到 0.6.2 试试;如仍有不便我们再跟进,先关闭此 issue。

### #310 Codex 子代理派发静默失败（bug · ALREADY-FIXED）
- **在哪修的**：Codex 默认 inline 模式在 issue 之前就已合入：`278b40ac`（2026-05-08，feat(codex): configurable dispatch mode）+ `6abde659`/`02fba643`（默认 inline）。已随 v0.6.0/0.6.1/0.6.2 GA 发布，文档 `docs-site/changelog/v0.6.0-beta.1.mdx`。
  - `workflow_phase.py:144-168` `resolve_effective_platform()` 把 `codex` → `codex-inline`；`inject-workflow-state.py:219-247` 每轮注入 `<codex-mode>inline … do not dispatch …>`。报告的「宣称派发但不调用工具」路径在默认配置下已不可达。
  - **CAVEAT**：reporter 0.5.19 其实也已带此机制，命中很可能是旧 `.trellis/` 未迁移 / Codex hooks 未在 `/hooks` 批准 / 显式设了 `dispatch_mode: sub-agent`。其建议 #1（tool_search 前置）和 #2（task_complete no-op guard）**未实现**，但对默认 inline 用户无意义。
- **建议**：**reply-and-keep (NEEDS-INFO)** — 让 reporter `trellis update` 后确认 `codex.dispatch_mode`（默认/inline）+ hooks 已批准；确认即关，若坚持用 sub-agent 模式则转为 enhancement。
- **Draft 回复**：
  > 这个问题的根因修复其实在你提 issue 之前就已经合入了：Codex 现在默认 `dispatch_mode: inline`（commit 278b40ac/6abde659），主会话直接改代码、不再派发 `trellis-implement`/`trellis-check` 子代理，每轮还会注入 `<codex-mode>inline …do not dispatch…>` 提示，所以"宣称派发但不调用工具然后 task_complete"的路径在默认配置下已经不存在了（0.6.0/0.6.1/0.6.2 GA 都包含）。0.5.19 其实也已带这套机制，你当时命中很可能是：项目里旧的 `.trellis/`（hook + workflow.md + config 在你项目里，不随 npm 升级自动更新）没迁移、Codex hooks 没在 `/hooks` 里批准（未批准则 banner 不注入），或显式设了 `dispatch_mode: sub-agent`。麻烦先 `trellis update` 后确认 `.trellis/config.yaml` 的 `codex.dispatch_mode`（默认/inline）并确保 hooks 已批准，再看是否还能复现？若你确实想用 sub-agent 模式，你提的 `tool_search` 前置与 no-op guard 目前还没做，我们可另立 enhancement 跟进。

---

## 🟡 仍然有效、待修（真 bug / 真待办）

### 真 bug

| # | 一句话现状 | 建议 |
|---|-----------|------|
| **#300** | Windows 下 `trellis mem list --cwd` 返 0：`claudeProjectDirFromCwd()` (`packages/core/src/mem/internal/paths.ts:19-21`) 的正则 `cwd.replace(/[/_]/g,"-")` 只处理 `/` 和 `_`，未处理 Windows `\` 和盘符 `:`，且 `--cwd` 快速路径无全局回退（`adapters/claude.ts:68-70`）。`--global`/`mem projects` 因不走该函数所以正常。0.6.1/0.6.2 均未修。 | **fix-now** — 正则补 `\` 与 `:`；并给 `--cwd` 路径加全局扫描回退。补 Windows 反斜杠路径的单测。 |
| **#303** | `add_session.py` 的 journal commit 把并行任务的脏文件一起带进来：`safe_trellis_paths_to_add()` (`safe_commit.py:99-105`) 遍历 `.trellis/tasks/` 下**每个** active task 目录全 stage。已发布的相似修复 (`0ec7c362`, v0.5.14) 只收窄了 `task.py archive`（独立函数 `safe_archive_paths_to_add` 加 `task_name`），从未碰 session 路径。 | **fix-now** — 镜像 archive 修复：把当前任务目录 thread 进 `safe_trellis_paths_to_add`（或加 scoped 变体），只 stage journal/index + 活动任务目录；补 add_session scope-creep 集成测试（对照 `task-archive.integration.test.ts:116`）。 |
| **#287** | 多级/GitLab 子组路径未支持：`parseRegistrySource` (`template-fetcher.ts:312-321`) 硬编码 `repo = segments[0]/segments[1]`，把 `gitlab:aa/bb/spec-marketplace` 误判为 repo=`aa/bb`、subdir=`spec-marketplace`。逻辑自 `93779ac4`(2026-03-12) 未变。注意现有测试 `template-fetcher.test.ts:77` 反而固化了错误假设。 | **reply-and-keep（需设计决策）** — 无法自动区分「子组层级」与「仓库内子目录」，需引入显式分隔符或前缀逐级 clone 探测。先追问 reporter 实际仓库结构再设计接口，不是 trivial patch。 |

`#287` Draft 回复：
> 已确认这是真实 bug，当前 0.6.2 仍存在：parseRegistrySource 把路径前两段固定当作 repo（template-fetcher.ts:320），所以 GitLab 子组仓库 aa/bb/spec-marketplace 会被误判成 repo=aa/bb、子目录=spec-marketplace。难点在于无法自动区分"子组层级"和"仓库内子目录"——需要引入显式分隔符（区分 repo 与 subdir）或按前缀逐级探测 clone。我们会保留此 issue 跟进修复方案，欢迎你说明实际仓库结构（是纯仓库根，还是 repo 内还需要再进子目录）以便我们设计接口。

> `#300`/`#303` 为 root cause 已定位的 fix-now，回复见各自 verdict（#300 已附中文 root-cause 说明；#303 修复后回执）。

### 真待办（enhancement）

| # | 一句话现状 | 建议 |
|---|-----------|------|
| **#292** | workflow 表述不清导致 agent 跳过 jsonl 填充：5 个缺陷里只有 #1（Phase Index `1.3 [conditional]` vs 正文 `[required]` 矛盾）在 `91970b68` 修了，**且仅在 main、未发布**；#2–#5（"seed-only manifests tolerated"、brainstorm Quality Bar 不检查 jsonl、"curated" 定义模糊、缺 brainstorm→1.3 gate）仍在。**GA 还把 jsonl 从 ✅必选降成 recommended**，反而加剧问题。 | **reply-and-keep** — 确认 #1 已修(待发)、#2–#5 仍有效；保留追踪 jsonl 质量墙，与 **#320**(brainstorm 改动) 协调。 |
| **#326** | 缺少 per-task 步骤级进度文件，`/continue` 仍靠 task.json 粗粒度 status + 产物存在性恢复，无法省 token 快速续接。项目自己已在 **v0.6.0-rc.0 冻结时明确推迟到 v0.7+**（`manifests/0.6.0-rc.0.json:6`、`v0.6.0.mdx:45`）。 | **reply-and-keep** — 打 `v0.7-candidate` 标签，说明是有意推迟非遗忘。 |
| **#339** | 任务目录/task.json 不记录关联 Agent 会话 ID。现有 session↔task 绑定方向相反且短暂（`.trellis/.runtime/sessions/`，被 gitignore 不持久化）。最接近的能力是 `trellis mem`（扫历史 transcript 重建上下文）。 | **reply-and-keep** — 指向 `trellis mem` 作为 workaround，追问是否需要把会话 ID 持久化进 task.json/meta。 |
| **#341** | monorepo 子代理用绝对路径 `cd /Users/.../frontend && …`，每次触发 Claude 权限弹窗。`config.yaml` 里 package 路径本就是相对的，但模板无引导子代理用相对路径。`settings.json` 也无 permissions.allow 抑制。 | **reply-and-keep** — 确认有效、归入 v0.7+；方向是引导子代理在 workspace 内用相对路径 cd。 |
| **#193** | `.trellis` 生成物（spec/task/PRD）的中文 i18n 输出。当前 0.6.2 **无任何输出语言开关**（无 `--lang`、无配置项、prompt 模板无"用用户语言写 spec"指令）。maintainer 2026-04-26 已答"在 roadmap 中"，但未发布。需求强、12 评论持续到 6-16。 | **reply-and-keep** — workaround：AGENTS.md 加强制中文指令（@HusuSama 方案）；设计方向是拆「给 AI 的英文 spec」与「给人的中文知识层」（@xiaoqiangfeifeifei）。 |

`#193` Draft 回复：
> 这个需求仍在 roadmap 中、尚未实现：当前 0.6.2 代码里没有任何输出语言开关（无 --lang 标志、无配置项、prompt 模板里也没有"用用户语言写 spec/task"的指令）。短期可在 AGENTS.md 里加一句强制中文输出的指令（见上方 @HusuSama 的方案）作为 workaround。我们计划区分"给 AI 看的英文 spec"与"给人看的中文业务知识层"，落地后会在此同步。

`#292` Draft 回复：
> 感谢细致的分析。第 1 点（Phase Index 1.3 标 `[conditional]` 与正文 `[required]` 矛盾）已在 commit 91970b68 修复（统一为 `[required · once]`，并补充"仅 sub-agent 派发平台"标注），下个版本随发布带出（v0.6.0–0.6.2 仍是旧表述）。其余 4 点仍然成立：1.4 的"seed-only manifests are tolerated"、brainstorm Quality Bar 不检查 jsonl、"curated" 定义模糊、以及缺少 brainstorm→1.3 的显式 gate——且 GA 把完成清单里的 jsonl 从必选降成了 recommended，确实削弱了强制性。这个 issue 我们保留，作为加强 jsonl 质量墙的跟踪项继续推进（会与 #320 的 brainstorm 改动一起协调）。

`#326` Draft 回复：
> 这个需求我们记下了，但还没实现：目前任务状态只有 task.json 里粗粒度的 status（planning/in_progress/...），/continue 仍靠 status + 产物存在性来恢复，没有你说的步骤级进度文件。0.6.0 进入 rc.0 冻结特性面时，这个 issue（连同 #193/#318/#320/#325）已被明确推迟到 v0.7+（见 v0.6.0 changelog）。会保留并在 v0.7 规划里评估。

`#339` Draft 回复：
> 目前 task.json 不记录关联的 Agent 会话 ID：session↔task 绑定只存在于 .trellis/.runtime/sessions/（方向相反、且被 gitignore，不随任务持久化）。可以先用 `trellis mem` 按任务从历史会话里重建上下文（它会扫描 task.py create/start 边界）作为替代方案。请问 `trellis mem` 能否满足需求，还是你希望把会话 ID 持久化进 task.json（或 meta 字段）？

`#341` Draft 回复：
> 已确认：这是 monorepo 下子代理用绝对路径 `cd` 触发 Claude 权限弹窗的真实问题，0.6.2 仍未处理（config.yaml 里 package 路径本就是相对的 `frontend`，但模板没引导子代理用相对路径执行）。我们会把它纳入后续版本（v0.7+）一并优化，方向是让子代理在 workspace 内用相对路径 cd，避免每次跨绝对路径触发拦截。

---

## 🟣 平台支持请求（归一类）

`AI_TOOLS` 注册表 (`packages/cli/src/types/ai-tools.ts`) 当前 **16 个平台**：claude-code, cursor, opencode, codex, kilo, kiro, gemini, antigravity, windsurf, qoder, codebuddy, copilot, droid, pi, reasonix, zcode。0.6.x 期间新增的只有 ZCode (`4905ecd3`) 和 Reasonix (`1d50a01b`, #301)。

| # | 平台 | 在 registry? | 值得做? | 建议 |
|---|------|:---:|---------|------|
| **#313** | **Trae** | ❌（曾在 `4714661f` 原型，`a6b758ae` 移除） | ⚠️ **重评估** | **reply-and-keep** — 原 drop 理由（无确定性触发入口）已失效：评论指出 Trae 现已有 slash command（@iamKyun）+ hooks（@CumquatLin, 6-17）。需 maintainer 决定是否重新接入。近似于已关闭的 #175。 |
| **#318** | **Qwen Code CLI** | ❌ | ✅ 值得 | **reply-and-keep（roadmap）** — 可自定义 API base URL（跑本地模型），与已支持的 Qoder **不重复**。按 reasonix/zcode 的 configurator+template 模式接入。已在 0.6.0 推迟批次内。 |
| **#325** | **Devin**（Windsurf 改名） | ❌（仅有 `windsurf`，`ai-tools.ts:274-290`） | ✅ 值得，需决策 | **reply-and-keep（需决策）** — 新增独立 `devin` 平台（configDir `.devin`） vs 把现有 windsurf 改名/别名并迁移 `.windsurf`→`.devin`。定方案后排版本。 |
| **#334** | **Hermes** | ❌ | ❓ 信息不足 | **reply-and-keep（NEEDS-INFO）** — 先追问 Hermes 的 configDir、命令/skill 调用方式、是否支持 hooks/agents，再评估。 |
| **#343** | **Pi mem 适配器** | ✅ Pi 已是平台 (`ai-tools.ts:361`)，但 mem 只支持 claude/codex/opencode | ✅ 值得，coherent | **reply-and-keep（good-first-issue）** — mem 仅 3 个 adapter (`MemSourceKind`, `types.ts:10`)，`--platform pi` 会 `die("unknown platform: pi")`。照 claude/codex/opencode adapter 模式加 `adapters/pi.ts` + `sessions.ts` switch + `VALID_PLATFORMS` 白名单 + `internal/paths.ts` 路径常量。 |

Draft 回复：

**#313 (Trae)**：
> Trae 之前被移除是因为当时没有 slash command / hook，缺少确定性的触发入口（见 #175 与 spec 记录）。现在你们提到 Trae 已经支持 slash command 和 hook，这确实改变了当初的判断，我们会重新评估接入。目前最新代码（0.6.2）的 AI_TOOLS 注册表里还没有 Trae，所以暂时无法通过 trae 终端调用 trellis，这个 issue 先保留作为待评估的平台接入需求。

**#318 (Qwen Code)**：
> 目前 Qwen Code 还未支持——registry（packages/cli/src/types/ai-tools.ts）里没有对应条目，0.6.x 期间新增的是 ZCode 和 Reasonix。已记入待办，会按 reasonix/zcode 的 configurator + template 模式接入；Qwen Code 可自定义 API 地址这点确实和已支持的 Qoder 不重复，谢谢反馈。

**#325 (Devin)**：
> 感谢反馈。目前 Trellis 还没有 Devin 平台支持，注册表里只有 windsurf 配置（.windsurf/workflows + .windsurf/skills，见 packages/cli/src/types/ai-tools.ts），0.6.x 也未做改名。想确认下你期望的方式：是新增一个独立的 `devin` 平台（配置目录 .devin），还是把现有 windsurf 直接改名/做别名（并把已安装的 .windsurf 迁移到 .devin）？确定后我们排进后续版本。

**#334 (Hermes)**：
> 感谢建议。目前 Trellis 0.6.2 尚未支持 Hermes（注册表 src/types/ai-tools.ts 中暂无该平台），我们会评估纳入待办。能否补充一下 Hermes 的配置目录、命令/skill 调用方式以及是否支持 hooks/agents？这些信息能帮助我们更快接入。

**#343 (Pi mem)**：
> Pi 本身已是 Trellis 支持的平台，但 `trellis mem` 目前只覆盖 claude/codex/opencode 三个 adapter，所以 `--platform pi` 会报 unknown platform。这是一个合理的待办，我们会按现有 adapter 模式补一个 Pi 适配器（adapters/pi.ts + sessions.ts 分支 + 平台白名单 + 路径常量）。欢迎社区贡献，属于 good-first-issue。

---

## ⚪ 需更多信息 / 可能 stale / 非缺陷

| # | 为什么 | 建议 |
|---|--------|------|
| **#275** | OpenCode agent 文件被指含 Claude 格式 —— **NOT-A-DEFECT**。源码/dist 在所有 0.6 版本里 `trellis-check.md` frontmatter 一直是 OpenCode 规范（`mode: subagent` + `permission` 块），配置器 `opencode.ts` 走专用 `templates/opencode/` 目录、无 Claude 来源路径。实测 0.6.2 `update --force` 甚至能把故意改坏的 Claude 式文件**还原**回 OpenCode 格式，无法复现。怀疑是旧安装，或告警其实针对 `mcp__exa__*` 通配键（#302 已确认 OpenCode 故意保留）。 | **reply-and-keep (NEEDS-INFO)** — 要 OpenCode 完整告警文字 + `trellis -v`，升级后重试；确认即关。 |
| **#311** | Cursor `hooks.json` 不执行 —— **NEEDS-INFO**。maintainer 2026-06-07 已 code-backed 回复并保留。**关键日期逻辑**：UTF-8 fix (`faac813e`) 与 sessionStart schema 对齐 (`33d2f855`) 都在 **v0.5.15** 发布，而 reporter 报告时已在 **0.5.19**，所以这两修复不解释其现象；`beforeSubmitPrompt` 在 Cursor 上是**刻意不注册**（schema 只接受 `{continue,user_message}`，无注入字段）。剩余原因为 by-design 混淆 / Cursor 3.5.33 运行时本身 gap / 环境特定。已 11 天无回复。 | **reply-and-keep（stale-leaning）** — 要 Cursor `renderer.log` 中 hooks.json 行 + 版本复核；两周无回复按 **STALE 关闭**。 |
| **#336** | OpenCode 子代理派发失败 —— **NOT-A-DEFECT**。截图真实报错是 `NOT NULL constraint failed: session_message.seq`，属 OpenCode 自身 SQLite 会话库 (`~/.local/share/opencode/opencode.db`) 内部错误。Trellis 零代码写 opencode.db 或 `seq`（`grep session_message` 无命中）；OpenCode 注入插件只 in-place 改 task 工具 prompt 且包了 try/catch，不可能产生 DB 约束错误。**非** #302、**非** 已发布的 #264。 | **reply-and-keep (NEEDS-INFO)** — 说明是 OpenCode 内部 SQLite bug，建议升级/重装 OpenCode 或清损坏 db、向上游反馈；确认后按 NOT-A-DEFECT 关闭。 |

Draft 回复：

**#275**：
> 这三个 opencode agent 文件的模板在所有 0.6 版本里 frontmatter 一直是 OpenCode 规范（mode: subagent + permission: 块），不是 Claude 模板。我在当前 0.6.2 上实测 `trellis update` 覆盖，写出来的就是正确的 OpenCode 格式，无法复现。请升级到最新版重试；如仍有告警，麻烦贴一下 OpenCode 的完整告警文字和 `trellis -v`，方便我们定位（怀疑告警是针对 permission 里的 mcp__exa__* 通配键，而非模板被换成了 Claude 版）。

**#311**：
> 补充一下：你报告时用的 0.5.19 已经包含了 UTF-8（v0.5.15, faac813e）和 Cursor sessionStart schema 对齐（v0.5.15, 33d2f855）这两个修复，所以这两点不是你看到的现象的原因；而 `beforeSubmitPrompt` 在 Cursor 上是刻意不注册的（Cursor 的该事件 schema 只接受 {continue, user_message}，没有可写入上下文的字段，见 platform-integration.md），per-turn 提醒在 Cursor 上只能走 sessionStart。请升级到最新版（npm i -g @mindfoldhq/trellis@latest && trellis update）后在全新 Cursor 会话里重试，并把 Cursor renderer.log 中提及 hooks.json 或 hook 执行的日志行贴上来——若 sessionStart 仍完全不触发，那更可能是 Cursor 3.5.33 运行时本身的问题。两周无回复我们会先按 stale 关闭，你随时可以带日志重开。

**#336**：
> 截图里的真实报错是 `NOT NULL constraint failed: session_message.seq`，这是 OpenCode 自身 SQLite 会话库（~/.local/share/opencode/opencode.db）在写入子会话消息时的内部错误，不是 Trellis 的问题——Trellis 只注入 task 工具的 prompt，从不写 OpenCode 的数据库或 seq 字段。建议先升级/重装 OpenCode（或清掉损坏的 opencode.db 后重试），如仍复现请向 OpenCode 上游反馈；麻烦你确认后我们再关掉这个 issue。

---

## 一句话总结 + 推荐处理顺序

**总结**：18 个 issue 中，2 个根因已修待关闭（#278/#310）、3 个真 bug（#300/#303/#287，其中 2 个可立即修）、5 个真待办、5 个平台请求、3 个需信息/非缺陷。最高杠杆是先清掉「已修没关」+ 修两个有现成修复模板的 Windows/并行 bug。

**推荐先做的 5 件事（按优先级）**：
1. **#303 fix-now** — 镜像 archive 修复，给 `safe_trellis_paths_to_add` 加任务作用域 + scope-creep 集成测试。数据安全类（会污染他人 commit），有现成参照模式，性价比最高。
2. **#300 fix-now** — 修 `claudeProjectDirFromCwd` 正则（补 `\` 和 `:`）+ `--cwd` 全局回退 + Windows 单测。改动小、影响明确。
3. **#278 + #310 关闭** — 两条根因已发布，直接贴 close 回复（#310 先要 reporter 确认 dispatch_mode/hooks）。零成本清理 backlog。
4. **#275 + #336 + #311 追问/收尾** — 三条非缺陷/需信息，发追问回复并设两周 stale 关闭窗口。
5. **平台请求批处理（#343/#318/#313/#325/#334）** — #343 标 good-first-issue；#313 标记「重评估」（Trae 现已有 slash+hooks）；#325 追问 alias-vs-new；#318 进 v0.7 backlog；#334 要 Hermes 配置信息。
