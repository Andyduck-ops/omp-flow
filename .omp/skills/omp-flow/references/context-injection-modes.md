# Context Injection Modes

omp-flow context injection aims to make AI agents read the right files at the right time instead of relying on model memory. Injection is implemented by the OMP extension (`src/omp/extension.ts`) and Ralph FSM (`src/core/fsm.ts`) working together.

---

## Two Modes of Injection

omp-flow supports two complementary modes for delivering context to agents:

### Mode 1: Hook Push

Extension event handlers inject context directly into agent prompts at specific lifecycle points. Automatic, always-on, zero agent effort.

| Hook | Method | Injected Content |
|------|--------|------------------|
| `onSessionStart` | `OMPFlowExtension.onSessionStart` | `<omp-flow-context>` block: active task, milestone, phase, FSM state, current step index, spec rules, knowhow breadcrumbs, boundary contract. Subsumed by `session_anchor` when available. |
| `onBeforeAgentStart` | `OMPFlowExtension.onBeforeAgentStart` | `session_anchor` XML block (structured grounding: intent, scope, boundary contract, execution progress, goals overview, accumulated signals), prior context, IRC coordination block, discoveries, wave context, verify commands. |
| `onContext` | `OMPFlowExtension.onContext` | Recent discoveries from EventBus (last 3), injected only when new discoveries exist since last injection. Fires on every LLM call, not just session start. |

**Characteristics**:
- Automatic: fires without agent intervention.
- Always-on: active for every subagent spawn.
- Structured: content is wrapped in XML blocks (`<session_anchor>`, `<prior-step-context>`, `<irc-coordination-context>`, etc.).
- Lifecycle-gated: each hook fires at a specific phase (session start, agent spawn, per-turn context refresh).

### Mode 2: Agent Pull

Skills and subagents read `.omp-flow/` files directly during execution. Manual, on-demand, agent decides what to read.

| Source | Access Pattern | Typical Content |
|--------|---------------|-----------------|
| Task files | Read `.omp-flow/tasks/{taskId}/prd.md`, `design.md` | Requirements, design decisions |
| Spec rules | Read `.omp-flow/specs/*.md` | Coding conventions, spec categories |
| Knowhow | Read `.omp-flow/knowhow/harvested-learnings.md` | Patterns, gotchas, architectural insights |
| Research | Read `.omp-flow/tasks/{taskId}/research/*.md` | Domain research, technology scouting |
| Findings | Read `.omp-flow/findings/*.md` | Audit findings from review passes |
| Events | Read `.omp-flow/events/discoveries.ndjson` | Cross-agent discovery board |
| CSV data | Read `.omp-flow/tasks/{taskId}/*.csv` | Structured data for analysis |

**Characteristics**:
- Manual: agent must explicitly read files.
- On-demand: agent pulls only what it needs for its current task.
- Discoverable: agents can use JSONL manifests (see below) to know what to read.
- Portable: works in any platform (Layer 1 persistence).

---

## Context Flow Map

```
                         HOOK PUSH (automatic)
                         =====================

    onSessionStart           onBeforeAgentStart              onContext
    ┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
    │ session_anchor │  ──►  │ session_anchor    │  ──►   │ recent       │
    │ (condensed)   │         │ priorContext       │         │ discoveries  │
    │ boundary       │         │ boundaryContract   │         │ (last 3)     │
    │ active task    │         │ IRC context        │         │              │
    │ phase/milestone│         │ discoveries (5)    │         │              │
    │ spec rules     │         │ wave context       │         │              │
    │ knowhow summary│         │ verify commands    │         │              │
    └──────┬───────┘         └──────┬───────────┘         └──────┬───────┘
           │                        │                             │
           ▼                        ▼                             ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │                        AGENT PROMPT                                  │
    │  (system message + injected context blocks + user intent)            │
    └─────────────────────────────────────────────────────────────────────┘
           ▲                        ▲                             ▲
           │                        │                             │
    ┌──────┴───────┐         ┌──────┴───────────┐         ┌──────┴───────┐
    │ Task PRD     │         │ Spec rules       │         │ Knowhow      │
    │ Design docs  │         │ Spec categories  │         │ Research     │
    │ Research     │         │ Conventions      │         │ Findings     │
    │              │         │                  │         │              │
    └──────────────┘         └──────────────────┘         └──────────────┘
                         AGENT PULL (manual, on-demand)
                         =================================
```

---

## Decision Rule: Which Mode to Use

```
Is the content structured grounding for the agent's work?
+-- YES -> Hook push (Mode 1)
|         - session_anchor (intent, scope, boundary contract, goals)
|         - priorContext (sliding window of completed steps)
|         - IRC coordination (peer list, messaging protocol)
|         - wave context (prior wave findings)
|         - discoveries (recent cross-agent findings)
|         - verify commands (quality checks to run)
|
+-- NO  -> What kind of content?
          +-- Task-specific research/design docs -> Agent pull (Mode 2)
          |   via JSONL manifest {file, reason} entries
          |   * PRD, design, implementation plans
          |   * Domain research, technology scouting
          |   * Audit findings, review output
          |   * Structured CSV data
          |
          +-- Spec rules / conventions -> Agent pull (Mode 2)
          |   * Coding guidelines
          |   * Spec categories
          |   * Architecture decisions
          |
          +-- Knowhow / learned patterns -> Agent pull (Mode 2)
              * Harvested learnings
              * Gotchas and workarounds
              * Pattern libraries
```

---

## JSONL Manifest Format

Agent pull uses JSONL files in the task directory as a manifest. Each line is one context entry:

```jsonl
{"file": ".omp-flow/specs/react/index.md", "reason": "React component conventions"}
{"file": ".omp-flow/specs/backend/api-patterns.md", "reason": "API design patterns"}
{"file": ".omp-flow/tasks/TASK-001/research/auth-flow.md", "reason": "Auth flow research"}
```

Format rules:
- Each line is a standalone JSON object with `file` and `reason` fields.
- Skip seed/comment rows without a `file` field.
- Include only spec, research, and reference files -- never pre-register code files to be modified.
- Agents read files listed in the manifest on startup, before beginning their main work.

---

## Summary

| Aspect | Hook Push (Mode 1) | Agent Pull (Mode 2) |
|--------|-------------------|-------------------|
| Trigger | Extension lifecycle event | Agent reads file explicitly |
| Automation | Automatic, always-on | Manual, agent-decided |
| Content | Structured grounding, summaries | Full document contents |
| Lifespan | Per-session, per-agent-spawn | Per-file, read on demand |
| Platform | OMP native only | All platforms |
| Overhead | Near-zero (pre-built blocks) | File I/O per read |
| Staleness risk | Low (injected per event) | High (agent must re-read) |
