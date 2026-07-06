# Platform Compatibility Reference

Detailed guide on omp-flow feature availability across AI coding platforms.

---

## Overview

omp-flow is designed primarily for **OMP native** (Oh My Pi runtime) but provides partial support for **CLI execution**. The key differentiator is the **hook system** -- OMP's event-binding mechanism enables automatic context injection, session lifecycle management, and quality enforcement, while CLI execution requires manual setup.

---

## Platform Architecture

```
+-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -+
|                          OMP-FLOW FEATURE LAYERS                                 |
+-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -+
|                                                                                  |
|  +-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- + |
|  |                       LAYER 3: AUTOMATION                                    | |
|  |  OMP hooks, Ralph FSM, Auto-injection, EventBus                              | |
|  |  ---------------------------------------                                     | |
|  |  Platform: OMP native ONLY                                                   | |
|  +-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- + |
|                                    |                                             |
|  +-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- + |
|  |                       LAYER 2: AGENTS                                        | |
|  |  Task subagents, IRC coordination, Wave dispatch                              | |
|  |  ---------------------------------------                                     | |
|  |  Platform: OMP native (full), CLI (partial via `npx omp-flow execute`)       | |
|  +-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- + |
|                                    |                                             |
|  +-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- + |
|  |                       LAYER 1: PERSISTENCE                                    | |
|  |  .omp-flow/ workspace, tasks, specs, knowhow, CSV                             | |
|  |  ---------------------------------------                                     | |
|  |  Platform: ALL (file-based, portable)                                         | |
|  +-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- + |
|                                                                                  |
+-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -+
```

---

## Detailed Feature Breakdown

### Layer 1: Persistence (All Platforms)

These features work on all platforms because they are file-based. Every platform can read and write `.omp-flow/` directory contents directly.

| Feature | Location | Description |
|---------|----------|-------------|
| Workspace state | `.omp-flow/state.json` | Milestone, phase, FSM state, active wave, goals |
| Task system | `.omp-flow/tasks/` | Task tracking, PRDs, design docs, research |
| Spec system | `.omp-flow/specs/` | Coding guidelines, spec rules |
| Knowhow | `.omp-flow/knowhow/` | Harvested learnings, patterns |
| FSM status | `.omp-flow/fsm/ralph-*/status.json` | Session step state, decision logs |
| Event log | `.omp-flow/events/events.jsonl` | Append-only event stream |
| Discoveries | `.omp-flow/events/discoveries.ndjson` | Cross-agent shared discovery board |
| Findings | `.omp-flow/findings/` | Audit findings from review passes |
| Session context | `.omp-flow/sessions/` | Per-session scratch data |
| Active task pointer | `.omp-flow/tasks/.active-task` | Current task slug |
| Boundary contracts | `.omp-flow/fsm/ralph-*/status.json#boundaryContract` | In/out-of-scope constraints |

**CLI/other platform workaround**: Manually read these files at session start. All Layer 1 data is plain JSON/Markdown/JSONL -- no binary formats.

### Layer 2: Agents (OMP Native Full, CLI Partial)

| Feature | OMP Native | CLI (`npx omp-flow execute`) |
|---------|-------------|------|
| Task subagents | Full `task()` subagent dispatch via extension | Manual subagent spawning only |
| IRC coordination | Real-time messaging between parallel agents | Not available |
| Wave dispatch | Automatic wave planning and parallel execution | Single-step execution only |
| Skill routing | FSM maps step stage to skill automically | Must specify skill manually per invocation |
| Prior context injection | `buildPriorContext` sliding window auto-injected | Not available in standalone mode |
| Discoveries propagation | `recentDiscoveries(5)` injected per subagent | Not available |

**CLI workaround**: Run `npx omp-flow execute --step <step-index>` for individual steps. Read `.omp-flow/fsm/ralph-*/status.json` manually to determine what step to run next. There is no subagent orchestration or IRC coordination outside OMP native.

### Layer 3: Automation (OMP Native Only)

| Feature | Dependency | Why OMP Native Only |
|---------|------------|---------------------|
| `onSessionStart` hook | OMP event system | OMP fires session lifecycle events |
| `onBeforeAgentStart` hook | OMP event system | Intercepts agent spawn to inject context |
| `onSessionStop` hook | OMP event system | Controls session continuation |
| `onContext` hook | OMP event system | Injects dynamic context per LLM call |
| `onAgentEnd` hook | OMP event system | Captures completion signals |
| Ralph FSM | `RalphFSMEngine` in-process | Requires OMP extension lifecycle |
| Auto context injection | Hook push via extension | Only OMP provides hook bindings |
| EventBus | In-memory + JSONL persistence | Requires extension runtime |
| Decision gate routing | `S_DECISION_EVAL` state | FSM integration with OMP hook flow |
| Staleness detection | Background timeout check | Requires persistent FSM engine |
| Session pause/resume | `pauseSession`/`resumeSession` | OMP lifecycle management |

**No workaround**: These features fundamentally require OMP native runtime with its hook/event system.

---

## OMP Event Bindings Used

### Activation

```typescript
// src/omp/extension.ts
pi.on('session_start',   (ctx) => ext.onSessionStart(ctx));
pi.on('session_stop',    (ctx) => ext.onSessionStop(ctx));
pi.on('before_agent_start', (ctx) => ext.onBeforeAgentStart(ctx));
pi.on('context',         (ctx) => ext.onContext(ctx));
pi.on('agent_end',       (ctx) => ext.onAgentEnd(ctx));
```

These 5 event bindings enable omp-flow's full automation layer. No other platform currently supports this event model.

### OMP CLI Features

| Command | Purpose |
|---------|---------|
| `npx omp-flow execute` | Run FSM session (single step or full flow) |
| `npx omp-flow status` | Read unified workspace state |
| `npx omp-flow continue` | Resume paused/failed session |
| `npx omp-flow search <query>` | Weighted spec search |
| `npx omp-flow events [--tail N]` | Recent event stream |

---

## CLI Usage Guide

For teams using CLI-only (without OMP native), here is how to get partial omp-flow benefits:

### What Works

1. **Workspace tracking**: `state.json`, tasks, specs, knowhow all work normally.
2. **Task organization**: Task directories and PRDs are standard Markdown/JSON.
3. **Spec reading**: Read `.omp-flow/specs/*.md` at session start.
4. **FSM inspection**: Read `.omp-flow/fsm/ralph-*/status.json` for step state.

### Recommended Workflow

```
1. Session Start
   - Read .omp-flow/state.json for milestone, phase, active wave
   - Read .omp-flow/tasks/.active-task for current task slug
   - Read .omp-flow/specs/ for active spec rules

2. Before Implementation
   - Read .omp-flow/tasks/{taskId}/ for PRD, design docs
   - Check .omp-flow/events/discoveries.ndjson for recent discoveries
   - Review .omp-flow/knowhow/harvested-learnings.md for patterns

3. Execute Step
   - npx omp-flow execute --step <index>
   - Or run the designated skill manually

4. After Step
   - Verify against spec rules
   - Optionally record completion in status.json
```

### What Does Not Work

- No automatic context injection (must read files manually)
- No IRC coordination between parallel agents
- No decision gate routing
- No staleness detection or session pause/resume
- No EventBus discovery propagation across steps

---

## Checking Your Platform

### OMP Native

```bash
# Check OMP version
npx omp --version

# Verify extension is loaded
ls .omp/extensions/omp-flow.ts
```

### CLI Standalone

```bash
# Verify FSM status files exist
ls .omp-flow/fsm/ralph-*/
cat .omp-flow/state.json
```

### Determining Support Level

```
Is OMP extension system available?
+-- YES -> Full omp-flow support (OMP native)
+-- NO  -> Partial support only
         +-- Can read files -> Layer 1 works
         +-- Has task subagent system -> Layer 2 partial
```
