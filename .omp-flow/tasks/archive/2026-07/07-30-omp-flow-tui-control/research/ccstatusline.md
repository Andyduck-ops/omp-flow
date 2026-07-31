---
type: "Research"
title: "ccstatusline widget and renderer patterns"
---

# ccstatusline widget and renderer patterns

Question: what does the exact current revision of `sirmalloc/ccstatusline` demonstrate about a
configurable Claude Code status line—especially its information catalog, responsive rendering,
configuration, caches, installation, tests, and data dependencies—and which concrete patterns
should change omp-flow's status-line information architecture without creating a lifecycle
database or depending on private Harness state?

## Source record

- Upstream: `https://github.com/sirmalloc/ccstatusline.git`
- Default branch at inspection: `main`
- Exact revision: `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`
- Tag and package version: `v2.2.27` / `2.2.27`
- Revision timestamp: `2026-07-25T18:50:39-04:00`
- Revision subject: `Version bump and docs update`
- Inspected: 2026-07-30
- Acquisition cache: `.omp-flow/cache/repos/ccstatusline/` (ignored, not task knowledge)

All upstream links below are pinned to that revision. Code and tests are treated as primary
evidence; README claims are not used where the implementation is more precise.

## Selected conclusion

ccstatusline is stronger evidence than the existing
[Maestro reference](maestro-flow-statusline.md) for presentation architecture. It has a centralized
widget manifest, categories and search, one-to-three editable lines, semantic empty rendering,
separator repair, flex placement, terminal-width truncation, themes, pre-rendering, versioned
short-lived caches, and a large behavioral test suite. Those mechanisms support making omp-flow's
small fixed renderer into a categorized, width-aware segment system rather than a hard-coded
string.

It is not a safe data-source model for omp-flow. Several headline widgets read Claude's private
transcript JSONL, scan all project transcripts, inspect private account files, extract an OAuth
access token from `.credentials.json` or macOS Keychain, and call an Anthropic OAuth endpoint.
Its custom-command widget also executes an arbitrary shell string with inherited environment and
passes the complete Claude status payload to it. None of those dependencies should enter
omp-flow's portable snapshot or renderer.

The justified direction is therefore:

1. adopt a small segment manifest, presentation categories, semantic empty behavior, left/right
   flex layout, deterministic width compaction, and bounded presentation caches;
2. keep omp-flow's current attention-first default and honest, source-owned progress semantics;
3. source model, context, cost, duration, tokens, rate limits, and session binding only from
   documented host input or an explicitly accepted adapter;
4. do not add transcript readers, credential discovery, account-email display, arbitrary shell
   widgets, or a persistent semantic store; and
5. retain non-destructive installation. ccstatusline confirms that replacement can be clearly
   previewed and confirmed, but omp-flow's first release should still install only into an empty
   Claude slot and otherwise provide a composable `--segment` command.

## Facts: catalog and information grouping

The package exposes one executable and one settings-driven renderer
([`package.json` lines 1-22](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/package.json#L1-L22)).
Its centralized manifest registers 87 content widgets plus separator and flex-separator layout
items. The registry is the execution boundary; each widget supplies its display name,
description, category, editor behavior, and renderer
([`widget-manifest.ts` lines 7-19](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/widget-manifest.ts#L7-L19);
[`widget-manifest.ts` lines 20-106](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/widget-manifest.ts#L20-L106);
[`Widget.ts` lines 37-49](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/types/Widget.ts#L37-L49)).

The catalog derives category/search records from those widget implementations, supports
category filtering, and fuzzy-searches display name, type, and description
([`widgets.ts` lines 19-52](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/widgets.ts#L19-L52);
[`widgets.ts` lines 54-126](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/widgets.ts#L54-L126)).
The implemented categories and relevant content are:

| Category | Relevant widgets |
|---|---|
| Core | model, output style, Claude session ID, thinking effort, Vim mode, sandbox, remote-control state, version |
| Context | length, window, used/usable percentage, bar, compaction count |
| Git | branch, SHA, changes/counts, clean/staged/unstaged/untracked/conflicts, remotes/fork, ahead/behind, worktree, PR/MR, CI |
| Session | elapsed clock, cost, name, account email, skill activity, cache timer |
| Tokens / Token Speed / Cache | input, output, cached and total tokens; input/output/total rates; cache reads/writes/hit rate |
| Usage | five-hour and weekly percentages/reset timers, per-model weekly limits, extra-usage spend/remaining |
| Environment | working directory, terminal width, memory |
| Custom | text, symbol, link, arbitrary command |
| Jujutsu | bookmarks, workspace, revision, description and change counts |
| Layout | explicit separator and flex separator |

This is presentation taxonomy, not workflow state. The value for omp-flow is the separation
between core product facts, host enrichment, repository enrichment, and layout operators—not the
number of widgets.

The default configuration uses three authored line arrays, with content only on the first:
model, context length, Git branch, and Git changes. It also stores flex mode, compact threshold,
color level, padding, Git cache TTL, minimalist mode, and powerline presentation
([`Settings.ts` lines 48-92](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/types/Settings.ts#L48-L92)).

## Facts: model, context, Git, cost, duration, tokens, limits, and identity

Claude's documented status payload is accepted through a loose but typed schema. It includes
session ID, transcript path, working directories, model, version, output style, effort, cost and
duration, context-window metrics, Vim/worktree state, and optional rate-limit buckets
([`StatusJSON.ts` lines 24-80](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/types/StatusJSON.ts#L24-L80)).
Simple widgets correctly prefer that native input:

- model uses `model.display_name` or `model.id`
  ([`Model.ts` lines 18-32](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/Model.ts#L18-L32));
- cost uses `cost.total_cost_usd`
  ([`SessionCost.ts` lines 18-31](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/SessionCost.ts#L18-L31));
- elapsed time prefers `cost.total_duration_ms`
  ([`SessionClock.ts` lines 38-50](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/SessionClock.ts#L38-L50)); and
- context-bar rendering prefers host context length and window size, using transcript-derived
  tokens and a local model-context table only as fallback
  ([`ContextBar.ts` lines 80-126](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/ContextBar.ts#L80-L126)).

Token totals are different: the renderer reads `transcript_path` on every render and derives
session totals from JSONL. It understands streaming duplicates and compaction boundaries, but that
correctness depends on undocumented transcript shape
([`ccstatusline.ts` lines 129-162](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/ccstatusline.ts#L129-L162);
[`jsonl-metrics.ts` lines 155-205](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-metrics.ts#L155-L205);
[`jsonl-metrics.ts` lines 207-265](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-metrics.ts#L207-L265)).
Session-name rendering likewise searches the private transcript backwards for `custom-title`
records
([`SessionName.ts` lines 20-53](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/SessionName.ts#L20-L53)).

Usage-limit widgets first consume host-provided `rate_limits`; only missing fields trigger the
private API path
([`usage-prefetch.ts` lines 182-234](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/usage-prefetch.ts#L182-L234)).
The widgets retain the important semantic distinction between five-hour/session and weekly
windows rather than presenting one quota
([`SessionUsage.ts` lines 60-117](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/SessionUsage.ts#L60-L117);
[`WeeklyUsage.ts` lines 60-117](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/WeeklyUsage.ts#L60-L117)).

Session identity is also plural:

- the native `session_id` can be rendered directly
  ([`ClaudeSessionId.ts` lines 18-27](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/ClaudeSessionId.ts#L18-L27));
- the user-visible renamed session is transcript-derived; and
- account email is read from the private `.claude.json` account state
  ([`ClaudeAccountEmail.ts` lines 23-40](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/ClaudeAccountEmail.ts#L23-L40)).

For omp-flow, an exact session/thread ID is useful internally for source binding, but neither a
raw ID nor account email belongs in the default visible line.

## Facts: width-aware rendering and semantic emptiness

ccstatusline pre-renders every configured widget exactly once, preserving positional slots for
separators and unknown widget types. Both renderers consume the same pre-rendered result
([`renderer.ts` lines 788-839](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/renderer.ts#L788-L839)).
The top-level command then suppresses a whole output line when its ANSI-stripped content is empty
([`ccstatusline.ts` lines 181-229](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/ccstatusline.ts#L181-L229)).

Individual widgets may return `null` for unavailable or intentionally hidden data. Examples
include cache widgets with `hideWhenEmpty` and compaction count with `hide zero`
([`CacheRead.ts` lines 37-53](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/CacheRead.ts#L37-L53);
[`CompactionCounter.ts` lines 287-305](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/CompactionCounter.ts#L287-L305)).
The ordinary renderer looks through empty widgets, suppresses leading/trailing separators, and
prevents empty content from leaving doubled separators
([`renderer.ts` lines 1003-1074](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/renderer.ts#L1003-L1074);
[`renderer.ts` lines 1127-1133](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/renderer.ts#L1127-L1133)).

Width is a real render input. Flex modes reserve either six or forty columns for host UI, or
switch between those budgets when context pressure crosses a configured threshold
([`renderer.ts` lines 70-108](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/renderer.ts#L70-L108)).
Flex separators divide the remaining width across segments, and both ordinary and powerline
renderers truncate ANSI-aware text with an ellipsis when still over budget
([`renderer.ts` lines 1211-1275](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/renderer.ts#L1211-L1275);
[`renderer.ts` lines 685-718](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/renderer.ts#L685-L718)).

This is materially better than Maestro's unbounded `nowrap` compact line, but it still truncates
from the right after layout. It does not use semantic segment priority or disclose how many
segments truncation hid. omp-flow should combine ccstatusline's measured-width foundation with
Maestro's attention ranking and `+N` disclosure: drop whole low-priority segments first, then
truncate only the final retained text as a last resort.

## Facts: line editing, custom commands, and themes

The configuration TUI is separate from the rendered status line. It provides category and
cross-category search, add/insert/change, move, delete, duplicate, merge, and per-widget editor
actions
([`input-handlers.ts` lines 140-291](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/tui/components/items-editor/input-handlers.ts#L140-L291);
[`input-handlers.ts` lines 303-410](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/tui/components/items-editor/input-handlers.ts#L303-L410);
[`input-handlers.ts` lines 436-499](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/tui/components/items-editor/input-handlers.ts#L436-L499)).
This is configuration control, not live workflow control: the displayed line still has no
approval, focus, interrupt, attach, or cancellation interaction.

The custom-command widget is powerful but unsafe as an omp-flow default. It:

- executes a user-provided shell command with `execSync`;
- inherits the renderer's full environment;
- sends the complete host status JSON, including `transcript_path`, plus terminal width on stdin;
- defaults to a one-second timeout; and
- can preserve command-supplied ANSI sequences

([`CustomCommand.tsx` lines 57-87](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/CustomCommand.tsx#L57-L87);
[`CustomCommand.tsx` lines 114-130](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/CustomCommand.tsx#L114-L130)).
The test deliberately proves that host fields and terminal width cross that command boundary
([`CustomCommand.test.ts` lines 50-74](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/widgets/__tests__/CustomCommand.test.ts#L50-L74)).

Powerline themes are presentation-only mappings for 16-color, 256-color, and truecolor terminals.
The built-ins are Custom, Nord, Nord Aurora, Monokai, Solarized, Minimal, Dracula, Catppuccin,
Gruvbox, One Dark, and Tokyo Night
([`colors.ts` lines 310-345](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/colors.ts#L310-L345);
[`colors.ts` lines 347-491](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/colors.ts#L347-L491)).
omp-flow can adopt semantic theme tokens (`normal`, `active`, `success`, `warning`, `error`,
`stale`, `muted`) but should not allow a theme to erase severity distinctions.

## Facts: performance caches

ccstatusline uses several distinct, replaceable presentation caches rather than one session
database:

- ordinary Git commands have an in-memory and versioned disk cache, default TTL five seconds,
  scoped by repository and invalidated by `.git/HEAD` and `.git/index` mtimes
  ([`git.ts` lines 39-56](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/git.ts#L39-L56);
  [`git.ts` lines 141-175](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/git.ts#L141-L175);
  [`git.ts` lines 177-220](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/git.ts#L177-L220));
- PR/MR and CI state use a 30-second disk cache and detached background refresh with a lock,
  returning stale useful data while refresh is pending or transiently failing
  ([`git-review-cache.ts` lines 114-120](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/git-review-cache.ts#L114-L120);
  [`git-review-cache.ts` lines 601-635](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/git-review-cache.ts#L601-L635);
  [`git-review-cache.ts` lines 638-735](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/git-review-cache.ts#L638-L735));
- usage data has a 180-second memory/disk cache, a token fingerprint, and rate-limit lock
  ([`usage-fetch.ts` lines 22-30](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/usage-fetch.ts#L22-L30);
  [`usage-fetch.ts` lines 216-234](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/usage-fetch.ts#L216-L234);
  [`usage-fetch.ts` lines 704-800](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/usage-fetch.ts#L704-L800)); and
- five-hour block calculation caches only a start time scoped by a hashed Claude config directory
  ([`jsonl-cache.ts` lines 16-40](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-cache.ts#L16-L40);
  [`jsonl-cache.ts` lines 101-132](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-cache.ts#L101-L132)).

The Git cache patterns fit omp-flow if every cached observation remains bounded, ignored,
versioned, atomically replaceable, source-scoped, and carries observed/freshness times. A cache
must never become task meaning or a lifecycle database.

## Facts: installation and coexistence

ccstatusline offers auto-updating `npx`/`bunx` commands and pinned global npm/bun installation
([`claude-settings.ts` lines 28-48](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/claude-settings.ts#L28-L48)).
It reads the existing Claude settings file, writes a backup, and preserves unrelated keys
([`claude-settings.ts` lines 136-214](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/claude-settings.ts#L136-L214)).

Coexistence is explicit but destructive after confirmation. The TUI shows the existing status-line
command, previews the exact settings path, install command, final command, and hook behavior, and
asks `Replace it?`
([`App.tsx` lines 620-654](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/tui/App.tsx#L620-L654)).
The installer then replaces the complete `statusLine` object while retaining its refresh interval
when supported
([`claude-settings.ts` lines 400-432](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/claude-settings.ts#L400-L432)).
Uninstall removes that field and managed hooks
([`claude-settings.ts` lines 441-463](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/claude-settings.ts#L441-L463)).

This improves informed consent over silent overwrite but does not create true coexistence.
omp-flow should keep its stronger current rule: empty-slot installation only, otherwise show the
existing owner and provide the exact manual `omp-flow statusline render --segment` composition
command. Uninstall must remove only an exact omp-flow-owned command.

## Facts: Windows behavior

The entry point tries to switch Windows to UTF-8 code page 65001 and ignores failure so rendering
continues
([`ccstatusline.ts` lines 89-100](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/ccstatusline.ts#L89-L100)).
Path quoting and package-manager resolution have Windows-specific branches
([`claude-settings.ts` lines 65-84](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/claude-settings.ts#L65-L84);
[`claude-settings.ts` lines 233-259](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/claude-settings.ts#L233-L259)).

Terminal-width detection is intentionally disabled on Windows unless
`CCSTATUSLINE_WIDTH` is explicitly supplied; Unix uses ancestor `ps`/TTY, `stty`, and `tput`
probes
([`terminal.ts` lines 35-92](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/terminal.ts#L35-L92);
[`terminal.ts` lines 104-178](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/terminal.ts#L104-L178)).
Tests lock in both the Windows override and no-probe behavior
([`terminal.test.ts` lines 266-280](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/__tests__/terminal.test.ts#L266-L280)).

Therefore omp-flow should accept host-supplied terminal width and a documented explicit override.
It should not copy Unix process-tree probing into a portable Python hot path, and Windows with
unknown width must choose a conservative compact layout rather than pretending flex placement is
available.

## Facts: test strategy

The revision contains 134 `*.test.ts`/`*.test.tsx` files and 1,628 `it`/`test` cases. Tests cover
individual widgets, schemas, TUI input handlers, migrations, configuration, ANSI rendering,
width/flex behavior, empty separators, caches, installation, Git/Jujutsu, usage parsing, proxy
behavior, transcript metrics, and Windows-specific branches.

Representative renderer tests assert context-dependent width budgets, powerline parity, flex
distribution, and correct placement when an adjacent widget renders empty
([`renderer-flex-width.test.ts` lines 56-118](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/__tests__/renderer-flex-width.test.ts#L56-L118);
[`renderer-flex-width.test.ts` lines 121-190](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/__tests__/renderer-flex-width.test.ts#L121-L190)).
Separator-collapse tests cover leading, trailing, consecutive, spacing, merge, and flex-boundary
cases
([`renderer-separator-collapse.test.ts` lines 54-139](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/__tests__/renderer-separator-collapse.test.ts#L54-L139);
[`renderer-separator-collapse.test.ts` lines 141-215](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/__tests__/renderer-separator-collapse.test.ts#L141-L215)).

CI separates lint/type-check, tests, and build, but all jobs run only on Ubuntu
([`ci.yml` lines 8-36](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/.github/workflows/ci.yml#L8-L36)).
This is a caveat: mocked Windows branches are useful but do not prove Windows installation,
encoding, process spawning, ANSI output, or filesystem behavior end to end.

## Private transcript and credential coupling

The following upstream behavior is explicitly out of bounds for omp-flow:

1. **Current transcript parsing.** Token totals, fallback duration, speeds, compaction, and renamed
   session read `transcript_path`; speed metrics also discover referenced subagent transcript
   files
   ([`ccstatusline.ts` lines 129-162](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/ccstatusline.ts#L129-L162);
   [`jsonl-metrics.ts` lines 476-518](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-metrics.ts#L476-L518)).
2. **Global transcript scanning.** Five-hour block fallback globs all
   `<claude-config>/projects/**/*.jsonl`, sorts by mtime, and parses activity timestamps
   ([`jsonl-blocks.ts` lines 31-85](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-blocks.ts#L31-L85);
   [`jsonl-blocks.ts` lines 180-218](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/jsonl-blocks.ts#L180-L218)).
3. **Account state.** Account email comes from private `.claude.json`.
4. **Credential extraction and network use.** Usage fallback reads
   `<claude-config>/.credentials.json`; on macOS it queries the Claude Code Keychain service and
   even enumerates candidate services
   ([`usage-fetch.ts` lines 460-525](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/usage-fetch.ts#L460-L525)).
   It sends that bearer token to `api.anthropic.com/api/oauth/usage`
   ([`usage-fetch.ts` lines 618-700](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/utils/usage-fetch.ts#L618-L700)).
5. **Arbitrary command disclosure.** A custom command receives the whole status payload and
   inherited environment through a shell string.

Host-provided `rate_limits`, cost, duration, context, model, and session ID are acceptable only
when the relevant Harness documents or deliberately owns that input. If a host does not provide
one of those facts, omp-flow should render it unavailable or omit it according to an explicit
presence policy; it should not recover the value from private state.

## Comparison with Maestro

| Concern | Maestro at its pinned revision | ccstatusline at this revision | omp-flow implication |
|---|---|---|---|
| Product shape | Fixed compact/expanded renderer, workflow-aware | General configurable status-line formatter plus configuration TUI | Keep omp-flow product-specific; adopt a small manifest, not a general dashboard |
| Information hierarchy | Model/task/team then Git/tokens/context; workflow detail second line | Category/search catalog and up to three arbitrary lines | Define explicit categories and defaults, but cap production output at one line plus one conditional omp-flow line |
| Width | No measured width adaptation established | Host/override width, flex placement, ANSI-aware hard truncation | Add measured width, semantic priority-drop, `+N`, then hard truncation |
| Empty data | Optional segments vanish; failures often indistinguishable | Widgets return empty and renderer repairs separators robustly | Adopt semantic empty composition, but preserve `stale`/`degraded` distinct from not-applicable |
| Progress | Several source-specific workflow/context measures | Context and quota bars; no workflow model | Retain omp-flow's typed, source-owned progress and never infer a total workflow percentage |
| Git performance | Two-second repository cache | Versioned five-second Git cache; 30-second stale-while-revalidate PR/CI cache | Use bounded source caches with observed time and freshness |
| Configuration | Environment/config layout choice | Searchable widget and line editor, themes, install manager | Provide presentation configuration and preview; do not let it mutate Bundle meaning |
| Installation | Claude-only status-line install | Exact replacement preview and confirmation, then overwrite | Keep stronger empty-slot-only default and manual composition |
| Private dependencies | Workflow JSON, private todo, unchecked bridge age | Transcripts, account state, OAuth credential/API, arbitrary shell | Reject both dependency families |
| Tests | Narrow behavioral subset plus generated visual scenarios | Broad unit/component coverage; Ubuntu-only CI | Add scenario/golden and width invariants plus real Windows CI |

## Concrete changes to omp-flow status-line information architecture

These are design changes, not implementation authorization.

### 1. Add a small presentation segment manifest

Define a closed renderer-facing manifest for supported presentation segments, separate from the
closed observation snapshot. A segment definition should contain only presentation facts:

- stable segment kind;
- display category;
- default priority;
- compact and full labels;
- minimum useful width;
- empty policy;
- severity/theme token; and
- whether it is core, host enrichment, repository enrichment, or action hint.

Recommended categories are `Attention`, `Bundle`, `Progress`, `Activity`, `Operations`, `Host`,
`Repository`, `Budget`, and `Action`. This is not a lifecycle model, dependency graph, or database.
It does not parse Markdown and does not manufacture task meaning.

### 2. Use a two-zone default line

Use a flex boundary conceptually equivalent to:

```text
◆ omp · <bundle> │ <attention/progress/activity>        <model/context/git/budget> │ <action>
```

The left zone is owned by omp-flow and preserves, in order, blocking attention, Bundle identity,
one honest progress measure, and correlated activity. The right zone contains optional
host/repository/budget enrichment. The compact action hint remains visible when actionable.
The existing conditional second line remains reserved for bounded omp-flow detail; do not add a
third production line merely because ccstatusline can.

### 3. Make width compaction semantic

Accept width from the host snapshot or explicit configuration. At successively narrower widths:

1. shorten labels and counts;
2. remove low-priority right-zone enrichment;
3. collapse operations/activity detail to counts;
4. retain highest-severity attention, Bundle identity, one progress measure, and action hint;
5. append `+N` for whole hidden segments; and
6. ANSI-aware truncate the last retained free-text field only as a final guard.

On unknown width—especially native Windows—choose the conservative compact form. Do not run Unix
TTY probes from the portable runtime.

### 4. Represent presence before rendering emptiness

Segment inputs should distinguish at least:

- `value`: current content exists;
- `notApplicable`: source authoritatively says the segment does not apply;
- `empty`: source authoritatively reports zero/none and policy may hide it;
- `unsupported`: this adapter cannot supply it; and
- `degraded`: it was expected but is stale, failed, or unavailable.

The renderer may omit `notApplicable` and configured `empty`, then repair separators as
ccstatusline does. It must not silently turn `degraded` into absence. This belongs in the bounded
snapshot/renderer contract, not in persistent workflow state.

### 5. Keep the trust boundary host-first

- Model, context, cost, duration, token, limit, and session facts come only from supported host
  input or an explicit adapter observation.
- Session/thread IDs remain internal provenance bindings by default; visible identity should be a
  safe short label and opt-in.
- Do not display account email.
- Do not parse transcripts, scan session directories, read credential stores, or call private
  OAuth endpoints.
- Do not derive progress from Git, token use, cost, duration, context, or quota percentages.

### 6. Keep custom composition outside the core renderer

The first release should not add ccstatusline-style arbitrary command widgets. Existing status-line
owners can call the bounded `omp-flow statusline render --segment` output. If external segment
providers are considered later, they require a separate accepted security design: argv execution
without an implicit shell, minimal allowlisted stdin, scrubbed environment, strict timeout/output
cap, ANSI sanitization, and explicit opt-in.

### 7. Use presentation caches, never semantic persistence

Git or adapter enrichment may use a short versioned cache or stale-while-revalidate producer.
Each entry must carry source binding, observed time, expiry, and schema version; writes should be
atomic and failures non-fatal. Cache directories stay ignored and entirely reconstructable.
Portable operation receipts and authored Concepts remain the only relevant task/runtime sources;
the cache cannot answer “what phase is the task in?” or “is work accepted?”

### 8. Add configuration and preview without status-line control

A later presentation configurator may group/search supported segments, reorder optional
enrichment, toggle hide-empty policy, select compactness, and preview known widths/themes.
It must not approve QbD, interrupt an actor, select workflow phase, or edit authored Concepts.
Live actions remain routed through the exact Harness-native inspector/Skill described by the
selected synthesis.

### 9. Strengthen verification

Add table-driven/golden scenarios for:

- wide, medium, narrow, zero, and unknown widths;
- ANSI, Unicode, CJK, and Windows paths;
- every presence state and separator-collapse boundary;
- attention priority and `+N` disclosure;
- stale/fresh cache transitions and corrupt cache recovery;
- existing Claude status-line coexistence, exact-owner uninstall, and invalid settings;
- empty-slot install on Windows and POSIX; and
- proof that renderer tests never touch transcripts, account files, Keychain, credential files,
  or the network.

Run actual Windows CI in addition to mocked platform branches.

## Caveats and unknowns

- The source has extensive tests, but the suite was not executed locally for this research
  Concept; the exact-revision code and checked-in CI configuration were inspected.
- Git PR/CI enrichment invokes authenticated `gh`/`glab` clients. Even though this is less private
  than extracting Claude credentials, omp-flow should treat such enrichment as optional and
  explicitly sourced.
- ccstatusline's schema accepts arbitrary widget type strings for forward compatibility
  ([`Widget.ts` lines 6-30](https://github.com/sirmalloc/ccstatusline/blob/83c8ffd551ec700fceeed98fe9ab50de84cb49fa/src/types/Widget.ts#L6-L30)).
  omp-flow's snapshot should remain closed and reject unknown semantic fields; forward-compatible
  presentation extensions must not become an open semantic input channel.
- ccstatusline's context-dependent `full-until-compact` width reserves more space when context
  pressure is high. That is a presentation preference, not evidence that context pressure should
  outrank blocking omp-flow attention.
- Theme richness and a configuration TUI are secondary. The immediate architecture value is
  manifest grouping, semantic emptiness, width priority, source trust, and cache boundaries.

## Recommendation handed back to synthesis/design

Revise the status-line design so the renderer consumes a closed observation snapshot through a
small categorized segment manifest and lays it out as an omp-owned left zone plus optional
host/repository enrichment on the right. Preserve the existing attention-first priorities,
conditional second line, source-specific progress, freshness markers, and non-destructive
installation. Add host/override width, semantic segment dropping with `+N`, empty-separator
repair, semantic theme tokens, and reconstructable presentation caches.

Explicitly prohibit transcript parsing, global session scans, private account fields, OAuth
credential discovery, private usage API calls, and arbitrary inherited-environment shell
commands. Those prohibitions are necessary even though they power useful ccstatusline widgets:
omp-flow's portable renderer should remain a bounded projection of supported observations, not a
private Harness-state miner or a second workflow system.
