---
type: "Research"
title: "Repository observability and control seams"
---

# Repository observability and control seams

Question: what can an omp-flow TUI observe or control through current repository contracts without
violating semantic/mechanical ownership?

## Scope and conclusion

This is internal research over the canonical workflow, portable Python kernel, Harness resources,
OMP adapter, and focused tests. No external source is needed for these repository-local claims.

The repository exposes two useful but deliberately separate planes:

1. Git-visible Bundle files provide authored navigation and durable semantic evidence.
2. The ignored runtime plus its JSON CLI provide session orientation and coarse operation
   correlation.

Neither plane is a cross-Harness live-control API. The shared kernel can identify a selected task,
list operation receipts, and move an operation from `active` to `completed` or `failed`; it cannot
report token/tool progress, native job state, heartbeats, approvals, or cancellation. OMP and
Claude expose different thin integration points, while the current Codex project resources expose
no repository-owned event adapter. A coherent TUI therefore needs a read-only shared view plus
capability-declared, Harness-native adapters for live observations and controls.

## Facts: portable semantic view

- Task meaning belongs to ordinary Markdown Concepts, placement, prose, and relative links.
  OmpFlow explicitly does not parse headings, lists, filenames, or arbitrary frontmatter into
  workflow state (`templates/.omp-flow/workflow.md:5-15`).
- The root `index.md` is an authored map rather than a complete manifest, and optional directories
  do not encode topology (`templates/.omp-flow/workflow.md:21-40`). A UI may render documents and
  links, but cannot claim that a filename, heading, or link position is a machine phase.
- Handoffs, reviews, audits, and human decisions remain authored Concepts. Python deliberately
  does not project review judgment into row status, and human approval must not become a runtime
  phase or parsed frontmatter (`templates/.omp-flow/workflow.md:154-171`).
- Bundles are Git-visible and portable, whereas runtime records are ignored and non-portable
  (`templates/.omp-flow/workflow.md:67-79`;
  `tests/omp-flow.test.ts:469-496`). This gives a TUI a stable document/navigation surface and Git
  history, not an authoritative percentage-complete signal.

The durable project philosophy reinforces the boundary: links and indexes expose paths through
knowledge, agents interpret semantics, and code owns only mechanical guarantees such as identity,
locking, and atomic effects (`.omp-flow/wiki/philosophy/semantic-knowledge-mechanical-control.md:14-17`;
`.omp-flow/wiki/philosophy/semantic-knowledge-mechanical-control.md:32-45`).

## Facts: portable mechanical snapshots

### Session orientation

- Session identity is resolved from an explicit `OMP_FLOW_CONTEXT_ID`, recognized payload keys, or
  Harness environment variables; the raw identity is reduced to a platform-labelled SHA-256 key
  (`templates/.omp-flow/scripts/common/active_task.py:14-20`;
  `templates/.omp-flow/scripts/common/active_task.py:39-61`).
- Each session has one private JSON pointer at
  `.omp-flow/.runtime/sessions/<context-key>.json`. It contains `current_task`, `context_key`, and
  `updated_at`; resolving it also reports whether the Bundle directory has gone stale
  (`templates/.omp-flow/scripts/common/active_task.py:64-99`).
- `status` is a one-shot JSON snapshot containing the current session's active pointer, Bundle
  locator, and all operations for that task. With no active task, or a stale pointer, it returns no
  operation view (`templates/.omp-flow/scripts/omp_flow.py:45-81`).
- `task current`, `list`, `show`, `select`, and `clear` are public CLI seams. Selection is
  deliberately session-local, and an explicitly requested task must match that session
  (`templates/.omp-flow/scripts/omp_flow.py:32-42`;
  `templates/.omp-flow/scripts/omp_flow.py:251-267`;
  `tests/omp-flow.test.ts:229-237`).

There is no public command that enumerates all live Harness sessions. A process that scans the
ignored session directory could discover implementation-private pointers, but would bypass the
session-scoped CLI contract and couple itself to Python-owned storage.

### Operation correlation

An operation record contains:

- opaque UUID receipt, task, entry and output paths;
- normalized role and caller-supplied actor ID;
- `active`, `completed`, or `failed` state;
- optional completed predecessor;
- optional external-action receipt requirement and value; and
- `created_at` and `updated_at`.

These fields are created atomically in one JSON file per operation
(`templates/.omp-flow/scripts/common/operation_store.py:77-128`). `operation show` and
`operation list` return records, while `operation start` also returns the strict dispatch
assignment. `operation finish` is the only terminal transition
(`templates/.omp-flow/scripts/omp_flow.py:133-216`).

The mechanical guarantees are useful control seams:

- entry and output paths are confined, required entry content must exist, and review predecessors
  must be completed and independently acted (`templates/.omp-flow/scripts/common/operation_store.py:88-110`);
- only the bound actor can finish an active operation, completion can require a native/external
  receipt, and duplicate external receipts fail closed
  (`templates/.omp-flow/scripts/common/operation_store.py:161-195`);
- operation mutation is lock-protected and JSON replacement is atomic
  (`templates/.omp-flow/scripts/common/operation_store.py:30-45`;
  `templates/.omp-flow/scripts/common/io.py:35-53`); and
- archive is blocked while an operation is `active`
  (`templates/.omp-flow/scripts/common/task_store.py:128-140`).

The focused tests exercise session isolation, strict assignment shape, OMP dispatch validation,
duplicate-receipt rejection, archive blocking, and the Git/runtime boundary
(`tests/omp-flow.test.ts:229-277`; `tests/omp-flow.test.ts:341-467`;
`tests/omp-flow.test.ts:469-496`).

### Snapshot limitations

The Python CLI prints one JSON result and exits; failures are stderr plus exit code 2
(`templates/.omp-flow/scripts/omp_flow.py:301-316`). There is no subscribe/watch command, event
cursor, append-only event log, or push channel. Polling `status` or watching atomic file
replacement are possible implementation techniques, but are not streaming contracts.

The record has no Harness name, native session/thread ID, process ID, native job handle, heartbeat,
progress payload, message/tool activity, approval request, cancellation request, or recovery
token. `updated_at` changes on creation and terminalization, not during live work
(`templates/.omp-flow/scripts/common/operation_store.py:112-127`;
`templates/.omp-flow/scripts/common/operation_store.py:175-192`). Consequently:

- `active` means “the mechanical receipt has not been terminalized,” not “the native agent is
  currently running”;
- an old `active` record cannot distinguish slow, disconnected, crashed, or abandoned work;
- `failed` is a terminal receipt state, not proof that a native process was cancelled; and
- no defensible percentage, ETA, or activity indicator can be derived from the shared record.

## Facts: current Harness-specific seams

### OMP extension

The OMP extension receives `session_start`, `tool_call`, `context`, `session_compact`, and
`agent_end` events (`src/omp/extension-entry.ts:25-44`). It can:

- tunnel the native session ID into Python as `OMP_FLOW_CONTEXT_ID`
  (`src/omp/extension.ts:194-207`);
- inject one `status` snapshot at session start/compaction
  (`src/omp/extension.ts:293-312`);
- intercept native `task` calls and reject assignments whose task, role, actor, paths, predecessor,
  or active receipt do not match the operation record
  (`src/omp/extension.ts:240-290`; `src/omp/extension.ts:334-367`); and
- block direct writes to Python-owned runtime paths
  (`src/omp/extension.ts:369-385`).

Counter-evidence to treating this as a live adapter: follow-up message delivery is explicitly left
to the native task/job system, and `agent_end` is currently a no-op
(`src/omp/extension.ts:190-192`; `src/omp/extension.ts:389-400`). The extension validates a native
dispatch boundary but does not publish native progress, completion output, approval, or
cancellation.

### Claude Code hooks

Claude configuration currently registers only:

- `SessionStart` on startup, resume, clear, and compact;
- `PreToolUse` for `Write` and `Edit`; and
- `SubagentStart` for the five managed agent types
  (`templates/claude/settings.json:5-121`).

The session hook tunnels the Claude `session_id`, invokes `status`, and injects that static
orientation (`templates/claude/hooks/session-start.py:26-34`;
`templates/claude/hooks/session-start.py:45-81`). The subagent hook injects verified native
`agent_id`/`agent_type`, but explicitly does not authorize spawn or mutate runtime state
(`templates/claude/hooks/inject-agent-identity.py:2-19`;
`templates/claude/hooks/inject-agent-identity.py:98-110`). The write guard only denies direct
runtime edits (`templates/claude/hooks/protect-runtime.py:19-56`).

No configured Claude hook records subagent progress or stop, translates cancellation, surfaces
approvals, or binds native completion back to an operation. Those capabilities remain Claude
native unless a future thin adapter exposes them.

### Codex

The installed Codex resource set consists of agent TOML files, shared skills, and project config
(`src/cli/init.ts:131-147`). The config only names `AGENTS.md` as a documentation fallback
(`templates/codex/config.toml:1-3`). Unlike Claude, there is no current repository-owned Codex hook
or event adapter in the installed resource set.

Codex can still run the portable CLI because the CLI delegates all workflow commands to
`omp_flow.py` (`src/cli/index.ts:28-35`; `src/cli/index.ts:50-57`). Its native spawn, progress,
message delivery, interruption, and result state remain available only inside the Codex Harness,
not through a repository contract evidenced here.

## Interpretation and recommended direction

### Shared read model

A first TUI can safely compose:

1. authored Bundle navigation and file/Git change observations;
2. session-scoped `status` snapshots obtained with an explicit Harness context identity; and
3. operation records labelled as mechanical receipts, with timestamps and freshness.

The UI should keep “authored knowledge” and “live mechanics” adjacent rather than flattening them.
It should never infer workflow phase, approval, verdict, or percent completion from Markdown or
from an `active` receipt.

### Control capability boundary

The current shared controls have different authority:

| Control | Current portable seam | Safe interpretation |
|---|---|---|
| Select/clear active task | `task select`, `task clear` | Session orientation only |
| Inspect Bundle/operations | `status`, `task show/list`, `operation show/list` | Snapshot read |
| Create operation | `operation start` | Create a guarded assignment receipt; does not spawn |
| Complete/fail operation | `operation finish` by bound actor | Correlate terminal outcome; does not stop a process |
| Archive Bundle | `task archive` | Explicit Git-visible move, blocked by active receipts |
| Cancel/pause/resume agent | None | Must delegate to owning Harness |
| Approve/deny native prompt | None | Must delegate to owning Harness |
| Stream progress/output | None | Must come from owning Harness |

A TUI must not implement “Cancel” by writing `failed` or deleting runtime files. It should offer a
live control only when the owning adapter advertises that exact capability and returns native
acknowledgement. The shared view should expose provenance (`Bundle`, `runtime`, `OMP`, `Claude`, or
`Codex`), observation time, freshness, and capability availability so snapshots are not mistaken
for control authority.

### Architecture implication

The repository evidence supports the brainstorm's hybrid hypothesis:

- a standalone reader can provide a portable cross-Harness view without owning task meaning;
- thin OMP, Claude, and Codex adapters are required for native discovery, progress, approvals,
  cancellation, and recovery; and
- the shared adapter contract should exchange observations and capability-scoped control
  acknowledgements, not introduce a lifecycle database, duplicate Harness scheduler, or persist
  semantic projections.

## Counter-evidence and unresolved questions

- OMP already receives several host events, so it may be the easiest adapter proof point; however,
  the current handlers neither persist nor forward live agent observations.
- Claude already exposes session and subagent-start hooks, but this research does not establish
  which additional current Claude events can support progress, stop, approval, or cancellation.
- Codex native collaboration clearly exists in the running Harness, but no repository source here
  establishes a stable programmatic event/control contract.
- File watching atomic JSON replacement may be practical on Windows, but its latency and rename
  semantics should be verified before it becomes a product contract.
- Native actor-ID stability across restart/reconnect, how a TUI securely acquires each session
  identity, and how stale active receipts are reconciled remain open.

The external Claude and Codex landscape tracks should answer those Harness API questions. Design
should not select concrete controls until those tracks distinguish documented capabilities from
terminal scraping or private storage coupling.
