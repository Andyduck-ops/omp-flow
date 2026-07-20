# Delta: `platform-map.md` for v0.6.0 GA

- **Source file**: `packages/cli/src/templates/common/bundled-skills/trellis-meta/references/platform-files/platform-map.md`
- **Scope of this delta**: only the file above. Sister files (`agents.md`, `skills-and-commands.md`, `hooks-and-settings.md`, `overview.md`) need parallel additions but are out of scope here.
- **Date**: 2026-06-15

## Audit Against Source of Truth (`AI_TOOLS` Registry)

`src/types/ai-tools.ts` defines 15 platforms. The matrix in `platform-map.md` currently lists 14. Cross-check:

| Registry key | In matrix? | Notes |
|---|---|---|
| `claude-code` | yes | OK |
| `cursor` | yes | OK |
| `opencode` | yes | OK |
| `codex` | yes | OK |
| `kilo` | yes | OK |
| `kiro` | yes | OK |
| `gemini` | yes | OK |
| `antigravity` | yes | OK |
| `windsurf` | yes | OK |
| `qoder` | yes | OK |
| `codebuddy` | yes | OK |
| `copilot` | yes | OK (note: registry `configDir = .github/copilot`, matrix shows `.github/` — keep as-is, matches sister docs) |
| `droid` | yes | OK |
| `pi` | yes | Row exists but does **not** advertise the native `trellis_subagent` capability shipped in 0.6.0-beta.19 |
| `reasonix` | **NO** | Missing — must be added |

No renames are pending for v0.6.0 GA. Only `reasonix` is missing, and only `pi` needs an annotation refresh.

---

## DIFF 1 — Matrix Row for Reasonix (ADD)

Insert as the LAST row of the `## Matrix` table (after the `Pi Agent` row at current line 22).

### BEFORE

```markdown
| Pi Agent | `--pi` | `.pi/` | `.pi/skills/` | `.pi/agents/` | `.pi/extensions/trellis/` + `.pi/settings.json` |
```

(no row exists for Reasonix)

### AFTER

```markdown
| Pi Agent | `--pi` | `.pi/` | `.pi/skills/` | `.pi/agents/` | `.pi/extensions/trellis/` (native `trellis_subagent` tool) + `.pi/settings.json` |
| Reasonix | `--reasonix` | `.reasonix/` | `.reasonix/skills/` | None — sub-agents are skills with `runAs: subagent` frontmatter | None |
```

### Rationale

From `src/configurators/reasonix.ts` and `src/types/ai-tools.ts`:

- `configDir` = `.reasonix`
- `cliFlag` = `reasonix`
- Workflow + bundled skills written under `.reasonix/skills/<name>/SKILL.md` (YAML frontmatter)
- Sub-agent surface (`trellis-implement`, `trellis-check`, `trellis-research`) is **not** a separate `agents/` directory — those names are emitted as skill folders whose `SKILL.md` carries `runAs: subagent`, replacing the workflow-skill variants of the same names
- No commands directory (slash commands are built into the Reasonix runtime)
- No hooks (`hasHooks: false`, `hasPythonHooks: false`)

The "Agent directory" cell value is intentionally a sentence, not a path, because there is no such directory.

---

## DIFF 2 — Pi Row Annotation (UPDATE)

The current Pi row understates a behavior shipped in 0.6.0-beta.19: the Pi extension exposes a **native `trellis_subagent` tool** with `single`/`parallel`/`chain` dispatch modes and progress cards (see `src/templates/pi/extensions/trellis/index.ts.txt:1395`). The platform map should advertise this so AIs reading the reference do not assume Pi sub-agents are spawned through generic mechanisms.

### BEFORE (line 22)

```markdown
| Pi Agent | `--pi` | `.pi/` | `.pi/skills/` | `.pi/agents/` | `.pi/extensions/trellis/` + `.pi/settings.json` |
```

### AFTER

```markdown
| Pi Agent | `--pi` | `.pi/` | `.pi/skills/` | `.pi/agents/` | `.pi/extensions/trellis/` (native `trellis_subagent` tool) + `.pi/settings.json` |
```

(Single-cell change in the Hooks/extensions column; same edit is folded into DIFF 1's AFTER block above for convenience.)

---

## DIFF 3 — Capability Group: "Trellis Sub-Agent Support" (UPDATE)

Reasonix has `agentCapable: true` and ships sub-agent definitions (as `runAs: subagent` skills). It belongs in this group.

### BEFORE (lines 28–40)

```markdown
These platforms usually have `trellis-research`, `trellis-implement`, and `trellis-check` files:

- Claude Code
- Cursor
- OpenCode
- Codex
- Kiro
- Gemini CLI
- Qoder
- CodeBuddy
- GitHub Copilot
- Factory Droid
- Pi Agent
```

### AFTER

```markdown
These platforms usually have `trellis-research`, `trellis-implement`, and `trellis-check` files:

- Claude Code
- Cursor
- OpenCode
- Codex
- Kiro
- Gemini CLI
- Qoder
- CodeBuddy
- GitHub Copilot
- Factory Droid
- Pi Agent
- Reasonix (delivered as skills with `runAs: subagent` under `.reasonix/skills/`, not as a separate `agents/` directory)
```

### Rationale

Keeping Reasonix in this list preserves the group's semantics (which platforms can spawn Trellis sub-agents). The parenthetical clarifies the unusual file shape so a reader does not go hunting for `.reasonix/agents/`.

---

## DIFF 4 — New Capability Subsection: "Native Trellis Sub-Agent Tool" (ADD)

Pi is currently the only platform exposing a host-side, type-safe `trellis_subagent` tool through its extension API. This is a distinct capability from "platform can spawn sub-agents" and deserves its own callout so AIs know to look at the extension file (not the agent file) when changing dispatch behavior on Pi.

### BEFORE

The `## Capability Groups` section currently has three subsections: `### Trellis Sub-Agent Support`, `### Main-Session Workflow Platforms`, `### Shared `.agents/skills/``.

### AFTER

Insert a new subsection **between** `### Main-Session Workflow Platforms` and `### Shared `.agents/skills/`` (i.e., after line 52, before line 54):

```markdown
### Native Trellis Sub-Agent Tool

Some platforms expose a first-class tool that the host runtime understands. The model calls it like any other tool and the host renders progress cards, validates the agent name against `.<platform>/agents/`, and enforces dispatch modes.

- Pi Agent — `trellis_subagent` tool, defined in `.pi/extensions/trellis/index.ts`. Supports `single` / `parallel` / `chain` dispatch modes and emits live `trellis-subagent-progress` events.

When changing sub-agent dispatch behavior on these platforms, edit the extension file, **not** the agent markdown — the agent markdown defines responsibilities, but the host extension owns dispatch, validation, and progress rendering.
```

### Rationale

- Surfaces `trellis_subagent` so AIs reading the reference know the dispatch entry point on Pi is host code, not prompt scaffolding
- Distinguishes Pi from other `agentCapable` platforms (Claude, Cursor, Codex, etc.) that spawn sub-agents through CLI primitives without a typed tool
- Forward-compatible: if another platform later ships a similar native tool, it can be added to the bullet list without restructuring

---

## DIFF 5 — Sanity Check: No Other Updates Needed

Verified the rest of the file does not need changes for v0.6.0 GA:

- `## Decision Rules When Modifying Platform Files` (lines 58–64) — generic, platform-agnostic, no edits needed.
- `## When Paths Differ` (lines 66–74) — generic guidance, no edits needed.
- Intro paragraph (lines 1–4) — already says "depends on which `trellis init --<platform>` commands the user ran"; covers both new entries automatically.

---

## Summary of Edits

| # | Type | Location | Change |
|---|---|---|---|
| 1 | ADD row | Matrix, after row 22 (Pi Agent) | New `Reasonix` row |
| 2 | UPDATE cell | Matrix row 22 (Pi Agent), `Hooks/extensions` column | Append `(native `trellis_subagent` tool)` |
| 3 | ADD bullet | `### Trellis Sub-Agent Support` list | New `Reasonix` bullet with file-shape clarification |
| 4 | ADD subsection | `## Capability Groups` (between Main-Session Workflow and Shared) | New `### Native Trellis Sub-Agent Tool` subsection naming Pi |
| 5 | none | rest of file | unchanged |

Total: 1 new row, 1 cell update, 1 new bullet, 1 new subsection.

## Open Questions / Caveats

- The Reasonix row uses a sentence (not a path) in the "Agent directory" cell. If the matrix style guide forbids prose in cells, alternative wording: `None (see Skills)`. Recommend the sentence for clarity.
- DIFF 4's subsection placement is a judgment call; placing it after `Trellis Sub-Agent Support` (instead of after `Main-Session Workflow`) is also defensible since it refines that capability. Final placement is a stylistic choice.
- If the rewrite plan wants Pi listed under a broader "Hook/Extension Driven" treatment, that belongs in `overview.md` (Section "Three Platform Integration Modes"), not here. Out of scope for this delta.
