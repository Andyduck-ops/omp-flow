---
type: "Research"
title: "Native platform specifications for a Codex Hook Adapter"
---

# Native platform specifications for a Codex Hook Adapter

本 Concept 回答 [Brainstorm 的后续研究问题](../brainstorm.md#后续研究问题)：Codex 当前原生
Hook / Skill 能力是否足以提供机械生命周期接入，最小配置边界是什么，以及哪些能力不能被当成
安全或语义权威。本轮只调研，不授权或实施 Adapter。

## 结论

截至 2026-08-01，Codex Hooks 已是默认开启的 Stable/GA 能力。官方公开的项目 Hook 入口是
受信任 repository 中的 `.codex/hooks.json`，或同一 config layer 的 `.codex/config.toml`
inline `[hooks]`；plugin 也能打包同一事件 schema。当前事件与载荷足以支持：session/turn/tool/
subagent correlation、pre-tool deny/rewrite、post-tool 结构化观察、compact 前后观察和 stop/end
清理。因此“Codex 缺少原生机械接入”的表述应修订为：“omp-flow 尚未接入 Codex 已提供的
原生机械入口”。

但证据也否定把 Hook 设计成完整安全边界或语义工作流引擎：hosted tool 不经过
`PreToolUse`/`PostToolUse`，特殊 tool path 可以绕开默认路径，`SubagentStart` 不能阻止启动，
`PostToolUse` 不能撤销副作用，非受管 Hook 未获 hash trust 时会直接跳过。正确方向仍是：
Hook 只做可验证的机械桥接和窄 guard；Python/runtime 继续独立验证 identity/path/receipt；
观察与展示 fail-soft；Task/Flow/approval/verdict 仍由 Bundle 与主会话拥有。

另一个需要显式修订的事实是：Codex 当前官方 project Skill 位置是沿 CWD 到 repo root 扫描的
`.agents/skills/<name>/SKILL.md`，不是 `.codex/skills/`。本仓库已经始终部署 `.agents/skills`
这一正确入口，但还额外部署并测试 `.codex/skills`；后者不应继续被描述为 Codex 当前官方
project-native Skill 根。

## 已确认事实

### 1. Codex Skill 的当前原生位置与语义

- 官方 Build skills 说明 Codex 从 repository、user、admin、system 四类位置读取 Skill；repo
  会从 CWD 向 repo root 扫描每层 `.agents/skills`，user 为 `$HOME/.agents/skills`，admin 为
  `/etc/codex/skills`。Skill 目录需要 `SKILL.md`，`name` 和 `description` 是必需 frontmatter；
  Skill 可以由模型隐式选择，也可由用户显式 `$name`/`/skills` 调用。来源：
  [Build skills — Where Codex loads local skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)，
  官方 Codex Manual（抓取 2026-08-01）lines 19034-19076、19113-19131。
- 官方将 direct skill folder 定位为 local/repo-scoped authoring；需要跨 repository 分发、多 Skill
  打包或与 connector 一起交付时才建议 plugin。来源：
  [Build skills — Distribute skills with plugins](https://learn.chatgpt.com/docs/build-skills#distribute-skills-with-plugins)，
  Manual lines 19133-19146。
- Skill 是模型可发现/可调用的 workflow 内容，不是“每次必执行”的机械 enforcement。Codex
  自身的 customization 指南把 Hook 定义为 lifecycle enforcement，把 Skill 定义为 reusable
  workflow。这支持保留 `$flow-status` 作为按需只读降级面，而不让 Skill 代替 observer/guard。
  来源：[Customization overview](https://learn.chatgpt.com/docs/customization/overview)，Manual
  lines 20176-20217。

Repository evidence：

- installer 已把所有通用 Skill 写到 `.agents/skills`：`src/cli/init.ts:140-149`。
- Codex-specific resource 又重复写到 `.codex/skills`：`src/cli/init.ts:170-189`；README 也把它
  表述成 Codex Skill 根：`README.md:188-197`。这与当前官方本地 Skill 文档不一致。
- 当前 `$flow-status` Skill 只调用受支持的 read-only `status inspect`，并明确禁止从缓存驱动
  task/operation/approval 或声称 persistent footer：
  `templates/common/skills/flow-status/SKILL.md:8-29`。这个降级边界是成立的。

### 2. Codex Hook 的配置、trust 与合并语义

- Hooks 当前为 GA，并在 feature table 中标为 Stable、默认开启。来源：
  [Hooks](https://learn.chatgpt.com/docs/hooks) 与
  [Configuration basics — Feature flags](https://learn.chatgpt.com/docs/config-file/basic#feature-flags)，
  Manual lines 533-539、10965-10978。
- Codex 从 active config layer 旁读取 `hooks.json` 或 inline `[hooks]`；项目常用位置是
  `.codex/hooks.json` / `.codex/config.toml`。Project `.codex/` layer 只有 repository 被信任后
  才加载；untrusted project 会忽略 project config、hooks 和 rules。来源：
  [Advanced configuration — Project config files and Hooks](https://learn.chatgpt.com/docs/config-file/config-advanced#hooks)，
  Manual lines 9791-9797、9810-9842。
- 同一 layer 同时存在 `hooks.json` 与 inline `[hooks]` 时，两者都会加载并产生 warning；官方
  建议每 layer 只用一种表示。不同文件/layer/plugin 的所有匹配 Hook 都会加载，而不是高优先
  layer 覆盖低优先 layer。多个匹配 command handler 并发启动，不能依赖相互顺序。来源：
  [Hooks — Where Codex looks for hooks](https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks)，
  Manual lines 20549-20554、20564-20590。
- 每个 non-managed command hook 必须由用户审阅并信任“当前 exact definition”；Codex 按 Hook
  hash 记录 trust，新增或变化的定义会被标为待审阅并跳过，直到在 CLI `/hooks` 中信任。
  Plugin install/enable 也不会自动信任 bundled hooks。Managed hooks 由 policy 信任且不能由
  user hook browser 禁用。`--dangerously-bypass-hook-trust` 只适用于外部已完成审阅的一次性
  automation，不应成为正常安装路径。来源：
  [Hooks — Review and trust hooks](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks) 与
  [Plugin-bundled hooks](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)，Manual
  lines 20596-20612、20820-20853。

这些事实意味着升级后 hash 改变必须成为显式 UX：Adapter 不得宣称安装后已自动生效；未
trust 时应显示 `unavailable`/降级到 Skill，而不能伪造 observer 或 protection 已激活。

### 3. Codex 可用事件、结构化 correlation 与控制能力

官方 release-behavior reference 当前列出：

| Event | 对 omp-flow 有用的结构化字段/控制 | 结论 |
|---|---|---|
| `SessionStart` | common `session_id`, `cwd`, `hook_event_name`, `model`；`source` 为 `startup`, `resume`, `clear`, `compact`；可返回 `additionalContext` | 可桥接 host session，并在 compact 后重新给 path-only orientation；不得注入推断出的 Task/Flow 语义 |
| `PreToolUse` | `turn_id`, `tool_name`, `tool_use_id`, `tool_input`；可 deny 或 rewrite `updatedInput` | 可做 runtime path/dispatch 的窄 fail-closed guard；接收端/runtime 仍须再次验证 |
| `PermissionRequest` | `turn_id`, `tool_name`, `tool_input`；可 allow/deny/不决定 | 不是当前最小 Adapter 必需；不能替代 runtime authorization |
| `PostToolUse` | 与 Pre 相同的 correlation，加 `tool_response`；失败 Bash 也会触发 | 可观察成功/失败结构化结果；副作用已经发生，不能作为 rollback/security boundary |
| `PreCompact` / `PostCompact` | `turn_id`, `trigger: manual|auto` | 可清理/标记机械状态；`SessionStart(source=compact)` 才是下一次 model request 前的 context 重注入点 |
| `SubagentStart` | parent `session_id`，以及 `turn_id`, `agent_id`, `agent_type`；可加 subagent context | 足以 correlation，但不能 block；actor/receipt 仍必须来自 strict assignment，不能从 `agent_type` 推断 |
| `SubagentStop` | 同上，加 `agent_transcript_path`, `stop_hook_active`, `last_assistant_message`；可要求继续 | 可做 activity/attention 观察；不得把 stop 当 reviewer acceptance 或 operation finish |
| `Stop` | `turn_id`, `stop_hook_active`, `last_assistant_message`；可要求 main turn 继续 | 不得从自然语言完成消息推断 gate/verdict |
| `SessionEnd` | main thread 的 `session_id`, `reason`（当前只有 `other`）；advisory、默认 1 秒且最多 3 秒；subagent 不触发 | 只适合 best-effort cleanup/clear；lease expiry 必须覆盖未触发、timeout 与异常退出 |
| `UserPromptSubmit` | `turn_id`, `prompt`，matcher 当前被忽略 | 不需要读取用户 prompt；会扩大语义/隐私范围，应排除 |

事件清单、matcher 值与 common input：
[Hooks — Matcher patterns](https://learn.chatgpt.com/docs/hooks#matcher-patterns)、
[Common input fields](https://learn.chatgpt.com/docs/hooks#common-input-fields)，Manual
lines 20855-20877、20911-20936。具体载荷与控制：Manual lines 21012-21469。

Tool coverage 的关键限制：shell/unified exec 以 `Bash` 匹配，`apply_patch` 可用
`apply_patch|Edit|Write` alias，MCP 和多数 local function tool 可观察，`spawn_agent` 也匹配
`Agent`；hosted tools（例如 `WebSearch`）不经过这条路径，并且特殊 tool path 可以 opt out。
官方因此明确要求把 tool hooks 视为 guardrail 而不是 complete enforcement boundary。
来源：[Hooks — Tool coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage)，Manual
lines 20889-20909。

### 4. Command handler 与跨平台约束

- 当前只有 `type: "command"` 真正执行；`prompt` / `agent` 会 parse 但 skip，`async` 也尚未
  支持。Command 以 session `cwd` 为工作目录。Repo-local script 不应假设从 repo root 启动，
  官方建议从 Git root 解析路径。来源：[Hooks — Config shape](https://learn.chatgpt.com/docs/hooks#config-shape)，
  Manual lines 20712-20732。
- JSON handler 可提供 POSIX `command` 和 Windows-only `commandWindows`；inline TOML 同时接受
  `command_windows` 或 `commandWindows`。因此不能把 Claude 的 `$CLAUDE_PROJECT_DIR` 命令
  文本复制到 Codex，也不能让 Windows 复用依赖 POSIX quoting/`python3` 的命令。最小设计必须
  为 POSIX 与 Windows 分别定义 argv/quoting，并在真实 CLI/IDE host 上验证含空格、非 ASCII
  repo path 与从子目录启动。
- Codex plugin hook 额外获得 `PLUGIN_ROOT` / `PLUGIN_DATA`，也设置兼容的
  `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA`。Project-local Hook 没有对应 repo-root placeholder；
  这是 plugin 相对 project file 唯一明显的路径优势，但不足以抵消额外 install/enable/trust
  边界。来源：[Hooks — Plugin-bundled hooks](https://learn.chatgpt.com/docs/hooks#plugin-bundled-hooks)，
  Manual lines 20820-20853。

### 5. 与 Claude Code 和 Oh My Pi 的对等基线

这两部分只用于验证“能力对等而非复制目录”，不继续横向扩展。

**Claude Code。** 当前官方 Hooks reference 使用 `.claude/settings.json` /
`.claude/settings.local.json`，不存在 standalone `.claude/hooks.json`；其事件比 Codex 更多，
并支持 command/http/MCP/prompt/agent handler。项目 hooks 与 skill 的 tool pre-approval 受 workspace
trust 约束；`/hooks` 是 read-only browser。Claude 的 common input 已有 `session_id`、
`prompt_id`、`agent_id`、`agent_type`，但 transcript 是异步落盘并可能滞后。来源：
[Claude Code Hooks reference](https://code.claude.com/docs/en/hooks#configuration)（抓取
2026-08-01，lines 307-332、651-718）、
[Claude Code Skills](https://code.claude.com/docs/en/slash-commands)（lines 450-460）。本仓库
Claude 模板确实在 `settings.json` 中绑定 SessionStart/Pre/Post/Subagent 事件：
`templates/claude/settings.json:5-213`。所以 Codex Adapter 应重用跨平台 runtime contract，不能
复制 Claude event names、tool names、environment variables 或 trust UX。

**Oh My Pi。** ignored clone cache 已存在于 `.omp-flow/cache/repos/oh-my-pi`，remote 为
`https://github.com/can1357/oh-my-pi.git`。本研究 fetch 的 upstream `main` revision 是
[`80627462b4e91f46795ba87f3678174bd3c0b907`](https://github.com/can1357/oh-my-pi/commit/80627462b4e91f46795ba87f3678174bd3c0b907)
（commit date 2026-07-31）；本项目有意 pin 17.2.1 revision
[`7a2ced50bea8b97dbab7d9bd579329c4ea704de0`](https://github.com/can1357/oh-my-pi/commit/7a2ced50bea8b97dbab7d9bd579329c4ea704de0)，
见 `src/omp/flow-status.ts:6-8,562-613`。

Upstream exact-revision anchors 显示 OMP extension 是 package manifest/module 入口，公开
`pi.on`, `registerCommand`, UI `setStatus` 等 API；event surface 包含 session、context、agent、
pre-exec `tool_call`、post-exec `tool_result` 与 tool execution observability；`tool_call` error
fail-closed，而无 UI 的 headless/subagent path 会 no-op：
[extensions.md lines 17-65](https://github.com/can1357/oh-my-pi/blob/80627462b4e91f46795ba87f3678174bd3c0b907/docs/extensions.md#L17-L65)、
[lines 222-259](https://github.com/can1357/oh-my-pi/blob/80627462b4e91f46795ba87f3678174bd3c0b907/docs/extensions.md#L222-L259)、
[lines 367-414](https://github.com/can1357/oh-my-pi/blob/80627462b4e91f46795ba87f3678174bd3c0b907/docs/extensions.md#L367-L414)、
[lines 468-484](https://github.com/can1357/oh-my-pi/blob/80627462b4e91f46795ba87f3678174bd3c0b907/docs/extensions.md#L468-L484)。
本仓库 extension 也直接注册这些原生事件：`src/omp/extension-entry.ts:26-46`；Flow Status
对 exact host version/capability fail-closed：`src/omp/flow-status.ts:562-613`。这确认 OMP 的
package extension 是原生等价面，不需要增加同名 hooks directory。

建议主会话如需要长期复用 upstream 细节，再创建一个 task-local
`reference/oh-my-pi-extension-api.md` Reference Concept，记录上述 remote、两个 revision、anchors
及“17.2.1 是本地 compatibility pin，8062746 是本次 current-main evidence”的区别；不要创建
paired metadata 或复制文档层。本输出已经记录本次决策需要的 provenance，因此 Reference 不阻塞
本轮收束。

## 解释、反证与 anchor 实践检验

### 确认

- 第一性锚定的核心成立：目标应是平台能力对等，不是复制 Claude Hook 文件结构。
- Codex 的事件和 correlation 字段已足够做机械 adapter；无需解析 Markdown、transcript 或
  agent prose，也无需新增 lifecycle database。
- 现有“语义主会话发布、native activity 独立、缓存不是 control authority”的 Wiki 边界继续
  成立：`.omp-flow/wiki/architecture/harness-flow-statusline.md:35-61,90-103`。

### 修订

- “Codex 缺少自动、结构化、可审查的机械入口”不再是平台事实；缺的是 omp-flow adapter。
- Codex project-native Skill 根应以 `.agents/skills` 为准。`.codex/skills` 当前是仓库历史实现
  （最早见 commit `cbc83a09426e05ca3a33894fa5b37847ecc19ab6`），不是当前官方文档支持的
  project Skill 根；后续应由 Brainstorm/Design 判断是移除兼容复制还是保留并明确非官方性质。

### 最强 counter-evidence

1. **Hook 不完整。** Hosted/specialized tool path 不保证触发，所以 Hook 无权成为 sole
   authorization boundary。
2. **Hook 不保证启动。** Repository trust 与 hook-definition hash trust 任一缺失都会跳过；
   upgrade 修改 hash 会重新进入 review。
3. **并发而非顺序。** 多个 matching handler 并发，不能设计“identity hook 先跑、observer 后跑”
   的隐式 pipeline；有先后依赖的机械检查必须聚合为单个 handler 或由 runtime transaction
   保证。
4. **部分事件只能观察。** `SubagentStart` 不能阻止，`PostToolUse` 不能撤销，`SessionEnd` advisory
   且时间预算极短。
5. **Surface coverage 未被文档完全证明。** 当前官方页面明确给出 CLI `/hooks` trust browser；本轮
   未找到同等明确的 IDE lifecycle-hook 行为承诺。不能仅凭 shared project config 推断 CLI/IDE
   完全等价，必须以真实 capture 测试关闭这个 unknown。

这些反证没有推翻 task 的必要性，但把 principal contradiction 收窄为：“在可缺席、非全覆盖、
需人审阅的 Codex Hook 机制上，怎样提供可降级的机械观察和 defense-in-depth，而不夸大
authority”。这是对 Brainstorm 的实质修订，主会话应先把该修订带回 Brainstorm，再进入 Design。

## 候选决策与无实现建议

推荐候选方向（尚不授权实现）：

1. **Project Skill 以 `.agents/skills` 为唯一官方依据。** 保留现有 `$flow-status` read-only fallback；
   不新增对 `.codex/skills` 的依赖。现有重复部署单独作为 migration/compatibility 决策。
2. **最小 Hook 表示选择 `.codex/hooks.json`。** 理由是它把 machine-managed lifecycle config 与
   用户/项目 `config.toml` 设置分离，且官方明确支持；不要在同一 layer 同时添加 inline
   `[hooks]`，避免双加载 warning。若目标路径已有 foreign hooks，Design 必须定义 preserve/merge/
   ownership/fail-closed 策略，绝不能整文件覆盖。
3. **暂不选择 plugin。** Plugin 更适合跨 repository marketplace 分发或将 Skill/MCP/assets 一起
   打包；它仍需 enable 与独立 hook hash trust，并不会减少最小 adapter 的 trust UX。只有产品
   决策改为“独立安装、跨 repo 复用”时再重开该选项。
4. **只选最小事件集。** `SessionStart`（session + compact reorientation）、`PreToolUse`
   （runtime/dispatch defense-in-depth）、`PostToolUse`（结构化 native activity）、
   `SubagentStart/Stop`（agent correlation）、`SessionEnd`（best-effort clear）。不要用
   `UserPromptSubmit` 或 transcript 推断语义。是否需要 `Pre/PostCompact`、`Stop`、
   `PermissionRequest` 留给 Design 以具体 contract 证明，默认不加。
5. **严格区分失败语义。** Runtime path/receipt/assignment identity 的 host pre-check 可 deny，但
   authoritative validator 仍在 Python/runtime；observer/status/cleanup 永远 fail-soft；Hook unavailable
   必须显式显示并退回 `$flow-status`，而不是阻断普通 Codex 使用或声称保护有效。
6. **命令按平台显式配置。** POSIX `command` 与 Windows `commandWindows`/`command_windows`
   分开，均以 Git root/absolute script path 解析；Linux/Windows、space/non-ASCII path、repo
   subdirectory start、CLI/IDE 均须真实验证。

本轮不修改 `templates/codex/`、`src/`、tests、runtime/session records 或人类风险排序。

## 未解决问题与下一步验证义务

- Codex CLI 与 IDE 对所有候选事件、trust prompt、stdout/stderr、timeout 和 command shell 的实际
  parity；官方资料不足以直接关闭。
- Native collaboration 在真实 capture 中的 canonical `tool_name`、`agent_type`、`tool_input`、
  `tool_response` 形状，尤其 batch subagent、interrupt/cancel、failure 与 resume/compact。
- Project update 改变 script 内容但不改变 hook command definition 时，hash trust 是否重审。官方
  明确绑定“hook definition hash”，没有承诺递归 hash script content；Design 不得假设脚本升级会
  自动触发 re-review。
- 外部 `.codex/hooks.json` 已存在时的 ownership 与可逆 merge；不同 hook source 会并发，测试需
  包含 foreign hooks。
- `SessionEnd` 未运行、超时、process kill、IDE disconnect 时的 clear/lease 行为。
- `.codex/skills` 历史复制是否仍被某个受支持 Codex build 私下读取；当前公开文档没有证明，若
  migration 决策依赖它，必须用指定 build 的真实 discovery capture，而不是继续凭测试自证。

## Source anchors 与 handoff

Confirmed facts、interpretations、counter-evidence、unknowns 和候选决策已在上文分离。主要外部
primary sources 均为 2026-08-01 获取的官方文档；Oh My Pi 使用 exact Git revision URL。内部
证据基于 repository HEAD `2c3c2e3`，未改动产品代码。

- Output：`.omp-flow/tasks/08-01-codex-native-hooks/research/native-platform-specs.md`
- 结论：证据支持继续该 task，但要求先回 Brainstorm 修订问题表述和 Skill 根假设；随后才可 Design。
- Decision impact：选择 `.agents/skills` + project `.codex/hooks.json` 作为最小候选边界，plugin
  延后；Hook 仅 defense-in-depth/observer，不能成为完整 enforcement 或语义 authority。
- Actor ID：`hook-research-native-specs`
- Dispatch receipt：`4be27deaca8143f6a7798d5a5af36db9`
