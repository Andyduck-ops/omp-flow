# GitHub Community Governance — Floor Version

## Goal

止住一个具体的痛:**用户都在 Issue 里提问 + 大改动直接甩 PR,列表乱、没方向**。用最小动作把"答疑"和"大提案"从 Issue 分流出去,Issue 回归纯 bug/feature。

不做全套 OSS 治理(CoC / SECURITY / 自动化 / Projects / Milestone / Epic / changesets 全部砍掉,以后按需再加)。

## 缘起(从任务起源 session decb5b25 还原)

用户原话:"我们要开始管理 GitHub 社区……要有清晰的 Roadmap……要不然现在 PR 就是大家随意 PR,太混乱了。"

核心痛点两个:
1. **乱 PR** —— 大改动(如 #337 211 文件 YAML 改造)不先讨论就甩 PR
2. **用户在 Issue 提问** —— 答疑帖(#308/#316/#317 等)混进 Issue 列表,分不清哪些是真待办

## 范围(地板版 only)

### In scope —— 现在就做,且不依赖架构图

1. **开 GitHub Discussions**,2 个 category:
   - **Q&A**(format: Q&A,带"最佳答案")—— 用户求助/使用问题
   - **Ideas**(format: open-ended)—— 大改动/架构提案先讨论(= 轻量 RFC 入口,#337 这类的去处)
2. **改 `.github/ISSUE_TEMPLATE/config.yml`**:
   - `blank_issues_enabled: false`(关掉空白 issue,逼用户走模板或去 Discussions)
   - 加 `contact_links`:Q&A(使用求助)+ Ideas(大提案)+ 保留 docs 链接
3. **处理 `question.yml`**:删除(提问改去 Q&A Discussion),或保留但其引导文案指向 Q&A
4. **存量清理**:把现有的提问类 Issue(#308 #316 #317 #314 等)用 GitHub "Convert to discussion" 挪到 Q&A

### 复用现有,不动

- `bug_report.yml` / `feature_request.yml` 已存在且够用(repro/version 已 required),**不改**——尤其不加依赖架构图的 affected-platform/layer 字段(那是后续任务的事)

### Out of scope(明确砍掉,后续任务再说)

- ROADMAP.md 的具体内容 —— **依赖架构图**,等第②步架构图做完再回来定(第③步)
- Milestone / Epic tracking issue —— roadmap 详细化时一起(第③步)
- Projects v2 看板
- CONTRIBUTING.md 大改 / PR 模板 / CODE_OF_CONDUCT / SECURITY
- triage 自动化(triage.yml / stale-bot)
- Announcements / Show & Tell category(量不够,以后加)
- RFC 正式流程(Ideas 板块先顶着)
- changesets / 治理角色 / CLA

## 验收标准

- [ ] Discussions 已开,存在 Q&A + Ideas 两个 category(Q&A 是 Q&A format)
- [ ] `config.yml`:`blank_issues_enabled: false`,New Issue 页显示 Q&A / Ideas 引导链接
- [ ] 点 "New Issue" 时,提问类用户被引导去 Q&A,而不是开空白 issue
- [ ] `question.yml` 已删除或改为引导去 Q&A
- [ ] 现有提问类 issue(至少 #308/#316/#317/#314)已 convert 到 Q&A 或评论引导
- [ ] `bug_report.yml` / `feature_request.yml` 未被破坏(回归确认仍可正常开)
- [ ] 文档/模板不引用不存在的人或邮箱

## 约束

- **维护者 = 1 人**,所有动作单人可做、零长期维护负担
- **不依赖架构图**:本任务所有产出都不碰 affected-platform/layer 词汇(那些等架构图)
- **减法优先**:只删/改,尽量不新增文件

## 后续(不在本任务)

- **第②步:架构图**(architecture-diagram 任务)—— 单独做
- **第③步:Roadmap + Milestone**(架构图之后)—— 定 0.7 等版本的具体功能,#343(Pi mem adaptor)等 issue 在那时分配进 milestone

## 风险

| 风险 | 缓解 |
|---|---|
| 开了 Discussions 但用户还在 Issue 提问(鬼城) | config.yml 关空白 issue + 引导链接,在源头分流;存量 issue 主动 convert |
| 砍太狠显得没治理 | 地板版只解决当下痛点;治理是渐进的,触发条件到了再加(后续任务) |
| question.yml 删了老用户找不到提问入口 | config.yml 的 Q&A contact link 顶上,且比 issue 更适合答疑 |
