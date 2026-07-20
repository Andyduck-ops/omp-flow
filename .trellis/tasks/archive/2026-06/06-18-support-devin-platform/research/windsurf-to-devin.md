# 调研：Windsurf → Devin Desktop 改名（#325）

## 结论：确实是改名，不是两个产品

Cognition 在 **2026-06-02** 通过 OTA 更新把 **Windsurf 改名为 Devin Desktop**（用户重启编辑器即自动更新，账号/插件/快捷键全保留，无迁移向导）。Devin 品牌统一了 Devin Desktop / Devin CLI / Devin Cloud / Devin Review。

来源：
- https://devin.ai/blog/windsurf-is-now-devin-desktop/
- https://docs.devin.ai/desktop/devin-desktop-faq

## 配置目录变化（关键）

**`.devin/` 是新的首选目录，`.windsurf/` 作为向后兼容 fallback 保留：**
- `.devin/rules/` 优先，`.windsurf/rules/` 仍作 fallback
- 新增 `.devinignore`（与 `.windsurfignore` / `.codeiumignore` 并存）
- **`.devin/` 优先于 `.windsurf/`（同时存在时）**
- Cascade → Devin Local（Cascade 2026-07-01 后移除）

## 对 Trellis 的影响

Trellis 当前 `ai-tools.ts:274` 的 windsurf 条目：
```
configDir: ".windsurf/workflows"
extraManagedPaths: [".windsurf/skills"]
cliFlag: "windsurf"  / name: "Windsurf" / agentCapable: false / hasHooks: false
templateDirs: ["common", "windsurf"]  （注：无专属 templates/windsurf/，用 common）
```

## 设计选项

| 方案 | 说明 | 取舍 |
|---|---|---|
| **A. 改名/别名**（windsurf → devin，迁移 .windsurf→.devin） | 把 registry 的 windsurf 条目改成 devin（configDir `.devin/...`），加一条 migration `rename-dir` 把已装的 `.windsurf/` 迁到 `.devin/`；可选保留 `--windsurf` 作 alias | 干净、跟官方"改名"语义一致；但要写 migration + 处理老用户 .windsurf |
| **B. 新增独立 devin 平台**（与 windsurf 共存） | 加一个新 devin 条目，windsurf 保留 | 不破坏老用户；但 registry 多一个冗余项，且官方其实是同一产品，长期会混乱 |

**倾向 A**——官方就是"改名 + .devin 优先 .windsurf fallback"，Trellis 跟进改名最贴合。migration 用 `rename-dir`（项目里已有这个 migration type，beta.23 的 trellis-spec-bootstarp 改名就是用它）把 `.windsurf/workflows` + `.windsurf/skills` 迁到 `.devin/...`。保留 `--windsurf` flag 作 deprecated alias 一个版本，平滑过渡。

## 待定（实现前确认）

- Devin Desktop 的 workflow/skills 具体落哪个子目录？官方 FAQ 说 `.devin/rules/`，但 Trellis 用的是 `.windsurf/workflows` + `.windsurf/skills` —— 需确认 Devin 是否仍读 `.devin/workflows`、`.devin/skills`，还是结构也变了。**实现前需查 Devin Desktop 实际读取的目录结构**（可能要装一个试，或查 Devin docs 的 rules/workflows 章节）。
- agentCapable/hasHooks 是否随 Devin Local（替代 Cascade）有变化？Devin Desktop 可能新增了 hook/agent 能力 —— 值得重评估 windsurf 当前 `agentCapable: false`。

---

## 补充调研：open question 已查实（来源 docs.devin.ai/desktop/devin-desktop-faq）

### Q1: Devin 目录结构 —— 与 Trellis windsurf 一一对应（好消息）

`.devin/` 子目录：`rules/` / `workflows/` / `skills/` / `plans/`，`.windsurf/` 作 read-only fallback：

| Trellis 当前（windsurf） | Devin 新路径 | 对应 |
|---|---|---|
| `.windsurf/workflows/` | `.devin/workflows/` | ✅ 同名子路径 |
| `.windsurf/skills/` | `.devin/skills/` | ✅ 同名子路径 |

**结论：子路径结构完全一致，只需把 configDir `.windsurf/workflows` → `.devin/workflows`、extraManagedPaths `.windsurf/skills` → `.devin/skills`，不用重设计。**

### Q2: Devin 能力变化 —— 现在支持 hooks

Devin Desktop 支持 lifecycle hooks（`.devin/config.json`）+ skills（`.devin/skills/<name>/SKILL.md`，同 SKILL.md 格式）。当前 Trellis windsurf 条目 `agentCapable: false / hasHooks: false` 对 Devin 而言**偏保守**。

**决策：本任务只做"改名 + 目录迁移"（最小、对症 #325）；hook/agent 能力升级单独评估（Devin 的 hook 机制要专门对接，不在 #325 范围）。**

### 最终实现方案（方案 A 确定）

1. registry windsurf 条目改名为 devin：`name: "Devin"`、`configDir: ".devin/workflows"`、`extraManagedPaths: [".devin/skills"]`、`cliFlag: "devin"`，其余（agentCapable/hasHooks/templateDirs: ["common", ...]）暂不变。
2. `rename-dir` migration：`.windsurf/workflows` → `.devin/workflows`、`.windsurf/skills` → `.devin/skills`（参照 beta.23 trellis-spec-bootstarp 改名）。
3. `--windsurf` 保留为 deprecated alias 一个版本（或迁移提示）。
4. 测试 + docs-site 平台列表 + platform-map.md 更新。
