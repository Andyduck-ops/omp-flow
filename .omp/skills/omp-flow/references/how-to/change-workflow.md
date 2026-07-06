# How To: Change Workflow

Modify Ralph FSM phases, insert or remove steps, or change skill routing in the maestro workflow.

**Platform**: OMP native (all platforms that support omp-flow)

---

## Files to Read First

| File | Purpose |
|------|---------|
| `src/core/fsm.ts` | RalphFSMEngine — step lifecycle, `createSession`, `advanceNextStep`, `completeStep` |
| `.omp/skills/omp-flow/SKILL.md` | Documents current FSM states, step stages, and routing |
| `.omp-flow/fsm/ralph-*/status.json` | Runtime session state for the active FSM session |

---

## Common Needs

| Scenario | What to Change | Skill Routing Impact |
|----------|---------------|----------------------|
| Add a new step stage | `createSession()` defaults + step schema in `RalphStep` | New stage name must match a skill or agent type |
| Remove a default step | Delete from the `defaultSteps` array in `createSession()` | No routing change unless the removed step was a gate |
| Insert a step between existing stages | Reorder `defaultSteps` or set `fullScope` on review step | Ensure the new stage's skill resolves to a known agent |
| Change skill for a stage | Edit the `skill` field in the step definition `{index, skill, args, stage, ...}` | Update any routing that maps stage to skill name |
| Add a decision gate | Set `decision` field on the step, route in `completeStep()` | Add handling in the 5-gate taxonomy |
| Change step retry limits | Modify `maxAutoFixIterations` (default 3) | — |

---

## Step-by-Step Modification Procedure

### Step 1: Locate the Default Step Blueprint

The 4 default lifecycle steps are defined in `RalphFSMEngine.createSession()` at `src/core/fsm.ts`:

```typescript
const defaultSteps: RalphStep[] = [
  { index: 1, skill: 'plan', args: '--mode task', stage: 'planning', decision: null, status: 'pending', completion_status: null, retry_count: 0 },
  { index: 2, skill: 'execute', args: '--mode dispatch', stage: 'execution', decision: null, status: 'pending', completion_status: null, retry_count: 0 },
  { index: 3, skill: 'grill', args: '--mode review', stage: 'review', decision: null, status: 'pending', completion_status: null, fullScope: true, retry_count: 0 },
  { index: 4, skill: 'harvest', args: '--mode learn', stage: 'harvest', decision: null, status: 'pending', completion_status: null, retry_count: 0 },
];
```

The core lifecycle stages are: `planning` → `execution` → `review` → `harvest`.

These map to FSM states via `advanceNextStep`:
- `planning` → `S_PLANNING`
- `execution` → `S_DISPATCH`
- `review` → `S_GRILL`
- `harvest` → `S_HARVEST`

---

### Step 2: Add or Remove a Step

**To add a step**, insert a new `RalphStep` object into the `steps` array:

```typescript
{ index: 5, skill: 'deploy', args: '--mode staging', stage: 'execution', decision: null, status: 'pending', completion_status: null, retry_count: 0 }
```

**To remove a step**, delete its entry from `defaultSteps`. If removing the review step, ensure `fullScope` is not referenced elsewhere.

**To change the step order**, reindex manually since `createSession()` auto-assigns `index + 1` from the array position.

---

### Step 3: Add a Decision Gate

To add a quality/decision gate, set the `decision` field on the step:

```typescript
{ index: 3, skill: 'grill', args: '--mode review', stage: 'review', decision: 'quality-gate', status: 'pending', completion_status: null, fullScope: true, retry_count: 0 }
```

Valid gate types (from `DecisionLogEntry.gateType`):
- `quality-gate` — post-execution review, routes through `S_DECISION_EVAL`
- `goal-gate` — post-goal audit, checks goal completion
- `scope-gate` — post-analysis scope check
- `reground-gate` — periodic drift check (every 3 execution steps)
- `structural` — milestone progression

When a decision gate is set, `completeStep()` routes the verdict through `S_DECISION_EVAL` instead of proceeding to the next step directly.

---

### Step 4: Change Skill Routing

Each step's `skill` field determines which agent/skill is dispatched. To route a step to a different skill:

1. Edit the `skill` value in the step definition (e.g., `'grill'` → `'review'`)
2. Ensure a matching skill exists at `.omp/skills/omp-flow-{skill}/SKILL.md` or is handled by `onBeforeAgentStart()`
3. Verify the skill name matches what `advanceNextStep()` expects in its stage → skill mapping

The mapping happens in `advanceNextStep()`:
```
stage 'planning'  → skill matches 'plan' agent
stage 'execution' → skill matches 'execute' agent
stage 'review'    → skill matches 'grill' agent
stage 'harvest'   → skill matches 'harvest' agent
```

---

### Step 5: Update the Core Skill Documentation

After modifying the workflow, update `.omp/skills/omp-flow/SKILL.md`:

```markdown
## FSM Integration

- Core lifecycle: S_PLANNING → S_DISPATCH → S_GRILL → S_HARVEST → S_DEPLOY (NEW)
- `advanceNextStep` maps step `stage` to FSM state: planning→S_PLANNING, execution→S_DISPATCH, review→S_GRILL, harvest→S_HARVEST, deploy→S_DISPATCH
```

---

### Step 6: Verify the Change

1. Run `npx -p typescript tsc --noEmit` — zero errors
2. Create a new session with `fsm.createSession('test-workflow')` and inspect steps
3. Advance through the workflow with `advanceNextStep()` and verify step order
4. If a decision gate was added, verify it routes through `S_DECISION_EVAL`

---

## Checklist

- [ ] Step definition modified in `createSession()`
- [ ] Decision gate set on the appropriate step (if needed)
- [ ] Skill routing updated in `advanceNextStep()` (if stage changed)
- [ ] TypeScript compiles without errors
- [ ] New steps execute in the expected order
- [ ] `.omp/skills/omp-flow/SKILL.md` FSM integration section updated
- [ ] `completeStep()` handles the new gate type (if applicable)
