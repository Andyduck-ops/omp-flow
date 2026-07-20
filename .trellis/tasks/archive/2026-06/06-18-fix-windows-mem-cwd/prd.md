# fix: Windows mem cwd 过滤返回 0（#300）

## Bug

Windows 上 `trellis mem list`（默认按当前 cwd 过滤）总返回 0，但 `--global` 和 `mem projects` 能正常列出同一 cwd 的 session。把 `mem projects` 打印的路径原样传 `--cwd` 也是 0。→ Windows 上按项目检索 mem 几乎不可用。

来源：issue #300（roronoafour, 2026-05-20，root cause 自己定位得很准）。

## 根因（已坐实）

`packages/core/src/mem/internal/paths.ts:49` `claudeProjectDirFromCwd()`：
```js
return path.join(CLAUDE_PROJECTS, cwd.replace(/[/_]/g, "-"));
```
正则只替换 `/` 和 `_`，**漏了 Windows 的 `\` 和盘符冒号 `:`**。Windows cwd `D:\code\2026\my_app` 算出的目录名跟 Claude 实际写到磁盘的目录名不符。

证据：
- `--cwd` 走快速路径（`adapters/claude.ts:68-69`）：`claudeProjectDirFromCwd(f.cwd)` + `existsSync` → 算错目录名 → existsSync 失败 → 0 条。
- `--global` / `projects` 走"扫全部 session + 读 jsonl/index 里的 cwd 字段"路径，不经该函数 → 正常。
- 同文件 `piProjectDirFromCwd()`（:55）已正确处理：`replace(/[/\\:]/g, "-")` —— Claude 那行该照此补齐。

## 修法

1. `claudeProjectDirFromCwd`：正则补 `\` 和 `:` → `cwd.replace(/[/\\:_]/g, "-")`（与 Claude 实际 Windows 目录命名一致 + 与 Pi 函数一致）。
2. **防御性回退**：`--cwd` 快速路径（claude.ts:68-69）当算出的目录不存在时，回退到"扫全部 session、按 cwd 字段匹配"（即 `--global` 用的解析路径），这样即使未来 Claude 改命名规则也不会静默返 0。
3. 验证 cwd 比较时大小写/分隔符归一化一致（报告者提到 Windows 盘符大小写）。

## 验收

- [ ] `claudeProjectDirFromCwd` 对 Windows 路径（含 `\` 和 `:`）算出正确目录名
- [ ] 新增单测：Windows 反斜杠 + 盘符路径 → 正确 sanitized dir name（对照 Pi 的测试）
- [ ] `--cwd` 路径加全局回退，算错/未来变更时不静默返 0
- [ ] 现有 claude/codex/pi/opencode mem 测试不回归
- [ ] pnpm lint + typecheck + test 全绿
- [ ] 实现后在 #300 回复并 close

## 不做

- 不重构 mem 整体架构；只修 cwd 解析 + 加回退
- 不碰其他 adapter 的 cwd 逻辑（除非验证发现同样漏 `\`/`:`）

## 状态
planning → 即将 start。关联 #300。
