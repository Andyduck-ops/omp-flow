# Design — Workflow 简化

## Source of truth

`.trellis/workflow.md`（710 行）= 项目内 dogfood 副本 + 实际 SOT。
真正的发布源：`packages/cli/src/templates/common/workflow.md` — 这份才是 `trellis init` / `trellis update` 下发给每个平台的模板。

调研结果（grep 验证）：

```bash
# 主仓项目 dogfood 版本
.trellis/workflow.md

# 模板单一来源
packages/cli/src/templates/common/workflow.md
```

修改顺序：**先改 template，再让本仓 `.trellis/workflow.md` 跟随**（避免 dogfood 漂移）。模板修完后用 `pnpm trellis update` 在本仓自身刷新，验证 hash 一致。

## 不变量

- `task.py` 不读 step 编号做逻辑判断，只用 `task.json.status` 字符串。删除 3.1 不影响 task lifecycle。
- `get_context.py --mode phase --step 3.1` 是 AI 拉具体步骤本文的接口。删除后这个调用应该返回"step not found"而不是 crash。要验证脚本的容错。
- 平台模板里有 `[platform-name] ... [/platform-name]` 包围的 inline 区域，但**只在 step body 内**，不在 step header / Phase Index 表上。删除整 step 时这些 inline 区域跟着一起没了，没遗留风险。
- AI 沿用旧 workflow 心智模型的恢复方式：新 SessionStart 注入新 workflow.md 后 AI 直接看新版本即可，**无需迁移**。

## 审计框架（应用于所有 14 个 step）

对每个 step 提以下问题：

1. **独有能力**：这一步做的事，能否被相邻步骤完全覆盖？
2. **触发判定**：`[required · once]` / `[required · repeatable]` / `[optional]` / `[on demand]` 这四类里，哪个是它的真实定位？标注是否有错位（例如标 required 但实际可跳过）。
3. **认知成本**：这一步在每个 task 都要被读一次。它的存在是降低还是抬高 AI 的执行可靠性？
4. **折叠路径**：如果删除，去向 = ？（合并入 X / 改为 checklist 项 / 完全消失 / 转为 spec 项）
5. **保留理由**：如果不删，独有理由 = ？（拒绝"惯例"作为理由，必须给得出具体反例：删了之后什么场景会出岔子）

输出 = `research/audit-findings.md`，每个 step 一节。最终结论 = 推荐删除清单 + 修改清单 + 保留清单（每类都要列出原因）。

## 删除 3.1 的迁移路径

**3.1 的两个独有价值的去向**：

| 原 3.1 价值 | 新载体 | 措辞要点 |
|---|---|---|
| 全量 package 视图（implement 完成后再跑一次 full-scope check） | 2.2 描述里加一句："最后一段 implement 完成后必须再跑一次 2.2，**这次的 spec 范围用 `--mode packages` 列出全部受影响 package，逐一检查**——而不是只看刚改的局部" | 把"末次 2.2 = full-scope"写死成 2.2 的语义 |
| Spec Sync 触发提醒 | 3.4 commit preamble 加 1 行："commit 前，如果你刚才修了 bug 或学到非显然知识，问自己：要不要写进 `.trellis/spec/` 让未来的我不重蹈覆辙？是 → Phase 3.3 先于 3.4。" | 把提醒钉在 commit gate，commit 前必读 |

**Phase Index 表更新**：

原：
```
- 3.1 Quality verification [required · repeatable]
- 3.2 Debug retrospective [on demand]
- 3.3 Spec update [required · once]
- 3.4 Commit changes [required · once]
- 3.5 Wrap-up reminder
```

新：
```
- 3.1 Debug retrospective [on demand]    (was 3.2)
- 3.2 Spec update [required · once]      (was 3.3)
- 3.3 Commit changes [required · once]   (was 3.4)
- 3.4 Wrap-up reminder                   (was 3.5)
```

**决策**：要不要 renumber？

- **不 renumber**（推荐）：保留 3.2-3.5 不动，3.1 留空（文档里说明"3.1 已合并入 2.2 + 3.4"）。代价：编号有空洞。收益：在线文档 / 第三方教程 / spec 引用的 "Phase 3.X" 字面值不破。
- **renumber**：所有 3.X 上移一位。代价：所有引用都要改。收益：编号连续。

PRD 已说 "改动必须是减法为主"，所以采用**不 renumber**策略。审计结果如果建议删多个步骤，统一在最后做或不做 renumber，作为单独决策。

## 工具调用面

- `get_context.py --mode phase --step 3.1` 删除后行为：脚本应返回 "Phase 3.1 not found in workflow.md（合并入 2.2 + 3.4）" 的友好错误。需要验证。
- `inject-workflow-state.py` 不读 step 编号，安全。
- `task.py current` / `task.py start` / `task.py finish` 不读 step 编号，安全。

## 多平台同步

`packages/cli/src/templates/common/workflow.md` 是单源。每个平台的 generated workflow 在 `trellis init` 时复制此文件（部分平台做了 inline 区域过滤——比如 codex-inline 会剥掉 `[Claude Code, Cursor, ...]` 区段）。删除 3.1 整 step 时**整段也带着 inline 区域消失**，过滤逻辑无差错处理需要。

验证：在 /tmp 跑 `trellis init --claude --codex --cursor --pi --reasonix`，对比每个平台 generated workflow.md 是否都没有 3.1。

## Rollback shape

| 阶段 | rollback |
|---|---|
| 改完模板没 commit | `git checkout packages/cli/src/templates/common/workflow.md` |
| commit 了没 push | `git reset --hard HEAD~1` |
| push 到 main 了 | revert commit，或在下一个 patch 里恢复 |
| 已 release 出去 | 不可逆，但纯文档改动，影响是认知摩擦而非功能 break——很轻 |

3.1 删除本质是"文档措辞改动"，比 dual-package promote 风险低 2 个数量级，不需要 ship gate。
