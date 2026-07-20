# Implement — Community Governance (Floor Version)

## Step 1 — 开 Discussions（需 maintainer 操作）

- [ ] 1.1 开启 has_discussions：`gh api -X PATCH repos/mindfold-ai/Trellis -f has_discussions=true`（AI 可跑，需权限）
- [ ] 1.2 配 category：留 **Q&A**（format 必须是 Q&A）+ **Ideas**（open-ended）。默认的 General/Polls/Show and tell/Announcements 删或留。
  - gh CLI 对 category CRUD 支持有限 → 大概率用户在 Web（Discussions 页 → 右侧 categories → Edit）点一下。
- [ ] 1.3 记录实际 category slug（核对 `/discussions/categories/<slug>` 真实 URL），回填 config.yml。
- **Gate**：Q&A + Ideas 两个 category 实际存在且 URL 确认。

## Step 2 — 改 config.yml（AI 直接做）

- [ ] 2.1 `.github/ISSUE_TEMPLATE/config.yml`：`blank_issues_enabled: false` + 三个 contact_links（Q&A / Ideas / docs），URL 用 Step 1.3 确认的 slug。
- [ ] 2.2 删 `.github/ISSUE_TEMPLATE/question.yml`。
- **验证**：`config.yml` YAML 合法（`python3 -c "import yaml; yaml.safe_load(open('.github/ISSUE_TEMPLATE/config.yml'))"`，无 yaml 则用 GitHub 渲染确认）。

## Step 3 — 存量 issue 分流（需 maintainer 操作）

- [ ] 3.1 逐个判断 #308 / #316 / #317 / #314（+ 扫一遍其余 open issue 找提问类）。
- [ ] 3.2 纯提问 → GitHub Web "Convert to discussion" → Q&A。真 feature/bug → 留 Issue。
  - convert 只能 Web 操作（gh CLI 无此命令）。AI 列出建议清单，用户点。

## Step 4 — 验证

- [ ] 4.1 点 "New Issue"：确认不再有空白选项，显示 Q&A / Ideas / docs 三个引导链接 + bug/feature 两个模板。
- [ ] 4.2 bug_report / feature_request 仍能正常开（未被 config 改动破坏）。
- [ ] 4.3 引导链接点进去能到对应 Discussions category（slug 对）。

## Step 5 — 提交 + 收尾

- [ ] 5.1 commit config.yml 改动 + question.yml 删除（**精确 path add，勿带 community-governance 任务目录外的东西**；commitlint：subject 全小写）。
- [ ] 5.2 push main。
- [ ] 5.3 task.py archive。

## 分工

- **AI 能直接做**：config.yml 改、question.yml 删、commit/push、has_discussions API（若有权限）
- **需用户 Web 操作**：category 增删（Step 1.2）、存量 issue convert（Step 3.2）—— AI 给清单 + 指令，用户点

## Rollback

- config/question 改动：`git revert` 或 `git checkout` 单文件
- Discussions：Settings 取消勾选（已 convert 的 discussion 保留）

## 不做（越界就停，另开任务）

ROADMAP 内容、Milestone、Epic tracker、Projects、CoC、SECURITY、PR 模板、triage 自动化 → 都是后续任务（架构图之后的第③步，或独立治理任务）。
