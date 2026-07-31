---
type: "Synthesis"
title: "Selected synthesis: Harness-native FlowStatus"
---

# Selected synthesis: Harness-native FlowStatus

This synthesis records the user-selected direction after the earlier
[ccstatusline-informed status-line synthesis](statusline-synthesis.md). It retains the pinned
[ccstatusline evidence](ccstatusline.md) but supersedes the branded omp segment and
standalone-renderer-first product shape. It selects a design direction; it is not implementation
authorization.

## Decision

Build one shared read-only `FlowStatusSnapshot` and present it through mature Harness-native status
surfaces:

```text
FlowStatusSnapshot
  ├─ Claude Code → ccstatusline FlowStatus widget/provider
  ├─ Codex       → managed $flow-status detail; native footer only when supported
  └─ Oh My Pi    → compact native footer + /flow-status on verified 17.2.1+
```

Claude Code uses ccstatusline as the primary visual product. Its Powerline renderer, themes,
configuration TUI, width handling, separator behavior, caching, and tests remain presentation
infrastructure. The omp-flow change is deliberately small: a bounded provider plus one
native FlowStatus widget. ccstatusline's Custom Command path is explicitly rejected because it
executes a shell string with inherited environment and receives the complete host payload.

There is no visible `OMP`, `omp:`, logo, or Bundle shorthand. One or two Powerline lines are
acceptable. The status line should spend its scarce flow area on sourced task-set counts, the
current bounded task, the explicit current methodology role, honest task-local progress, and
attention.

## Intended effect

```text
 Opus  main*  ctx 42%  $0.37 
 tasks ███░ 3/4  statusline renderer  QbD  task 3/5  ⚠1 
```

At narrow widths:

```text
 Opus  main*  ctx42%  4 tasks · renderer · QbD · 3/5 · ⚠1 
```

The first line is ordinary Harness/workspace/resource context. The same line or optional second
line answers:

- how many tasks are in the current complete source-owned set;
- how many are complete, active, or pending;
- which bounded task is current;
- which explicit assignment role currently positions it in the methodology;
- how far that exact task has advanced when a stable denominator exists; and
- whether fresh attention is required.

## Meaning and ownership

`tasks` means the current bounded task set owned by the Harness or another explicitly accepted
source. It is not the number of task Bundles, files under `work/`, operation receipts, agents ever
spawned, or Markdown checkboxes. Counts render only when the source says the set is complete and
carries a revision and freshness.

The current methodology position is a presentation vocabulary over an explicit assignment role:

| Explicit role | Visible position |
|---|---|
| `executor` | Implement |
| `reviewer` | Review |
| `researcher` | Research |
| `architect` | Design |
| `qbd-auditor` | QbD |
| `planner` | Plan |
| `explore`, `oracle`, `orchestrator` | no position label |

This mapping does not create a lifecycle database or infer phase from Markdown, directories, Git,
or elapsed time. If no current assignment supplies a role, the position is unavailable.

Progress belongs to the exact current task. It requires source identity, task identity, stable
membership or denominator, revision, observation time, and binding to the current assignment.
Task-set completion, native plan progress, context pressure, and mechanical receipt counts remain
different measures. Presentation may draw one clearly labelled bar for the complete task-set
measure by default, or for current-task progress when configured and valid; the other measure
remains a labelled ratio. No overall methodology percentage or ETA is inferred.

## Adapter shape

- **Claude Code:** ccstatusline owns styling and layout. A FlowStatus widget consumes a bounded
  provider result and returns semantic content/presence; it does not duplicate Powerline rendering.
  Task counts remain unavailable until a complete structured `TaskList` baseline exists.
- **Oh My Pi:** upstream 17.2.1 at
  `7a2ced50bea8b97dbab7d9bd579329c4ea704de0` provides keyed native status, command
  registration, and full task-batch progress snapshots. A thin adapter owns only compact
  `flow-status` text and read-only `/flow-status`; unverified versions retain direct CLI detail.
- **Codex:** the adapter capability-probes the installed public surface. It uses a supported native
  provider when available; otherwise the snapshot still powers `$flow-status` drill-down
  without falsely claiming a persistent custom footer.

Adapters do not reconstruct task meaning. Controls remain Harness-native and revalidate current
target, binding, capability, and freshness rather than trusting cached display data.

## Security and portability

The provider uses public structured runtime data and fresh source-owned Harness observations. It
does not parse authored Markdown semantics, scan transcripts, read account or credential stores,
call private usage endpoints, run arbitrary extension commands, or persist semantic history.

Inputs, outputs, caches, deadlines, Windows UTF-8 behavior, source bindings, and stale/error states
remain bounded and testable. Optional presentation failure cannot block the Harness prompt.

The pinned positive and negative native capability evidence is recorded in
[Native Harness flow-status capabilities](native-harness-flow-capabilities.md).

## Documentation and delivery

The durable architecture is also distilled in the project Wiki at
`.omp-flow/wiki/architecture/harness-flow-statusline.md`. README documentation should be
updated when the provider and at least one supported adapter are implemented and verified; until
then it must not claim the feature is available.
