---
type: "Research"
title: "Maestro Flow embedded status-line patterns"
---

# Maestro Flow embedded status-line patterns

Question: what does the current `catlog22/maestro-flow` implementation demonstrate about an
embedded Claude Code or Codex status line, progress, hooks, snapshots, refresh, compactness, and
interaction—and which parts are relevant to an omp-flow status bar that must not become a
full-screen console or a second workflow model?

## Source record

- Upstream: `https://github.com/catlog22/maestro-flow.git`
- Default branch at inspection: `master`
- Exact revision: `52a4778c042da72608ccf0f633f0266b3b0d89dc`
- Package version: `0.5.59`
- Revision timestamp: `2026-07-30T14:41:21+08:00`
- Inspected: 2026-07-30
- Acquisition cache: `.omp-flow/cache/repos/maestro-flow/` (ignored, not task knowledge)

All code links below are pinned to that revision. This Concept separates observed implementation
facts from interpretation; the repository's prose documentation is treated as secondary to its
code and tests where they disagree.

## Selected conclusion

Maestro Flow provides a useful proof that a high-density, output-only status surface can live
inside Claude Code without taking over the terminal. Claude Code invokes a short-lived command
after interactions, passes a native session snapshot on stdin, and renders ANSI stdout. The
command combines native invocation data with small, best-effort repository and temporary-file
reads, conditionally omits unavailable segments, and defaults to one information line plus an
optional workflow line.

Its strongest reusable patterns for omp-flow are:

- let the Harness own placement and refresh timing;
- render a fresh, bounded projection and exit rather than run another terminal application;
- show several small, source-specific measures instead of one invented percentage;
- prioritize active and failed work, cap inline detail, and disclose hidden items with `+N`;
- trade a small, explicit freshness window for expensive reads on the hot render path; and
- degrade by omitting a segment rather than breaking the Harness prompt.

The source also exposes boundaries omp-flow should tighten. Maestro's status line reads and
interprets its own workflow schema, while omp-flow must not infer semantic state from authored
Markdown. Its coordinator bridge carries an update timestamp but the status-line reader does not
check its age, and widespread silent failure gives no visible provenance or degraded-state cue.
The implementation is non-interactive: it displays state but exposes no status-line controls.

At this revision there is no equivalent persistent Codex embedded status line. Maestro installs
Codex lifecycle hooks and may attach transient `statusMessage` text to a hook invocation, but its
dedicated `maestro-statusline` installation path writes only Claude Code's `statusLine` setting.
That makes the Claude design a product pattern, not evidence of a portable cross-Harness status
API.

## Facts: embedding and refresh lifecycle

The package publishes `maestro-statusline` as a separate executable, whose entire entry point is
to load the compiled status-line module and call `runStatusline`
([`package.json` lines 13-17](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/package.json#L13-L17);
[`bin/maestro-statusline.js` lines 1-4](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/bin/maestro-statusline.js#L1-L4)).

Claude installation writes:

```json
{
  "statusLine": {
    "type": "command",
    "command": "maestro-statusline"
  }
}
```

The implementation detects and installs that field in Claude settings, while ordinary hook
installation deliberately leaves it opt-in
([`src/commands/hooks.ts` lines 292-331](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/commands/hooks.ts#L292-L331);
[`src/commands/hooks.ts` lines 334-356](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/commands/hooks.ts#L334-L356)).
The guide describes the refresh contract as Claude Code passing JSON after each interaction and
rendering the command's ANSI stdout
([status-line guide lines 21-44](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/docs-site/src/content/docs/en/guides/statusline-guide.md#L21-L44)).

`runStatusline` accumulates stdin, parses one JSON value, writes one formatted result, and exits.
A three-second timeout prevents a stuck renderer; the explicit post-flush exit was added because
lingering handles had left status-line processes alive for hours
([`src/hooks/statusline.ts` lines 817-838](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L817-L838)).
There is no key handling, focus, modal, attach, approval, pause, or cancellation path in this
renderer. Its interaction model is strictly Harness refresh in, formatted text out.

## Facts: compact layout and information hierarchy

The native input contributes model, working directory, session ID, remaining context, token
counts, and changed-line counts
([`src/hooks/statusline.ts` lines 37-50](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L37-L50)).
The formatter supplements that snapshot with current workflow state, coordinator bridge, Claude
todo, teammate activity, and Git status. Empty optional values simply do not create segments
([`src/hooks/statusline.ts` lines 719-774](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L719-L774)).

Compact layout is the default. It merges:

1. model, coordinator, current task, and team; then
2. directory/Git, token and line counts, and context usage

into one pipe-separated line. If workflow data exists, a second line shows the workflow header
and selected work items. Expanded layout puts the two segment groups on separate lines and the
workflow on a third
([`src/hooks/statusline.ts` lines 711-718](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L711-L718);
[`src/hooks/statusline.ts` lines 776-815](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L776-L815)).
Layout is selected explicitly by environment or Maestro configuration; the default is compact
([`src/hooks/constants.ts` lines 11-53](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/constants.ts#L11-L53)).

Work-item compactness is not only visual. Completed items older than 48 hours are dropped, all
items are ranked `in_progress`, `failed`, `completed`, then `pending`, and at most three are
rendered. The line shows `+N` when expiry or the cap hides more
([`src/hooks/statusline.ts` lines 637-705](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L637-L705);
[`src/hooks/statusline.ts` lines 801-809](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L801-L809)).
Teammate activity independently uses a 30-minute activity window, a three-person inline cap, and
the same `+N` disclosure pattern
([`src/hooks/statusline.ts` lines 458-465](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L458-L465);
[`src/hooks/statusline.ts` lines 501-530](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L501-L530)).

The visual test is a scenario generator rather than a checked terminal snapshot: it duplicates
segment structure into an HTML preview with minimal, workflow, full, critical-context, and
no-context cases
([`src/hooks/__tests__/statusline-visual-test.ts` lines 1-8](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/__tests__/statusline-visual-test.ts#L1-L8);
[`src/hooks/__tests__/statusline-visual-test.ts` lines 47-99](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/__tests__/statusline-visual-test.ts#L47-L99)).
Behavioral tests do exercise canonical run progress rendering, but the inspected chain test covers
only a small subset of the filtering and layout claims
([`src/hooks/__tests__/statusline-chains.test.ts` lines 59-99](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/__tests__/statusline-chains.test.ts#L59-L99)).

## Facts: progress is plural, local, and bounded

Maestro does not render one overall completion percentage. It uses several measures with
different meanings:

- **Context pressure:** a fixed ten-cell bar and integer percentage. Remaining context is
  normalized after subtracting Claude Code's 16.5% autocompact reserve
  ([`src/hooks/statusline.ts` lines 91-103](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L91-L103);
  [`src/hooks/constants.ts` lines 55-62](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/constants.ts#L55-L62)).
- **Coordinator position:** completed/total real steps, or `P` when paused. Completed and failed
  coordinators disappear from the segment
  ([`src/hooks/statusline.ts` lines 538-574](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L538-L574)).
- **Session/run progress:** sealed runs divided by total runs, plus the active run sequence
  ([`src/hooks/statusline.ts` lines 294-346](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L294-L346);
  [`src/hooks/statusline.ts` lines 797-800](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L797-L800)).
- **Individual work chain:** completed artifacts divided by artifacts in that chain, with distinct
  symbols for active, failed, complete, and pending
  ([`src/hooks/statusline.ts` lines 594-635](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L594-L635)).

This is an important pattern even though omp-flow cannot copy Maestro's run/artifact schema:
compact progress should retain the denominator and source-specific meaning. A context budget, a
native operation count, and an authored-document change are not interchangeable inputs to one
percentage.

## Facts: snapshots, bridges, freshness, and failure

Each render is a new short-lived process. The implementation therefore uses small cross-process
files to avoid repeatedly paying expensive reads:

- Git state is cached for two seconds and keyed by directory plus `.git/HEAD` and `.git/index`
  mtimes. Branch switches, commits, and staging invalidate immediately; an unstaged edit may lag
  for the TTL
  ([`src/hooks/statusline.ts` lines 361-409](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L361-L409)).
- Team display is cached for ten seconds
  ([`src/hooks/statusline.ts` lines 458-471](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L458-L471);
  [`src/hooks/statusline.ts` lines 489-499](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L489-L499)).
- Context metrics are written best-effort to a session-keyed temp bridge with a timestamp
  ([`src/hooks/statusline.ts` lines 121-133](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L121-L133)).
- Coordinator state is another session-keyed temp bridge. Its payload includes `updated_at`, but
  `readCoordBridge` returns parsed content without an age check, and `buildCoordinatorSegment`
  consumes it without checking that timestamp
  ([`src/hooks/coordinator-tracker.ts` lines 31-59](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/coordinator-tracker.ts#L31-L59);
  [`src/hooks/coordinator-tracker.ts` lines 489-510](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/coordinator-tracker.ts#L489-L510);
  [`src/hooks/statusline.ts` lines 538-550](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L538-L550)).

Most optional readers catch errors and return an empty value, and top-level parse/render failure
also exits silently. This protects the interactive prompt from an accessory failure, but it
means absence can represent “not applicable,” “missing,” “corrupt,” “timed out,” or “unsupported”
without telling the operator which.

## Facts: Claude and Codex are asymmetric

Claude Code has a first-class status-line setting in Maestro's installer. Codex support uses a
different `hooks.json` model with `SessionStart`, `PreToolUse`, `PostToolUse`,
`UserPromptSubmit`, and `Stop`
([`src/commands/hooks.ts` lines 387-412](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/commands/hooks.ts#L387-L412)).
Codex hook entries can include a `statusMessage` and timeout, and Maestro installs one command per
hook event
([`src/commands/hooks.ts` lines 486-532](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/commands/hooks.ts#L486-L532)).
The examples use messages such as “Loading workflow context” and “Checking command safety”; these
describe the current hook invocation rather than a persistent session status surface
([Codex hooks guide lines 229-276](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/docs-site/src/content/docs/en/guides/hooks-guide-codex.md#L229-L276)).

The same guide says Codex hooks need a feature flag, execute global and project hooks
concurrently, limit pre/post tool hooks to Bash, and are unavailable on Windows
([Codex hooks guide lines 20-39](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/docs-site/src/content/docs/en/guides/hooks-guide-codex.md#L20-L39)).
The CLI implementation prints the Windows warning but still writes the Codex hook configuration
([`src/commands/hooks.ts` lines 1398-1414](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/commands/hooks.ts#L1398-L1414)).

Therefore the exact-revision evidence supports only:

- a persistent embedded Claude Code renderer;
- transient Codex hook activity messages and hook-based context/guard actions; and
- no shared Maestro abstraction that makes those two surfaces equivalent.

## Interpretation for an omp-flow terminal-embedded status bar

### Patterns worth adopting

1. **Harness-native embedding.** A thin Claude adapter should use the native status-line command
   contract. A Codex adapter should use an actual Codex-supported status surface if one is
   established separately; Maestro's Codex hooks do not prove one.
2. **Render-and-exit snapshots.** Build the line from an explicit observation snapshot and bounded
   reads, render once, and exit. A persistent supervisor is unnecessary for the embedded view.
3. **Two adjacent meanings.** Keep Harness mechanics on the first line and an optional authored
   Bundle/operation summary on the next. Do not flatten documents and live execution into one
   lifecycle label.
4. **Source-specific progress.** Prefer exact measures such as native completed/total items,
   unresolved attention count, context pressure, or changed Concepts. Never infer an overall
   percentage from Markdown filenames, headings, links, or frontmatter.
5. **Attention-first compaction.** Active and failed observations deserve inline priority.
   Completed observations should age out, detail should be capped, and `+N` should disclose
   truncation rather than pretending the visible set is complete.
6. **Budget the hot path.** Cache expensive Git or filesystem summaries for a short documented
   interval, and invalidate on cheap authoritative signals where possible.
7. **Protect the prompt.** Renderer failure must not break the Harness interaction. Unlike
   Maestro, however, omp-flow should retain a tiny degraded/freshness marker when an expected
   adapter source is stale or unavailable.

### Patterns not to copy

- Do not read Maestro-style workflow JSON or reconstruct task phase/chain semantics. omp-flow's
  authored Concepts remain documents and links; the portable runtime provides only mechanical
  receipts.
- Do not read private Harness todo directories as though they were a portable contract.
- Do not display a bridge value merely because a session-keyed file parses. Require observed time,
  source, and an explicit freshness policy.
- Do not treat omitted content as proof that nothing is active. Missing, unsupported, stale, and
  not-applicable should remain distinguishable in the observation model even if the compact line
  reduces them to one marker.
- Do not put approval, interruption, or cancellation behind a decorative status-line glyph unless
  the owning Harness provides a correlated interaction channel. Maestro's renderer itself offers
  no evidence for interactive status-bar control.

## Caveats, counter-evidence, and unknowns

- The repository documentation says three or more chains automatically expand into separate
  lines, but the inspected implementation selects compact/expanded layout only from configuration,
  caps work items at three, and appends `+N`
  ([guide lines 48-76](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/docs-site/src/content/docs/en/guides/statusline-guide.md#L48-L76);
  [`src/hooks/statusline.ts` lines 641-705](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L641-L705);
  [`src/hooks/statusline.ts` lines 780-815](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/statusline.ts#L780-L815)).
  This Concept follows the code.
- The guide's configuration table omits the implemented `layout` option and layout environment
  variable. Product docs at this revision should not be assumed to specify the renderer exactly
  ([guide lines 269-295](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/docs-site/src/content/docs/en/guides/statusline-guide.md#L269-L295);
  [`src/hooks/constants.ts` lines 17-47](https://github.com/catlog22/maestro-flow/blob/52a4778c042da72608ccf0f633f0266b3b0d89dc/src/hooks/constants.ts#L17-L47)).
- The code has a 60-second staleness constant for context-budget consumption, but that does not
  protect the coordinator status-line read path. A redesigned bridge needs per-observation
  freshness, not one global implication of “live.”
- The implementation and tests establish render behavior, not terminal-width adaptation. The
  compact renderer uses `white-space: nowrap` in its preview and does not show a width budget or
  truncation algorithm; long model, task, branch, or intent text may still wrap or crowd the
  prompt.
- The exact refresh cadence is owned by Claude Code. The repository describes “after each
  interaction” but does not establish a portable interval, subscription, or user-triggered
  refresh API.
- Codex support is especially version- and platform-sensitive. Maestro's own guide labels Windows
  unsupported, so the Codex hook examples cannot be used as evidence for a Windows-safe embedded
  bar.

## Recommendation handed to design

Use Maestro's Claude Code renderer as evidence for a deliberately small, read-only companion
surface: one hot-path status line for native mechanics and attention, with at most one additional
line for a bounded omp-flow summary. Every segment should carry internal provenance and observed
time even when the visible form is terse. Rank attention over completion, cap detail, disclose
hidden counts, and render a visible stale/degraded marker instead of silently presenting an old
bridge as current.

Treat interaction as a separate, Harness-owned capability. The embedded line may advertise an
available action or attention state, but approval, interruption, attach, and cancellation must
route through the exact native adapter that owns the correlated live request. For Codex, rely on
the separately researched app-server/event boundary rather than assuming Maestro's hook
`statusMessage` is a status-line API.
