# How To: Change Hooks/Events

Modify OMP hook event bindings, add new EventBus event types, or change handler behavior in the extension.

**Platform**: OMP native (hook system)

---

## Files to Read First

| File | Purpose |
|------|---------|
| `src/omp/extension.ts` | `activateExtension()` — hook bindings; `OMPFlowExtension` — handler methods |
| `src/core/events.ts` | `EventBus` class, `EventKind` type union, event lifecycle |
| `.omp/skills/omp-flow/SKILL.md` | Documents current hook bindings and event use |

---

## OMP Hook Events

The extension currently binds 5 OMP lifecycle events in `activateExtension()` at `src/omp/extension.ts:275-283`:

| Event | Handler | Trigger |
|-------|---------|---------|
| `session_start` | `onSessionStart()` | New session begins |
| `before_agent_start` | `onBeforeAgentStart()` | Agent is about to start |
| `tool_call` | `onToolCall()` | Tool is invoked |
| `agent_complete` | `onAgentComplete()` | Agent finishes execution |
| `session_stop` | `onSessionStop()` | Session turn ends |

All handlers follow the same signature:
```typescript
(ctx: OMPHookContext) => OMPHookContext
```

The `OMPHookContext` interface (from `extension.ts`):

```typescript
export interface OMPHookContext {
  prompt?: string;
  systemPrompt?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  subagentPrompt?: string;
  subagentRole?: string;
  subagentId?: string;
  modelTier?: 'smol' | 'default' | 'slow';
  shouldContinue?: boolean;
}
```

---

## EventBus Event Types

The `EventBus` in `src/core/events.ts` supports 19 event kinds via the `EventKind` union:

| EventKind | Emitted When | Used By |
|-----------|-------------|---------|
| `task_created` | Task directory created | State tracking |
| `task_started` | Task execution begins | State tracking |
| `task_completed` | Task finishes | State tracking |
| `step_advanced` | FSM advances to next step | Decision log |
| `step_completed` | Step reaches completion verdict | Decision log |
| `step_failed` | Step fails beyond retry | Alerting |
| `agent_spawned` | Subagent dispatched | Coordination |
| `agent_completed` | Subagent returns | Coordination |
| `agent_failed` | Subagent errors out | Alerting |
| `message` | Inter-agent IRC message | Coordination |
| `broadcast` | Wave-wide broadcast | Coordination |
| `drift_detected` | Reground gate detects drift | Safety |
| `boundary_violation` | Agent crosses boundary | Safety |
| `readiness_checked` | Pre-execution readiness run | Safety |
| `harvest_completed` | Knowhow harvest done | Learning |
| `session_started` | Ralph session starts | Lifecycle |
| `session_stopped` | Ralph session stops | Lifecycle |
| `finding_recorded` | Finding persisted to disk | Knowledge |
| `context_injected` | Context injected into prompt | Diagnostics |
| `fsm_transition` | FSM state changes | Tracking |

---

## Common Needs

| Scenario | What to Change | Files |
|----------|---------------|-------|
| Bind a new OMP hook event | Add `pi.on('event', handler)` + new handler method | `extension.ts` |
| Add a new EventBus event kind | Add to `EventKind` union + call `eventBus.append()` | `events.ts` |
| Modify existing hook behavior | Edit the handler method body | `extension.ts` |
| Add logic before/after handler | Chain in the handler method | `extension.ts` |
| Add a new event subscriber | Read from `EventBus` via `tail()` or `recentDiscoveries()` | `events.ts` |
| Deactivate a hook binding | Remove (or comment) the `pi.on()` line | `extension.ts` |

---

## Step-by-Step Modification Procedure

### Step 1: Bind a New OMP Hook Event

In `activateExtension()` at `src/omp/extension.ts:275-283`, add the binding:

```typescript
pi.on('context', (ctx) => extension.onContext(ctx));
pi.on('agent_end', (ctx) => extension.onAgentEnd(ctx));
```

Add the handler method:

```typescript
public onContext(ctx: OMPHookContext): OMPHookContext {
  // Read recent discoveries and inject as system message
  const discoveries = this.eventBus.recentDiscoveries(3);

  if (discoveries.length > 0) {
    return {
      ...ctx,
      systemPrompt: (ctx.systemPrompt || '') +
        '\n<recent-discoveries>\n' + discoveries.join('\n') + '\n</recent-discoveries>',
    };
  }

  return ctx;
}
```

### Step 2: Add a New EventBus Event Kind

1. Add the new kind to the `EventKind` union in `src/core/events.ts`:

```typescript
export type EventKind =
  | 'task_created'
  | 'task_started'
  // ... existing kinds ...
  | 'my_new_event';  // Add new event kind
```

2. Emit the event using `eventBus.append()`:

```typescript
this.eventBus.append('my_new_event', {
  key: 'value',
  timestamp: new Date().toISOString(),
}, {
  taskId: taskId,
});
```

### Step 3: Subscribe to Events

Read events from the EventBus:

```typescript
// Get recent events (tail)
const recentEvents = this.eventBus.tail(10);
// Returns OMPFlowEvent[] with kind, data, tags

// Get recent discoveries only
const discoveries = this.eventBus.recentDiscoveries(5);
// Returns string[] of formatted discovery entries

// Get events matching a kind
import { getEventsByKind } from '../core/events.js';
const taskEvents = getEventsByKind(recentEvents, 'task_completed');
```

### Step 4: Modify an Existing Handler

Edit the handler method directly. Example — add logging to `onSessionStop`:

```typescript
public onSessionStop(ctx: OMPHookContext): OMPHookContext {
  const ralph = this.fsm.getStatus();

  console.log('[omp-flow] Session stop:',
    JSON.stringify({ fsmState: ralph.fsmState, status: ralph.status }));

  // ... existing logic ...
}
```

---

## Hook Return Contract

All OMP hook handlers return `OMPHookContext` with these standard fields:

| Field | Purpose |
|-------|---------|
| `shouldContinue` | Whether the runtime should continue processing |
| `prompt` | Modified prompt for the next turn |
| `subagentPrompt` | Modified subagent prompt |
| `modelTier` | Recommended model tier |
| `additionalContext` | Structured context for next turn (session_stop) |
| `decision` | 'block' format for session stop escalation |
| `reason` | Reason for blocking |

---

## Testing

1. Mock `pi.on()` in a unit test and verify the event name
2. For a new handler: call it directly with a mock context and inspect the return
3. For new EventBus events: append + tail, verify event kind and data
4. For modified handlers: verify before/after context differs as expected

---

## Checklist

- [ ] New OMP hook binding added in `activateExtension()` (if applicable)
- [ ] Handler method added to `OMPFlowExtension` class
- [ ] Handler follows `(ctx: OMPHookContext) => OMPHookContext` signature
- [ ] New `EventKind` added to the type union (if new event)
- [ ] `eventBus.append()` called with correct kind and data shape
- [ ] Return contract followed (shouldContinue, prompt as needed)
- [ ] Removing a hook: `pi.on()` line removed, handler method deprecated or removed
- [ ] TypeScript compiles without errors
