# Porting Plan: trellis-channel → bundled marketplace skill

- **Source**: `/Users/taosu/.claude/skills/trellis-channel/`
- **Target**: `marketplace/skills/trellis-channel/` (alongside `trellis-meta`, `trellis-spec-bootstarp`)
- **Date**: 2026-06-15
- **Scope**: internal (read source skill files, design generic-user-facing copy)

## 1. Skill name and placement

- **Skill name**: `trellis-channel` (frontmatter `name: trellis-channel`)
- **Bundled directory**: `marketplace/skills/trellis-channel/`
  - Pattern matches existing `marketplace/skills/trellis-meta/` and `marketplace/skills/trellis-spec-bootstarp/` (note: the existing peer dir is misspelled "bootstarp"; do not propagate that typo to the new skill).
- **Layout**:
  ```
  marketplace/skills/trellis-channel/
  ├── SKILL.md
  └── references/
      ├── workflows.md
      ├── forum.md
      ├── workers.md
      ├── progress-debugging.md
      └── command-reference.md
  ```

## 2. File-by-file reusability assessment

| Source file | Lines | Verdict | Notes |
|---|---|---|---|
| `SKILL.md` | 87 | Near-verbatim with small edits | Drop the `local-forum.md` row in the routing table and the bullet in the Reference Files index. Everything else (frontmatter description, First Commands, Core Rules, Not For) is generic-safe. |
| `references/workflows.md` | 130 | Verbatim | Patterns A–F are entirely generic. Example task paths (`.trellis/tasks/05-XX-storage-adapter`, `05-12-foo`, `05-13-example`) and worker handles (`cx-arch`, `check-cx`, `check-claude`) are clearly illustrative. No private content. |
| `references/forum.md` | 148 | Near-verbatim | Examples use `trellis-issues` and `trellis-changelog` as board names — illustrative, not private. The "Internal Changelog Forums" section uses thread keys like `channel-threads-core-beta13` and `release-ci-only-publishing`; reword the thread-key examples to fully generic ones (e.g. `release-2026-q1`, `runtime-event-schema-change`) to avoid hinting at the maintainer's local naming. |
| `references/workers.md` | 98 | Verbatim | All generic. Agent card YAML example uses neutral `name: check`. |
| `references/progress-debugging.md` | 114 | Verbatim | Storage layout, wait semantics, exit codes, common-failure table are universal. Includes the `npm install -g @mindfoldhq/trellis@beta` hint — this is the canonical install command, keep as-is. |
| `references/command-reference.md` | 161 | Verbatim with one tiny edit | Generalize the parenthetical "Filed at trellis-issue `tag-help-misleads-reserved-vs-convention`" → either drop the sentence or replace with neutral phrasing ("tracked upstream"). The technical content of the tag-vs-kind explainer is high-value and must stay. |
| `references/local-forum.md` | 94 | **DROP** | Machine-specific. Documents actual durable global forum boards on the source machine (`trellis-issue`, `trellis-changelog`, `awesome-trellis-workflow`, `vine-project`) along with thread keys. The `vine-project` entry is explicitly marked private. Generic users have none of these boards. |

## 3. Required rewrites / scrubs

1. **`SKILL.md`** — two micro-edits:
   - Remove the "本机有哪些常用 forum/thread" row from the Route-By-User-Intent table.
   - Remove the `references/local-forum.md` bullet from the Reference Files index.
   - Optionally: also remove the secondary reference to `local-forum.md` in the "看看这个 thread / trellis-issue / linked context" routing row (currently reads "`references/forum.md`, then `references/local-forum.md`"). Change to just `references/forum.md`.

2. **`references/forum.md`** — soft-scrub illustrative thread keys:
   - Replace `channel-threads-core-beta13` and `release-ci-only-publishing` with generic placeholders (`release-2026-q1` and `runtime-event-schema-change` or similar) so the example does not look like maintainer leftover.
   - Other example identifiers (`uninstall-regression`, `trellis-issues`, `trellis-changelog`) are good generic examples and can stay.

3. **`references/command-reference.md`** — one tiny edit:
   - In the tag-vs-kind section, soften "Filed at trellis-issue `tag-help-misleads-reserved-vs-convention`" to "Tracked upstream." The technical guidance around `--kind done` / `--kind turn_finished` / reserved `interrupt` vs convention tags is the value of this section and must remain intact.

4. **`references/local-forum.md`** — do not ship. Contains:
   - This machine's actual durable global boards
   - A `vine-project` entry explicitly marked "Private product context"; the same warning appears under `trellis-issue / vine-trellis-core-sdk-needs`
   - Operating-memory copy ("local operating memory, not public Trellis docs") that confirms the file was never intended for public distribution

## 4. Files to ship vs drop (final)

**Ship (5 references + 1 SKILL):**
- `SKILL.md` (with the two micro-edits above)
- `references/workflows.md` (verbatim)
- `references/forum.md` (with illustrative-thread-key scrub)
- `references/workers.md` (verbatim)
- `references/progress-debugging.md` (verbatim)
- `references/command-reference.md` (with one phrase softened)

**Drop:**
- `references/local-forum.md` (machine-specific + private content)

## 5. Recommended SKILL.md structure (bundled version)

```markdown
---
name: trellis-channel
description: Use Trellis channel for live multi-agent collaboration, spawned workers, cross-agent review, progress inspection, forum channels, and channel log debugging.
---

# trellis-channel

`trellis channel` is the local multi-agent collaboration runtime. Use it when
agents need to talk through a durable event log, when a worker should be
spawned as a peer process, when an in-flight worker needs interrupt/debugging,
or when feedback should be recorded on a durable `--type forum` channel.

This skill is an index. Load only the reference file for the current job.

## First Commands

```bash
trellis --version
trellis channel --help
trellis channel list --all
trellis channel list --scope global --all
```

If the user gives a channel or thread name, inspect it before asking for background:

```bash
trellis channel forum <board> --scope global
trellis channel thread <board> <thread> --scope global
trellis channel context list <board> --scope global --thread <thread>
```

## Route By User Intent

| User intent | Read |
|---|---|
| "和 codex/claude 讨论一下", "brainstorm" | `references/workflows.md` |
| "派一个 implement/check agent", "让 agent review" | `references/workflows.md`, then `references/workers.md` |
| "开 issue 区 / topic 群 / changelog / board" | `references/forum.md` |
| "看看这个 thread / linked context" | `references/forum.md` |
| "channel 卡住了 / 没输出 / progress 被截断" | `references/progress-debugging.md` |
| "具体命令怎么写" | `references/command-reference.md` |

*(One row removed vs source: the "本机有哪些常用 forum/thread" row, which pointed to the dropped `local-forum.md`. The remaining thread-inspection row no longer references `local-forum.md`.)*

## Core Rules

*(Carry over verbatim — all 7 bullets are platform/user-agnostic and contain high-signal rules:)*

- New forum channels use `--type forum`; a `thread` is one item inside a forum channel.
- Use `context-file` / `context-raw` and `trellis channel context add/delete/list`. `linked-context-*` is deprecated terminology.
- Use `--stdin` or `--text-file` for long messages.
- Pretty `messages` output is an operator dashboard and may truncate progress; use `--raw` for audit.
- `--as` is the speaker or worker handle, depending on command.
- For brainstorm, do multiple pressure-test rounds.
- **Dispatcher wait pattern**: use `--kind done` / `--kind turn_finished` (trellis-emitted system events), NOT a user `--tag` as completion signal. See `references/command-reference.md` "tag vs kind".
- Forum channels are event-sourced. Do not parse `events.jsonl` first.
- `@mindfoldhq/trellis-core` owns reusable channel/thread state; the CLI owns flags, rendering, prompts, worker lifecycle, exits.

## Reference Files

- `references/workflows.md` — canonical collaboration patterns A–F.
- `references/forum.md` — forum channels, context, title, rename, changelog forums.
- `references/workers.md` — spawn, agent cards, context injection, interrupts.
- `references/progress-debugging.md` — progress/raw inspection and stalled worker diagnosis.
- `references/command-reference.md` — current CLI command reference.

*(One bullet removed vs source: `references/local-forum.md`.)*

## Not For

*(Carry over verbatim:)*

- One static review where a markdown file and prompt are enough.
- Replacing normal tool calls with self-logging.
- Long-term memory retrieval. Use durable forum channels for actionable issues, and `trellis mem` for session/history search.
```

## 6. Suggested implementation steps

1. `mkdir -p marketplace/skills/trellis-channel/references`
2. Copy 5 references verbatim, then apply the soft-scrubs noted in section 3 to `forum.md` and `command-reference.md`.
3. Write the new `SKILL.md` per section 5 (two routing-table / reference-list edits relative to source).
4. Verify the bundled skill mirrors layout of `marketplace/skills/trellis-meta/`.
5. Spot-check that no occurrence of `local-forum`, `vine-project`, or `vine-trellis-core-sdk-needs` survives in any shipped file.

## Caveats / Not Found

- The current bundled-skills peer directory `marketplace/skills/trellis-spec-bootstarp/` is misspelled ("bootstarp" instead of "bootstrap"). Do not propagate that typo to `trellis-channel`. Whether the peer should be renamed is out of scope for this plan.
- The packaging pipeline that copies `marketplace/skills/*` into per-platform locations (`.cursor/skills`, `.opencode/skills`, etc.) was not inspected — the plan assumes any new bundled skill added under `marketplace/skills/` participates in the same distribution path as `trellis-meta`. If a registry/index file needs updating, that step is not captured here.
