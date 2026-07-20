# Delta: `customize-local/change-skills-or-commands.md`

- **Query**: Identify what content needs to change in `change-skills-or-commands.md` to cover the v0.6 bundled-skill auto-dispatch flow (`getBundledSkillTemplates()` in `packages/cli/src/templates/common/index.ts`).
- **Scope**: internal (template source vs. shipped CLI behavior)
- **Date**: 2026-06-15
- **Source file audited**: `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/customize-local/change-skills-or-commands.md` (79 lines)
- **Sibling doc**: `references/platform-files/skills-and-commands.md` will (separately) describe the same flow at the "what" level; this file is the "how to change" companion.

---

## What v0.6 actually does

`packages/cli/src/templates/common/index.ts` exports `getBundledSkillTemplates()`. On `trellis init` / `trellis update` it directory-scans `packages/cli/src/templates/common/bundled-skills/`, then dispatches each subdirectory as a complete skill (including `references/` subtrees) to every platform's skill root.

```
SOURCE (upstream Trellis CLI repo)
  packages/cli/src/templates/common/bundled-skills/
  ├── trellis-meta/              ← multi-file skill
  ├── trellis-spec-bootstrap/    ← multi-file skill
  └── trellis-session-insight/   ← multi-file skill
                │
                │  trellis init / trellis update
                │  getBundledSkillTemplates()
                ▼
DEPLOY TARGETS (user's project, per platform)
  .claude/skills/<name>/         (Claude Code)
  .cursor/skills/<name>/         (Cursor)
  .codex/skills/<name>/          (Codex)
  .agents/skills/<name>/         (Codex / Gemini CLI shared layer)
  .opencode/skills/<name>/       (OpenCode)
  .reasonix/skills/<name>/       (Reasonix, beta.23 — 15th platform)
  .kiro/skills/<name>/           (Kiro)
  .gemini/...                    (Gemini CLI)
  .qoder/skills/<name>/          (Qoder)
  .codebuddy/skills/<name>/      (CodeBuddy)
  .github/skills/<name>/         (GitHub Copilot)
  .factory/skills/<name>/        (Factory Droid)
  .pi/skills/<name>/             (Pi Agent)
  .kilocode/skills/<name>/       (Kilo)
  .agent/skills/<name>/          (Antigravity)
  .windsurf/skills/<name>/       (Windsurf)
```

Every file inside a deployed bundled skill is tracked in `.trellis/.template-hashes.json`, so on the next `trellis update`:

- unchanged file → refreshed silently
- "modified by user" → conflict prompt (overwrite / keep / write `.new` sibling)

This means the current doc — which treats `.{platform}/skills/<name>/` as a place you simply *add* files — is missing the truth that **the most prominent skills there are owned by upstream**. Local edits inside `trellis-meta/`, `trellis-spec-bootstrap/`, or `trellis-session-insight/` will be flagged on every update.

---

## Section-by-section delta

### Section 1 — File preamble (lines 1–4)

**BEFORE**

```markdown
# Change Local Skills, Commands, Prompts, And Workflows

When the user wants to change AI entry points, auto-trigger rules, or explicit command behavior, edit skills, commands, prompts, or workflows in local platform directories.
```

**AFTER**

```markdown
# Change Local Skills, Commands, Prompts, And Workflows

When the user wants to change AI entry points, auto-trigger rules, or explicit command behavior, edit skills, commands, prompts, or workflows in local platform directories.

Before editing, classify the skill you are about to touch:

- **Bundled upstream skill** — `trellis-meta`, `trellis-spec-bootstrap`, `trellis-session-insight`. Source of truth lives in the Trellis CLI repo under `packages/cli/src/templates/common/bundled-skills/<name>/`; auto-dispatched to every platform's skill root by `getBundledSkillTemplates()` on `trellis init` / `trellis update`. Local edits here are tracked by `.trellis/.template-hashes.json` and will be flagged on the next update.
- **Project-local skill** — anything else under `.{platform}/skills/`. Owned by the user; not refreshed by `trellis update`.

The remainder of this file uses "skill" for the local file; the override and conflict rules differ between the two cases.
```

---

### Section 2 — "Read These Files First" (lines 5–10)

**BEFORE**

```markdown
## Read These Files First

1. `.trellis/workflow.md`
2. Target platform skill/command/prompt/workflow directory
3. Related agent or hook files
4. Whether project rules already exist in `.trellis/spec/`
```

**AFTER**

```markdown
## Read These Files First

1. `.trellis/workflow.md`
2. Target platform skill/command/prompt/workflow directory
3. Related agent or hook files
4. Whether project rules already exist in `.trellis/spec/`
5. `.trellis/.template-hashes.json` — confirms whether the skill you are about to edit is upstream-owned (entry present) or project-local (entry absent)
```

---

### Section 3 — "Which Entry Type To Choose" (lines 12–19)

**BEFORE**

```markdown
| Goal | Recommendation |
| --- | --- |
| AI should automatically know a capability | Add or modify a skill. |
| User wants to trigger manually with a command | Add or modify a command/prompt/workflow. |
| Team project conventions | Prefer `.trellis/spec/` or a project-local skill. |
| Change Trellis flow semantics | Synchronize `.trellis/workflow.md`. |
```

**AFTER**

```markdown
| Goal | Recommendation |
| --- | --- |
| AI should automatically know a capability | Add or modify a skill. |
| User wants to trigger manually with a command | Add or modify a command/prompt/workflow. |
| Team project conventions | Prefer `.trellis/spec/` or a project-local skill — never a bundled skill directory. |
| Tweak a bundled skill (`trellis-meta` et al.) for the user's own project | Create a project-local sibling skill (different name) that overrides intent, or edit `.trellis/spec/`. Edits inside the bundled skill directory survive only until the next `trellis update` and will need a "keep" choice each time. |
| Contribute the change back upstream | Edit `packages/cli/src/templates/common/bundled-skills/<name>/` in the Trellis CLI repo, not the deployed copy. |
| Change Trellis flow semantics | Synchronize `.trellis/workflow.md`. |
```

---

### Section 4 — "Modify A Skill" (lines 21–39)

**BEFORE**

```markdown
## Modify A Skill

A skill is usually:

\`\`\`text
<skill-name>/
├── SKILL.md
└── references/
\`\`\`

`SKILL.md` should be short and responsible for triggering/routing. Put long content in `references/` so AI can read it on demand.

The frontmatter description should specify when to use the skill. Example:

\`\`\`yaml
description: "Use when customizing this project's deployment workflow and release checklist."
\`\`\`

Do not write vague descriptions such as "helpful project skill"; they can trigger incorrectly.
```

**AFTER**

```markdown
## Modify A Skill

A skill is usually:

\`\`\`text
<skill-name>/
├── SKILL.md
└── references/
\`\`\`

`SKILL.md` should be short and responsible for triggering/routing. Put long content in `references/` so AI can read it on demand.

The frontmatter description should specify when to use the skill. Example:

\`\`\`yaml
description: "Use when customizing this project's deployment workflow and release checklist."
\`\`\`

Do not write vague descriptions such as "helpful project skill"; they can trigger incorrectly.

### Bundled vs. Project-Local

The same directory shape is used by two very different ownership models:

| Aspect | Bundled (`trellis-meta`, `trellis-spec-bootstrap`, `trellis-session-insight`) | Project-local |
| --- | --- | --- |
| Source of truth | `packages/cli/src/templates/common/bundled-skills/<name>/` in Trellis CLI repo | Inside the user project itself |
| Dispatch | Auto-dispatched to every platform skill root by `getBundledSkillTemplates()` (`packages/cli/src/templates/common/index.ts`) on `trellis init` / `trellis update` | Created by the user (or another skill) and never moved |
| Hash tracking | Every file recorded in `.trellis/.template-hashes.json`; conflict prompt on update | Not tracked |
| Editing locally | Allowed but will be marked "modified by user" on next update | Free editing |
| The right way to customize | Add a *new* project-local skill with a *different* name that supplements (or supersedes) the bundled one | Edit the file directly |

If the goal is "make my project's AI behave differently when discussing release notes," the answer is almost always a project-local skill, not surgery on `trellis-meta/`.
```

---

### Section 5 — "Modify A Command/Prompt/Workflow" (lines 41–50)

No changes required; this section is about explicit commands, which are still single-file and not subject to the bundled-skills auto-dispatch flow. (Commands under `packages/cli/src/templates/common/commands/` go through a different path — `getCommandTemplates()` — and produce single-file outputs, which the current text already handles correctly.)

---

### Section 6 — "Common Paths" (lines 52–61)

**BEFORE**

```markdown
| Platform | Entry directories |
| --- | --- |
| Claude Code | `.claude/skills/`, `.claude/commands/` |
| Cursor | `.cursor/skills/`, `.cursor/commands/` |
| OpenCode | `.opencode/skills/`, `.opencode/commands/` |
| Codex | `.agents/skills/`, `.codex/skills/` |
| GitHub Copilot | `.github/skills/`, `.github/prompts/` |
| Kilo / Antigravity / Windsurf | workflows + skills |
```

**AFTER**

```markdown
| Platform | Entry directories |
| --- | --- |
| Claude Code | `.claude/skills/`, `.claude/commands/` |
| Cursor | `.cursor/skills/`, `.cursor/commands/` |
| OpenCode | `.opencode/skills/`, `.opencode/commands/` |
| Codex | `.agents/skills/`, `.codex/skills/` |
| Gemini CLI | `.agents/skills/`, `.gemini/commands/` |
| Kiro | `.kiro/skills/` |
| Qoder | `.qoder/skills/`, `.qoder/commands/` |
| CodeBuddy | `.codebuddy/skills/`, `.codebuddy/commands/` |
| GitHub Copilot | `.github/skills/`, `.github/prompts/` |
| Factory Droid | `.factory/skills/`, `.factory/commands/` |
| Pi Agent | `.pi/skills/` |
| Reasonix | `.reasonix/skills/` (no separate commands dir; slash commands built into the platform) |
| Kilo / Antigravity / Windsurf | workflows + skills |

Every directory above is a deploy target for the three bundled skills. Each platform receives a full copy on `trellis init` and refresh on `trellis update`; nothing has to be wired by hand.
```

---

### Section 7 — "Add A Project-Local Skill" (lines 63–72)

**BEFORE**

```markdown
## Add A Project-Local Skill

If the user wants to document team-private customizations, create a project-local skill, for example:

\`\`\`text
.claude/skills/project-trellis-local/
└── SKILL.md
\`\`\`

For multi-platform projects, add equivalent versions in each platform skill directory, or use `.agents/skills/` on platforms that support the shared layer.
```

**AFTER**

```markdown
## Add A Project-Local Skill

If the user wants to document team-private customizations, create a project-local skill — never put project-private content into a bundled skill directory, since `trellis update` will overwrite it.

\`\`\`text
.claude/skills/project-trellis-local/
└── SKILL.md
\`\`\`

For multi-platform projects, add equivalent versions in each platform skill directory, or use `.agents/skills/` on platforms that support the shared layer (Codex, Gemini CLI).

Pick a name that does **not** collide with the bundled set:

- `trellis-meta`
- `trellis-spec-bootstrap`
- `trellis-session-insight`

A reused name causes `getBundledSkillTemplates()` to overwrite the project-local copy on the next update. A common convention is to prefix the project name: `acme-trellis-deploy`, `acme-trellis-onboarding`.
```

---

### Section 8 — "Notes" (lines 74–78)

**BEFORE**

```markdown
## Notes

- Do not mix every platform's syntax into one file.
- Do not change only one platform entry point while claiming all platforms are supported.
- Do not hide long-term engineering conventions inside a command; write them to `.trellis/spec/`.
```

**AFTER**

```markdown
## Notes

- Do not mix every platform's syntax into one file.
- Do not change only one platform entry point while claiming all platforms are supported.
- Do not hide long-term engineering conventions inside a command; write them to `.trellis/spec/`.
- Do not hand-edit files inside `trellis-meta/`, `trellis-spec-bootstrap/`, or `trellis-session-insight/` under any `.{platform}/skills/` directory expecting the change to persist — they are bundled and refreshed by `trellis update`. Either contribute upstream or add a project-local skill that complements them.
- After `trellis update` reports a "modified by you" conflict on a bundled skill file, choose **keep** only if you accept maintaining the divergence by hand; otherwise accept the overwrite and re-apply the intent as a project-local skill.
```

---

## Summary of the three-axis relationship the file must now teach

1. **Source axis** — `packages/cli/src/templates/common/bundled-skills/<name>/` is the upstream owner of the three bundled skills.
2. **Dispatch axis** — `getBundledSkillTemplates()` walks that directory once per `trellis init` / `trellis update` and copies every file (including nested `references/`) into every platform's skill root.
3. **Override axis** — the user owns project-local skills in the *same* deploy directory (`.{platform}/skills/`); collision with a bundled name loses on update, so customizations live under a *different* directory name and rely on description-driven trigger routing.

The current file documents only axis 3 implicitly, treats axes 1–2 as nonexistent, and so leaves AI agents and users misled about why their edits keep getting flagged.

---

## Caveats / Not Found

- The parallel sibling task's `bundled-skills.md` (referenced in the user prompt) does not yet exist under `.trellis/tasks/06-15-release-v0-6-0-ga/research/trellis-meta-rewrite/`. This delta was drafted directly from the v0.6 source-of-truth in `packages/cli/src/templates/common/index.ts` (the `getBundledSkillTemplates()` implementation) plus the bundled-skill directory listing under `packages/cli/src/templates/common/bundled-skills/` and the audit findings in `.trellis/tasks/06-15-release-v0-6-0-ga/research/trellis-meta-drift.md` § 13 and § 20. When the sibling `bundled-skills.md` lands, this delta may need a phrasing pass to align tone and terminology with that file.
- The sibling doc `references/platform-files/skills-and-commands.md` will also need a corresponding update (separate audit item; covered by `trellis-meta-drift.md` § 13). The "Modify A Skill → Bundled vs. Project-Local" subsection added here should be cross-referenced from that file rather than duplicated.
