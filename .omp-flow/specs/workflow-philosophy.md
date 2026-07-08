# Workflow Philosophy

> **Purpose**: Define the five core design tenets that govern every aspect of `omp-flow`'s task lifecycle. These principles are not aspirational — they are enforced by the FSM, the CSV pipeline, and the QbD Advisor engine. Violating any of them means the task never reaches execution.

---

## Why These Principles?

`omp-flow` orchestrates AI agents to produce production-quality code autonomously. Without deliberate design constraints, autonomous agents produce:
- **Scope drift**: vague plans that lack hard boundaries expand silently during implementation.
- **Prompt noise**: irrelevant context dilutes agent focus, ballooning token costs and hallucination rates.
- **Undefined quality criteria**: subjective "looks done" gates that cannot be verified programmatically.
- **Unreviewed plans**: architectural flaws discovered during execution, forcing costly rewrites.

The five tenets below are the **antidote** to these failure modes. Each is load-bearing: remove one and the pipeline's correctness guarantee collapses.

---
## 0. Control Plane vs Data Plane Decoupling

### Statement

**Control Flow belongs in structured CSV tables (`tasks.csv`); Detailed Requirements and Instruction Payloads belong in Markdown (`.task/T*.md`).**

### Mechanism

To prevent file bloat (like Trellis's 6-file per task pattern) and avoid CSV escaping nightmares:

1. **`tasks.csv` (Control Plane)**: Holds task ID, status, wave, model tier, and the relative path `taskMd` (`.task/T1.md`). It is the single source of truth for scheduling, progress, and execution status.
2. **`.task/T1.md` (Data Plane)**: Holds multi-line Markdown instructions, pseudocode, edge cases, and Q&A history.
3. **`.task/T1.json` (Check Evidence)**: Holds machine-readable PASS/FAIL verdicts, `tests_run`, `tests_failed`, and `file:line` proof.

This separation guarantees:
- **No CSV escaping hell**: Prompt templates contain quotes, commas, and newlines without breaking CSV RFC 4180 parsing.
- **Compaction resilience**: CSV holds status across turns; `.task/T*.md` holds instructions.
- **Zero context noise**: Subagents read only their assigned `taskMd` + exact `contextFiles`.


## 1. Quality by Design (QbD)

### Statement

**Invest $1 in pre-review design and planning before spending $100 on code that may need to be rewritten.**

### Mechanism

Every task begins with a mandatory **pre-execution audit** (`QbD Advisor`, implemented in `src/core/qbd-advisor.ts`):

1. The `omp-flow-architect` produces `prd.md` and `design.md`.
2. Before any code is written, `auditTaskPlan()` runs an adversarial audit:
   - **Boundary check**: all code falls within `in_scope`; no `out_of_scope` items are implemented.
   - **Consistency check**: `done_when` criteria exist and are measurable; no circular dependencies in `dependsOn`.
   - **Context check**: referenced `contextFiles` paths exist on disk.
3. The audit produces a `QbDVerdict`:
   - `passed: true` — execution may proceed.
   - `passed: false` — a `findings[]` list with `severity` and `summary` is returned; the plan must be revised.

### Cost Multiplier Rationale

| Phase | Relative Cost | Why |
|-------|---------------|-----|
| Plan review (pre-execution) | $1 | Text-only read; no code written; instant feedback |
| Implementation | $20–$40 | Agent time, review loops, potential rework |
| Production fix | $100+ | Regression, migration, user-impact analysis |

A flaw caught at the Pre-Review stage costs **1 unit**. The same flaw caught after shipping costs **100 units**. QbD ensures the low-cost gate is never skipped.

### Enforcement

- `src/core/qbd-advisor.ts` — `auditTaskPlan()` is called by the `S_PLANNING` → `S_DISPATCH` FSM transition.
- **Non-negotiable**: no plan enters execution without passing QbD audit.
- Failure to call QbD before execution is itself a review finding (`high` severity).

---

## 2. Three-Artifact Task Package

### Statement

Every task is defined by exactly **three** unified artifacts: `prd.md` + `design.md` + `tasks.csv`. No task is complete without all three.

### The Artifacts

| Artifact | File | Owner | Contents |
|----------|------|-------|----------|
| **PRD** (Product Requirements Document) | `prd.md` | `omp-flow-architect` | Goal, in-scope, out-of-scope, done-when, open questions |
| **Design** (Technical Design Document) | `design.md` | `omp-flow-architect` | Architecture, modules, interfaces, data flow, boundary contracts |
| **Execution Plan** (CSV Step Manifest) | `tasks.csv` | Task Seed Engine | Atomic steps with `step_id`, `description`, `contextFiles`, `mode` |

### Why CSV for the Step Manifest?

CSV was chosen over JSON, YAML, or Markdown for three reasons:

1. **Diff-friendly**: every row is a line; diffs are atomic and reviewable.
2. **Tool-agnostic**: any spreadsheet editor, `git diff`, or CLI pipe can read/write it.
3. **Column-enforced structure**: missing `contextFiles` or `mode` is syntactically visible as an empty cell — no silent defaults.

### The `tasks.csv` Schema

```csv
step_id,description,dependencies,contextFiles,mode
TASK-001-01,Implement core types,,"src/core/types.ts",code
TASK-001-02,Build parser,01,"src/core/parser.ts;src/core/types.ts",code
TASK-001-03,Write unit tests,02,"tests/unit/core.test.ts;tests/setup.ts",test
```

| Column | Required | Description |
|--------|----------|-------------|
| `step_id` | Yes | Unique step identifier (`TASK-NNN-MM`) |
| `description` | Yes | What this step produces |
| `dependencies` | No | Comma-separated `step_id` prerequisites |
| `contextFiles` | No | Semicolon-separated paths for precision indexing |
| `mode` | No | Step mode: `code`, `test`, `docs`, `review` |

### Lifecycle

```
prd.md ──→ design.md ──→ tasks.csv ──→ (QbD Audit) ──→ execution
```

Each artifact builds on the previous. Skipping an artifact is impossible because the QbD Advisor requires all three to produce a passing verdict.

---

## 3. Precision Context Indexing (`contextFiles`)

### Statement

**Every atomic step receives exactly the context it needs — no more, no less. Zero prompt noise.**

### Problem

Traditional agent systems inject the entire project spec, workspace structure, or full source tree into every prompt. This causes:
- **Token waste**: paying for irrelevant context on every call.
- **Focus dilution**: the agent must sift through noise to find relevant code.
- **Hallucination risk**: conflicting or unrelated context misleads the model.

### Solution

Each row in `tasks.csv` carries a `contextFiles` column — a semicolon-separated list of file paths scoped to that specific step:

```csv
step_id,description,contextFiles
TASK-002-01,Implement CSV adapter,src/core/csv-adapter.ts;src/core/types.ts
```

At execution time, the **CSV Context Injector** (in `src/omp/extension.ts` via `onBeforeAgentStart`):

1. Reads the current row's `contextFiles`.
2. For each path, reads the file content (or a header summary for binary/large files).
3. Injects a `<row-context-files>` XML block into the subagent's prompt:

```xml
<row-context-files>
<file path="src/core/types.ts">
// Existing type definitions...
export interface CSVRow {
  step_id: string;
  description: string;
  // ...
}
</file>
</row-context-files>
```

### Benefits

| Metric | Before (full-context) | After (precision indexing) |
|--------|-----------------------|---------------------------|
| Prompt tokens per step | ~8,000–15,000 | ~1,000–3,000 |
| Agent focus accuracy | ~60% | ~95% (estimated) |
| Context-switch errors | Common | Rare |

### Enforcement

- `src/omp/extension.ts` injects the context; the FSM ensures every step dispatch goes through it.
- Missing `contextFiles` defaults to only the step's own `design.md` and `prd.md` — never the full workspace.
- Large files (>100 KB) are truncated to a 30-line summary with a `[truncated]` marker.

---

## 4. Architecture as Enforcement

### Statement

**Design principles are not convention documents — they are hard gates built into the FSM and the CSV pipeline. The correct path is the only path; there are no "guidelines" that can be silently ignored.**

### How It Works

Every design tenet translates to an enforceable check somewhere in the pipeline:

| Tenet | Enforced By | Where | Violation Behavior |
|-------|-------------|-------|--------------------|
| Plan before code | FSM state ordering | `S_PLANNING` → `S_CONFIRM` → `S_DISPATCH` | Step won't progress; no shortcut |
| Boundary compliance | QbD Advisor `auditTaskPlan()` | `src/core/qbd-advisor.ts` | `QbDVerdict.passed === false`; plan rejected |
| TDD (test before code check) | CSV `mode` column | `tasks.csv` parser | `mode: test` step without prior `mode: code` step flagged |
| Convergent criteria | Grep-verifiable checks | `src/core/convergence-checker.ts` | Vague criteria `[rejected]` at parse time |
| No weasel words | QbD Advisor string scanning | `auditTaskPlan()` findings | `severity: warning` with rejected pattern list |
| Step ordering | `dependencies` + FSM linear advance | `tasks.csv` → FSM | Circular `dependsOn` detected → blocking error |
| Artifact completeness | QbD Advisor file-existence check | `auditTaskPlan()` | Missing `prd.md` / `design.md` / `tasks.csv` → hard fail |

### Weasel-Word Rejection

The QbD Advisor scans `prd.md` and `design.md` for non-verifiable language and flags them:

| Weasel Pattern | Example | Replacement |
|----------------|---------|-------------|
| "should support" | "The system should support CSV export" | Stateless or stateful? How is "support" measured? |
| "when needed" | "Add pagination when needed" | Define the exact threshold (e.g. > 100 rows) |
| "ideally" | "Ideally, the module is reusable" | Remove; either it is required or it is not |
| "consider" | "Consider using streaming" | Either specify streaming or remove |
| "depending on requirements" | "Depending on requirements, add caching" | Decide now or split into a second task |

A finding severity of `critical` is raised for weasel patterns in `done_when` criteria — they make convergence unverifiable.

---

## 5. Human Approval Gate

### Statement

**Never start execution without explicit plan approval from a human.**

### The Decision Gate

After the QbD audit passes, the FSM enters `S_CONFIRM` state. This is a hard gate:

1. **FSM pauses** at `S_CONFIRM` — no automatic transition to `S_DISPATCH` or `S_WAVE_DISPATCH`.
2. **Decision summary is produced**: a `DecisionGateVerdict` containing:
   - Plan overview (from `prd.md` goal)
   - Step count and ordering (from `tasks.csv`)
   - Risk assessment (from QbD findings)
   - Estimated scope and boundary summary
3. **System waits for human input** — one of:
   - `APPROVED` — proceed to dispatch
   - `REJECTED` — return to planning for revision
   - `CONCERNS` — human annotates specific concerns; the plan is adjusted and the gate is re-entered

### Why This Gate Exists

Without a human gate, three failure modes recur:

| Failure Mode | Without Gate | With Gate |
|-------------|--------------|-----------|
| Wrong problem solved | Agent executes against misunderstood requirements | Human catches the mismatch before $100 coding spend |
| Scope explosion | Agent interprets vague boundary as "do everything" | Human confirms hard `out_of_scope` boundaries |
| Missing validation criteria | Agent self-approves with circular reasoning | Human confirms `done_when` is meaningful |

### Decision Gate Flow

```
  ┌─────────────────────────────────────┐
  │           Plan Complete             │
  │  (prd.md + design.md + tasks.csv)  │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │        QbD Advisor          │
  │    (Automated Audit)        │
  │  ┌────────────────────────┐ │
  │  │  Boundary Compliance   │ │
  │  │  Consistency Scan      │ │
  │  │  Context Existence     │ │
  │  │  Weasel-Word Rejection │ │
  │  └───────────┬────────────┘ │
  └──────────────┼──────────────┘
                 │
                 ▼
  ┌──────────────────────────────┐
  │     S_CONFIRM (FSM Gate)    │
  │  ┌────────────────────────┐ │
  │  │  DecisionGateVerdict   │ │
  │  │  Wait for Human:       │ │
  │  │  [APPROVED] [REJECTED] │ │
  │  │  [CONCERNS]            │ │
  │  └────────────────────────┘ │
  └──────────────────────────────┘
           │           │
           ▼           ▼
   ┌──────────┐  ┌──────────┐
   │ Execute  │  │ Revise   │
   │ (DISPATCH)│  │ (PLANNING)│
   └──────────┘  └──────────┘
```

### Enforcement

- The FSM state machine explicitly prohibits transition from `S_PLANNING` to `S_DISPATCH` — the path always goes through `S_CONFIRM`.
- `S_CONFIRM` does not time out or auto-approve at any threshold. It waits indefinitely.
- The `DecisionGateVerdict` is persisted to the task's `task.json` for audit trail.

---

## Quick Reference

| Principle | Core Idea | Enforced By | Violation Signal |
|-----------|-----------|-------------|-----------------|
| **QbD Pre-Review** | Audit design before writing code | `src/core/qbd-advisor.ts` | `QbDVerdict.passed === false` |
| **Three-Artifact Package** | `prd.md` + `design.md` + `tasks.csv` | QbD file-existence check | Missing artifact → hard fail |
| **Precision Context** | Per-step `contextFiles`; zero noise | `src/omp/extension.ts` injector | Full context fallback (degraded but safe) |
| **Architecture as Enforcement** | Design rules = FSM gates + CSV schema | FSM state ordering + validators | Step cannot advance; parse error |
| **Human Approval Gate** | No execution without approval | FSM `S_CONFIRM` | Indefinite wait — no auto-approve |

---

**Related**: [architecture-constraints.md](./architecture-constraints.md) for the FSM state machine that implements these gates; [review-standards.md](./review-standards.md) for how violations in implementation are scored.
