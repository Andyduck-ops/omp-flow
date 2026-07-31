# Completion-audit Flow Status repair

**Status:** IMPLEMENTED — the repaired Work passed fresh
[QbD 2](../qbd/qbd-2/flowstatus-workmap-audit-2.md), received linked
[human approval](../qbd/qbd-2/human-decision.md), and produced the
[v2 implementation handoff](handoffs/flow-status-v2-implementation.md). It now awaits independent
implementation review.

## Objective

Repair the independently observed gaps that reopened the Flow Status delivery:

1. Claude must have production, structured, revision-bound sources for methodology position and
   current-task-local progress without assuming that `TaskList.owner` identifies a managed
   `SubagentStart`.
2. Claude attention must use only documented start/terminal correlations; `PermissionRequest`
   cannot be treated as a correlated blocking start.
3. Every managed Claude agent that publishes binding or progress must actually expose
   `TaskUpdate`, with native mutation authority enforced before execution by a fail-closed
   parameter guard.
4. A fresh Claude installation must actually enable the recommended two-line Powerline profile,
   while an existing ccstatusline configuration must remain user-owned.
5. Executable tests must not import fixtures from a movable task Bundle.
6. Repository documentation and Bundle links must remain truthful after the Bundle is archived.
7. The 50 ms warm p95, 250 ms cold p95, and responsive hung-child degradation behavior must be
   measured over defined supported-environment service boundaries rather than asserted as a hard
   real-time guarantee.
8. The first status row must identify the one runtime-selected root task Bundle beside preserved
   native model/context/Git, and the second row must show one reversible authored Flow
   orientation, phase detail, and at most one honest graphical measure.
9. The existing v1 task-set/assignment/progress implementation must remain accurately labelled
   native activity, while a new explicit orchestrator/Harness v2 publication supplies root Task,
   Flow, rounds/attempts, accepted Work, movement and phase measure without semantic inference in
   Python, adapters, cache or providers.

This remains one bounded repair because the gaps meet at the shared publication boundary and the
installed Claude path. It now compatibly extends the shared snapshot to v2 and revises the
ccstatusline configuration from one widget instance to two views of the same widget/provider.
The landed v1 source/snapshot, accepted Oh My Pi native-activity adapter, Codex capability
decision, and ccstatusline renderer architecture remain intact; v1 facts cannot stand in for v2.

Because this revision replaces the earlier 500 ms hard-deadline wording with 400/600/1000 ms
supported-environment service budgets, implementation dispatch requires a fresh independent QbD
PASS and explicit human calibration of that user-facing tradeoff.

## Inputs

- [Reopened completion record](../completion.md)
- [Repaired PRD](../prd.md)
- [Repaired Design](../design.md)
- [Root Flow publication v2](../interfaces/flow-status-publication-v2.md)
- [Flow Status snapshot v2](../interfaces/flow-status-snapshot-v2.md)
- [Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md)
- [Second completion-repair QbD](../qbd/completion-repair-audit-2.md)
- [Third completion-repair QbD](../qbd/completion-repair-audit-3.md)
- [First root Task/Flow v2 QbD FAIL](../qbd/flow-status-v2-audit-1.md)
- [Second root Task/Flow v2 QbD FAIL](../qbd/flow-status-v2-audit-2.md)
- [Flow Status semantic publisher v2](../interfaces/flow-status-publisher-v2.md)
- [Prior Claude work](claude-ccstatusline.md)
- [Prior setup and integration work](setup-docs-and-integration.md)

## Required product changes

### Explicit root Task/Flow v2 publication

- Extend canonical `templates/common/skills/omp-flow/SKILL.md` and its normal managed deployed
  copies with the exact main-session publish/renew/clear obligations. Do not grant write behavior
  to the read-only `flow-status` Skill.
- Add the sole production typed builder
  `src/cli/flow-status-semantic-publisher.ts#buildRootFlowPublishRequestV2` and installed
  `omp-flow flow-status publish|renew|clear` entries. The builder consumes only closed explicit
  `RootFlowSemanticInputV2`; it performs no filesystem/Markdown/directory/Git/receipt/handoff/
  Review/verdict/prompt/transcript read. Publisher tests import this exact export.
- Implement the common success/error JSON, stdout/stderr, exit 0/2/3, request scope and clear
  schemas exactly. Invoke publish at initial selection, semantic transition, accepted review,
  backtrack/reopen/resume and Finish; clear at selection/session/disconnect/archive/remove.
- Add the exact closed `RootFlowPublishRequestV2`, nine-variant `FlowDetail`,
  `AcceptedWorkAttestationV2`, `RootFlowPublicationV2` and `FlowStatusSnapshotV2` contracts linked
  above. Every member, nullable value, enum, bound and relational combination is normative.
- Make the main-session omp-flow orchestrator the sole semantic publisher/transition authority.
  It reads authored Concepts and invokes the exact installed publisher entry above with closed
  semantic input.
  Portable Python validates canonical repository, selected root task, host/session/caller scope,
  freshness, current-revision CAS and local relations; it does not discover semantic fields.
- Implement closed `initial`/`same`/`forward`/`backtrack`/`resume`/`reopen` relationships,
  idempotent exact retry, one-winner concurrency and latest-value replay limits. Cross-publication
  counter meaning is proved by tests importing the production builder, not cache history or a
  test-only transition table.
- Preserve `FlowStatusSnapshotV1` unchanged as optional `nativeActivity`. Never relabel its native
  task-set membership, assignment role or task-local progress as root Task, Flow, Work acceptance
  or v2 progress. Scope mismatch, absence or stale v2 degrades explicitly rather than borrowing
  authority from v1.
- Implement the closed nine-position renderer vocabulary: Explore, Design, QbD 1, Decompose,
  QbD 2, Execute, Integrate, Wiki and Finish. Treat the ordinal as reversible orientation, not
  initiative completion. Support initial/same/forward/backtrack/resume/reopen without inferring
  prior or future state.
- Validate the exact phase unions: meaningful Explore rounds; separate QbD 1,
  QbD 2 and completion-audit attempts; explicit human calibration; per-Work
  Implement/Review/Rework rounds; and accepted Work only after current-revision, different-actor,
  independent accepted review. Initial implementation is review/rework round zero; the first
  review is round one. Every request carries the complete request-only current Work catalog:
  work-set/catalog revision and every Work's current revision, handoff/implementer and independent
  review identity/revision/reviewer/round/result. The production builder derives the entire
  attestation set; the receiver compares every entry, including non-current Works, then stores
  only catalog/acceptance revisions, digests and aggregate. Never parse handoff/Review Concepts.
  Resume alone changes no counter; reopened Work may reduce the numerator.
- Accept zero or one explicit stable-denominator phase measure using only the position-compatible
  owners. Reject Flow index, rounds, audit attempts, native counts, receipts, context, tokens,
  cost, Git and time as bar sources. Render at most one graphical bar and collapse it to the same
  atomic labelled ratio at compact widths.
- Keep Wave out of both persistent views. Its explicit ID/title/revision/work-set/ordinal/focus
  shape may appear only in the revised read-only detail surface.
- Use only host literals `claude`, `codex`, `oh-my-pi`. Under one scope lock, live v1 observation
  and v2 publication update independent branches of one canonical v2 envelope with one atomic
  write. Cutover never reads an old v1 cache; it invalidates it and waits for fresh live data.
  Bound the latest cache by the existing 64 KiB, regular-file, eight-scope and eviction rules.
  Do not add dual write, compatibility reader, lifecycle database, semantic ledger, Markdown
  parser, history store, or directory/file counter.
- Replace root `maxAgeMs` with the exact 10–15 minute publisher lease. At main-session control
  turns and before native waits, when no semantic change is pending and at most five minutes
  remain, explicitly revalidate selection/session/source and call renew; wait polling returns
  control at least every five minutes. Renew changes only lease/snapshot revisions. Native v1
  observation, provider, cache and render cannot renew. Crash/no control turn expires; clear
  handles selection/session/disconnect/archive/remove; resume publishes a fresh lease.

### Two ccstatusline views

- Keep one Flow Status widget kind and one bounded provider, but add the exact owned
  `omp-flow-root-task-v2/root-task` and `omp-flow-flow-v2/flow` instances. Require the complete
  v2 capability quartet and one frame-scoped provider read shared by both views; reject a
  v1-only build.
- Fresh confirmed setup enables Powerline and puts root Task first, then native
  model/context/Git in preserved relative order on line one, with Flow on line two. Expose/report
  fixed line-one/line-two plus separate 1..64 position arguments. No third line is permitted.
- Implement ownership manifest v2 and the exact one-way v1-owned migration, staged artifact
  verification, pending digest record, atomic two-node config replacement, ownership commit,
  enable order, rollback and interrupted recovery. Classify exact/idempotent, foreign,
  duplicate, modified, swapped-view, occupied-slot, missing-one-view and partial-owned states;
  never commit a one-view profile.
- Implement full, compact and minimum examples from the v2 snapshot interface. Full shows
  ID/title; compact may replace ID with explicit title, otherwise middle-ellipsizes ID. On row two
  retain blocking attention, Flow index/position, labelled
  measure, current Work/review detail, movement, then freshness/prose. A ratio never survives
  without label and denominator.
- Preserve the accepted v1 Claude guard/source path as native activity and extend the provider and
  fixtures rather than replacing it. Codex stays on demand; Oh My Pi may show v2 only from an
  explicit scoped publication, never from its native batch-count observation.

### Claude production observations

- Extend the managed Claude hook registration and observer so a complete main-session `TaskList`
  remains the only source of task-set membership and current-task identity.
- On a reviewed managed `SubagentStart`, create a short-lived single-use nonce binding for the
  exact repository, session, task-set revision, membership revision, current task, `agent_id`, and
  `agent_type`; return the complete request only through the identity hook's structured
  `additionalContext`.
- Give the exact five managed Claude agent definitions native `TaskUpdate`, while retaining their
  existing prohibition on Agent dispatch. Register one synchronous
  `PreToolUse(TaskUpdate)` command guard as the native authorization boundary.
- For any exact managed `agent_type`, make that guard validate common `agent_id`, `tool_use_id`,
  canonical repository/session, live pending or consumed nonce, current task and revisions, and
  the complete input before execution. Allow only:
  - bind with exact top-level `taskId`, `owner`, `metadata` and only the exact
    `flowStatusBindingV1` metadata;
  - progress with exact top-level `taskId`, `metadata`, the immutable binding metadata, and one
    valid closed monotonic progress transition.
- Atomically reserve every allowed intent under `tool_use_id`. Deny another task/owner, extra
  input/metadata, status, deletion, dependency, subject, description, changed unit set,
  non-monotonic progress, replay, conflict, expiry, or missing state. Internal validation, state,
  lock, I/O, or serialization failure must emit deny or exit 2; prompt prose and PostToolUse
  rejection are not authorization.
- Do not require setup to force a real native TaskUpdate without a documented direct public
  surface, authentication, or a model turn. Normal readiness combines pinned official Hook
  provenance, deterministic direct conformance of the exact staged guard over every allow/deny/
  failure shape, exact installed matcher/command/digest verification, and guard-first atomic
  installation before any TaskUpdate-enabled agent definition.
- Doctor must report `configured`, `guardConformant`, and `nativeE2E` independently. Fixture/direct
  conformance leaves native E2E `unproven`; a controlled authenticated model session may attach
  positive native evidence when available but is not a normal setup dependency. On install
  failure, restore all five no-TaskUpdate definitions before rolling back the matcher/guard;
  removal uses the reverse safe order.
- Accept methodology position only after the same agent's first successful `TaskUpdate` proves
  that both `owner = agent_id` and the exact nonce binding metadata were accepted for the current
  task. Never infer this identity by comparing independently observed owner and agent strings.
  The exact reviewed managed-agent table remains:
  `omp-flow-architect`, `omp-flow-check`, `omp-flow-implement`, `omp-flow-qbd`, or
  `omp-flow-research`.
- Accept current-task-local progress only from a successful, same-agent `TaskUpdate` carrying the
  unchanged binding object and closed `flowStatusProgressV1` object defined by the Design. Do not
  derive progress from the main task-set ratio, tool count, tokens, duration, prompt text,
  filenames, Markdown, or operation history.
- Produce blocking attention only from correlated `AskUserQuestion` and `Elicitation`
  start/result event pairs. `PermissionRequest` has no documented start correlation ID and cannot
  open blocking attention. Produce bounded failure/denial warnings only from structured terminal
  events. Do not parse notification prose, errors, transcripts, or final assistant messages.
- Revoke assignment, task-local progress, and agent-scoped attention on owner change,
  `SubagentStop`, baseline replacement, session boundary, disconnect, observed replay or
  identity/revision contradiction, binding mismatch, or expiry. An adapter-local counter orders
  accepted observations but cannot prove a skipped native hook; unobserved loss degrades only by
  the specified maximum age.

### Fresh install and existing configuration

- When no ccstatusline config exists and the user confirms installation, create the exact
  Design-specified default: root Task first and native model/context/Git widgets on line one,
  Flow on line two, and Powerline enabled with the specified separator and caps.
- When a config already exists, atomically insert or move the two exact managed views. Preserve every
  pre-existing widget, line, order, theme, Powerline choice, refresh value, unknown field, and
  unrelated Claude setting. Never turn Powerline on for an existing user config.
- Keep preview, ownership, idempotence, conflict, rollback, and exact-owner removal behavior.
  Removal of a fresh managed config restores the recorded pre-install absence only when the whole
  file still matches the managed post-install digest; otherwise it removes only exact owned views.

### Stable evidence and archive-safe documentation

- Move executable native payloads to:
  - `tests/fixtures/flow-status/claude-task-events-v2.1.220.json`
  - `tests/fixtures/flow-status/oh-my-pi-task-events-v17.2.1.json`
- Add bounded Claude assignment/progress/attention scenarios to the Claude fixture. Tests may not
  contain `.omp-flow/tasks/` or `.omp-flow/tasks/archive/` in a fixture path.
- Keep provenance prose in the Bundle, but refer to repository-stable executable fixtures by
  code-form repository path rather than a depth-sensitive Markdown link. Delete both
  `reference/fixtures/*.json` payloads in the same migration so only the stable tier remains.
- Convert all 13 known Bundle-to-repository links in the six historical Concepts identified by
  the completion QbD into code-form repository paths. Update README, the durable Wiki,
  `completion.md`, indexes, handoff, and review only after executable behavior lands.
- Convert the five historical movable-fixture references in `work/claude-ccstatusline.md`,
  `review/claude-ccstatusline.md`, `qbd/qbd-1/flowstatus-audit-4.md`,
  `qbd/qbd-1/flowstatus-audit-5.md`, and `work/oh-my-pi-native-status.md` to the canonical
  `tests/fixtures/flow-status/` code-form paths while preserving links to the Reference Concept.
- Add one archive-aware navigation checker that computes the actual destination selected by
  `task archive`, resolves ordinary links from that simulated location without creating a second
  Bundle copy, and then repeats against the final moved tree. No current-task and archive-task
  backlink may be claimed simultaneously.

### Performance proof

- Add a deterministic benchmark entry point that emits machine-readable sample counts, every
  duration, nearest-rank p95, maximum, platform versions, fixture size, and pass/fail.
- Measure 200 warm provider samples after 20 discarded warm-ups; each measured sample performs a
  real open/read/validate/format over a fresh valid cache entry. Warm p95 must be at most 50 ms.
- Install a short-lived, no-shell supervisor as the Claude status command. Each invocation spawns
  only the exact pinned ccstatusline executable and managed config, schedules hung-child handling
  400 ms after successful child creation, captures at most 64 KiB, and returns semantic empty on
  timeout, signal, non-zero exit, malformed output, or overflow. There is no retry, discovery,
  resident process, or fallback command.
- Measure 40 cold, newly spawned complete supervisor invocations using distinct temporary
  repository/cache directories. Cold p95 must be at most 250 ms.
- The synchronous provider read has no autonomous in-process deadline. Keep production
  regular-file valid/degraded semantic cases and the 200 warm/40 normal cold measurements, but do
  not require or claim a controllably stalled NTFS regular file.
- Put all production supervisor timeout, pipe teardown, Windows termination, and exit behavior in
  one exported function. Exercise that exact function 20 times with a test-owned child that emits
  fixed `READY` and then intentionally remains alive. The production transition must stop
  accepting output, destroy stdin, invoke default `ChildProcess.kill()` on Windows, destroy
  stdout/stderr, unref the child, and resolve semantic empty in that order. On the pinned idle
  Windows/Node job every case must request kill by 450 ms and return degraded presentation by
  600 ms. Child `close` and external PID absence are a separate <= 1000 ms cleanup gate; a
  1200 ms parent watchdog is always failure. The test child is not represented as a provider/read
  stall, and the production CLI never accepts its path from external input.
- Run this benchmark serially on the pinned Windows Node 22/Python 3.12 job and locally in a real
  UTF-8/CJK path. No daemon, resident accessory, network, Git scan, transcript read, or shell
  discovery may be used to meet the budget.

## Allowed implementation boundary

- `templates/.omp-flow/scripts/common/flow_status.py` and the stable CLI command surface only for
  closed v2 validation, selected-task/scope correlation, and atomic latest-projection storage;
  no authored Markdown interpretation
- the tracked deployed portable runtime copy when owned by the same implementation change and no
  in-flight operation is using it; otherwise installation/update tests use only the canonical
  template until safe cutover
- `src/cli/flow-status-semantic-publisher.ts`, its focused installed CLI wiring, and
  `templates/common/skills/omp-flow/SKILL.md` plus managed deployed copies for the production
  typed builder and main-session publish/renew/clear obligations
- `src/omp/flow-status.ts`, bounded provider/schema/renderer modules under `src/cli/`, and
  `templates/common/skills/flow-status/` for v1/v2 assembly, native presentation, and read-only
  on-demand detail
- the focused pinned ccstatusline patch/build manifest under `integrations/ccstatusline/` for the
  exact v2 capability quartet, two view renderers and one frame-scoped shared read
- `templates/claude/settings.json`
- focused Claude Flow Status hooks under `templates/claude/hooks/`
- the exact five managed agent definitions under `templates/claude/agents/`
- tracked deployed copies under `.claude/hooks/`, `.claude/settings.json`, and
  `.claude/agents/` when owned by this repository
- a focused short-lived Flow Status supervisor under `src/cli/` and its installed executable
- `src/cli/flow-status-setup.ts` and its existing atomic configuration helper
- Flow Status tests and stable fixtures under `tests/`
- `.github/workflows/flow-status-windows.yml`
- README, `.omp-flow/wiki/architecture/harness-flow-statusline.md`,
  `.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`, Wiki indexes,
  `completion.md`, Bundle indexes, and the linked repair handoff/review. Implementation updates
  both Wiki pages from “pre-formal schema” to the final audited-but-availability-qualified state;
  this Architect operation does not edit Wiki.
- the six historical Concepts containing the 13 archive-breaking repository links:
  `research/flowstatus-synthesis.md`, `research/native-harness-flow-capabilities.md`,
  `qbd/qbd-1/flowstatus-audit.md`, `qbd/qbd-1/flowstatus-audit-2.md`,
  `qbd/qbd-2/flowstatus-workmap-audit.md`, and
  `work/handoffs/setup-docs-and-integration.md`
- the five historical Concepts containing movable-fixture links:
  `work/claude-ccstatusline.md`, `review/claude-ccstatusline.md`,
  `qbd/qbd-1/flowstatus-audit-4.md`, `qbd/qbd-1/flowstatus-audit-5.md`, and
  `work/oh-my-pi-native-status.md`
- the two old Bundle payloads under `reference/fixtures/` only for migration into the canonical
  stable tier and deletion in that same change

The portable operation store, task/archive selection semantics, authored Markdown semantics,
accepted v1 Oh My Pi native observation, Codex footer capability decision, and unrelated
installer behavior are read-only inputs. This Work does not authorize a semantic database,
Markdown parser, workflow transition engine, native task dispatcher, or control action.

## Required verification

1. `tests/flow-status-v2-publisher.test.ts` imports the exact production builder and exercises
   every Skill invocation point, primitive/detail bounds, meaningful Explore/audit/review
   transitions, initial/same/forward/backtrack/resume/reopen, and publish/renew/clear common JSON
   streams/exits. `tests/flow-status-v2.test.py` exercises the receiver CAS, actor/scope/selection
   checks and adversarial builder-output validation; no duplicated test-only builder is allowed.
2. Production-builder Execute cases cover initial round zero, first/later review, rework,
   accepted/no-current and reopen from the complete Work catalog. Negatives mutate a
   **non-current** accepted Work revision and handoff revision, as well as same actor, stale/missing
   review, omitted/extra attestation, duplicate Work and stale catalog. Receiver repeats those
   adversarial comparisons; accepted measure equals derived aggregate/set revision.
3. Fake-clock cases run active Implement and Review beyond the 900,000 ms maximum single lease
   through <=300,000 ms main-session control-turn renewals, then prove crash/no-renew expiry,
   selection/session replacement, disconnect, clear and fresh resume. Native v1 observation,
   provider/cache read and render never renew. Assembly/cutover cases prove exact host, one lock,
   atomic v2 envelope, independently fresh branches, one write per update, invalidated old v1
   cache, no compatibility read/daemon/authority borrowing, latest-only eviction and discarded
   Work catalog/attestations.
4. `node --test tests/flow-status-v2-render.test.mjs` full/compact/minimum/unavailable Powerline
   and ASCII goldens prove one frame performs one read, root Task precedes preserved native
   model/context/Git on row one, Flow/detail/at-most-one bar on row two, bar-to-labelled-ratio
   compaction, ID/title priority, exact unavailable/semantic-empty separators, CJK display width,
   no Wave, and no third line.
5. `tests/flow-status-v2-setup.test.ts` and installed-artifact tests prove exact IDs/objects,
   capability quartet, four placement inputs/reports, ownership manifest v2, fresh/existing
   preservation, one-way owned-v1 migration, idempotent update, duplicate/foreign/modified/
   swapped/partial classifications, pending recovery, atomic rollback and exact removal without
   a committed one-view state.
6. `python -X utf8 tests/flow-status-v2-detail.test.py` proves snapshot-v2 inspection, separately
   labelled native activity, root/native degradation, and Wave ID/revision/work-set/ordinal/focus
   output while both persistent views remain Wave-empty.
7. Claude fixture tests prove the nonce binding handshake, exact positive role and progress,
   tool availability plus the exact synchronous guard in all five managed agents,
   AskUserQuestion/Elicitation attention, bounded
   permission-denial warnings, and owner, agent, task, revision, replay, expiry, resume, and
   terminal invalidation. Negative tests prove `PermissionRequest` cannot open blocking attention
   and a local adapter-sequence increment cannot claim a skipped hook.
8. Direct exact-guard PreToolUse conformance tests accept only bind and monotonic progress shapes,
   reserve and reconcile exact `tool_use_id`, and deny authorization for every foreign task,
   owner/status/deletion/dependency/detail mutation, extra field, invalid transition,
   replay/conflict/expiry, and injected internal guard failure. Installed checks prove exact
   matcher/command/digest and safe commit/rollback order. Doctor truthfully separates configured,
   conformant, and authenticated native-E2E evidence; it never derives E2E from fixtures. A
   credential-gated controlled job may attach real native allow/deny evidence when available;
   otherwise it records `unproven`/skipped without failing normal setup.
9. A negative source scan proves the observer does not read transcripts, prompts, Markdown,
   Concept filenames, task-Bundle placement, Git, operation history, raw notification messages,
   raw error strings, or `last_assistant_message`.
10. A targeted executable-fixture import scan proves test code contains no task-Bundle fixture
   dependency without rejecting unrelated historical prose; the old two JSON payloads are absent,
   the five historical references name stable code-form paths, and only one payload tier remains.
11. The benchmark JSON proves the 200 production-reader warm and 40 normal whole-supervisor cold
   gates plus 20 deterministic hanging-child cases through the exact production supervisor/kill
   function. All 20 meet <= 50 ms timer lateness, <= 600 ms degraded return, and <= 1000 ms child
   close/PID absence on the pinned idle job; JSON separates kill/pipe/presentation/cleanup clocks,
   and the 1200 ms watchdog never intervenes. It makes no synchronous-read interruption or
   universal hard-real-time claim.
12. The full Windows, build, test, installed-artifact, package, and diff gates pass.
13. Before archive, documentation tests prove both durable Wiki pages no longer claim that formal
   schema/design is absent and accurately distinguish audited design from shipped availability.
   The archive-aware checker then passes in the computed destination and final destination,
   covering README, Wiki, completion, indexes, handoff, review, and all 13
   repaired repository-external links plus all five fixture-relocation references.
14. An independent reviewer checks the implementation and a fresh completion audit verifies the
   installed user-visible path. Prior accepted reviews do not waive this new review.

## Done

This work is done only when all required verification is linked from a handoff, the independent
review accepts it, archive-safe documentation is checked in its final location, and
`completion.md` is rewritten from **REOPENED** to a new evidence-backed completion record. A green
legacy suite or an unchanged previous review is not completion evidence for this repair.
