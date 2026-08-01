---
type: "Design"
title: "Minimal Codex-native Skill and Hook adapter"
---

# Minimal Codex-native Skill and Hook adapter

本设计实现 [PRD](prd.md) 中的可观察结果，并采用
[Selected synthesis](research/synthesis.md) 选定的 `.agents/skills` + project
`.codex/hooks.json` 边界。具体平台约束来自
[Native platform specifications](research/native-platform-specs.md)，现有 installer、runtime 与
其他 Harness 的所有权边界来自
[Internal harness contracts](research/internal-harness-contracts.md)。本轮只增加两个有确定收益的
Codex 事件：`SessionStart` 和 `PreToolUse(apply_patch)`；不引入 activity observer、native task
progress 或新的 workflow state。

## 设计边界与所有权

| 组件 | Canonical source | 安装位置 | 所有权 |
|---|---|---|---|
| 共享 Skills | `templates/common/skills/**/SKILL.md` | `.agents/skills/**/SKILL.md` | 仍由 core managed resources 部署；Codex 不再拥有第二份 Skill 内容 |
| Codex Hook 配置 | `templates/codex/hooks.json` | `.codex/hooks.json` | omp-flow exact-file ownership；不解析或合并 foreign JSON |
| Session adapter | `templates/codex/hooks/session-start.py` | `.codex/hooks/session-start.py` | Codex managed resource；只读 payload/runtime orientation |
| Runtime patch guard | `templates/codex/hooks/protect-runtime.py` | `.codex/hooks/protect-runtime.py` | Codex managed resource；只检查 `apply_patch` 的机械路径 |
| Runtime kernel | `templates/.omp-flow/scripts/**` | `.omp-flow/scripts/**` | Python 继续拥有 session/path/operation mechanics；Hook 不复制这些校验 |

`src/cli/init.ts` 只负责把三个 Codex Hook resources 加入 `CODEX_RESOURCES`，并停止把通用 Skills
复制到 `.codex/skills`。`src/cli/update.ts` 继续使用现有 whole-file hash、backup 与冲突流程，不增加
JSON merger、Hook registry 或专用 state store。README 与 Wiki 只说明能力、trust 和降级路径，不成为
可执行配置来源。

## `.agents/skills` 迁移

新安装与更新后的唯一 Codex project Skill discovery root 是 `.agents/skills`。它继续由
`UNIVERSAL_AGENT_SKILL_RESOURCES` 与 `FLOW_STATUS_AGENT_RESOURCE` 从 `templates/common/skills`
部署；Claude 与 Oh My Pi 的 Harness-native Skill copies 不变。

现有 `.codex/skills/<name>/SKILL.md`（包括 `flow-status`）全部转入 obsolete-managed paths：

- stored hash 与磁盘内容相同：`update` 备份后删除，清除相应 managed hash；
- 无 stored hash 或内容已修改：状态为 `changed`，默认 preserve 并显示冲突；不把它继续视为
  Codex 官方入口，也不静默删除；
- fresh init 不创建 `.codex/skills`；显式 `--force` 仍保留 CLI 已有的用户授权语义，但普通
  init/update 不借此覆盖修改内容。

测试以“fresh Codex install 的每个 omp-flow Skill 只在 `.agents/skills` 有一份可发现副本”为
准，不要求清理已变成空目录的 `.codex/skills`。

## Exact-owned `.codex/hooks.json`

canonical JSON 只有以下两个 matcher group；同一 project layer 不写 inline `[hooks]`：

```json
{
  "description": "omp-flow mechanical orientation and runtime-write guard.",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "^(startup|resume|clear|compact)$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -X utf8 \"$(git rev-parse --show-toplevel)/.codex/hooks/session-start.py\"",
            "commandWindows": "python -X utf8 -c \"import pathlib,runpy,subprocess; root=subprocess.check_output(['git','rev-parse','--show-toplevel'], text=True, encoding='utf-8').strip(); runpy.run_path(str(pathlib.Path(root)/'.codex'/'hooks'/'session-start.py'), run_name='__main__')\"",
            "timeout": 15,
            "statusMessage": "Loading omp-flow orientation",
            "additionalContextLimit": 1200
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "^apply_patch$",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -X utf8 \"$(git rev-parse --show-toplevel)/.codex/hooks/protect-runtime.py\"",
            "commandWindows": "python -X utf8 -c \"import pathlib,runpy,subprocess; root=subprocess.check_output(['git','rev-parse','--show-toplevel'], text=True, encoding='utf-8').strip(); runpy.run_path(str(pathlib.Path(root)/'.codex'/'hooks'/'protect-runtime.py'), run_name='__main__')\"",
            "timeout": 15,
            "statusMessage": "Checking omp-flow runtime paths"
          }
        ]
      }
    ]
  }
}
```

POSIX command 使用 Git root 而不是 session-relative `.codex/...`。Windows override 不依赖 POSIX
substitution 或 quoting：它以 Windows `python` 启动一个只负责 `git rev-parse --show-toplevel` 与
`runpy.run_path` 的 stdlib launcher；Git 输出按 UTF-8 解码。两个真实平台 fixture 必须验证命令
文本，而端到端 smoke test 必须从含空格、非 ASCII 的 repository 子目录启动，避免仅由字符串
快照自证正确。

`hooks.json` 从当前 obsolete list 移回 managed resources。若磁盘上是早期 omp-flow managed Hook，
且当前内容仍等于 stored hash，update 可按正常 `autoUpdate` 替换；若它被修改，则进入 `changed`
冲突。若路径从未由 omp-flow 管理：普通 init 因文件存在而 skip，update 因无 stored hash 且内容
不同而 `changed`/skip。任何一种 foreign/modified 情形都不 parse、merge、rewrite 或自动信任；
用户可使用现有显式 overwrite/create-new 操作自行校准。

Hook trust 独立于 installer ownership。Project `.codex` 未信任、`[features].hooks=false`、Hook
definition hash 尚未在 `/hooks` 审阅、或当前 surface 不执行 Hooks 时，两个 handler 都可能不运行。
installer 不写 trust store、不使用 `--dangerously-bypass-hook-trust`，也不宣称 guard 已激活。安装与
update 输出/文档须提示用户在 `/hooks` 查看 source/hash 并明确 trust；定义变更后需重新审阅。

## `SessionStart` contract

### Input and validation

脚本从 stdin 读取一个 JSON object，并只使用：

- `hook_event_name` 必须等于 `SessionStart`；
- `source` 必须是 `startup | resume | clear | compact`；
- `session_id` 与 `cwd` 必须是非空 string；
- 不读取 `transcript_path`、prompt、对话文本或 model output。

脚本从 payload `cwd` 调用 `git rev-parse --show-toplevel` 得到 resolved root，并验证 payload cwd
位于该 root 内、`.omp-flow/scripts/omp_flow.py` 存在。它只在 child-process environment 中设置
`CODEX_THREAD_ID=<session_id>`（并移除可能覆盖它的 `OMP_FLOW_CONTEXT_ID`），然后运行：

```text
<current-python> -X utf8 <root>/.omp-flow/scripts/omp_flow.py --cwd <root> status
```

它不写 Codex env file、不持久化新的映射，也不选择 Task。runtime 根据 session ID 读取自己拥有的
机械 session pointer；不存在 active Task 是有效 orientation，不是 Hook error。

### Success output

成功时 exit `0`，stdout 是单行 UTF-8 JSON：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "<!-- omp-flow-runtime-orientation:v1 -->\n<bounded runtime status>\nTask meaning lives in the linked Bundle; do not infer Task, Flow, approval, verdict, or progress from this runtime orientation."
  }
}
```

`additionalContext` 只包含现有 runtime `status` 的 path-only/mechanical 输出与固定边界提醒，不
render Bundle、不遍历 Markdown、不注入 generated context。stdout 不混入日志；诊断只写 stderr。

### Fail-soft output

JSON malformed、字段缺失、Git/root/runtime 定位失败、runtime non-zero/timeout 或输出无法按 UTF-8
读取时，脚本仍 exit `0` 并返回同一个 `SessionStart` native shape，其中 `additionalContext` 为短且
有界的：

```text
omp-flow orientation unavailable: <sanitized reason>. Use $flow-status or the explicit omp_flow.py CLI; do not infer workflow state.
```

同时可带同样的 `systemMessage` 供 UI 显示。不得使用 `continue:false`，不得输出 `STOP`，也不得让
orientation/display 故障阻止普通 Codex 工作。reason 不包含 transcript、完整 environment 或异常
traceback。

## `PreToolUse(apply_patch)` contract

### Input and path extraction

脚本从 stdin 读取 JSON object，并要求 `hook_event_name == "PreToolUse"`、
`tool_name == "apply_patch"`、非空 `cwd`、以及 object `tool_input` 中非空 string `command`。这是
Codex 当前官方 Hook wire contract；脚本只解析该 command 中 apply_patch envelope 的机械 file
directives：

- `*** Add File: <path>`；
- `*** Update File: <path>`；
- `*** Delete File: <path>`；
- update block 内可选的 `*** Move to: <path>`，同时检查 source 与 destination。

必须存在恰好一个 `*** Begin Patch`/`*** End Patch` envelope 和至少一个 file directive；空 path、
NUL、未知/破损 file directive、`Move to` 无所属 update、重复 envelope，或无法完整提取路径均为
malformed。脚本不解释 hunk 内容，也不解析 authored Markdown semantics。

使用 payload `cwd` 作为 apply_patch 相对路径基准，通过 Git 找到 resolved repository root。每个
source/destination path 必须是相对路径，经过 `resolve(strict=False)` 和 platform-normalized
containment 检查后仍位于 repository root；absolute、UNC、drive-relative、越过 root 或经既有
symlink 逃逸均视为无法验证。保护目标是 resolved `<root>/.omp-flow/.runtime` 本身及其全部后代。

### Allow and deny

所有 path 都在 repo 内且均不命中 runtime 时，脚本 stdout 为空并 exit `0`；因此普通源码、
`.omp-flow/tasks/**` Concepts、Wiki 和 canonical templates 均放行。

任一路径命中 runtime，或 payload/parser/root/containment 无法验证时，脚本 exit `0` 并只输出 Codex
当前 `PreToolUse` deny shape：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Runtime coordination is Python-owned. Use .omp-flow/scripts/omp_flow.py task/operation/flow-status commands instead of patching .omp-flow/.runtime directly."
  }
}
```

malformed/unverifiable 的 reason 改为“cannot safely verify apply_patch paths”，但仍 deny。捕获所有
预期 JSON、path、Git、I/O 与 Unicode failure，以保证“handler 已启动但无法判断”不会 fail open；
只有 Python process 未被 Codex 启动、被禁用/未 trust、host 不覆盖或被外部强制终止时无法提供该
guard，这些属于明确的 coverage limit。Python runtime 的安全路径和 identity 校验仍是最终边界。

## 数据流与状态

```text
Codex trusted project event
  -> exact-owned hooks.json matcher
  -> one stateless Python handler on stdin JSON
     -> SessionStart: runtime `status` read -> bounded additionalContext
     -> PreToolUse: patch directives + resolved paths -> empty allow | native deny
```

两个 handler 都是 stdlib-only、一次性、无共享顺序假设。它们不写 `.omp-flow/.runtime`、不写
status cache、不 renew/clear Flow lease，不产生 task/operation receipt。Codex 拥有 event dispatch、
trust、timeout 与 UI；installer 拥有 deployed-file hashes；runtime 拥有机械 session/path state；
Bundle Concepts 与 main session 继续拥有 Task/Flow/approval/verdict/work meaning。

## Failure semantics and coverage claims

| 情形 | 行为 | 产品声明 |
|---|---|---|
| Session payload/runtime/status failure | exit 0 + bounded unavailable context | Skills 与 CLI 可继续使用 |
| apply_patch payload/path/parser failure | native deny | 已启动 guard fail closed |
| runtime add/update/delete/move | native deny | supported local `apply_patch` 被保护 |
| ordinary in-repo patch | no output, exit 0 | 不干扰源码/Bundle 编辑 |
| foreign/modified hook file | preserve + visible conflict | 无自动 merge/overwrite/trust |
| project/hook untrusted, disabled, unsupported, timeout before output | Hook 未提供保证 | 明示 unavailable/coverage limit；不得声称 OS sandbox |
| hosted/specialized opt-out or non-apply_patch mutation | 本轮不观察 | Python/runtime validation 仍必须独立成立 |

## Verification strategy

### Focused unit/fixture tests

- `SessionStart`：四个 source 均以 exact `session_id` 调用 runtime；有/无 selected Task；malformed
  JSON、wrong event/source、missing cwd/session、Git/runtime/non-zero failure 均输出 bounded
  unavailable 且 exit 0；输出不含 transcript 内容。
- patch parser：runtime add/update/delete、move source、move destination、`.`/`..`、Windows separator、
  case normalization、symlink escape、absolute/UNC/drive path、empty/broken/duplicate envelope 全部
  deny；普通 source、Bundle Concept、含空格/非 ASCII path 全部 allow。
- native shapes：fixture 断言 JSON 只有受支持字段，deny 的 event/name/decision 精确，allow 无
  stdout；UTF-8 stderr 不污染 stdout。

### Installer/update/package tests

- fresh `--codex` 安装包含 `.agents/skills`、`.codex/hooks.json` 与两个 Hook scripts，不包含
  `.codex/skills/**`；Hook JSON 可 parse，只有两个 event/matcher，并同时含 `command` 与
  `commandWindows`。
- init 对 existing foreign Hook skip；update 对 no-hash foreign、modified managed Hook/scripts
  preserve/visible conflict；unmodified managed Hook idempotent/auto-update；旧 unmodified
  `.codex/skills` duplicate 删除，modified duplicate 保留。
- 旧 unmodified managed legacy `.codex/hooks.json` 可迁移到新 canonical；modified legacy Hook
  不覆盖。backup 包含所有将 overwrite/delete 的文件。
- `npm pack --dry-run` 证明 tarball 含 `templates/codex/hooks.json` 和两个 scripts，不再依赖
  Harness-specific Codex Skill template source。

### Cross-platform smoke and repository gates

在 Linux/macOS shell 与 Windows command host 各从 repo 子目录执行两个 canonical command，repo
路径同时覆盖空格和非 ASCII；捕获真实 `SessionStart` 与 `PreToolUse(apply_patch)` stdin/stdout、
exit code 和 deny/allow。CLI Hook trust/disable 用 `/hooks` 手工 smoke 记录，不把 IDE parity 作为
本轮验收。

最终运行：

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/codex/hooks templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

## Rejected alternatives

- **Inline `[hooks]` in `.codex/config.toml`**：需要解析/改写可能由用户拥有的 TOML，并与
  `hooks.json` 同层双加载；不如 exact-file conflict 明确。
- **Codex plugin**：增加 install/enable/marketplace 边界，且不会消除 Hook hash trust；本轮是
  repository-local adapter。
- **恢复 `UserPromptSubmit`/workflow-state injection**：扩大隐私与语义范围，并重新制造已移除的
  context renderer。
- **增加 `PostToolUse`、Subagent、Stop、SessionEnd 或 native task observer**：没有本轮 outcome
  所需的 complete native baseline；单个事件不能产生 root Flow、Work total 或 reviewer acceptance。
- **把 `.codex/skills` 保留为兼容副本**：当前官方 project discovery 是 `.agents/skills`；双写会
  继续制造来源歧义与 update surface。
- **merge foreign `.codex/hooks.json`**：需要拥有 JSON formatting、ordering、unknown fields 与
  并发 handler 语义；当前 whole-file hash 模型无法安全承诺 round trip。
- **Hook 作为唯一安全/授权边界**：untrusted、disabled、hosted 与 opt-out paths 可绕过；它只能是
  defense-in-depth，最终路径/identity/receipt 仍由 runtime 校验。

## Residual risks carried to QbD 1

- Codex 对 project Hook definition hash 的重新信任不等于对被引用 script 内容递归 hash；文档与
  update 输出必须要求用户在升级后检查 actual scripts 与 `/hooks` definition，不能暗示 script
  update 自动触发 re-review。
- Windows `commandWindows` 的 shell argv 传递与目标 Codex build 必须由真实 smoke capture 证明；
  fixture 通过不足以关闭该风险。若失败，允许只替换 launcher command，不扩大事件或状态设计。
- `apply_patch` 的官方 wire field 是 `tool_input.command`；目标 Codex build smoke 仍须固化实际
  payload，任何偏离该闭合 shape 的输入都必须 deny，不能以宽松猜测放行。

这些风险均有 fail-soft/deny 或不宣称 coverage 的安全降级，不阻塞独立 QbD 1 挑战；QbD 1 之后
仍需人类 linked approval，才能进入 work decomposition。

## Operation correlation

- Actor ID: `hook_architect`
- Dispatch receipt: `d3617df59d9f438bb22f8ae362c1ba62`
- Output boundary: `.omp-flow/tasks/08-01-codex-native-hooks/design.md`
- Next gate: independent QbD 1 audit over PRD, this Design, synthesis, and linked research; then a
  linked human decision.
