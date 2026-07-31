---
type: "Synthesis"
title: "Selected synthesis: an omp-flow status line"
---

# Selected synthesis: an omp-flow status line

This synthesis combines the repository and Harness evidence with the user-supplied
[Maestro Flow investigation](maestro-flow-statusline.md) and later
[ccstatusline investigation](ccstatusline.md). It supersedes the earlier
[operator-console synthesis](tui-synthesis.md). It selects a revised direction for design; it does
not authorize implementation.

## Decision

Make an embedded, read-only status line the primary omp-flow visualization. The visible product
combines ordinary terminal-working context—model, project/Git, context budget, and optional
cost/duration—with one bounded omp-flow segment. Default output is one compact line. A second line
appears only in the expanded profile for active omp-flow work or attention. Deeper
evidence and exact controls open through an installed Harness-native status Skill or direct
status-inspector CLI; a standalone full-screen console is not the default product.

The shared product is a bounded snapshot and renderer, not a universal terminal host:

- Claude Code uses its documented command status-line contract and supplies native session data on
  stdin. If another renderer such as ccstatusline already owns that slot, it remains the compositor
  and calls the bounded omp-flow segment; omp-flow does not replace it. Supported composition
  gives the segment an explicit allocation, matches the outer Custom Command width cap, permits at
  most one outer graphical bar, and renders omp work progress as a ratio rather than a second bar.
- Codex uses its native footer only to the extent the installed version exposes a supported
  extension. Current Codex documentation exposes selection and ordering of built-in footer items,
  not an arbitrary external command item. Until that changes, omp-flow detail is reached through
  the repository-installed `omp-flow-status` Skill, explicitly invoked as `$omp-flow-status`, or
  through `omp-flow status inspect`; not cursor manipulation, screen scraping, or a claimed
  persistent footer.
- Both Harnesses may use the same segment model, compaction rules, provenance, and action routing
  even when their presentation surfaces differ.

## Intended visible effect

The line should be readable in under a second. The recommended compact profile is:

```text
Opus │ test2@main* │ ctx 42% │ omp:tui ███░░ 3/5 ⚠1
```

This exposes identity, workspace, resource pressure, and flow without turning each into a separate
dashboard panel. `3/5` is a provider-native plan denominator, not a claim that the whole omp-flow
task is 60% complete. `main*` is Git state, not workflow progress.

At wider widths the standard profile may add change counts, cost, duration, and activity:

```text
Opus 4.1 │ test2 main* +342 -87 │ ctx 42% │ $0.37 18m │ omp:tui ██████░░░░ 3/5 ⚠1
```

The expanded profile may use a conditional second line so generic host facts and omp-flow detail
do not compete:

```text
Opus 4.1 │ test2 main* │ ctx 42% │ $0.37 18m
omp:tui-statusline │ plan ██████░░░░ 3/5 │ ↻ researcher 42s │ ops ✓8 ↻1 ✕1 │ ⚠1
```

When no bounded work source exists, `ctx` may own the single graphical bar. Its percentage is
whole context used—fill increases toward 100% pressure—and is never work completion. At narrow
widths it
drops optional cost, token/rate-limit detail, Git counts, and activity prose before blocking
attention, Bundle identity, or one honest progress fact. The action hint may disappear below 100
columns; the attention count remains the cue. `+N` discloses only capped attention/activity detail,
not normal profile omissions.

## Progress semantics

Progress is a typed, source-owned measure:

| Visible measure | Allowed source | Meaning |
|---|---|---|
| `plan 3/5` with a bar | Live Codex app-server `turn/plan/updated` for one exact thread/turn | Provider-completed current plan items out of that event's complete plan |
| `ops ✓8 ↻1 ✕1` without an overall bar | Portable runtime receipts | Mechanical receipt counts, not acceptance or semantic completion |
| `ctx 42%` with a bar only when no work bar is eligible | Current host-provided context metric normalized to whole percent used | Context pressure, not work progress; fill grows as use increases |
| `⚠2` | Fresh correlated observations | Items needing attention, not remaining work |

A bar requires a nonzero total, current value within bounds, a label, a source, a scope/revision,
and freshness. A Codex plan beside a Bundle additionally requires a current matching
task/receipt/actor binding. In standalone output exactly one graphical bar may render: a valid
Codex plan wins and context becomes numeric; without a valid work plan, context may own the bar.
In supported composition output omp progress is ratio-only and the reviewed outer profile owns
zero or one graphical bar. If the source becomes stale, loses its denominator, binding, or scope,
the bar is
removed or marked unknown rather than frozen as current. Markdown contents, paths, filenames,
links, Git changes, receipt age, and terminal output never supply a percentage.

## Status-line content budget

The normative retention priority, independent of left/right visual order, is:

1. blocking state and stale or disconnected provenance;
2. selected Bundle identity;
3. one selected bounded progress or activity fact;
4. model;
5. branch/dirty state;
6. numeric context;
7. warning attention;
8. operation summary;
9. current correlated activity detail;
10. an action hint when attention exists and width is at least 100 columns;
11. optional cost, duration, token, rate-limit, and detailed Git enrichment.

The exact 160/120/100/80/60/unknown-column eligibility and line allocation is the
[Design retention matrix](../design.md#flow-status-widget). This synthesis does not
define a competing compaction order.

The compact profile is the default; standard and expanded are explicit preferences. The renderer
uses a small categorized segment manifest, semantic empty/degraded states, measured display width,
and separator repair. It is not a general-purpose clone of ccstatusline's widget universe.

## Control model

The line itself does not intercept keys, approve requests, or mutate workflow meaning. It advertises
attention and the installed host hint (`/omp-flow-status` for Claude when probed,
`$omp-flow-status` for Codex), with `omp-flow status inspect` as the direct CLI entry.

The Skill-routed/direct inspector is deliberately small:

- open the selected Bundle or active entry/output Concept;
- show provenance and freshness for the active measure;
- preview or attach/focus a correlated native target when the Harness advertises that capability;
- request an exact native interrupt when the adapter proves the target and verb; and
- explain why an action is unavailable.

There is no generic cancel. Process stop remains distinct from native interrupt. Human QbD approval
continues to be recorded by the normal coordinator as a linked Concept after an explicit human
decision; a decorative bar or key press is not approval evidence.

## Data and performance boundary

Each render consumes host input plus a small, reconstructable, ephemeral snapshot. It renders once
and exits. Expensive Git or adapter queries use a short documented cache or a background producer;
the render hot path does not crawl the Bundle, parse Markdown semantics, scan private transcripts,
or query every native session.

Every live segment retains internal source, observed time, freshness, and exact binding even when
the compact text omits those fields. Expected-but-stale data renders a degraded marker. Renderer
failure must never break the Harness prompt.

No lifecycle database, workflow phase model, durable event ledger, transcript index, exact
topology, or compatibility reader is added. The cache is ignored, bounded, replaceable, and cannot
become task knowledge.

Model, context, cost, duration, token, and rate-limit values come only from documented host input
or an explicitly accepted adapter. The renderer does not parse transcript JSONL, scan session
directories, read account or credential files, call private OAuth endpoints, or use Git/context/
cost as a work-completion denominator.

## Why this direction wins

| Direction | Result |
|---|---|
| Standalone operator console | Too visually heavy for continuous use and not what the user requested; retain only as a possible later drill-down. |
| Always-expanded multi-line HUD | Recreates the crowding problem and competes with the prompt. |
| One overall omp-flow percentage | Has no honest denominator across research, human decisions, implementation, and review. |
| Terminal cursor overlay or PTY scraping | Fragile across Codex/Claude versions, alternate screens, resize, Windows, and prompts. |
| Rebuilding ccstatusline's full generic widget editor | Duplicates a mature optional compositor and expands omp-flow beyond product-specific status. |
| **Existing compositor or standalone fallback plus bounded omp segment and command drill-down** | Always visible, low interruption, real bounded progress, coexistence with model/Git/context status, and controls remain with the owning Harness. |

## Evidence boundaries and residual risks

- Claude Code officially supports a custom command status line, multiple output lines, ANSI color,
  refresh intervals, and host session/context fields:
  [Claude Code status-line documentation](https://code.claude.com/docs/en/statusline).
- Codex currently supports `/statusline` and `tui.status_line` for built-in footer fields, while
  `/title` includes built-in task progress. The public surface does not establish third-party
  footer items:
  [Codex CLI slash commands](https://learn.chatgpt.com/docs/developer-commands.md?surface=cli).
- Codex does establish repository-installed Skills and explicit `$skill-name` invocation, which is
  the supported first-release drill-down extension:
  [Codex Skills](https://learn.chatgpt.com/docs/build-skills).
- Claude Code likewise discovers project Skills and invokes them as `/skill-name`:
  [Claude Code Skills](https://code.claude.com/docs/en/slash-commands).
- Maestro proves the Claude render-and-exit shape and compact progress patterns, but its persistent
  workflow schema, private todo read, unchecked bridge age, and silent omission are not acceptable
  omp-flow contracts.
- ccstatusline proves the richer generic segment catalog, measured-width/flex composition,
  empty-separator repair, short caches, configuration preview, and Windows-specific handling.
  Its transcript parsing, account/credential reads, private usage API, and arbitrary shell widget
  are evidence boundaries, not dependencies for omp-flow.
- A shared persistent Codex embedding remains gated on an official extension point or a separately
  accepted terminal-host design. The first design must describe this asymmetry plainly rather than
  promise visual parity it cannot deliver.
- Status-line installation must not silently overwrite an existing user status-line command. The
  first release installs only an empty Claude slot and leaves occupied configuration unchanged;
  existing renderers—including ccstatusline through an explicitly configured custom-command
  widget—can manually call the bounded ratio-only `--segment` output. Supported ccstatusline
  composition uses matching explicit `--width` and `maxWidth`, validates the final composed line,
  and reports profiles with multiple outer bars as needing configuration. The omp command
  allowlists supported stdin fields, ignores private path/credential-like fields, emits bounded
  output, and never executes an extension command of its own.
