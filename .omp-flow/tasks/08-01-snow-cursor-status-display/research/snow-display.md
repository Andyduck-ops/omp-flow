---
type: "Research"
title: "Snow native Flow Status display surfaces"
---

# Snow native Flow Status display surfaces

Informs [Native display research](native-display.md). This investigation tests the provisional
claim that Snow may lack a truthful native persistent display, and asks which released surface can
consume the existing Flow Status v2 snapshot without weakening project ownership or exact session
scope.

## Conclusion and decision impact

Snow `0.8.24` **does have a native persistent StatusLine extension surface**. That revises the
narrow assumption that Snow has no status-line API. It does not yet justify an omp-flow persistent
widget: released Snow loads StatusLine plugins only from the user-global
`~/.snow/plugin/statusline/` directory, and the public StatusLine context contains `cwd` and system
state but no current Snow session ID. The released `snow cmd statusline status --json` command is
only plugin/builtin inventory; it neither evaluates a plugin nor renders status content.

The principal contradiction in the Brainstorm is therefore confirmed, not falsified: the shared
snapshot is ready and Snow has presentation primitives, but binding a persistent view to the exact
project session would still require unsupported inference, a user-global ownership policy, or a
new session bridge.

For the current project-local boundary, the smallest truthful integration is a native **on-demand**
shortcut backed by the already-installed `flow-status` Skill, not a persistent StatusLine plugin.
A project `.snow/commands/flow-status.json` prompt command can make the view discoverable and ask
Snow to execute the project `flow-status` Skill. The Skill then uses Snow's normal
`terminal-execute` path, where `SNOW_SESSION_ID` is explicitly injected, and calls the existing
exact `status inspect --host snow --session ... --json` contract. The visible result is
model-mediated conversation output and must be labelled on-demand, not a footer or a stable JSON
command response.

A richer native on-demand AnyPanel is technically possible now and is the strongest
counter-option: AnyPanel receives the current `sessionId`, supports timer repaint, and can be
opened from a project command. Its plugin is nevertheless user-global. It should be designed only
if the human explicitly accepts an external-user-directory setup/update/removal and collision
policy; it should not be silently folded into `init --snow` as though it were project-owned.

No return to Brainstorm is required unless that ownership boundary changes. Research revises the
surface inventory but does not change the observable problem, irreducible outcome, or the rule
against project-global session fallback.

## Confirmed facts

### Release and provenance

- On 2026-08-01, npm `latest` was `snow-ai@0.8.24`, published
  `2026-07-31T06:25:18.271Z`. npm reports `gitHead`
  `86a18cfbf5844c14a99dcc717eed26b8cf5b89d4`; upstream tag `v0.8.24` and `HEAD`
  resolve to the same commit, dated `2026-07-31T14:21:27+08:00`. The versioned registry record is
  [snow-ai 0.8.24](https://registry.npmjs.org/snow-ai/0.8.24), and the published tarball is
  [snow-ai-0.8.24.tgz](https://registry.npmjs.org/snow-ai/-/snow-ai-0.8.24.tgz), npm integrity
  `sha512-uhptkrR/3EKuSm6rLfEotLb2DNrd3bxRHBwsVCW017fFaUVhiF9MMdnu1ZOINOTScVS+jnBDD6oPR4Uj8fZRXA==`.
- An isolated released-runtime probe returned `0.8.24` for
  `npx --yes --package=snow-ai@0.8.24 snow --version`. The same package returned exit 0 and
  `{ok:true, command:"statusline.status"}` for
  `snow cmd statusline status --json`, reporting 21 builtins and the user-global statusline
  directory. This proves package/command availability, not interactive widget rendering.
- The machine's normally resolved `snow` is `0.7.23`. It reports that version, but
  `snow cmd statusline status --json` falls through to the interactive Ink application and fails
  under non-TTY stdin. Thus the currently installed CLI does not expose the 0.8.24 `cmd`
  control-plane surface. This observation does not claim that 0.7.23 lacked all StatusLine plugin
  rendering.

### Persistent StatusLine contract

- Snow fixes the external StatusLine directory at `join(homedir(), '.snow', 'plugin',
  'statusline')`; there is no project-scope alternative in that configuration contract
  ([`apiConfig.ts` lines 216-230](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/apiConfig.ts#L216-L230)).
- The loader accepts `.js`, `.mjs`, and `.cjs`, loads files in filename order, lets later external
  IDs override earlier/builtin IDs, watches the user directory, and cache-busts modules on change
  ([`useStatusLineHooks.ts` lines 115-172](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/statusline/useStatusLineHooks.ts#L115-L172),
  [lines 216-304](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/statusline/useStatusLineHooks.ts#L216-L304)).
- Each enabled hook runs immediately and then on an interval: default 5 seconds, minimum 1 second.
  Async overlap for one hook is suppressed. A thrown refresh clears that hook's current items and
  logs a warning, while other hooks continue
  ([`useStatusLineHooks.ts` lines 318-374](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/statusline/useStatusLineHooks.ts#L318-L374)).
- A hook returns short `text`, optional `detailedText`, color/gradient and priority. Simple mode
  renders items in one horizontal status row; normal mode renders each item's detailed text in the
  native footer area
  ([`StatusLine.tsx` lines 628-652](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/StatusLine.tsx#L628-L652),
  [lines 863-886](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/StatusLine.tsx#L863-L886)).
- The public hook context is exactly `cwd`, `platform`, `language`, `simpleMode`, labels and system
  state. It has no `sessionId`
  ([`types.ts` lines 161-181](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/statusline/types.ts#L161-L181));
  the TUI constructs the same session-free object
  ([`StatusLine.tsx` lines 402-494](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/components/common/StatusLine.tsx#L402-L494)).
- `snow cmd statusline status` scans that directory and returns plugin paths plus builtin IDs. It
  does not call `getItems`, accept a session, or display current item text
  ([`sessionCommandHandlersExtra.ts` lines 512-556](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/sessionCommandHandlersExtra.ts#L512-L556)).

### Exact-session on-demand surfaces

- Snow project custom commands live under `.snow/commands/`; project commands load before and
  override same-named global commands
  ([`custom.ts` lines 238-288](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/commands/custom.ts#L238-L288)).
  Prompt commands feed their prompt into the current conversation; execute commands spawn a shell
  ([`custom.ts` lines 491-540](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/commands/custom.ts#L491-L540)).
- A direct execute custom command is not an exact-session Flow Status bridge. Its shell spawn does
  not pass `cwd` or a Snow identity environment explicitly
  ([`useCommandHandler.ts` lines 1524-1550](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/hooks/conversation/useCommandHandler.ts#L1524-L1550)).
  By contrast, Snow's normal bash/terminal path builds a child environment from the current
  conversation and supplies `SNOW_SESSION_ID`
  ([`useBashMode.ts` lines 224-251](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/hooks/input/useBashMode.ts#L224-L251),
  [`sessionIdentityEnv.ts` lines 16-47](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/sessionIdentityEnv.ts#L16-L47)).
- Snow natively discovers project `.agents/skills` after global Skills and before project
  `.snow/skills`
  ([`skills.ts` lines 178-206](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/mcp/skills.ts#L178-L206)).
  This matches omp-flow's shared Skill deployment and avoids a duplicate Snow Skill tree
  (`README.md:669-673`). The existing Skill requires exact Snow evidence and refuses missing or
  conflicting host/session values (`templates/common/skills/flow-status/SKILL.md:10-45`).
- AnyPanel is a true native on-demand screen. A project custom command can be type `panel`, but the
  actual plugin loader is fixed at user-global `~/.snow/plugin/anypanel/`
  ([`loader.ts` lines 1-18](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/plugins/anypanel/loader.ts#L1-L18),
  [lines 59-118](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/plugins/anypanel/loader.ts#L59-L118)).
  Unlike StatusLine, Snow passes `sessionManager.getCurrentSession()?.id` into the panel
  (`source/ui/pages/chatScreen/ChatScreenPanels.tsx` at upstream revision: lines 516-531), and both
  `init` and rich rendering receive that session ID
  ([`AnyPanelScreen.tsx` lines 81-108](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/pages/AnyPanelScreen.tsx#L81-L108),
  [lines 336-360](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/pages/AnyPanelScreen.tsx#L336-L360)).
  The panel can repaint at a plugin interval clamped to at least 100 ms, but only while open
  ([`AnyPanelScreen.tsx` lines 185-196](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/ui/pages/AnyPanelScreen.tsx#L185-L196)).

### Existing Flow Status v2 boundary

- The canonical backend includes `snow` in its closed host set
  (`templates/.omp-flow/scripts/common/flow_status.py:16-26`), scopes cache writes by repository,
  host and exact host session (`templates/.omp-flow/scripts/common/flow_status.py:3373-3394`), and
  exact inspection rejects ambiguity unless the caller supplies the matching host/session
  (`templates/.omp-flow/scripts/common/flow_status.py:3449-3492`). No new renderer or cache is
  needed.
- The current Snow managed set contains Agents and two Hook definitions/handlers, but no command,
  StatusLine plugin, or AnyPanel plugin (`src/cli/init.ts:232-256`). README accurately says the
  adapter reads the Snow-scoped snapshot and installs no native persistent status bar
  (`README.md:552-556`).

## Counter-evidence and rejected inferences

- **Against “Snow has no persistent extension”:** false for 0.8.24. The StatusLine API is real,
  reloadable, periodic, and natively rendered.
- **Against “therefore install a footer now”:** the API is user-global and session-blind. `cwd`
  alone cannot distinguish concurrent Snow sessions in one repository. Enumerating the newest or
  sole Snow cache would be the prohibited project-global fallback.
- **Against using `snow cmd statusline status` as the view:** it returns configuration inventory,
  not the current rendered items or Flow snapshot.
- **Against a direct project execute command:** the custom-command shell path does not establish
  the current session identity. Ambient `SNOW_SESSION_ID` might exist when a user launches Snow in
  a specially prepared environment, but upstream does not make that a current-session guarantee.
- **Against “only model chat is possible”:** AnyPanel disproves that. It supplies exact session
  identity and timed repaint, but its user-global plugin ownership is a real additional design
  commitment and it is on-demand, not persistent.

## Candidate decisions

1. **Recommended current scope — project prompt shortcut plus existing Skill.** Add one exact-owned
   `.snow/commands/flow-status.json` prompt command that requests the `flow-status` Skill. Preserve
   the Skill as the sole inspection procedure and the v2 cache as the sole data source. Document
   that `/flow-status` is on-demand, model-mediated, and may report unavailable; do not promise a
   persistent footer or stable machine JSON from the slash command.
2. **Optional richer follow-up — explicit AnyPanel setup.** If the human accepts user-global
   plugin ownership, design a generic exact-owned AnyPanel plugin plus project command. The panel
   must pass its supplied `sessionId` explicitly to `status inspect`, render only validated v2
   compact/detail fields, and become semantic-empty on unavailable/stale/error. Setup/update/remove
   must detect foreign or modified plugin IDs/files rather than overwrite them.
3. **Defer persistent StatusLine.** Reconsider only after a released Snow contract exposes the
   current session in `StatusLineHookContext` and either project-scoped plugins or an explicitly
   approved exact-owned global setup. A released TTY capture should then prove initial render,
   resume/session switch, two concurrent sessions in one repository, timed refresh, stale/expired
   clearing, narrow-terminal behavior, plugin failure isolation, and removal.

## Unknowns and verification obligations

- No interactive TTY capture was performed for 0.8.24 StatusLine or AnyPanel. Source plus the
  released `cmd` probe establishes the contracts above, but not terminal layout or remount behavior.
- It remains to verify that a managed prompt shortcut reliably causes Snow to execute the intended
  project Skill rather than merely paraphrase it. Failure must remain a truthful unavailable/on-demand
  result, not trigger a fallback cache search.
- No ownership convention currently exists for omp-flow writes under `~/.snow/plugin/*`. AnyPanel
  therefore needs an explicit product/human decision before design; research does not assign that
  risk tolerance.
- Upstream may later add `sessionId` to StatusLine context or project plugin scope. Pin and probe a
  new released version before changing the recommendation; do not infer support from documentation
  on `main` alone.

## Cache provenance and Reference recommendation

The useful ignored clone is `.omp-flow/cache/repos/snow-cli`, remote
`https://github.com/MayDay-wpf/snow-cli.git`, clean at
`86a18cfbf5844c14a99dcc717eed26b8cf5b89d4` (`v0.8.24`). Useful anchors are:

- `source/ui/components/common/statusline/{useStatusLineHooks.ts,types.ts}` and
  `source/ui/components/common/StatusLine.tsx` — persistent loader, context, refresh and render;
- `source/utils/execution/{sessionIdentityEnv.ts,sessionCommandHandlersExtra.ts}` — exact child
  identity and released command semantics;
- `source/utils/commands/custom.ts` — project command ownership;
- `source/utils/plugins/anypanel/*` and `source/ui/pages/AnyPanelScreen.tsx` — exact-session
  on-demand alternative;
- `source/mcp/skills.ts` — shared project Skill discovery.

Because this clone materially affects design, the main session should add and link one task-local
Reference Concept such as `reference/snow-cli-v0.8.24.md` with this URL, revision, anchors, release
probe results, local interpretation, and the caveat that StatusLine is global/session-blind while
AnyPanel is global/exact-session/on-demand. Do not copy source or create paired metadata.
