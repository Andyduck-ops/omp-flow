# Design — Community Governance (Floor Version)

## 改动面（极小）

```
.github/ISSUE_TEMPLATE/
├── config.yml          # 改：关空白 issue + 加 Discussions 引导链接
├── question.yml        # 删（提问改去 Q&A Discussion）
├── bug_report.yml      # 不动（已够用）
└── feature_request.yml # 不动（已够用）

GitHub Discussions       # 开启 + 建 Q&A / Ideas 两个 category（gh API 或 Web 设置）
存量 issue               # convert 提问类到 Q&A
```

## config.yml 目标内容

```yaml
blank_issues_enabled: false
contact_links:
  - name: 使用求助 / Question
    url: https://github.com/mindfold-ai/Trellis/discussions/categories/q-a
    about: 使用问题、配置疑问、"支持 X 吗" —— 发到 Q&A，保持 Issues 只装确认的 bug/feature。
  - name: 想法 / 大改动提案 (Idea / Proposal)
    url: https://github.com/mindfold-ai/Trellis/discussions/categories/ideas
    about: 较大或破坏性的改动（如架构调整、工作流重构）先在 Ideas 讨论方向，再开 Issue / PR。
  - name: 文档问题 / Docs
    url: https://github.com/mindfold-ai/docs/issues/new
    about: 文档相关问题请在 docs 仓提交。
```

> category slug：GitHub 对 "Q&A" 默认 slug 是 `q-a`，"Ideas" 是 `ideas`。建完 category 后核对实际 URL 再定稿。

## Discussions 开启方式

两条路（择一）：
1. **Web**：仓库 Settings → Features → 勾选 Discussions → 进 Discussions 页配 category（默认会有 Announcements/General/Ideas/Polls/Q&A/Show and tell；留 Q&A + Ideas，其余删或留作以后）
2. **gh API**：`gh api -X PATCH repos/mindfold-ai/Trellis -f has_discussions=true` 开启 has_discussions。category 的增删 gh CLI 支持有限，大概率仍需 Web 点一下。

→ 这一步需要 maintainer 权限。AI 能跑 API 开 has_discussions，category 配置可能要用户在 Web 操作。实施时确认。

## question.yml 处理

删除。提问应去 Q&A Discussion（有"最佳答案"、不占 Issues）。config.yml 的 Q&A contact link 取代它作为提问入口。

## 存量 issue convert

GitHub issue 右侧 "Convert to discussion" → 选 Q&A。候选（提问类，非真 bug/feature）：
- #308 sub-agent 模式好用了吗
- #316 spec 能否装多套
- #317 支持全局 init 吗
- #314 init 后 bootstrap 任务问题

实施时逐个判断：是真 feature 的留 Issue，纯提问的 convert。

## 不做（重申）

ROADMAP 内容 / Milestone / Epic / Projects / CoC / SECURITY / PR 模板 / triage 自动化 —— 全部后续任务。本任务只分流。

## Rollback

- config.yml 改坏 → git revert 单文件
- Discussions 开了想关 → Settings 取消勾选
- question.yml 删了想恢复 → git 历史取回
