---
type: "Work"
title: "Implement the native Codex Skill and Hook adapter"
---

# Implement the native Codex Skill and Hook adapter

## Objective

实现 [approved Design](../design.md)：Codex Project Skills 只从 `.agents/skills` 部署；新增
exact-owned `.codex/hooks.json`、`SessionStart` orientation handler 和
`PreToolUse(apply_patch)` runtime guard，并保持 foreign/user configuration 与其他 Harness 不受损。

## In scope

- `src/cli/init.ts` 的 Codex managed/obsolete resource ownership，包括审计 A1：
  `.codex/hooks.json` 与 `.codex/hooks/session-start.py` 必须同时从 obsolete set 移入 managed
  resources；`.codex/hooks/protect-runtime.py` 新增为 managed；所有现行 omp-flow/flow-status
  `.codex/skills/**` managed duplicates 移入 obsolete，`.agents/skills` 保持 canonical deployment。
- `templates/codex/hooks.json` 与两个 stdlib-only UTF-8 Python handlers，并同步本仓库 owned deployed
  copies `.codex/hooks.json`、`.codex/hooks/*.py`。
- Focused Python fixtures 与 TypeScript installer/update/package contract tests，覆盖 PRD/Design 的
  session、patch parser、path containment、foreign/modified preserve、legacy migration、Skill 去重。
- README 与一个可发现的 Wiki architecture/knowhow Concept，明确 `/hooks` trust、definition hash
  不递归等于 script review（审计 A2）、coverage limit、降级和三平台原生表面。
- 将 npm package 准备为下一个 patch version `0.2.6`，但不执行 `npm publish`。

## Out of scope

PostToolUse/native task observer、Subagent/Stop inference、SessionEnd lease mutation、plugin、stock Codex
footer、IDE/App parity 声明、foreign JSON merge、lifecycle state 或新的 runtime schema。

## Allowed code and output boundary

Implementer 可修改：

- `src/cli/init.ts`；
- `templates/codex/**` 与对应 owned `.codex/hooks*`；
- tracked omp-flow Skill duplicates under `.codex/skills/**` only for their approved removal；
- `tests/**` 中与 init/Hook contract 直接相关的文件；
- `README.md`、`.omp-flow/wiki/**` 的相关 Concepts；
- `package.json`、`package-lock.json`；
- 本 Work 的 handoff Concept `work/codex-native-adapter-handoff.md` 与必要 Bundle links。

不得修改用户已有的无关 dirty files：`.omp-flow/.gitignore` 与
`templates/.omp-flow/scripts/common/disposition.py`，也不得删除 untracked legacy Skill directories、
cache、old tasks 或 tarballs。

## Done conditions

- Fresh Codex init 不生成 `.codex/skills` managed files，生成可解析的 exact two-event Hook config 和
  两个 byte-identical canonical/deployed handlers。
- Legacy update 不会发生“先 managed update、再 obsolete delete”；unmodified Hook/handler 最终存在，
  unmodified duplicate Skills 被清理，modified/foreign files 保留并呈现 conflict。
- SessionStart 复用 `CODEX_THREAD_ID`、移除 override，并对四种 source 输出 bounded orientation；
  failure fail-soft。
- Guard 只接受官方 `tool_input.command` closed shape；runtime add/update/delete/move 与 malformed/
  unverifiable paths deny，普通 source/Bundle patch allow；不做字符串前缀式 containment。
- POSIX 与 Windows launcher 至少在当前可用 host/shell 中从含空格和非 ASCII 的 repo 子目录 smoke；
  无法在本机执行的 surface 不获得正面声明。
- README/Wiki 明确 Hook definition trust 与 referenced script review 的区别，并说明 `/hooks`、disabled/
  untrusted fallback 与非完整 enforcement。
- `0.2.6` tarball dry-run 包含 canonical Codex Hook resources，不包含 Harness-specific Codex Skill
  template source。

## Verification

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/codex/hooks templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

另运行 focused Hook fixture 和当前可用的 POSIX/Windows command smoke，并在 handoff 中记录 exact
commands、results、未运行项和原因。

## Expected handoff

`work/codex-native-adapter-handoff.md` 必须链接本 Work，列出 changed files、行为、migration、测试、
package contents、残余风险、actor ID 和 operation receipt。
