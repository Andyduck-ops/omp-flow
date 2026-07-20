# fix: .trellis staging 范围失控类 bug（#303）

## 缘起

issue #303：`add_session.py` 的 journal commit 会把并行任务的未提交文件一起 stage。break-loop 分析（research/303-break-loop.md）发现这是一**类** bug，横跨 3 个触发器，且本 session 实地复发 3 次（community-governance 文件被反复扫进无关提交，d66405d9/81960120/3c3219cf 三次 untrack）。

## 根因（break-loop 结论）

「暂存 `.trellis/` 必须按精确路径、按当前任务作用域」是个 bug 类级契约，但只实现在两个 copy-paste Python helper 之一里（archive 修了，session 没修），且 release 脚本 + AI 手动 `git add -A` 完全绕过收口。

## 范围（本任务修 3 个 live UNSCOPED 点 + 固化）

### 修复（对症 + 堵本 session 复发主因）

- **A/B（#303 本体）**：`add_session.py::_auto_commit_workspace` 暂存范围从「全部活跃任务目录 iterdir」收窄为「当前 developer 的 journal-*.md + index.md + **仅当前任务目录**」。
  - 实现：给 `safe_trellis_paths_to_add` 加可选 `task_name` 参数（对齐 `safe_archive_paths_to_add` 签名），传入时 task 段只 append `.trellis/tasks/<task_name>`，不 iterdir；`_auto_commit_workspace` 用 `get_current_task` 解析当前任务再传入。
- **C（release.js:82，本 session 复发 2 次主因）**：`git add -A -- ':!docs-site' ':!marketplace'` 追加 `':!.trellis'` pathspec，排除整棵 .trellis/ 不被扫进 `chore: pre-release updates`。单行修，最高性价比。
- **D（AI/人手动 git add -A，1fd56ba7 那次）**：行为层禁令，写进 spec + AI 可读处。无代码面。

### 固化（spec 契约升级）

- `script-conventions.md`：修正 line ~844 对 `safe_trellis_paths_to_add` 的描述（别再背书宽范围）；升级反模式段把「unscoped task staging」标为横跨 3 触发器的 bug 类；新增「禁 `git add -A`/`git add .`/`git add .trellis/`」绝对禁令；新增 parity 不变量。
- `release-process.md`：把「pre-release 暂存必须排除 .trellis」升级为契约 + 记本 session incident note。

### 不做（单独立项）

- **共享 helper 收口**（合并 `safe_trellis_paths_to_add` + `safe_archive_paths_to_add` 为一个 scoped 生成器 + 删 `safe_archive_paths_to_add` 的 legacy `task_name is None` 宽分支 E）——结构性改进、改动面大、与紧急对症修复耦合放大风险。本任务结束时建一个 follow-up task，引用 break-loop §3 staging 地图 + §4.1 迁移清单。

## 验收

- [ ] add_session 自动提交只含「当前 developer journal/index + 当前任务目录」，并行任务脏文件不被带入
- [ ] 新增 session 版 scope-creep 集成测试（对齐 task-archive.integration.test.ts:116）：弄脏 task-b → task-a 上下文跑 add-session → 断言 HEAD 不含 /task-b/、task-b 仍 dirty
- [ ] 该测试对旧（宽范围）代码 fail、新代码 pass（真回归守护）
- [ ] release.js:82 加 ':!.trellis'；脏 .trellis/tasks 状态下 pre-release 暂存不含 .trellis
- [ ] spec：script-conventions.md（描述修正 + 禁令 + parity 不变量）、release-process.md（排除契约 + incident note）已更新
- [ ] 现有 task.py archive scope 测试 + 全套 lint/typecheck/test 不回归
- [ ] 源模板 packages/cli/src/templates/trellis/scripts/ 与本地 .trellis/scripts/ 副本同步
- [ ] 实现后在 #303 回复并 close
- [ ] follow-up task（共享 helper 收口）已建

## 状态
planning → 即将 start。关联 #303 + break-loop research。
