# merge main 0.5.19 累积分叉到 beta 分支

## 背景

`main`（稳定线，当前 0.5.19 + 已合并 #324）和 `feat/v0.6.0-beta`（beta 线，0.6.0-beta.22）之间已累积一批历史性分叉。绝大多数是"同一 fix 被双重 commit"（cherry-pick 没保 SHA，导致两边都各自有内容相同但 SHA 不同的提交），但也有 beta 独有 feature 引入的真实差异。

PR #324 当前已通过 cherry-pick `9d779acb` 单独搬上 beta（commit `47882b13`），但其余分叉仍未处理。下一次 `git merge origin/main` 仍会冒出同一批冲突。

之前抽样的 `git merge --no-ff origin/main` 暴露的冲突清单：

| 文件 | hunks | 类型 |
|---|---|---|
| `packages/cli/src/templates/trellis/scripts/common/session_context.py` | 1 | beta 独有：`trellis upgrade` 文案 vs main 旧 npm 字符串 |
| `packages/cli/src/templates/trellis/scripts/common/task_store.py` | 6 | 多个 archive/auto-commit 修复在两边各应用一次 |
| `packages/cli/src/templates/trellis/workflow.md` | 3 | codex namespace + sub-agent vs skill 文案 |
| `packages/cli/test/configurators/platforms.test.ts` | 1 | 平台 registry 数据 |
| `packages/cli/test/regression.test.ts` | 3 | 历史回归 case |
| `packages/cli/test/scripts/task-archive.integration.test.ts` | 2（add/add） | 两边独立创建同名测试文件 |
| `packages/cli/test/templates/pi.test.ts` | 4 | Pi 平台模板测试 |

合计 **20 hunks 跨 7 文件**。

## 目标

把 `main` 上 beta 还没拿到的所有改动合到 `feat/v0.6.0-beta`，留下一个干净的 merge commit，beta 后续可以 fast-forward 跟随 main。

## 策略

走 `git merge --no-ff origin/main`（明确生成 merge commit，便于审计；不用 rebase，因为 beta 已有多个 commits 不能改写已发布历史）。逐 hunk 解决：

1. **同一 fix 双重应用（phantom 冲突）**：两边内容等价 → 任选一侧，commit message 不变。
2. **beta 独有 feature（如 `trellis upgrade`）**：取 `HEAD`（beta）侧。
3. **main 后期 hotfix beta 没拿到**：取 `origin/main` 侧或合并两侧。
4. **add/add（`task-archive.integration.test.ts`）**：对比两侧测试 case，合并去重。

每个冲突文件解决后做行内 sanity check：搜 `<<<<<<<` 残留、目视结构是否合理。

## 验收

- [ ] `git merge --no-ff origin/main` 完成，无残留冲突标记（`grep -rn '^<<<<<<< HEAD' packages/` 无输出）
- [ ] `pnpm --filter @mindfoldhq/trellis typecheck` clean
- [ ] `pnpm --filter @mindfoldhq/trellis lint` clean
- [ ] `pnpm --filter @mindfoldhq/trellis test` 全绿（基线 1204 通过；若 main 引入新测试可上升）
- [ ] 烟雾测试：`trellis init --claude --skip-existing -y` 在临时目录里成功
- [ ] merge commit 落到 beta 分支本地（push 由用户决定）

## 非目标

- 不在本次解决任何业务 bug
- 不动 beta 已 commit 的 `47882b13`（PR #324 cherry-pick）和 `3379fe85`（#323 fix）
- 不向 `main` 反向合并

## 备注

- 本任务定位 **lightweight**（merge 任务，无业务逻辑设计）。PRD-only。
- merge commit message 模板：`Merge branch 'main' into feat/v0.6.0-beta` + 注明已通过 cherry-pick 提前搬入的 #324。
- 解冲突过程中如果发现 main 已有改动被 beta 后续 commit 推翻（语义回退），需先 surfacing 给用户，不擅自取舍。
