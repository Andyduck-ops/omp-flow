# Implementation — Workflow 简化

## Phase A: 审计

A1. 通读 `packages/cli/src/templates/common/workflow.md`（template 源），对 14 个 step 各回答 design.md 的 5 个问题，输出 `.trellis/tasks/06-17-workflow-simplify-redundant-steps/research/audit-findings.md`

A2. grep 全仓引用，找出所有提到 "Phase 3.1" 字面值的地方（docs-site / spec / 其他 skills / 任何代码或注释）：
```bash
grep -rn "Phase 3\.1\|step 3\.1\|3\.1 Quality" \
  --include="*.md" --include="*.mdx" --include="*.ts" --include="*.js" --include="*.py" \
  . 2>/dev/null | grep -v node_modules
```

A3. user gate：把审计报告 + grep 结果给用户 review，确认哪些要动 / 哪些保留

## Phase B: 删除 3.1（最小变更版本）

B1. 修改 `packages/cli/src/templates/common/workflow.md`：
- 删除 "#### 3.1 Quality verification" 整 step block
- Phase Index 表删掉 "3.1 Quality verification" 行
- Rules / Active Task Routing 表如果引用 3.1 → 改为"2.2 末次全量 check"

B2. 修改 `packages/cli/src/templates/common/workflow.md` 的 2.2 step body：
- 加一行强调"末次 2.2 必须 full-scope，用 `--mode packages` 列出所有受影响 package"

B3. 修改 `packages/cli/src/templates/common/workflow.md` 的 3.4 step body：
- 在 step body 顶部加 1 行 reminder："commit 前，如果你刚才修了 bug 或学到非显然知识，问自己：要不要写进 `.trellis/spec/`？是 → 先走 Phase 3.3 再回到 3.4。"

B4. **不 renumber**：3.2 / 3.3 / 3.4 / 3.5 编号保持。

## Phase C: 其它审计推荐项（待 A3 后定）

按 A3 user gate 的结果，逐项实施或推迟。每项独立 commit。

## Phase D: 模板同步 + 本仓 dogfood

D1. 模板改完后，在本仓自身跑：
```bash
pnpm --filter @mindfoldhq/trellis build
node packages/cli/dist/cli/index.js update --dry-run
```
预期：`.trellis/workflow.md` 在 update 计划里显示为"将被刷新"（hash 变化）

D2. 实际 update：
```bash
node packages/cli/dist/cli/index.js update --force
```

D3. 对比 `.trellis/workflow.md` 跟 template：
```bash
diff packages/cli/src/templates/common/workflow.md .trellis/workflow.md
# 预期：完全一致（dogfood 同步）
```

## Phase E: 多平台 dogfood

E1. 全新临时项目：
```bash
rm -rf /tmp/workflow-simplify-dogfood
mkdir /tmp/workflow-simplify-dogfood && cd /tmp/workflow-simplify-dogfood && git init -q .
node /Users/taosu/.../packages/cli/dist/cli/index.js init -y -u test \
  --claude --cursor --codex --pi --reasonix
```

E2. 检查每个平台的 workflow.md（或等价物）是否不含 3.1：
```bash
for f in .claude .cursor .codex .pi .reasonix; do
  if [ -f "$f/workflow.md" ]; then
    echo "--- $f/workflow.md ---"
    grep -c "Phase 3\.1\|3\.1 Quality" "$f/workflow.md" || echo "  ✓ clean"
  fi
done
# 也检查 .trellis/workflow.md（这是真正的单一来源）
grep -c "Phase 3\.1\|3\.1 Quality" .trellis/workflow.md
```

E3. 检查 `get_context.py --mode phase --step 3.1` 行为：
```bash
python3 .trellis/scripts/get_context.py --mode phase --step 3.1
# 预期：友好错误"Phase 3.1 not found"，不 crash
```
如果脚本 crash → 需要在脚本里加一个 fallback 错误信息。

## Phase F: 测试 + lint + typecheck

```bash
pnpm lint && pnpm typecheck && pnpm test
```

预期：和当前一样全绿（这次只动 markdown，但仍然完整跑一遍以防有 test 在断言 workflow 内容）。

## Phase G: 提交 + push

G1. 单 commit：`refactor(workflow): drop redundant Phase 3.1, fold into 2.2 + 3.4`

G2. commit body 包含：
- 删 3.1 的理由（与 2.2 同源、独有价值已迁移）
- 不 renumber 的决策理由
- 迁移路径（2.2 强调末次 full-scope + 3.4 加 spec-sync preamble）
- 审计报告位置（research/audit-findings.md）

G3. push 到 main。这是文档改动，不需要走 PR + review，但仍尊重团队约定 — 如果 main 受保护需要 PR，照走 PR。

## 验证矩阵

| 检查项 | 命令 | 期望 |
|---|---|---|
| Template 不含 3.1 | `grep -c "Phase 3\.1" packages/cli/src/templates/common/workflow.md` | 0 |
| 本仓 .trellis/workflow.md 跟随 | `diff template .trellis/workflow.md` | 一致 |
| 各平台 generated workflow | 见 E2 | 0 hits 各 |
| `get_context.py --step 3.1` | 见 E3 | 友好错误 |
| 测试套件 | `pnpm test` | 全绿 |
| 第三方文档引用 | A2 grep | 全部更新或保留并标注 |

## Rollback

每个 Phase 都可独立 rollback：
- A 阶段：丢弃 research/ 文件
- B-D 阶段：`git checkout` 模板文件即可
- G push 后：revert commit
