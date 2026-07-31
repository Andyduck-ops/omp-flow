---
type: "PRD"
title: "Harness-native Flow Status"
---

# Harness-native Flow Status PRD

This PRD commits the user-selected
[Harness-native FlowStatus synthesis](research/flowstatus-synthesis.md) and is realized by the
[shared snapshot and adapter design](design.md). It replaces the branded omp segment and
standalone-renderer-first product shape. It does not by itself authorize implementation.

The 2026-07-31 completion audit reopened the delivery. The previous implementation proved
task-set counts and rendering, but did not prove production Claude sources for methodology
position, current-task-local progress, or attention; its fresh default also left Powerline
disabled, executable tests depended on movable Bundle fixtures, archive links were inconsistent,
and the performance numbers had no defined measurement. The repaired requirements below are
authoritative for the repair work and supersede any earlier **COMPLETE** claim.

## Root Task/Flow projection revision (2026-07-31)

The user-approved
the observable-flow direction at
`.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`
reopens this PRD once more. This section is normative and supersedes the incompatible parts of the
Outcome and R1, R3–R6, R8–R10 below. R2 and the Claude guard, supervisor budget, fixture,
Powerline, reversibility, Windows/UTF-8, documentation and archive-link requirements remain in
force unless this section explicitly revises their widget cardinality or displayed meaning.

The primary glanceable object is now the **one runtime-selected root task Bundle**, not a native
Harness task set or current native assignment. The landed
[`FlowStatusSnapshotV1`](interfaces/flow-status-snapshot-v1.md) remains intact and truthfully
labelled as optional `nativeActivity`. It must not be called the root Task, accepted Work,
methodology Flow, or initiative completion.

The product shall add the closed, explicit
[`RootFlowPublicationV2`](interfaces/flow-status-publication-v2.md) and assemble it with optional
v1 native activity in
[`FlowStatusSnapshotV2`](interfaces/flow-status-snapshot-v2.md). Only an orchestrator/Harness that
has interpreted the authored Bundle may publish v2 semantic facts. Python may validate closed
shape, active task equality, path confinement, actor/session correlation and atomic latest-cache
replacement. Python, adapters, cache and providers shall not parse Markdown/directories, count
files/receipts, infer Flow from native roles/task states, or create a lifecycle database, semantic
ledger or durable history.

The persistent ccstatusline target is exactly two Powerline rows, with two owned **instances** of
the same Flow Status widget/provider:

```text
 Task · 07-30-omp-flow-tui-control · TUI control  Sonnet 4  ctx 38%  main +5 
 Flow 6/9 · Execute  Work 4/13 ████░░░░░░░░░  Review · Round 2 
```

The `root-task` instance belongs on the first row alongside preserved native model, context and
Git widgets. The `flow` instance owns the second row. Fresh confirmed setup creates exactly that
two-row profile and enables Powerline. Existing configuration setup previews and inserts or moves
only those two exact owned instances, retaining foreign widgets, lines, order, theme and
Powerline choice. Earlier singular-instance wording is retired; this does not permit another
widget kind, provider, renderer or third line.

The Flow vocabulary is exactly: Explore (Brainstorm/Research may alternate inside one meaningful
round), Design, QbD 1, Decompose, QbD 2, Execute (Implement/Review/Rework), Integrate, Wiki
knowledge harvest and Finish. `Flow n/9` is reversible orientation, not overall percentage.
Backtrack, resume and reopen are explicit publications and do not manufacture or erase authored
history. Resume alone increments nothing. Explore increments only for material reframing or
reopening caused by evidence, synthesis, audit, review or implementation—not messages, tools,
files or time. QbD 1, QbD 2 and Finish completion audits own separate attempt scopes; a fresh
independent audit increments only its own scope, and model PASS never means human approval.

Execute shall expose the authored Work-set revision, current Work, Implement/Review/Rework focus,
per-Work review/rework round and review verdict. A Work contributes to `accepted/total` only after
its current handoff revision has a different-actor independent review explicitly accepting it.
Changes requested lead to rework and a later review round. Reopening accepted Work may lower the
numerator in a fresh publication; the cache does not enforce monotonic lifecycle state.

The Flow row renders at most one graphical bar. It must belong to the current position and carry
an explicit stable denominator and source/unit-set revisions. Execute normally uses accepted Work;
other allowed owners are phase-local exploration/design checks, audit checks (never attempt
count), authored work-map checks, integration checks, Wiki harvest or finish checks. Flow index,
round, attempt, native task count, receipts, tokens, cost, Git and elapsed time never drive the
bar. Width compaction turns the labelled bar into its atomic labelled ratio before removing it.
Wave is authored drill-down and is excluded from the default footer.

The title is explicit publisher data and optional; consumers never parse `task.md`. Full width
shows `ID · title`; compact width may replace the ID with that explicit friendly title, matching
the durable Wiki; without a title the ID is middle-ellipsized. The Flow row retains, in order,
blocking attention,
Flow index/position, the labelled measure, current Work/review detail, movement, then age/prose.
Unknown, unavailable, stale, malformed, scope/selection-mismatched or disconnected v2 publication
degrades explicitly and cannot borrow authority from v1. Codex remains on demand until a verified
third-party footer exists; Claude is the primary rich target; Oh My Pi may render only the v2
facts its verified native surface can receive explicitly.

The second v2 QbD repair makes that publication operational. The canonical shared
`templates/common/skills/omp-flow/SKILL.md` is the main-session invocation owner for Claude,
Codex and Oh My Pi. It supplies explicit authored semantic input to the single production typed
builder `src/cli/flow-status-semantic-publisher.ts`; the builder performs no Concept/filesystem
read. The installed `omp-flow flow-status publish|renew|clear` commands, common JSON result/error
envelopes and invocation obligations are closed by
[the publisher interface](interfaces/flow-status-publisher-v2.md). `$flow-status` remains
read-only.

Every publish request carries a complete request-only current Work-set baseline: work-set and
catalog revisions, all Work IDs/current revisions, current handoff revision/implementer, and
current independent review identity/revision/reviewer/round/result. The production builder derives
the entire accepted attestation set and the receiver compares every member, including non-current
Works, before storing only catalog/acceptance revision, count and digest. Previous Work/handoff
revision, same actor, stale review, omission or extra acceptance fails closed.

Root truth uses a 10–15 minute scope/selection/session/publisher-bound lease, not the former
1–30-second observation TTL. The main-session orchestrator revalidates unchanged semantic source
and calls `renew` at its control turns/before bounded native waits when five minutes or less
remain. Repeated event-driven renewals keep Implement/Review visible beyond one maximum lease
without a daemon. Native observations, cache/provider reads and render frames cannot renew.
Selection/session/disconnect/archive/remove invokes exact scoped `clear`; crashed/unresumed
publishers expire fail closed.

Implementation must also synchronize the two durable Wiki pages named by the v2 QbD with the
final audited status and schema/capability truth. This Architect repair does not modify Wiki;
documentation changes land with implementation and remain subject to archive-link verification.

### Executable acceptance matrix for this revision

Every criterion below must be executable against the named source; prose inspection alone is not
acceptance:

| ID | Criterion | Executable verification source |
| --- | --- | --- |
| V2-1 | Managed main-session Skill invokes exact production builder/CLI; valid input produces all nine variants; malformed/scope/actor/selection cases return exact stream/exit envelopes. | `tests/flow-status-v2-publisher.test.ts` imports `buildRootFlowPublishRequestV2`; `python -X utf8 tests/flow-status-v2.test.py` exercises receiver envelopes. |
| V2-2 | The production builder—not a test copy—keeps Explore mode in-round, increments meaningful reframe, separates audit attempts, and preserves counters on resume/renew. | `npm test -- --runInBand`, focused `tests/flow-status-v2-publisher.test.ts` transition table. |
| V2-3 | Complete Work catalog derives every accepted member; non-current previous Work/handoff, same actor, stale review, omission/extra entry fail; zero/initial/rework/re-review/no-current are exact. | `tests/flow-status-v2-publisher.test.ts` plus receiver adversarial cases in `tests/flow-status-v2.test.py`. |
| V2-4 | Initial/same/forward/backtrack/reopen/resume, CAS concurrency/idempotency, publish/renew/clear and replaced session have one expected result without semantic history. | Publisher/receiver movement, command-result and cache cases in both named v2 tests. |
| V2-5 | Each position accepts only its allowed explicit measure; attempts/rounds/index/native facts are rejected; accepted-Work ratio equals the attestation aggregate; renderer emits at most one bar. | `tests/flow-status-v2.test.py` plus `node --test tests/flow-status-v2-render.test.mjs`. |
| V2-6 | One canonical v2 envelope assembles independently fresh branches; repeated main-session renewals preserve waits longer than 15 minutes; crash, expiry, stale selection/session and clear fail closed; v1 never renews. | `tests/flow-status-v2-publisher.test.ts` fake-clock lease sequences plus `tests/flow-status-v2.test.py` assembly/cutover/I/O cases. |
| V2-7 | Exact IDs, capability manifest, shared frame read, four placement reports, v1 one-way migration, ownership v2, dedupe/partial/conflict/rollback/remove preserve foreign config and never commit one view. | `npm test -- --runInBand`, focused `tests/flow-status-v2-setup.test.ts` and installed-artifact cases. |
| V2-8 | Wave is revision/scope bounded, absent from both persistent views, and present only in explicit read-only detail fixtures. | `python -X utf8 tests/flow-status-v2-detail.test.py` and `node --test tests/flow-status-v2-render.test.mjs`. |
| V2-9 | Builder/runtime/provider/adapters make zero Markdown/directory/Git/receipt/verdict reads; Work catalog and attestations are discarded; cache stores one latest projection. | Publisher dependency-denial plus receiver cache-content/eviction cases in the named v2 tests. |
| V2-10 | One-frame full/compact/unavailable CJK/ASCII/Powerline samples put Task before native widgets, apply ID/title priority, collapse separators and preserve Flow/denominator priority. | `node --test tests/flow-status-v2-render.test.mjs` on pinned Windows plus normal `npm test`. |
| V2-11 | Durable philosophy/architecture Wiki pages state that formal v2 contracts exist, preserve audited-versus-shipped truth, and remain archive-safe. | Documentation assertion tests plus the existing simulated/final archive-link checker. |

The previously accepted completion-repair test matrix remains required for the Claude guard,
doctor evidence separation, safe commit order, supervisor timing/cleanup, movable fixtures and
post-archive link validation. A fresh independent QbD audit and linked human calibration must
approve this revision before implementation dispatch.

## Outcome

In the first release, a developer can glance at Claude Code's ccstatusline or the pinned,
capability-probed Oh My Pi 17.2.1 native footer and understand:

- how many tasks are in the current complete source-owned task set;
- how many are complete, active, pending, or failed;
- which bounded task is current;
- which explicit assignment role places the current work in the methodology;
- how far that exact task has progressed when its owner supplies a stable denominator; and
- whether fresh attention is required.

In Codex, the same bounded detail is available on demand through `$flow-status`; the first release
does not call that a persistent or glanceable footer.

These flow facts appear alongside existing Harness information. They do not add a visible `OMP`,
`omp:`, logo, or Bundle shorthand. Claude v2 uses the exact two ccstatusline Powerline lines; Oh My Pi
uses one compact native footer contribution; there is no separate dashboard or parallel
status-line renderer.

## Requirements

### R1 — Shared facts, native presentation

The product core shall be one closed read-only `FlowStatusSnapshotV1`. Each Harness adapter shall
translate that snapshot into its supported native presentation primitives and shall not re-count
tasks, reinterpret methodology, or recalculate progress.

Claude Code shall use ccstatusline as the primary rich presentation owner. A verified Oh My Pi
adapter shall contribute one compact native status entry. Codex shall expose on-demand detail
through the managed `$flow-status` Skill until a public third-party footer provider exists.
Themes, Powerline wrappers, placement, width, refresh, controls, and UI lifecycle remain owned by
the Harness or ccstatusline.

### R2 — No injected product branding

Default and built-in presentation shall add no `OMP`, `omp:`, product logo, Bundle shorthand, or
command prefix. Source-owned task labels may contain arbitrary safe user text, but the adapter
shall not inject product branding around them.

### R3 — Honest task-set counts

`tasks` shall mean one current complete task set explicitly owned by the Harness or another
accepted source. The snapshot shall retain source ID, task-set ID, membership revision, observed
time, and freshness. Counts shall include total, completed, active, pending, and failed with
testable arithmetic invariants.

Each supported Harness capability shall translate a closed source observation containing either a
complete bounded ephemeral member list or an unavailable reason
(`unsupported`, `incomplete`, `stale`, `malformed`, or `disconnected`). The producer validates
membership and counts, stores only aggregate counts plus a membership digest, and discards the
member list. An unavailable set retains source health/attention but has no current task or
progress.

The product shall not count repository task Bundles, `work/` files, Markdown lists or checkboxes,
operation receipt history, filenames, Git changes, agents ever spawned, or inferred future work.
If completeness or current membership is unavailable, task totals shall be omitted or visibly
degraded.

### R4 — Current bounded task

The current task ID and display label shall come from the same current task-set membership
revision. The current task shall be suppressed or marked unbound when it is absent from that exact
set, stale, or scope-mismatched. Its label shall not be reconstructed from a Concept path, prompt,
branch, or terminal text.

### R5 — Methodology position without lifecycle state

The status surface shall display the current assignment's literal supported role and may translate
it only through this v1 vocabulary: `executor` to Implement, `reviewer` to Review, `researcher` to
Research, `architect` to Design, `qbd-auditor` to QbD, and `planner` to Plan. `explore`, `oracle`,
and `orchestrator` are presentation-neutral because none establishes one unique methodology
position. Unknown roles are malformed until a reviewed contract version adds them.

This translation is a label for current work only. It shall not assert that earlier positions are
complete, that later positions are pending, that a gate passed, or that the Bundle owns a
machine-readable lifecycle phase. No role, position, transition, approval, or review result may be
inferred from Markdown, directories, file presence, operation age, or Git.

Claude Code shall not assume that `TaskList.owner` automatically equals
`SubagentStart.agent_id`; no accepted source proves that behavior. A positive Claude assignment
requires an explicit native binding handshake:

1. a complete main-session `TaskList` supplies exactly one current task;
2. a structured `SubagentStart` supplies a fresh `agent_id` and an exact managed `agent_type`;
3. the managed identity Hook issues a bounded one-time binding nonce for that exact
   repository/session/task-set revision/task/agent tuple through its existing documented
   `additionalContext` channel; and
4. the same agent successfully calls native `TaskUpdate` for that exact task with
   `owner = agent_id` and the closed binding metadata/nonce, with a structured result proving both
   fields were accepted.

Only then may the adapter use the reviewed `agent_type` mapping:
`omp-flow-architect` to `architect`, `omp-flow-check` to `reviewer`,
`omp-flow-implement` to `executor`, `omp-flow-qbd` to `qbd-auditor`, and
`omp-flow-research` to `researcher`. The mapping is compiled adapter data over the native hook
value, not a scan of an agent filename or frontmatter.

The five managed Claude agent definitions shall explicitly allow `TaskUpdate` and constrain it to
this exact self-binding/progress publication contract. The same installation shall register one
synchronous `PreToolUse` command Hook matching exact `TaskUpdate`. For an exact managed
`agent_type`, that guard shall deny before execution unless the common `agent_id`, canonical
repository, session, current task, task-set and membership revisions, pending or consumed nonce,
`tool_use_id`, and complete `tool_input` match one closed authorized shape:

- **bind:** the only top-level members are `taskId`, `owner`, and `metadata`; `taskId` is the
  pending current task, `owner` is the exact native `agent_id`, and metadata contains only the
  exact injected `flowStatusBindingV1`;
- **progress:** the only top-level members are `taskId` and `metadata`; metadata repeats the exact
  consumed immutable binding and contains one valid `flowStatusProgressV1` transition for that
  same task.

The guard shall atomically reserve the accepted intent under its exact `tool_use_id` before
returning `permissionDecision: "allow"`. It shall return
`hookSpecificOutput.permissionDecision: "deny"` for a missing, stale, replayed, concurrent, or
mismatched binding; another task/owner; any extra top-level or metadata member; `status`,
deletion, dependency, subject, description, or unrelated native mutation; or an invalid progress
transition. Parse, I/O, lock, state, or serialization failure shall emit deny, or exit code 2 when
a JSON denial cannot be emitted.

Normal setup shall not claim it can force a native Claude `TaskUpdate` without an authenticated
model turn or documented direct invocation surface. Readiness instead requires:

1. pinned official provenance for the installed Claude version's common subagent fields,
   `PreToolUse` input/decision shape, subagent Hook propagation, and exit-code-2 blocking behavior;
2. deterministic direct conformance over the exact staged guard executable, including every
   allowed/denied payload, reservation transition, malformed input, internal failure, and exit
   code, followed by the same bounded doctor matrix against the exact installed digest and an
   isolated temporary authorization-state root;
3. byte/digest verification of the installed executable, exact `PreToolUse` matcher/command, and
   five exact managed definitions; and
4. a safe commit order that installs and verifies the guard and matcher before atomically
   replacing any agent definition with a `TaskUpdate`-enabled version, rolling all definitions
   back to no-`TaskUpdate` before removing the guard on failure.

Doctor shall report these dimensions separately as `configured`, `guardConformant`, and
`nativeE2E`. Passing normal setup means configured and conformant; it shall display
`nativeE2E: unproven` rather than manufacture a sentinel result. A separate controlled,
authenticated native session may promote the evidence to `proven` only after observing both an
allowed managed bind/progress call and a denied mutation with no side effect. Lack of credentials
does not make normal setup impossible and does not permit an E2E claim. The five agents still have
no `Agent` dispatch tool, and main-thread or unmanaged native TaskUpdate behavior is outside this
managed publication guard.

A missing baseline, nonce, authorized and successful owner/metadata result, current-task match, or
exact agent type yields `assignment: null`. Main-thread work, built-in/unmanaged or renamed
agents, competing bindings, and stopped agents have no positive Claude methodology position. The
adapter shall not parse the dispatch descriptor, prompt, transcript, agent Markdown, Concept
path, or operation history to fill the gap.

### R6 — Honest task-set and task-local progress

A labelled task-set bar or ratio may appear only for a fresh complete task set, using completed
members over that exact membership revision's total. A current-task bar or ratio may appear only
when a fresh source owns a stable nonzero denominator, current value, unit, task binding, source
revision, and membership revision. Task-set completion and current-task progress shall retain
distinct labels, sources, revisions, and denominators.

Context, cost, duration, tokens, Git, receipt counts, task-set counts, elapsed time, and authored
Concepts shall never move current-task progress. One widget renders at most one graphical bar;
the configured target defaults to task-set completion, while the other valid measure remains a
labelled ratio. If the selected target is unavailable, the widget may use the other valid measure
without relabelling it. There is no overall methodology percentage or ETA. Invalid, stale,
replayed, unbound, or denominator-changing progress loses display authority.

Claude current-task-local progress is opt-in structured data authored by the explicitly bound
managed agent. After the binding handshake, that agent may use its newly allowlisted
`TaskUpdate` only for the same current task and closed `flowStatusProgressV1` metadata defined by
the Design. Before implementation work begins, the agent authors a bounded stable unit set and
fresh opaque unit-set/source revisions; subsequent successful updates publish only the completed
unit count over that denominator. For one consumed binding, `label`, `unit`, `total`, and
`unitSetRevision` are immutable, `total` is an integer from 1 through 32, `current` is an integer
that strictly increases from its last accepted value without exceeding `total`, and every
accepted `sourceRevision` is fresh. Changing unit identity, order, label, or denominator requires
a new native assignment and binding; the guard denies such a change inside the current binding.

The metadata supplies its own label, unit, current value, stable nonzero denominator, unit-set
revision, and source revision. A `TaskList` baseline does not contain this metadata and therefore
cannot manufacture or restore task-local progress. An agent without `TaskUpdate`, a failed or
out-of-contract update, baseline replacement, owner/agent/task/assignment/nonce mismatch,
`SubagentStop`, revision reuse after a denominator change, resume/compact/fork, observed replay,
or expiry removes its authority. An unobserved lost Hook cannot be detected immediately and is
bounded only by the source maximum age.

### R7 — Attention and freshness

Attention shall retain source, revision, severity, kind, reason, count, observation time, and
maximum age. Blocking attention survives width compaction before optional detail. A stale or
disconnected source may produce a degradation marker but cannot preserve an old approval,
progress, task, or active-role claim as current.

Claude blocking attention shall come only from structured, correlated native pairs:
`PreToolUse(AskUserQuestion)` to matching `PostToolUse`/`PostToolUseFailure`,
`Elicitation` to matching `ElicitationResult`. Correlation uses the exact native
`tool_use_id` or `elicitation_id` plus repository, session, and optional bound `agent_id`.
Claude `PermissionRequest` is not a v1 blocking-attention source because its documented input has
no `tool_use_id`; input, prompt ID, time, ordering, and adapter sequence cannot manufacture one.
`PermissionDenied` and structured tool failures may produce bounded terminal warnings under their
own native ID, but they do not imply that an approval dialog is still waiting. Raw notification
prose, raw error text, prompts, transcripts, `last_assistant_message`, elapsed silence, and
filename or Markdown content are never attention sources. An unpaired event expires and degrades
rather than remaining a perpetual input claim.

### R8 — Claude Code minimal extension

The supported Claude integration shall add exactly one Flow Status widget kind and one bounded
read-only provider to a disclosed compatible ccstatusline build. The widget shall participate in
ccstatusline's existing manifest, configuration TUI, Powerline renderer, themes, flex layout,
semantic-empty behavior, line editor, and tests.

The extension shall not duplicate ccstatusline's renderer, theme system, terminal-width detector,
configuration UI, or general widget framework. It shall not depend on ccstatusline's transcript,
account, OAuth, arbitrary-command, or global session-scan facilities.

The implementation should be upstreamable. Until an upstream release includes the capability,
setup may use only a pinned reviewed build that advertises all four v2 capabilities in the
snapshot interface: widget, snapshot schema, exact views, and shared-frame read. A
`flowStatusWidgetV1`-only build is not v2-ready; setup shall not hot-patch an arbitrary global
installation.

### R9 — Two Powerline lines

The retention-guaranteed profile places the exact `root-task` instance first on line one, followed
by the user's existing model/workspace/context/Git widgets in their original relative order, and
places the exact `flow` instance on line two. Semantic empty leaves no stray separators and
suppresses an otherwise-empty second line. No adapter creates or targets a third line. A one-line
profile is not v2 readiness.

The compact first-row form uses explicit friendly title instead of full Task ID when present;
otherwise it middle-ellipsizes ID. The second row prioritizes blocking attention, Flow
index/position, labelled phase measure, current Work/review detail, movement and freshness/prose.
Graphical fill becomes the same labelled ratio first. `Flow n/9 Label` is the minimum valid Flow
fact. Unknown width uses the tested semantic-empty/unavailable thresholds and ASCII fallback from
the v2 snapshot interface.

On a fresh installation with no ccstatusline configuration, confirmed setup enables Powerline and
creates `omp-flow-root-task-v2` before native `model`, `context-length`, `git-branch` and
`git-changes` on line one, and `omp-flow-flow-v2` on line two. The exact separator is U+E0B0,
start cap U+E0B6, and end cap U+E0B4, with the documented ASCII fallback. On existing
configuration, setup does not enable Powerline, add host widgets, change a theme, or normalize
choices; it atomically inserts or moves both exact owned instances at their explicit placements.

### R10 — Codex and Oh My Pi capability gating

The Codex adapter shall probe the installed public surface. While arbitrary third-party persistent
footer items remain unsupported, it shall leave `tui.status_line` unchanged and expose read-only
detail through `$flow-status`. It shall not use cursor overlays, screen scraping, terminal
wrapping, or a version guess as a substitute.

Oh My Pi support shall require `@oh-my-pi/pi-coding-agent` 17.2.1 or a separately verified
compatible revision, pinned initially to upstream
`7a2ced50bea8b97dbab7d9bd579329c4ea704de0`. The thin adapter shall use
`ctx.ui.setStatus("flow-status", text)` for a compact native footer contribution and register one
read-only `/flow-status` detail command. It shall consume only the exact selected native `task`
call's structured full `TaskToolDetails.progress[]` snapshots and shall not merge concurrent
unselected calls. It shall clear only its exact status/command ownership on invalidation or
removal. Older or unverified versions retain direct `omp-flow status inspect` without a persistent
claim. The adapter shall not own native dispatch, concurrency, cancellation, result delivery, or
UI lifecycle.

### R11 — Bounded hot path and cache

Snapshot input shall be closed, UTF-8, schema-versioned, and at most 64 KiB. Arrays, identifiers,
labels, counts, timestamps, and freshness shall have explicit bounds. A cache shall be ignored,
atomic, reconstructable, safe to delete, limited to one snapshot for each of at most eight
repository/host/session scopes, and evict entries after 24 hours.

The ccstatusline provider hot path shall perform one bounded regular-file cache read, emit once,
and return. It shall perform no network request, transcript read, credential/account access, Git
crawl, Harness-wide discovery, or Markdown parse. An in-process synchronous `statSync`/
`readFileSync` path cannot promise to interrupt a stalled operating-system read; the product shall
not describe a timestamp check around that call as a hard I/O deadline.

Claude setup shall instead configure one short-lived, no-shell supervisor as the status-line
command. The supervisor spawns exactly the pinned ccstatusline executable as its one child,
forwards bounded stdin/stdout, and schedules degradation at **400 ms after successful child
spawn**. On that callback it freezes the semantic-empty result, detaches/destroys pipes, invokes
Node `ChildProcess.kill()` with the default signal (the supported Windows forceful-termination
path), unreferences the child, and exits the presentation path. It is not a renderer, daemon,
worker pool, or resident accessory. Provider code starts no further child.

The release targets remain 50 ms p95 warm provider time, 250 ms p95 cold configured-command time,
and a **600 ms supported-environment degraded-return service budget** for a hung child on the
pinned idle Windows/Node job. This is the behavior the user needs: an optional status renderer
must stop delaying terminal work and fail semantic empty. It is a measured service-level budget,
not a hard-real-time or arbitrary-OS guarantee.

Those budgets are release gates with one normative measurement:

- warm is 200 measured in-process provider iterations after 20 discarded warm-ups; every sample
  performs a real open/read/validate/format over a fresh valid cache entry, and nearest-rank p95
  shall be at most 50 ms;
- cold is 40 newly spawned, fully configured statusline processes using distinct temporary
  repository/cache directories, and nearest-rank p95 shall be at most 250 ms; and
- timeout service is 20 invocations of the exact exported production supervisor/termination function
  with an intentionally hanging test child. The child emits one fixed readiness marker after
  spawn and then remains alive without exiting; it is not represented as a cache reader. The
  supervisor schedules kill at 400 ms from successful child spawn and uses the same pipe detach,
  `ChildProcess.kill()`, semantic-empty, unref, and exit path as the configured production
  command. On the pinned idle CI environment every case must record kill-request timer lateness
  at most 50 ms and supervisor degraded return at most 600 ms. Child `close` and external PID
  absence are a separate asynchronous cleanup gate at most 1000 ms. A 1200 ms parent watchdog
  only classifies a cleanup failure and every intervention fails. The production CLI remains
  closed to the exact probed ccstatusline executable and never accepts a child path from stdin,
  environment, status input, or user config.

The benchmark shall emit machine-readable raw durations, p95, maximum, sample counts, fixture
size, and Node/Python/OS versions. It runs serially on the pinned Windows Node 22/Python 3.12 job
and locally in a real UTF-8/CJK path. Meeting the budget through memoizing an old snapshot,
starting a daemon, skipping validation, or replacing the real child/read boundary with a
cooperative mock is forbidden for warm/cold measurement. The provider receives separate semantic
tests over real regular files for valid, missing, stale, oversized, malformed, partial, CJK, and
non-regular inputs. No test or product claim says an in-process synchronous regular-file read can
be interrupted. Node timers are not exact: CPU starvation, VM suspension, process-spawn delay, and
OS scheduling outside the pinned idle supported environment can exceed the service budget. The
supervisor shall still degrade and request cleanup when it next runs; it shall not describe the
600 ms CI gate as a universal deadline.

### R12 — Read-only status and native drill-down

Persistent status is display-only and contains no action capability. The direct
`omp-flow status inspect` CLI and managed Codex `$flow-status` Skill may show provenance, task
membership proof, binding, progress source, and attention.
Any later preview, attach/focus, native interrupt, or process stop shall re-query the owning live
adapter and validate target, assignment, actor, task-set revision, capability revision, freshness,
and confirmation. Cached display data shall never authorize mutation or change a receipt.

### R13 — Reversible installation

Setup shall detect Harness, scope, current status owner, compatible ccstatusline capability, and
native adapter capability; preview exact package revision and structured configuration changes;
preserve all existing widgets, themes, lines, ordering, refresh settings, and unrelated fields;
and add both exact view instances/one provider registration only after confirmation.

Repeated setup shall be idempotent. Removal shall delete only the two exact managed Flow Status
instances, provider, or native registration. It shall not uninstall ccstatusline, replace another
renderer, rewrite user lines, or delete task data.

Fresh absence and existing ownership are distinct installation states. For fresh absence, setup
may create the exact R9 default after confirmation and records the pre-install absence plus the
managed post-install digest. For an existing config, the target decoded document equals the
original plus or minus the two owned instances, with foreign relative order and unknown fields
unchanged. Removal may restore absence only when a wholly managed fresh config still matches its
recorded digest. Otherwise it removes only exact owned instances and preserves the file.

For Claude, the exact managed `statusLine.command` is the bounded supervisor, parameterized with
the explicitly probed pinned ccstatusline executable and config path. Setup previews that complete
argv relationship, records its ownership, and rejects shell composition, an arbitrary child
command, an unprobed executable, or a foreign supervisor. Existing non-owned status commands
remain a conflict and are not replaced.

### R14 — Windows and terminal correctness

Paths and I/O shall be UTF-8-safe on Windows. Width shall use ccstatusline or native Harness
information, count terminal display columns rather than bytes or UTF-16 units, and provide
Unicode/Powerline plus ASCII fallbacks. Unknown Windows width shall choose conservative compact
output without Unix process-tree, `stty`, or `tput` probing.

### R15 — Documentation truthfulness

The project Wiki may describe this selected architecture before implementation as design
knowledge. README shall describe Flow Status as available only after the shared provider and at
least one supported adapter, installation path, and verification suite land. Documentation shall
state current Harness asymmetries and exact supported package/capability revisions.

## First-release non-goals

- A branded omp-flow status bar, standalone renderer, full-screen dashboard, or replacement
  terminal host.
- A lifecycle database, semantic event ledger, Markdown parser, duplicate task registry,
  exact-topology model, compatibility reader, or second dependency graph.
- Inferring task sets, current task, phase, acceptance, review verdict, human approval, overall
  percentage, or ETA from authored files or mechanical receipts.
- A general ccstatusline plugin ABI, widget marketplace, theme fork, or maintained copy of its
  entire editor/renderer system.
- Transcript/session scraping, account or credential discovery, private usage APIs, arbitrary
  shell widgets, network Git enrichment, or aggregate analytics.
- Approval relay, spawn, steering, archive, destructive session removal, or cached-status control.
- Claiming persistent Codex status support, or Oh My Pi support outside the pinned/probed public
  capability, before an installed public API proves it.

## Acceptance criteria

1. A complete task-set fixture with seven tasks, three complete, one active, two pending, and one
   failed renders a labelled task-set summary with the same denominator and arithmetic; changing
   receipt counts alone does not change it. Claude remains unavailable until a successful complete
   `TaskList` baseline, and Oh My Pi requires a full indexed progress array equal to the selected
   submitted batch length.
2. Incomplete, stale, membership-replaced, malformed, wrong-repository, wrong-session, and
   unsupported task sets cannot render fresh totals.
3. A current task renders only when its ID and membership revision match the current set; wrong,
   removed, replayed, and stale tasks render unbound/degraded without borrowing a filename label.
4. Claude role fixtures replay the executable handshake from complete sole-current TaskList,
   through managed SubagentStart/nonce injection, to a same-agent successful TaskUpdate of the
   exact task owner and binding metadata. Tool-availability tests prove each managed definition
   exposes `TaskUpdate` only after the installed synchronous guard/matcher and safe commit order
   are verified. Direct guard conformance
   tests allow the exact bind and progress inputs, atomically reserve `tool_use_id`, and deny
   before authorization for another task/owner, extra key/metadata, status, deletion, dependency,
   subject, description, missing/expired/replayed nonce, invalid transition, concurrent call, and
   guard parse/I/O/lock/state/serialization failure. Doctor reports configured, conformant, and
   native-E2E evidence independently; normal setup is not blocked by absent model credentials and
   never labels fixture conformance as native E2E. Missing/mismatched nonce, task, owner, agent,
   result field, unmanaged/renamed agent, main-thread work, competing bind, stop, observed replay,
   and session change remove the role. No test assumes automatic owner equality.
5. After that handshake, a real successful Claude `flowStatusProgressV1` TaskUpdate fixture and
   the existing Oh My Pi structured fixture render their own labelled `current/total`; wrong task,
   owner, agent, nonce, assignment, source revision, membership revision, unit, denominator,
   reused unit-set revision, unavailable tool, failed update, observed replay, stop, disconnect,
   and expiry remove the ratio/bar. A TaskList baseline alone never creates or restores
   task-local progress.
6. Task-set and task-local progress remain separately labelled; at most one is graphical and the
   other remains a ratio. Context, cost, duration, tokens, Git, receipts, and time cannot move
   either value.
7. Correlated Claude AskUserQuestion and elicitation fixtures produce and clear blocking attention
   by exact native ID; PermissionDenied/failure fixtures produce bounded terminal warnings only.
   PermissionRequest and notification fixtures prove they cannot create waiting approval because
   they lack a start/terminal correlation ID. Unpaired, mismatched, stopped, stale, observed
   replay, and session-replaced observations do not survive freshness, and raw
   message/error/final-response text is never parsed.
8. Supported ccstatusline fixtures register exactly one new widget kind/provider with two exact
   view instances and reuse the existing
   manifest, editor, Powerline themes, flex layout, separator collapse, and semantic-empty line
   suppression.
9. Compact and full final-composition fixtures for the guaranteed two-view/two-line profile at
   160, 120, 100, 80, 60, and a conservative 20-column unknown-width budget produce at most two
   lines, retain atomic facts according to the documented blocking-attention/task-progress/
   task-set priority, render at most one correctly labelled bar, and inject no `OMP`, `omp:`,
   logo, or Bundle shorthand.
10. Missing root Flow yields one `root-task` unavailable marker and semantic-empty `flow`; a width
    below six columns empties both managed views without doubled or dangling separators.
11. The Flow Status provider/supervisor tests prove no transcript, todo, account, credential,
    Keychain, private API, arbitrary command, inherited-environment shell, network, or Markdown
    dependency. The supervisor spawns only the explicitly probed pinned executable with argv,
    bounds stdin/stdout, returns semantic empty within the supported degraded-return budget, and
    satisfies the separate asynchronous child-close/PID cleanup gate.
12. Current Codex fixtures leave `tui.status_line` unchanged; deploy, discover, repeat, conflict,
    and exact-owner-remove the canonical project `$flow-status` Skill; and activate a future
    persistent adapter only after a positive public capability probe.
13. Oh My Pi 17.2.1 fixtures pin the upstream revision; probe the capability; register exactly the
    `flow-status` footer key and one read-only `/flow-status`; handle flat, batch, background,
    failed, aborted, concurrent, stale, and disconnected calls; preserve unrelated status and
    commands; and prove older/unverified versions retain only direct CLI detail without assuming
    dispatch/cancellation ownership.
14. Compatible, absent, incompatible, declined, repeated, user/project, corrupt, and removal setup
    fixtures prove that fresh absence creates the exact enabled two-line Powerline default, while
    an existing config changes only by atomic insertion/movement/removal of the two owned views. Every
    original decoded node/order and every unrelated file remains equal; existing Powerline/theme
    choices are never normalized.
15. Cache, performance, and timeout-service fixtures enforce bounds, scope matching, expiry, atomic
    recovery, LRU/24-hour eviction, no resident accessory process, 200-after-20 production-reader
    warm samples at p95 <= 50 ms, and 40 normal whole supervised-command cold samples at
    p95 <= 250 ms. Separate regular-file semantic tests cover every specified valid/degraded
    result without an interruption claim. Twenty intentionally hanging-child cases call the exact
    exported production supervisor/kill path and, on the pinned idle Windows/Node job, require all
    20 kill requests by 450 ms, all degraded supervisor returns by 600 ms, and all child
    `close`/PID-absence confirmations by 1000 ms; a 1200 ms cleanup watchdog is always failure.
    JSON records timer lateness, kill result/error, pipe detach, degraded return, child close, PID
    probe, and scheduler/environment metadata separately. These are supported-environment service
    gates, not hard-real-time guarantees.
16. Real Windows CI covers UTF-8/CJK paths, display-column width, Powerline and ASCII output,
    atomic writes, deadline/process exit, and unknown-width behavior.
17. Deleting the presentation cache leaves no lifecycle database, semantic history, duplicate task
    registry, or durable session projection.
18. README does not claim the feature is usable until provider, adapter, setup, and verification
    implementation are present; the Wiki clearly labels the pre-implementation architecture.
19. Executable Flow Status payload tests load native JSON only from
    `tests/fixtures/flow-status/`; a targeted import/read-path scan finds no fixture dependency on
    a current or archived Bundle. Legitimate runtime lifecycle tests that create or inspect
    `.omp-flow/tasks/` are not falsely rejected. Bundle provenance remains explanatory, the five
    historical fixture references name only the stable code-form paths, and
    `reference/fixtures/*.json` does not remain as a second payload tier after migration.
20. The archive-aware link command first simulates the exact dated archive destination and then
    runs after the real atomic move. It resolves files and anchors for every Bundle Markdown link,
    README, Wiki, completion, repair handoff, and repair review; rejects simultaneous
    current/archive Wiki backlinks; and records zero broken targets from the final location. The
    repair scope owns all 13 previously identified repository-external links, all five historical
    fixture-relocation references, and the Wiki backlink.
