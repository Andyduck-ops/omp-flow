# OMP Flow Local Skill Template

Copy this template to create a project-specific `omp-flow-local` skill for documenting customizations made to the vanilla omp-flow system.

---

## How to Use

1. Create directory: `mkdir -p .omp/skills/omp-flow-local`
2. Copy the template below to `.omp/skills/omp-flow-local/SKILL.md`
3. Replace `[PROJECT_NAME]` with your project name
4. Update the version and date fields
5. Document each customization as you make it

---

## Template

```markdown
---
name: omp-flow-local
description: |
  Project-specific omp-flow customizations for [PROJECT_NAME].
  This skill documents all modifications made to the vanilla omp-flow system.
  Inherits from omp-flow for base architecture documentation.
  Use this skill to understand what's been customized in this project's omp-flow setup.
---

# OMP Flow Local - [PROJECT_NAME]

## Overview

This skill documents all customizations made to omp-flow in this project. For vanilla omp-flow documentation, see the `omp-flow` skill and `.omp/skills/omp-flow/references/`.

## Base Information

| Field | Value |
|-------|-------|
| OMP Flow Version | X.X.X |
| Date Initialized | YYYY-MM-DD |
| Last Updated | YYYY-MM-DD |

---

## Customizations Summary

Quick reference of what's been modified:

- **Commands**: X added, Y modified
- **Agents**: X added, Y modified
- **Hooks**: X modified
- **Specs**: X categories added
- **Workflow Phases / FSM**: [summary of changes]

---

## Added / Modified Commands

### Added Commands

<!-- Template for new command:
#### command-name
- **Path**: `.omp/commands/command-name.ts` or `.omp/skills/omp-flow-local/commands/command-name.md`
- **Purpose**: [what it does]
- **Registration**: [how it's registered in extension.ts or skill manifest]
- **Added**: YYYY-MM-DD
- **Reason**: [why it was added]
-->

(none yet)

### Modified Commands

<!-- Template for modified command:
#### command-name
- **Path**: [full path to command file or extension registration]
- **Change**: [what was changed]
- **Date**: YYYY-MM-DD
- **Reason**: [why it was changed]
-->

(none yet)

---

## Added / Modified Agents

### Added Agents

<!-- Template for new agent:
#### agent-name
- **Path**: `.omp/agents/agent-name.ts` or `.omp/skills/omp-flow-local/agents/agent-name.md`
- **Purpose**: [what it does]
- **Platform**: [task subagent, FSM-managed agent, standalone]
- **Tools**: [allowed tool set]
- **Added**: YYYY-MM-DD
- **Reason**: [why it was added]
-->

(none yet)

### Modified Agents

<!-- Template for modified agent:
#### agent-name
- **Path**: [full path to agent file]
- **Change**: [what was changed]
- **Date**: YYYY-MM-DD
- **Reason**: [why it was changed]
-->

(none yet)

---

## Modified Hooks

OMP Flow hooks are bound via `pi.on('eventName', handler)` in `src/omp/extension.ts`. EventBus also supports custom events via `EventBus.emit()`.

### Modified Hooks

<!-- Template for hook modification:
#### hook-name
- **Hook Event**: [e.g. session_start, session_stop, before_agent_start, agent_end, context, tool_use, pre_tool_use]
- **File**: [path, e.g. src/omp/extension.ts]
- **Change**: [description of change]
- **Date**: YYYY-MM-DD
- **Reason**: [why it was changed]

**Before** (pseudocode):
```typescript
// original logic
```

**After** (pseudocode):
```typescript
// modified logic
```
-->

(none yet)

---

## Added / Modified Specs

Specs live under `.omp-flow/specs/` and define standards for the project. They are organized by category (e.g., security, conventions, reference).

### Added Spec Categories

<!-- Template for new spec category:
#### Category Name
- **Path**: `.omp-flow/specs/category-name/`
- **Files**: [list of files]
- **Purpose**: [what standards it covers]
- **Added**: YYYY-MM-DD
-->

(none yet)

### Modified Specs

<!-- Template for modified spec:
#### spec-name.md
- **Path**: `.omp-flow/specs/category/spec-name.md`
- **Change**: [what was changed]
- **Date**: YYYY-MM-DD
- **Reason**: [why it was changed]
-->

(none yet)

---

## Workflow Changes

Document modifications to the Maestro FSM phases, step topology, routing rules, skill injection, and wave dispatch logic.

### FSM / Phase Changes

<!-- Template for FSM change:
#### Change Name
- **What**: [e.g. added new phase after 'planning', changed step transition between analyze and execute]
- **Files Affected**: [list, e.g. src/core/fsm.ts, src/omp/extension.ts]
- **Date**: YYYY-MM-DD
- **Reason**: [why the change was needed]
-->

(none yet)

### Task Decomposition / Wave Dispatch

<!-- Template for wave dispatch changes:
#### Change Name
- **What**: [e.g. added parallel wave dispatch for review+test, changed dependency sorting]
- **Files Affected**: [list]
- **Date**: YYYY-MM-DD
-->

(none yet)

### Skill Routing

<!-- Template for skill routing changes:
#### Change Name
- **What**: [e.g. changed skill resolution order, added project-local skill override]
- **Files Affected**: [list]
- **Date**: YYYY-MM-DD
-->

(none yet)

---

## Changelog

Record all changes chronologically, most recent first.

<!-- Template for changelog entry:
### YYYY-MM-DD - Change Title
- [Change 1]
- [Change 2]
- Reason: [why these changes were made]
-->

### YYYY-MM-DD - Initial Setup
- Initialized omp-flow-local skill
- Base omp-flow version: X.X.X

---

## Migration Notes

Document any special steps needed when upgrading omp-flow or integrating customizations with a new version.

<!-- Template:
### Upgrade to omp-flow X.Y.Z
- [ ] Check if custom hook handlers conflict with new hook signatures
- [ ] Merge new FSM step definitions
- [ ] Update custom agent definitions to match new interfaces
- [ ] Verify command registrations
- [ ] Test all modified hooks with the new event payloads
-->

(none yet)

---

## Known Issues

Track any issues with customizations.

<!-- Template:
### Issue Title
- **Status**: Open / Resolved / Workaround
- **Description**: [what's wrong]
- **Root Cause**: [if known]
- **Workaround**: [if any]
- **Related Files**: [list]
- **Opened**: YYYY-MM-DD
- **Resolved**: YYYY-MM-DD
-->

(none yet)
```

---

## Automation Script

To auto-create the skill for a new project, run:

```bash
#!/bin/bash
# create-omp-flow-local.sh

PROJECT_NAME="${1:-$(basename $(pwd))}"
SKILL_DIR=".omp/skills/omp-flow-local"

mkdir -p "$SKILL_DIR"

cat > "$SKILL_DIR/SKILL.md" << 'SKILL'
---
name: omp-flow-local
description: |
  Project-specific omp-flow customizations for PROJECT_NAME_PLACEHOLDER.
  This skill documents all modifications made to the vanilla omp-flow system.
  Inherits from omp-flow for base architecture documentation.
---

# OMP Flow Local - PROJECT_NAME_PLACEHOLDER

## Base Information

| Field | Value |
|-------|-------|
| OMP Flow Version | $(cat package.json 2>/dev/null | grep version | head -1 | cut -d'"' -f4 || echo "unknown") |
| Date Initialized | $(date +%Y-%m-%d) |
| Last Updated | $(date +%Y-%m-%d) |

## Customizations

(none yet — document changes as you make them)

## Changelog

### $(date +%Y-%m-%d) - Initial Setup
- Initialized omp-flow-local skill
SKILL

echo "Created $SKILL_DIR/SKILL.md for project: $PROJECT_NAME"
```
