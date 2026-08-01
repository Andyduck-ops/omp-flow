---
type: "Research"
title: "Internal harness contracts for a Codex-native Hook adapter"
---

# Internal harness contracts for a Codex-native Hook adapter

This Concept answers the repository-owned portion of the open questions in
[Brainstorm](../brainstorm.md): what capability boundary already exists across Claude, Codex,
and Oh My Pi; what is actually missing in Codex; and what the smallest later design may safely
change. It records research only and authorizes no implementation.

Repository: `git@github.com:Andyduck-ops/omp-flow.git`

Inspected revision: `2c3c2e31db8daa6050e2c847da80d255833a12f5` (2026-08-01 local HEAD).
Historical cutover anchor: `584810bc4a7d3b4fdf06497ee9da7601ba19dfe9` (2026-07-30), parent
`161195782aadaf824b5492592ebcffcf0f509c56`.

## Conclusion

The first-principles anchor is **confirmed but narrowed**. Codex currently lacks an automatic,
structured event bridge and pre-tool protection, but it does not lack the underlying workflow
contracts, runtime receiver, agent role definitions, or read-only status surface. The practical
gap is therefore a thin Codex-native adapter plus safe ownership/merge/update behavior, not a new
control plane and not a port of Claude's Python hooks.

The smallest consequential design should preserve three separations already proved by the other
harnesses:

1. session correlation, dispatch identity, and direct runtime-write protection are mechanical and
   fail closed;
2. native task/attention observation and status presentation are advisory and fail soft to
   `unavailable`/semantic empty;
3. Task/Flow meaning remains authored in Bundle Concepts and published only by the main session,
   never inferred by a Hook.

No implementation should start from this result alone. A separate primary-source investigation
must first establish exact Codex event payloads, blocking/exit semantics, project trust/hash UX,
and supported merge behavior. Those facts decide whether the thin adapter belongs in
`.codex/hooks.json`, project TOML, or a plugin.

## Confirmed facts

### Codex already has the semantic and role layer, but no managed Hook layer

- The managed Codex set consists of five native agent TOMLs, shared workflow Skills, the
  read-only `flow-status` Skill, and `.codex/config.toml`; there is no Hook resource in
  `CODEX_RESOURCES` (`src/cli/init.ts:103`, `src/cli/init.ts:170`). The config only declares the
  trusted-project documentation fallback (`templates/codex/config.toml:1`).
- The Codex researcher contract already enforces the complete path/actor/receipt assignment and
  explicitly disables recursive multi-agent use (`templates/codex/agents/omp-flow-research.toml:11`,
  `templates/codex/agents/omp-flow-research.toml:41`). The Hook gap therefore must not be used to
  redesign agent prompts or assignment meaning.
- Tests deliberately assert that a fresh install has no `.codex/hooks.json`, while deploying the
  byte-identical read-only status Skill to Codex (`tests/omp-flow.test.ts:286`,
  `tests/omp-flow.test.ts:291`). README and the durable Wiki make the same bounded claim: Codex has
  on-demand detail only and no claimed persistent footer (`README.md:477`,
  `.omp-flow/wiki/architecture/harness-flow-statusline.md:99`).

### Claude demonstrates two different failure classes, not one generic Hook policy

- Claude binds session-start, structured task/attention observation, guarded `TaskUpdate`, direct
  runtime-write protection, and managed subagent start/stop at explicit native events
  (`templates/claude/settings.json:6`, `templates/claude/settings.json:83`,
  `templates/claude/settings.json:95`, `templates/claude/settings.json:149`).
- Session orientation bridges the native session ID into `OMP_FLOW_CONTEXT_ID` and emits only
  runtime orientation plus an explicit reminder not to infer lifecycle meaning
  (`templates/claude/hooks/session-start.py:26`, `templates/claude/hooks/session-start.py:55`,
  `templates/claude/hooks/session-start.py:70`). This is path/mechanical orientation, not a rendered
  task context package.
- Direct `Write`/`Edit` into `.omp-flow/.runtime` is denied; malformed protection input exits 2
  (`templates/claude/hooks/protect-runtime.py:39`, `templates/claude/hooks/protect-runtime.py:45`,
  `templates/claude/hooks/protect-runtime.py:58`). The focused integration test proves denial for
  runtime files and allowance for ordinary Bundle Concepts (`tests/omp-flow.test.ts:808`,
  `tests/omp-flow.test.ts:824`, `tests/omp-flow.test.ts:838`).
- Managed `TaskUpdate` authorization is fail closed, but non-managed agents pass through; a denied
  managed call emits a native denial and falls back to exit 2 only if that output itself fails
  (`templates/claude/hooks/flow-status-task-update-guard.py:278`,
  `templates/claude/hooks/flow-status-task-update-guard.py:366`).
- Observation is intentionally fail soft: malformed or partial evidence revokes stale observer and
  authorization state, publishes `unavailable` where possible, and returns success so status cannot
  block work (`templates/claude/hooks/flow-status-observe.py:783`). This distinction is the most
  important reusable design fact for Codex.

### Oh My Pi proves the thin in-process adapter pattern

- The OMP entry point activates only when the `omp` harness is configured, registers Flow Status,
  and subscribes to native `session_start`, `tool_call`, `context`, `session_compact`, and
  `agent_end` events (`src/omp/extension-entry.ts:26`, `src/omp/extension-entry.ts:32`,
  `src/omp/extension-entry.ts:36`).
- Its dispatch boundary validates the native actor ID, role, active task, operation receipt, output,
  and completed predecessor before allowing recognized omp-flow tasks; mismatch blocks the tool
  call (`src/omp/extension.ts:240`, `src/omp/extension.ts:263`, `src/omp/extension.ts:334`,
  `src/omp/extension.ts:358`). It separately blocks writes to Python-owned config/runtime paths
  (`src/omp/extension.ts:369`).
- Its status path writes only the adapter-owned UI key and swallows presentation failure
  (`src/omp/flow-status.ts:340`). Ambiguous, malformed, or partial native progress becomes
  `unavailable`, not invented progress (`src/omp/flow-status.ts:480`,
  `src/omp/flow-status.ts:504`). Unsupported versions, missing APIs, and command conflicts do not
  register the feature (`src/omp/flow-status.ts:562`, `tests/omp-flow-status.test.ts:289`).
- Tests prove exact public-event registration, session-scope rebinding, cleanup, and read-only detail
  without relabelling native task counts as root Flow (`tests/omp-flow-status.test.ts:309`,
  `tests/omp-flow-status.test.ts:358`, `tests/omp-flow-status.test.ts:370`,
  `tests/omp-flow-status.test.ts:401`).

### Installation and update behavior cannot safely accept a Hook file by simple enumeration

- Init treats adapter files as whole managed resources. Existing files are skipped by default and
  overwritten only with force (`src/cli/init.ts:328`, `src/cli/init.ts:349`). That behavior can
  preserve a foreign Hook file, but it cannot merge an omp-flow entry into a user-owned Hook
  document.
- Update auto-overwrites only when the installed hash still matches the stored managed hash;
  modified content is a conflict and defaults to skip (`src/cli/update.ts:64`,
  `src/cli/update.ts:117`). Obsolete files are deleted only when their stored hash still matches;
  modified legacy files are preserved as changed (`src/cli/update.ts:132`).
- Current cleanup explicitly marks former Codex `session-start.py`, `hooks.json`, and
  `inject-workflow-state.py` as obsolete (`src/cli/init.ts:250`, `src/cli/init.ts:282`). Therefore a
  new Hook design must include a deliberate ownership/migration rule; merely reusing these paths
  would collide with an active retirement contract.

## Strongest counter-evidence and revisions

1. **Counter-evidence: Codex Hooks existed before.** At parent revision
   `161195782aadaf824b5492592ebcffcf0f509c56`, `templates/codex/hooks.json` bound
   `UserPromptSubmit` to `inject-workflow-state.py`. Commit
   `584810bc4a7d3b4fdf06497ee9da7601ba19dfe9` removed both on 2026-07-30 while adopting OKF
   Bundles. Current tests call it a “legacy state-render hook” and current update logic retires it.
   This falsifies any proposal to restore per-turn workflow-state rendering under a new native-Hook
   label. It does **not** falsify a bounded mechanical observer/guard.
2. **Counter-evidence: some desired behavior is already portable.** The Python receiver already
   accepts `claude`, `codex`, and `oh-my-pi` hosts, and the Codex status Skill already reads the same
   snapshot. The missing piece is event acquisition and protection, not another cache schema or
   renderer. The Wiki explicitly says a future supported Codex surface can consume the existing v2
   snapshot without changing publisher or receiver
   (`.omp-flow/wiki/architecture/harness-flow-statusline.md:101`).
3. **Revision to the anchor:** “automatic observation and protection” is too broad if it implies
   every lifecycle event should block on adapter health. Only authority/integrity boundaries may
   fail closed. Display/observation must fail soft and revoke stale evidence, matching Claude and
   OMP.
4. **Revision to parity:** Claude has a TaskList/TaskUpdate-specific native authorization protocol;
   OMP has a task-batch descriptor validator. Codex parity should mean equivalent outcomes using
   Codex payloads, not matching either platform's event count, filenames, state shape, or Python
   implementation.

## Candidate decision for later Design

Subject to primary Codex payload evidence, choose a **thin project-native bridge** with only these
responsibilities:

- establish and clear exact repository/session/subagent correlation;
- validate recognized omp-flow subagent dispatch against the existing operation receipt and native
  actor/role tuple before execution when the event contract can block;
- deny direct mutations of Python-owned runtime/config paths for supported native write/edit tools;
- translate supported structured native task/attention events into the existing bounded observer
  input, degrading to `unavailable` on missing, ambiguous, partial, stale, or malformed evidence;
- leave semantic Root Task/Flow publication, Bundle interpretation, progress meaning, review
  acceptance, and status rendering outside the Hook.

The installer must not overwrite or parse-and-rewrite an arbitrary user Hook document by default.
Design must first choose one explicit ownership model supported by Codex: exact owned file with
conflict refusal, a natively composable include/array entry, or a plugin-owned surface. Update must
preserve foreign entries and modified owned content, and any trust/hash change must be surfaced to
the user rather than silently re-approved.

## Unknowns that block Design selection, not this internal conclusion

- Exact Codex payload fields and guarantees for session ID, subagent ID/role, tool call ID, cwd,
  tool arguments/results, compact/resume/fork, and stop/end.
- Which events can synchronously block, how deny is represented, and whether malformed/timeout/exit
  behavior differs between CLI and IDE.
- Whether project `.codex/hooks.json`, `[hooks]` TOML, and plugins compose with user configuration or
  compete for one owned document.
- Trust prompt, Hook hash review, upgrade, rollback, Windows command quoting, Linux executable
  resolution, and behavior when Hooks are unsupported or disabled.
- Whether Codex exposes a complete native task baseline. Without one, the design must not synthesize
  task totals or port Claude's TaskList authorization state.

These questions should be answered by the separately dispatched external Codex research. If its
evidence shows no pre-execution blocking or no stable correlation fields, return to Brainstorm and
narrow the goal to fail-soft observation plus explicit unsupported protection instead of emulating
authority.

## Provenance and Reference decision

No external repository was acquired for this bounded internal question, so no ignored clone-cache
Reference Concept is warranted. The useful repository is the current project itself, identified by
the origin and exact revisions above; its relevant anchors are the cited adapter, installer,
updater, tests, README, Wiki, and the historical Codex Hook cutover. Primary Codex documentation
was deliberately left to the external research question rather than duplicated here.

## Operation correlation

- Actor ID: `hook-research-internal`
- Dispatch receipt: `96d53cfdb04a438fb8514f7dd169c5b1`
- Output boundary: `.omp-flow/tasks/08-01-codex-native-hooks/research/internal-harness-contracts.md`
- Decision impact: confirms a thin adapter direction; narrows fail-closed scope; blocks any
  implementation until external native-contract and installation/trust evidence is linked.
