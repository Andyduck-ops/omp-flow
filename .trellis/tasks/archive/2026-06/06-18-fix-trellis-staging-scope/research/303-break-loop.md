# Break-Loop 分析：#303 类 bug —— `.trellis/` 暂存范围失控（unscoped staging）

> 目标不是"修这一个 bug"，而是"让这一**类** bug 永不再现"。
>
> bug 类定义：**任何 Trellis 自动提交（或 release 工具、或 AI 手动 commit）在暂存 `.trellis/` 时把范围扩大到「不该带的东西」——尤其是把并行进行中的其他任务目录、整棵工作树扫进了一个本不相关的提交。**
>
> 本 session（2026-06-17）该类 bug **实地复发了 3 次**，同一组 6 个 community-governance 任务文件被反复扫进不相关提交，维护者手动 `git rm --cached` 解了 3 次（d66405d9 / 81960120 / 3c3219cf），最后放弃、把草稿正式 track 掉（e83233c9）。这证明：**只修 Python helper 不够**。

---

## 1. 根因分类

主分类：**change-propagation failure（修复未传播）+ 重复逻辑（duplicated logic）**，叠加一个 **implicit assumption（隐式假设）/ 工作流缺口**。

逐层拆解：

- **表层**：`add_session.py:_auto_commit_workspace`（session/journal 自动提交）的暂存范围仍是「全部活跃任务目录」，会把并行窗口里其他任务的脏改动一起 commit。这就是 #303 报的现象。
- **直接根因（change-propagation failure）**：这是一个**已知 bug 类**，在 v0.5.14 已经为 archive 路径点修过一次（`0ec7c362`，源码侧 `23bff8d2`），但**修复没有泛化**——session 路径和 release 路径原封不动地保留了宽范围。修了一个 sibling，另一个 sibling 没动。
- **更深根因（duplicated logic）**：`safe_trellis_paths_to_add` 与 `safe_archive_paths_to_add` 从出生那一刻（`5a5e5db5`，2026-05-09）起就是**两个 copy-paste 的独立函数**，各自带一份相同的 `for child in sorted(tasks_dir.iterdir())` 宽扫循环（旧版 line 95 / line 128）。它们**从来不是一个共享 helper**，所以修一个对另一个**没有任何编译/测试压力**。这才是「修复不泛化」的机械原因——没有单一收口点强制两个 call site 一起改。
- **最深根因（implicit assumption + 工作流缺口）**：本 session 的 3 次复发里，**只有 1 次** 经过 Python helper，另外 2 次根本绕开了它——来自 `release.js:82` 的 `git add -A`，以及一次 AI agent 手敲的 `git add -A`。隐式假设是「把暂存安全收口进 `safe_commit.py` 就万事大吉」，但 release 脚本和 AI 的手动操作**从未被纳入这条收口规则**。`.trellis/tasks/` 不在 `.gitignore`（`git check-ignore` 返回 1 = 未忽略），所以任何 blanket stage 都会把未 track 的任务目录吸进去。

一句话根因：**「暂存 `.trellis/` 必须按精确路径、按当前任务作用域」是一个 bug 类级别的契约，但它只被实现在两个互相 copy-paste 的 Python helper 之一里，既没收口成共享 helper，也没扩展到 release 工具和 AI 行为层。**

---

## 2. 为什么之前的修复（v0.5.14 archive fix）没能防住

证据链（全部已对当前代码核对）：

1. **点修 vs 系统修**。`0ec7c362` 的 commit message 明确只讲 `task.py archive`，关联任务 `.trellis/tasks/05-13-fix-auto-commit-gitignore-bleed-273/`。它只 `git show` 改动了 `safe_archive_paths_to_add` 及其 caller `task_store.py:_auto_commit_archive`，并附带处理了 archive 特有的「phantom-delete」（`shutil.move` 源目录删除，`git rm -r --cached --ignore-unmatch`，当前 `task_store.py:529-532`）。session 提交不搬目录，phantom-delete 那一半不适用——于是作者把整件事当成「archive 专属」，**没意识到「全部任务目录」这个宽范围本身是一个跨路径共享的 bug 类**。

2. **copy-paste 分裂，没有共享 helper**。因为 `5a5e5db5` 把同一段循环复制成两个独立 `def`，修 `safe_archive_paths_to_add` 时 `safe_trellis_paths_to_add` 纹丝不动（`safe_commit.py:61-111`，自出生从未改过，宽扫循环仍在 line 100-105）。若当初是一个共享的 `_active_task_paths()`，修复时两个 call site 必须一起改。

3. **没有 parity 测试**。`5a5e5db5` 的 message 号称加了「task.py archive parity」回归用例，但 `regression.test.ts:6342-6343` 只断言**两个函数名作为字符串存在**，根本没断言**范围一致性**。真正的行为级 scope-creep 测试 `task-archive.integration.test.ts:116`（"does not bundle dirty changes from other task dirs"，弄脏 task-b → archive task-a → 断言 task-b 不泄漏、仍 dirty，line 142-148）**只为 archive 写**；session 路径**没有等价的集成测试**。CI 因此从未亮红。

4. **从没人开始修 session 路径**。`git log --all -S "task_name" -- '*add_session.py'` 返回 **零** commit——session 路径的 scoping 从未被尝试过；`add_session.py` 触碰暂存 helper 的历史只有 `5a5e5db5` 及其 release re-sync（`df6271c6` / `1b656afc` / `3c3227c`），没有任何 scope 修复。

5. **release 路径与 AI 行为层从未被纳入收口**。spec 文档 `.trellis/spec/cli/backend/script-conventions.md:836-1013` 把契约写成「Scripts that auto-stage `.trellis/` paths must go through `common/safe_commit.py`」——它只约束 **Python 脚本**。`release.js`（Node）和「AI 手动 commit」不在这句话覆盖范围内，于是 `release.js:82` 的 `git add -A` 和 agent 手敲的 `git add -A` 都是合法的、未被任何规则拦截的逃逸口。**本 session 的 3 次复发里有 2 次走的正是这两条逃逸口。**

> 关键 takeaway：v0.5.14 修的是「archive 这一个症状」，而 #303 + 本 session 复发暴露的是「**unscoped `.trellis` staging 这一整类**」横跨 3 个不同触发器（session 自动提交 / release 脚本 / AI 手动），其中 2 个根本不经过被加固的 Python 层。

---

## 3. 系统性扩散：完整的 staging 点地图

> 真相源（source of truth）= `packages/cli/src/templates/...`；本地 `.trellis/scripts/` 副本经 `diff -q` 确认**逐字节相同**。

| # | Staging 点 | 触发器 | 当前状态 | 是否需修 | 证据 |
|---|-----------|--------|---------|---------|------|
| A | `add_session.py::_auto_commit_workspace` → `safe_trellis_paths_to_add(repo_root)` | `trellis add-session` 自动提交 | **UNSCOPED** | **必修（#303 本体）** | `add_session.py:341` 调宽 helper；helper `safe_commit.py:61-111` 在 line 100-105 扫 `for child in tasks_dir.iterdir()` 全部活跃任务目录 |
| B | `safe_commit.py::safe_trellis_paths_to_add` | （被 A 调用） | **UNSCOPED** | **必修** | 自 `5a5e5db5` 出生从未改；无 `task_name` 参数、无当前任务概念 |
| C | `release.js::main` 第一处暂存 | `pnpm release` 的 `chore: pre-release updates` | **UNSCOPED** | **必修（本 session 2 次复发主因）** | `release.js:82` `run("git add -A -- ':!docs-site' ':!marketplace'")` → line 83-84 commit。除两个 submodule 外暂存整棵树，`.trellis/tasks` 未排除。直接产出污染提交 5ee43ecc、ec123deb（两者都**只**含那 6 个 stray 文件） |
| D | AI agent 手敲 `git add -A` | 人/AI 临时组装提交 | **UNSCOPED** | **必修（行为层，无代码面）** | 无源文件；产出污染提交 1fd56ba7（130 文件 skill-refresh 顺手扫进 6 个任务文件）。untrack 提交 d66405d9 的 message 直接点名「an over-broad `git add -A`」 |
| E | `safe_commit.py::safe_archive_paths_to_add`（legacy `task_name is None` 分支） | 任何忘传 `task_name` 的未来 caller | **UNSCOPED（潜伏/dormant）** | 建议删（防回归） | `safe_commit.py:159-169` 仍是旧宽扫；当前唯一 caller 总传 `task_name`，所以休眠，但任何新 caller 漏传即重新打开宽范围 |
| F | `task_store.py::_auto_commit_archive` → `safe_archive_paths_to_add(repo_root, task_name=..., modified_children=...)` | `task.py archive`（`--no-commit` 跳过） | **SCOPED ✅** | 已修，作为修复范本 | `task_store.py:502-504` 走窄分支；`safe_commit.py:146-157` 只暂存 archive 子树 + 显式 `modified_children`；`task_store.py:529-532` 额外 `git rm -r --cached --ignore-unmatch` 处理搬走的源 |
| G | `release.js::main` 第二处暂存 | `pnpm release` 的 version 提交 | **SCOPED ✅** | 无需动 | `release.js:89` `git add package.json ../core/package.json` |
| H | `bump-versions.js::main` | `node scripts/bump-versions.js` | **不暂存** | 无需动 | 只 `writeJSON` 重写两个 package.json（line 121-122），暂存交给 G |
| I | `safe_commit.py::safe_git_add` | 所有 Python 自动提交的底层原语 | **SCOPED ✅** | 无需动 | `safe_commit.py:180-202` 只 `git add -- <paths>`，从不 `-A`、从不 `-f` retry（0.5.11 #245 修复后） |
| — | `dist/.../multi_agent/create_pr.py:169` `git add -A` | 无（已删管线） | 非 live | 不管 | multi_agent 管线 v0.5.0 已从源码删除（`efccf6f4`；manifest `0.5.0-beta.0.json:1302-1363` 的 safe-file-delete）。仅存于 stale dist 与 `.trellis/.backup-*`，不发布、不执行 |
| — | 文档/skill 散文里的 `git add -A`、test fixture 里的 `git add -A` | 无 | 非工具 | 不管 | `marketplace/skills/...`、`docs-site/...`、`task-archive.integration.test.ts:119/171/207` 等是说明/测试 setup，不是自动暂存的产品代码 |

**结论：3 个 live UNSCOPED 点必修（A/B 是同一根，C，D），1 个潜伏点建议清（E）。** 其中 A/B 是 #303 报告体；C+D 是本 session 实地复发的真正元凶——而它俩**都不在** v0.5.14 加固的 Python 层内。

---

## 4. 预防机制（分层）

### 4.1 Code 层 —— 收口成单一作用域 helper

干掉「让 archive-fix 没能泛化」的 copy-paste 重复：

- 新增（或将现有两函数收敛为）一个共享的、**带任务作用域**的路径生成器，例如
  `active_task_paths(repo_root, task_name=None)` —— 当传 `task_name` 时只产出
  「该任务目录 + （如果是 archive 操作）archive 子树 + 显式 `modified_children`」；
  让 `safe_trellis_paths_to_add` 与 `safe_archive_paths_to_add` 都转调它。
- 迁移 call site：
  - **A/B**：`add_session.py:_auto_commit_workspace` 解析当前任务（`add_session.main` 已在 `add_session.py:507` 用 `get_current_task`），把范围收成「当前 developer 的 journal-*.md + index.md + **当前任务目录**」，**不再** `iterdir()` 全部任务。
  - **F**：保持现状（已是范本）。
  - **E**：删除 `safe_archive_paths_to_add` 的 legacy `task_name is None` 宽扫分支（`safe_commit.py:159-169`），让任何 caller 无法静默重新打开宽范围。
- **C（release.js:82）**：把 `git add -A -- ':!docs-site' ':!marketplace'` 改成
  「只暂存真实 release 产物」或至少追加 `':!.trellis'`（pathspec 排除整棵 `.trellis/`），
  使 release session 里残留的脏 `.trellis/tasks`/`.trellis/workspace`/runtime 文件不被扫入 `chore: pre-release updates`。这是**单行、最高性价比**的修复。

### 4.2 Behavioral / Workflow 层 —— 禁 `git add -A`（针对 D，无代码面）

本 session 的复发证明 Python 修复**不足以**覆盖 AI agent 手敲的 `git add -A`（1fd56ba7）。需要一条**显式工作流规则**，写进 AI 会读的地方（`script-conventions.md` 的 staging 契约段、以及/或 workflow/CLAUDE 级指引）：

> **在本仓库永远不要 `git add -A` / `git add .` / `git add .trellis/`。永远按精确路径暂存。**
> 自动提交一律走 `common/safe_commit.py`；release 走 `release.js` 的精确 pathspec；
> 人/AI 临时提交前先 `git status`，逐路径 `git add <path>`，绝不 blanket stage。

（可选硬约束：加一个 pre-commit hook，检测到提交里混入非当前任务的 `.trellis/tasks/*` 时告警/拦截——把行为规则变成可执行护栏。）

### 4.3 Test 层 —— 每个暂存 helper 都要有「并行任务 scope-creep」回归

- 仿照 `task-archive.integration.test.ts:116` 为 session 路径加等价集成测试：
  弄脏 task-b → 在 task-a 上下文跑 `add-session` 自动提交 → 断言 HEAD 不含任何
  `/task-b/` 路径、task-b 仍 dirty。
- 加一个 **parity 测试**：断言所有暂存 helper（或共享生成器的所有入口）在传入
  `task_name` 时**都不**调用 `tasks_dir.iterdir()` 的全量扫描——把 §2 缺的「范围一致性断言」补上，replace 掉 `regression.test.ts:6342-6343` 那个只验函数名存在的空壳。
- 可加一个针对 **release.js:82** 的测试/检查：在脏 `.trellis/tasks` 状态下跑 pre-release 暂存逻辑，断言 staged 集合不含 `.trellis/`。

### 4.4 Spec 层 —— 哪个 `.trellis/spec/` 文档承接

承接文件：**`.trellis/spec/cli/backend/script-conventions.md`**（已有 staging 契约，line 836-1013）+ **`.trellis/spec/cli/backend/release-process.md`**（release 路径，line 116/154）。
需要做的修订见 §5。

---

## 5. 知识固化（写进 `.trellis/spec/`，作为可执行契约）

把契约从「archive 专属」升级为「**整类 `.trellis` 暂存范围**」。具体落点：

**A. `.trellis/spec/cli/backend/script-conventions.md`（staging 契约段 836-1013）**

1. 修正 line 844 的描述：`safe_trellis_paths_to_add` 不应再被记成「active task dirs（全部）」——改成「当前 developer 的 journal/index + **当前任务目录**」，与代码同步收窄。这一行目前在 spec 里**背书了**宽范围，是知识层面的硬伤。
2. 升级 line 973-1013 的「Wrong / Right」反模式：明确「unscoped task staging」是一个**跨 3 个触发器**的 bug 类，列出三处必走收口的暂存点（session 自动提交、release 脚本、人/AI 手动），而不只是 Python 脚本。
3. 新增一条**绝对禁令**（可执行契约）：
   > 本仓库禁止 `git add -A` / `git add .` / `git add .trellis/`（任何语言、任何脚本、任何人/AI）。
   > 暂存 `.trellis/` 只能：(a) 走 `common/safe_commit.py` 的精确白名单，或 (b) 走 `release.js` 的精确 pathspec。
4. 新增「parity 不变量」一条：任何暂存 helper 在带 `task_name` 时不得做 `tasks_dir.iterdir()` 全量扫描；删除 `safe_archive_paths_to_add` 的 legacy 无参宽分支。

**B. `.trellis/spec/cli/backend/release-process.md`（line 116 已提排除 docs-site/marketplace）**

5. 把 line 116 的描述升级为契约：pre-release 暂存（`release.js:82`）**必须**排除 `.trellis/`（或正向只列产物路径），并记录本 session 的复发事故（污染提交 5ee43ecc / ec123deb，untrack 3 次 d66405d9 / 81960120 / 3c3219cf，最终 e83233c9 妥协）作为「为什么这条契约存在」的 incident note——与 `safe_commit.py` 顶部那段 548-files incident docstring 同体例。

> 固化目标：未来任何人改 `safe_commit.py` / `add_session.py` / `release.js` 时，spec 与测试会**强制**他们意识到「unscoped `.trellis` staging」是一类、横跨 3 个触发器、且有可执行的范围不变量；未来任何 AI 读到 staging 契约段就会看到「禁 `git add -A`」的硬禁令。

---

## 修复 #303 的具体方案

**最小、对症的修复（#303 本体 = staging 点 A/B）**：

把 `add_session.py:_auto_commit_workspace`（`add_session.py:321-372`）的暂存范围镜像 archive helper 收窄成：
**当前 developer 的 `journal-*.md` + `index.md` + 仅当前任务的目录**（含其在 archive 下的位置，如适用），不再暂存全部活跃任务目录。

实现路径（二选一，推荐前者）：

- 给 `safe_trellis_paths_to_add` 增加可选 `task_name` 参数（与 `safe_archive_paths_to_add` 签名对齐）：传入时，task 段只 append `.trellis/tasks/<task_name>`，不 `iterdir()`；`_auto_commit_workspace` 先用 `get_current_task` 解析当前任务（`add_session.main:507` 已有此调用模式）再传入。
- 或直接在 `_auto_commit_workspace` 内解析当前任务并构造精确路径列表，仍经 `safe_git_add` 暂存。

配套（同一个 #303 修复 PR 内）：
- 加 session 版 scope-creep 集成测试（§4.3 第一条），对齐 `task-archive.integration.test.ts:116`。
- 同步修正 spec `script-conventions.md:844` 的描述（§5.A.1），否则代码收窄了但 spec 仍背书宽范围。

**统一 helper：现在做还是单独立项？**

建议**本 PR 先对症修 #303（A/B）+ 修 release.js:82（C）+ 加禁 `git add -A` 规则（D）**，因为 C 和 D 才是本 session 真正烧到维护者的 3 次复发，单行修 C 性价比最高，且不修 C 则「类」未闭环。

**共享 helper 收口（合并两函数 + 删 E 的 legacy 分支）单独立项**——它是「防第三次复发」的结构性改进，但改动面更大（动 `safe_archive_paths_to_add` 的签名/分支、动 `task_store.py` caller、改 parity 测试），与 #303 的紧急对症修复耦合会放大风险。立项时引用本文件 §3 的 staging 点地图与 §4.1 的迁移清单作为 scope。
