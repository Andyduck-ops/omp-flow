# How To: Add Skill or Command

Add a new bundled skill, a project-local (custom) skill, or a slash command to the omp-flow system.

**Platform**: OMP native

---

## Files to Read First

| File | Purpose |
|------|---------|
| `.omp/skills/omp-flow/SKILL.md` | Core skill — pattern for all bundled skills |
| `.omp/skills/omp-flow-executor/SKILL.md` | Example bundled skill layout |
| `src/omp/extension.ts` | Command routing — `/omp-flow:<command>` dispatch |
| `src/tools/` | Tool implementations referenced by commands |

---

## Bundled vs Project-Local Distinction

| Aspect | Bundled Skill | Project-Local Skill |
|--------|--------------|---------------------|
| **Location** | `.omp/skills/omp-flow-{name}/` | `.omp/skills/omp-flow-local/` |
| **Scope** | Shipped with omp-flow, available everywhere | Custom to this project only |
| **Lifecycle** | Updated with omp-flow releases | Maintained by the project team |
| **SKILL.md** | Required — defines trigger, inputs, workflow | Required — documents customizations |
| **Registration** | Installed by `omp-flow:install` | Created manually, must be documented |
| **Documentation** | In omp-flow reference docs | In `omp-flow-local/SKILL.md` changelog |

---

## Common Needs

| Scenario | What to Create | Location |
|----------|---------------|----------|
| New bundled agent skill | `SKILL.md` with triggers, inputs, workflow | `.omp/skills/omp-flow-{name}/` |
| New slash command | Route handler + skill or tool | `src/omp/extension.ts` + skill |
| Project-specific override | Local skill in project | `.omp/skills/omp-flow-local/` |
| New tool for subagents | Tool function + skill docs | `src/tools/` + skill |
| Custom command for one project | Command in omp-flow-local | `.omp/skills/omp-flow-local/SKILL.md` |

---

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Skill directory | `omp-flow-{name}` (kebab-case) | `omp-flow-debugger` |
| Skill name | kebab-case in `name` field | `omp-flow-debugger` |
| Slash command | `/omp-flow:{command}` (camelCase or kebab) | `/omp-flow:brainstorm` |
| Command handler method | `on{Command}()` on extension class | `onBrainstorm()` |
| Tool file | `{name}-tool.ts` | `spec-search-tool.ts` |

---

## Step-by-Step Modification Procedure

### Step 1: Create the Skill Directory

```bash
mkdir -p .omp/skills/omp-flow-{name}/
```

For a project-local skill:

```bash
mkdir -p .omp/skills/omp-flow-local/
```

---

### Step 2: Create SKILL.md

Every skill must have a `SKILL.md` with frontmatter and sections:

```markdown
---
name: omp-flow-{name}
description: |
  One-line description of what this skill does.
  When it should be dispatched.
---

# {Skill Title}

## Trigger

- List conditions that activate this skill
- E.g., slash command, FSM state, hook event

## Inputs

- `.omp-flow/tasks/{taskId}/input-file.md` — what it reads
- `.omp-flow/state.json` — what state it depends on

## Workflow

1. First step
2. Second step
3. Third step

## Outputs

- `.omp-flow/tasks/{taskId}/output-file.md` — what it produces
- Return format: structured JSON or status report

## Boundary Contract

- **In-scope**: What this skill can modify
- **Out-of-scope**: What this skill must not touch
- **Forbidden**: Explicit prohibitions
```

Required frontmatter fields:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier, kebab-case |
| `description` | Yes | What the skill does and when to dispatch |

---

### Step 3: Register a Slash Command (If Applicable)

Add a route in `activateExtension()` at `src/omp/extension.ts`:

```typescript
// In the command dispatch logic (onSessionStart or onToolCall)
if (command.startsWith('/omp-flow:{name}')) {
  return this.on{Name}(ctx);
}
```

Add the handler method to `OMPFlowExtension`:

```typescript
public on{Name}(ctx: OMPHookContext): OMPHookContext {
  // Parse arguments, validate state, execute
  const result = execute{Name}(args);

  return {
    ...ctx,
    shouldContinue: result.continue,
    prompt: result.prompt,
  };
}
```

---

### Step 4: Document in omp-flow SKILL.md

Update the command list in `.omp/skills/omp-flow/SKILL.md`:

```markdown
- `/omp-flow:{name}` → {description}; transition to S_{STATE}.
```

---

### Step 5: Test the Skill

1. Verify the skill file parses correctly (frontmatter + body)
2. For slash commands: invoke the command and verify the correct handler runs
3. Test with an actual subagent dispatch

---

## SKILL.md Template (Bundled)

```markdown
---
name: omp-flow-{name}
description: What this skill specializes in and when to dispatch it.
---

# {Skill Title}

## Trigger

- `/omp-flow:{command}` slash command
- Auto-activates when FSM state is S_{STATE}

## Inputs

- `{input path}` — description

## Workflow

1. {First step}
2. {Second step}

## Outputs

- `{output path}` — description

## Boundary Contract

- **In-scope**: {what it can touch}
- **Out-of-scope**: {what it must not touch}
- **Forbidden**: {explicit prohibitions}
```

## SKILL.md Template (Project-Local)

```markdown
---
name: omp-flow-local
description: Project-specific customizations and overrides.
---

# OMP Flow Local Customizations

## Added Commands

### /omp-flow:my-custom-command
- **File**: `.omp/skills/omp-flow-local/commands/my-custom-command.md`
- **Purpose**: What it does
- **Added**: YYYY-MM-DD
- **Reason**: Why it was added

## Modified Hooks

### onBeforeAgentStart
- **Change**: Added project-specific context
- **File**: .omp/extensions/omp-flow.ts (local copy)
- **Date**: YYYY-MM-DD

## Changelog

| Date | Change | Reason |
|------|--------|--------|
| YYYY-MM-DD | Added `my-custom-command` | Needed for X |
```

---

## Checklist

- [ ] Skill directory created with kebab-case name
- [ ] `SKILL.md` with required frontmatter (`name`, `description`)
- [ ] Trigger conditions documented
- [ ] Inputs, workflow, and outputs fully specified
- [ ] Boundary contract defined (in-scope, out-of-scope, forbidden)
- [ ] Command registered in extension.ts (if new slash command)
- [ ] Command handler method added to `OMPFlowExtension`
- [ ] .omp/skills/omp-flow/SKILL.md updated with new command entry
- [ ] Project-local skills documented in omp-flow-local/SKILL.md
- [ ] Tested with actual invocation
