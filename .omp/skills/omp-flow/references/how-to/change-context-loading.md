# How To: Change Context Loading

Modify what context is injected into subagent prompts, or switch between hook-push and agent-pull modes.

**Platform**: OMP native (all platforms that support omp-flow)

---

## Files to Read First

| File | Purpose |
|------|---------|
| `src/core/context-package.ts` | `ContextPackageBuilder`, `ContextManifestEntry`, `SpecEntry` interfaces |
| `src/omp/extension.ts` | `onSessionStart`, `onToolCall`, `onBeforeAgentStart` — hook push and native task interception points |
| `.omp-flow/scripts/get_context.py` | Python handoff assembler used before native `task` dispatch |
| `.omp-flow/tasks/*/implement.jsonl` | Supplemental JSONL manifest for executor context |
| `.omp-flow/tasks/*/check.jsonl` | Supplemental JSONL manifest for reviewer context |

---

## Two Injection Modes

### Hook Push (Automatic, Always-On)

Extension event handlers inject context blocks directly into the agent prompt at specific lifecycle points:

| Event | Handler | Injects |
|-------|---------|---------|
| `session_start` | `onSessionStart()` | `<omp-flow-context>` block with active task, milestone, phase, FSM state |
| `tool_call` for native `task` | `onToolCall()` | Runs `.omp-flow/scripts/get_context.py` and replaces `assignment` / `prompt` with Role Definition, Global Context, Curated Context, Task Brief, and Local Guidance |
| `before_agent_start` | `onBeforeAgentStart()` | Legacy/secondary agent-start context path for non-native-task contexts |
| `context` | `onContext()` | Recent discoveries as system message (on every LLM call) |
| `session_stop` | `onSessionStop()` | Continuation prompt for next turn |

### Agent Pull (Manual, On-Demand)

Skills read `.omp-flow/` files directly during execution via JSONL manifest entries:

```jsonl
{"file": ".omp-flow/specs/coding-conventions.md", "reason": "Coding style guidelines"}
{"file": ".omp-flow/tasks/TASK-001/prd.md", "reason": "Product requirements for current task"}
```

The `ContextPackageBuilder.buildPackage()` loads these manifest files and assembles a `ContextPackage` with boundary contract, spec rules, and manifest entries.

---

## Common Needs

| Scenario | What to Change | Mode |
|----------|---------------|------|
| Add a static context block to row-bound native task agents | `.omp-flow/scripts/get_context.py` | Native task handoff |
| Add session-start context | `onSessionStart()` in extension.ts | Hook push |
| Add a spec file to executor context | Add `{"file": ..., "reason": ...}` to `implement.jsonl` | Agent pull |
| Add a spec file to reviewer context | Add entry to `check.jsonl` | Agent pull |
| Remove a row-bound context layer | Remove it from `.omp-flow/scripts/get_context.py` | Native task handoff |
| Change which files an agent type reads | Edit the JSONL manifest file for that role | Agent pull |
| Add dynamic context based on agent role | Modify role handling in `onToolCall()` and `.omp-flow/scripts/get_context.py` | Native task handoff |

---

## Step-by-Step Modification Procedure

### Step 1: Decide Push vs Pull

**Use hook push when:**
- The context is dynamic (depends on current FSM state, recent discoveries, wave)
- The context applies to every subagent unconditionally
- The context is computed at runtime (e.g., boundary contract from active task)

**Use agent pull when:**
- The context is static (spec files, reference docs)
- Different agents need different context (executor vs reviewer isolation)
- The context is large (files read on demand, not inlined into the prompt)

---

### Step 2a: Modify Native Task Handoff

To add a new static context block to executor/reviewer/QbD prompts, edit `.omp-flow/scripts/get_context.py` and keep `src/omp/extension.ts` limited to role/row extraction plus process invocation:

```python
sections.append(render_section("omp-flow: My Custom Context", custom_context))
```

To add dynamic context per role:

```python
if role == "architect":
    sections.append(render_section("omp-flow: Planning Context", planning_context))
elif role == "reviewer":
    sections.append(render_section("omp-flow: Review Context", review_context))
```

### Step 2b: Modify Agent Pull (JSONL Manifest)

JSONL manifests are JSON Lines files at `.omp-flow/tasks/{taskId}/{action}.jsonl` where `action` is `implement` or `check`.

**Entry format:**

```jsonl
{"file": "path/to/file.md", "reason": "Why this file is needed"}
{"file": "path/to/dir", "reason": "Reference directory", "type": "directory"}
```

**Add an entry to implement.jsonl:**

```jsonl
{"file": ".omp-flow/specs/error-handling.md", "reason": "Error handling patterns"}
{"file": ".omp-flow/specs/testing.md", "reason": "Testing requirements"}
```

**Add an entry to check.jsonl** (reviewers only):

```jsonl
{"file": ".omp-flow/specs/security.md", "reason": "Security review checklist"}
```

**The `ContextManifestEntry` interface** (from `context-package.ts`):

```typescript
export interface ContextManifestEntry {
  file: string;        // Relative path from workspace root
  reason: string;      // Why this file is being loaded
  type?: 'file' | 'directory';  // Defaults to 'file'
}
```

---

### Step 3: Verify Manifest Loading

The `ContextPackageBuilder.buildPackage()` resolves all manifest entries and includes them in the `ContextPackage.manifest` array:

```typescript
const manifest = this.loadManifest(taskId, 'implement');
const pkg = this.buildPackage(taskId, 'executor');
// pkg.manifest = [{ file: "...", reason: "..." }, ...]
```

To verify:
1. Inspect the parsed `ContextPackage` in a test
2. Confirm all entries from the JSONL are present in `pkg.manifest`
3. Confirm entries with `type: 'directory'` are not excluded

---

## Context Entry Format Reference

### JSONL Manifest Entry

```jsonl
{"file": ".omp-flow/specs/coding-conventions.md", "reason": "Code style and linting rules"}
```

### ContextPackage Context Injection Block

The builder produces a block like:

```
<spec-rules>
- coding-conventions.md: Code style and linting rules
- security.md: Security review checklist
</spec-rules>
```

---

## Testing

1. Add a test entry to an existing JSONL manifest
2. Run `contextPackageBuilder.buildPackage(taskId, role)` — verify entry is loaded
3. Run a subagent dispatch — verify context appears in the prompt
4. For hook push changes: trigger the handler and inspect `ctx.subagentPrompt`

---

## Checklist

- [ ] Determined push vs pull for the new context
- [ ] Hook push: handler method modified in `extension.ts`
- [ ] Agent pull: JSONL manifest created or updated
- [ ] `ContextManifestEntry` format is correct (`file`, `reason`, optional `type`)
- [ ] Manifest loading verified via test or inspection
- [ ] No duplicate entries (idempotency is not enforced per-file — check manually)
