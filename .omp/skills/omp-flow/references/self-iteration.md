# OMP-Flow Self-Iteration Guide

How to maintain skill documentation when customizing omp-flow.

---

## Core Principle

**Every omp-flow modification MUST be documented in the appropriate skill.**

```
Modification to project's omp-flow setup -> Update omp-flow-local (project skill)
Modification to omp-flow itself          -> Update omp-flow (core skill)
```

---

## Decision Tree

```
Is this a modification to omp-flow?
|
+-- YES: What kind?
|   |
|   +-- Project-specific customization
|   |   +-- Update .omp/skills/omp-flow-local/SKILL.md
|   |
|   +-- Bug fix to core omp-flow
|   |   +-- Update src/ (upstream)
|   |   +-- Update .omp/skills/omp-flow/SKILL.md if behavior visible to agents
|   |
|   +-- New feature to core omp-flow
|       +-- Update src/
|       +-- Update .omp/skills/omp-flow/SKILL.md with new commands/behaviors
|       +-- Update references/ if new patterns or guides are added
|
+-- NO: Just using omp-flow
    +-- No skill update needed
```

---

## Self-Iteration Workflow

### Step 1: Before Making Changes

```bash
# Check if project-local skill exists
ls .omp/skills/omp-flow-local/SKILL.md

# If not, create it from template
mkdir -p .omp/skills/omp-flow-local
# Copy template from .omp/skills/omp-flow/references/omp-flow-local-template.md
```

### Step 2: Make the OMP-Flow Modification

Do your work: add a tool, modify a hook, change the FSM, register a slash command, etc.

### Step 3: Document in Project Skill

Open `.omp/skills/omp-flow-local/SKILL.md` and:

1. **Find the right section** (Customizations Summary, Commands, Agents, Hooks, Specs, Workflow)
2. **Add entry using the appropriate template** (see Documentation Templates below)
3. **Update changelog**
4. **Update summary counts** at the top of each section

### Step 4: Verify Documentation

Ask yourself:

- [ ] Would another AI (or human) understand what was changed?
- [ ] Is the "why" documented (not just the "what")?
- [ ] Are affected files listed with paths?
- [ ] Is the date recorded?
- [ ] Are migration notes added if the change breaks backward compatibility?

---

## Documentation Templates

### New Command

```markdown
#### /omp-flow:my-command
- **File**: `.omp/commands/my-command.md`
- **Purpose**: Brief description of what it does
- **Added**: 2026-07-05
- **Reason**: Why this command was needed

**Usage**:
/omp-flow:my-command [args]

**Routing**:
- Delegates to `omp-flow-my-skill` skill
- Handles arguments: `[intent]`, `--flag`
- Emitted events: `my_command_dispatched` (EventBus)

**Example**:
User asks "..." -> Command dispatches executor subagent
-> Output written to `.omp-flow/tasks/{taskId}/my-output.md`
```

### New Agent

```markdown
#### my-agent
- **File**: `.omp/agents/my-agent.md`
- **Purpose**: What this agent specializes in
- **Tools**: Read, Write, Edit, Bash, Glob, Grep, Eval
- **Model**: default
- **Added**: 2026-07-05
- **Reason**: Why this agent was needed

**Context Injection**:
- Added to `OMPFlowExtension.activateExtension()` hook bindings at line X
- Receives session_anchor XML block in `onBeforeAgentStart`

**Invocation**:
task(subagent_type="my-agent", prompt="...")
```

### Hook Modification

```markdown
#### OMPFlowExtension
- **Hook Event**: `onBeforeAgentStart` (src/omp/extension.ts:98)
- **Change**: Added injection for `my-agent` context block
- **Lines Modified**: 120-148
- **Date**: 2026-07-05
- **Reason**: Support new agent type with custom context

**Code Changes**:

```typescript
// Added context builder
private buildMyAgentContext(status: RalphStatus): string {
  return `<my-agent-context>...</my-agent-context>`;
}

// Called in onBeforeAgentStart after session_anchor
if (agentType === 'my-agent') {
  blocks.push(this.buildMyAgentContext(status));
}
```
```

### Spec Category Addition

```markdown
#### security/
- **Path**: `.omp-flow/specs/security/`
- **Purpose**: Security guidelines for the project
- **Files**:
  - `index.md` - Category overview
  - `auth-guidelines.md` - Authentication patterns
  - `input-validation.md` - Validation requirements
- **Added**: 2026-07-05
- **Reason**: Project requires security-focused development
- **SpecLayer**: project (project-local specs, survives upgrades)

**JSONL Integration**:
{"file": ".omp-flow/specs/security/index.md", "reason": "Security guidelines"}
```

### Workflow Change

```markdown
#### Custom FSM Phase
- **What**: Added research phase between planning and execution
- **Files Affected**:
  - `src/core/fsm.ts` (FSMState enum, advanceNextStep)
  - `.omp/skills/omp-flow/SKILL.md` (FSM Integration section)
- **Date**: 2026-07-05
- **Reason**: All tasks in this project need upfront research

**New FSM Flow**:
S_PLANNING -> S_RESEARCH -> S_DISPATCH -> S_GRILL -> S_HARVEST

**New FSMState**:
```typescript
'S_RESEARCH' as const
```

**Event Emission**:
- `fsm_transition` emitted on S_RESEARCH entry/exit
```

---

## Changelog Format

```markdown
### 2026-07-05 - Feature: Custom Research Phase
- Added S_RESEARCH FSM state between S_PLANNING and S_DISPATCH
- Modified src/core/fsm.ts: FSMState enum, advanceNextStep routing
- Updated .omp/skills/omp-flow/SKILL.md: FSM Integration section
- Reason: Project complexity requires upfront research before dispatch

### 2026-07-04 - Bugfix: Hook Timeout
- Increased onBeforeAgentStart timeout guard from 10s to 30s
- Modified src/omp/extension.ts: line 201
- Reason: Complex context package builds were timing out on large projects

### 2026-07-03 - Initial Setup
- Initialized omp-flow-local skill
- Base omp-flow version: 0.6.0
```

---

## Multi-Project Scenario

When working with multiple omp-flow projects:

```
~/projects/
+-- project-a/
|   +-- .omp/skills/omp-flow-local/   # Project A customizations
+-- project-b/
|   +-- .omp/skills/omp-flow-local/   # Project B customizations
+-- project-c/
    +-- .omp/skills/omp-flow-local/   # Project C customizations

.omp/skills/omp-flow/                 # Core skill (vanilla omp-flow, via git)
```

**Each project has its own `omp-flow-local`** documenting that project's specific customizations.

**The core `omp-flow` skill is shared** and documents vanilla omp-flow (from the repository).

---

## Upgrade Workflow

When upgrading omp-flow to a new version:

### 1. Review New Version Changes

```bash
# Compare new core skill with current
diff -r .omp/skills/omp-flow/ \
        ./new-omp-flow/.omp/skills/omp-flow/
```

### 2. Check for Conflicts

Review each customization in `omp-flow-local`:

- Does the new version include this feature natively?
- Does the new version break this customization?
- Can this customization be simplified or removed?

### 3. Merge Carefully

```bash
# Backup current core skill
cp -r .omp/skills/omp-flow .omp/skills/omp-flow.backup

# Update core skill
cp -r ./new-omp-flow/.omp/skills/omp-flow/* .omp/skills/omp-flow/
```

### 4. Update Project Skills

Add migration note to `omp-flow-local`:

```markdown
### 2026-07-05 - Upgraded to omp-flow 0.7.0
- Updated core skill to 0.7.0
- Kept custom `security-scan` command (not in vanilla)
- Migrated `my-agent` to new context injection format
- Removed `old-hook` customization (now in vanilla)
```

---

## AI Instructions

When an AI modifies omp-flow, it MUST:

1. **Check** if `omp-flow-local` exists in the project
2. **Create** it from template if missing (see `omp-flow-local-template.md`)
3. **Document** the change immediately after making it
4. **Update** the changelog with date, description, and reason
5. **Verify** the documentation is complete

**Never** modify `.omp/skills/omp-flow/` for project-specific changes.

**Always** tell the user what was documented.

Example AI response:

> "I've added the `/omp-flow:deploy` command and documented it in `.omp/skills/omp-flow-local/SKILL.md` under the Commands section."
