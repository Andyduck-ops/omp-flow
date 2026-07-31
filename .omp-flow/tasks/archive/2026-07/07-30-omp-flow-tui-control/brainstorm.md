---
type: "Brainstorm"
title: "Brainstorm: Design an observable and controllable TUI for omp-flow"
---

# Brainstorm: Design an observable and controllable terminal status line for omp-flow

The current omp-flow workflow is intentionally semantic rather than a Python lifecycle: Markdown
Concepts carry purpose, findings, design, work, handoffs, reviews, and human decisions; the runtime
owns only session/path/actor correlation, locks, atomic operations, and opaque receipts; each
Harness owns native spawn, concurrency, progress, cancellation, identity, and UI.

The desired outcome is a Harness-attached status line that makes meaningful progress legible
without occupying the working terminal. It should be visible while the user works in Claude Code
or Codex, and route any deeper inspection or control back through the current Harness rather than
becoming a second full-screen application. The user accepts one or two lines; the constraint is
information value and hierarchy, not a rigid one-line limit.

The original investigation selected a standalone operator console. On 2026-07-30 the user
corrected that product shape: it was too crowded, lacked a useful progress bar, and misunderstood
“状态栏” as a dashboard. The supplied
[Maestro Flow reference](research/maestro-flow-statusline.md) reframed the task around an embedded,
default-one-line companion surface with progressive disclosure. The later
[ccstatusline reference](research/ccstatusline.md) clarified that this surface also needs the
ordinary terminal-working context developers expect—model, repository/Git state, context budget,
and optional cost or duration—composed with, rather than displaced by, omp-flow status.

## Questions driving investigation

1. Which observable seams already exist in this repository and which state remains available only
   inside each Harness?
2. Which mature Claude Code and Codex terminal projects demonstrate useful patterns for session
   discovery, event streaming, multiplexing, progress, cancellation, approval, and recovery?
3. How should one compact renderer adapt to the different extension surfaces provided by Claude
   Code and Codex?
4. Which progress measures have a real, stable denominator, and how should the line distinguish
   native plan/task progress, mechanical operation counts, and context pressure?
5. Which state belongs on the always-visible line, and which inspection or controls should open
   only through a Harness-native command or compact drill-down?
6. How can omp-flow compose into an existing mature status-line owner such as ccstatusline without
   overwriting it, importing its private transcript/credential dependencies, or duplicating its
   general-purpose widget catalog?

## Working hypotheses

- The status line, not a standalone full-screen TUI, should be the primary product.
- Default output should fit on one line. A second line should appear only for active omp-flow work
  or attention; additional detail belongs behind a command such as `/omp`.
- Progress is plural. A bar is valid only when its label, source, current value, and total have
  defined semantics. A native plan may show `3/7`; operation receipts may show counts; context
  usage may show a separate budget bar. None becomes “overall task 62%.”
- Event provenance, freshness, actor identity, and control capability must be visible so a stale
  snapshot is never mistaken for current control authority.
- The embedded line is display-only. It may advertise `⚠1 /omp`, but attach, open, refresh, or
  interrupt actions belong to a correlated Harness-native command/palette.
- The visible line has four product groups: identity (`model`, project/Bundle), workspace (Git),
  resource (`ctx`, optional cost/duration), and flow (bounded omp-flow
  progress/activity/attention). Profiles and semantic width priority keep those groups legible
  without making every metric permanently visible.
- A Bundle shorthand such as `omp:tui` is not valuable enough for the primary flow position. The
  omp-flow line should instead answer how many bounded tasks exist when a real source owns that
  set, which task is current, what kind of work is happening now, and how far that bounded task has
  progressed.
- No `OMP`, `omp:`, logo, or product-name segment is required. The flow facts should read as
  ordinary status-line information.
- ccstatusline's existing Powerline renderer, themes, width handling, widget configuration, and
  one-to-three-line layout are the selected presentation foundation. omp-flow should add only a
  bounded data provider and the minimum task/current-work/stage/progress/attention widgets or
  Custom Command composition needed to use that foundation; it should not build a parallel visual
  renderer.
- “Stage” must describe a fresh current native assignment role/state (for example research,
  design, implementation, review, or waiting for input), not a Python lifecycle field inferred
  from filenames or Markdown.

## Constraints and non-goals

- No lifecycle database, exact-topology IDs, Evidence ledger, Markdown semantic parser,
  compatibility reader, dual write, custom agent dispatcher, or replacement Harness.
- No direct status-line mutation of task meaning. Authored Concepts remain the durable way to change
  requirements, design, decisions, reviews, and approval.
- Cancellation, approvals, spawn, concurrency, and result delivery remain native to each Harness;
  a shared UI may invoke them only through explicit adapter capabilities.
- The design must remain UTF-8-safe on Windows and useful when one or more Harness integrations are
  unavailable.

## Research links

- [Repository observability and control seams](research/internal-observability-seams.md)
- [Claude Code TUI landscape](research/claude-code-tui-landscape.md)
- [Codex TUI landscape](research/codex-tui-landscape.md)
- [Maestro Flow embedded status-line patterns](research/maestro-flow-statusline.md)
- [ccstatusline widget, renderer, and trust-boundary patterns](research/ccstatusline.md)
- [Selected status-line synthesis](research/statusline-synthesis.md)
- [Superseded operator-console synthesis](research/tui-synthesis.md)

The user explicitly asked to investigate mature alternatives before selecting the design.

## Selected direction after reframing

Use ccstatusline as the primary Claude status-line product and presentation owner. Add bounded
flow-status data through its existing composition seam first; patch native widgets only where
needed for editor-level ordering or Powerline behavior. Do not add visible omp-flow branding.
Current Codex supports a configurable
built-in footer but does not document an arbitrary external status-line item, so Codex-specific
embedding must remain capability-gated and must not be simulated with unsafe terminal cursor
tricks. The same snapshot and renderer can still power a Codex-native command or future supported
footer extension.

The first Powerline line answers “which model/workspace am I in and how much context remains?” The
same line or an optional second Powerline line answers “how many bounded tasks are in the current
sourced task set, which one is current, what work role/state is active, how far that bounded task
has progressed, and does anything need me?” A compact `/omp` drill-down answers “show me the
evidence and available exact actions.”
The rationale and host asymmetry are recorded in the
[selected status-line synthesis](research/statusline-synthesis.md).
