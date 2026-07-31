# Third root Task/Flow v2 QbD audit

Verdict: **PASS**

## Subject

This fresh different-actor audit evaluates:

- [Completion-audit Flow Status repair](../work/completion-audit-repair.md)
- [Root Task/Flow PRD revision](../prd.md)
- [Root Task/Flow Design revision](../design.md)
- [Root Flow publication v2](../interfaces/flow-status-publication-v2.md)
- [Flow Status semantic publisher v2](../interfaces/flow-status-publisher-v2.md)
- [Flow Status snapshot v2](../interfaces/flow-status-snapshot-v2.md)
- [Second root Task/Flow v2 QbD FAIL](flow-status-v2-audit-2.md)

It re-audits the repaired semantic publisher, complete current Work-set baseline and long-wait
lease, together with the retained v2 assembly, two-view presentation, installation, guard,
supervisor, fixture and archive gates. It does not inspect an implementation, authorize a model
PASS as human approval, or weaken the required independent implementation review and completion
audit.

## Decision

The repaired design is now constructible and safe to dispatch.

The prior three release blockers are closed:

1. one canonical main-session coordination Skill owns explicit publication, one named production
   TypeScript builder consumes closed semantic input, and installed `publish|renew|clear` commands
   have closed results, streams and exits;
2. every Execute publication carries a bounded complete current Work catalog, so acceptance for
   the whole numerator is derived and checked against current Work, handoff and independent Review
   revisions rather than only the displayed Work; and
3. a 10–15 minute selection/session/root/publisher/source-bound lease has an explicit
   main-session-only renew path and at-most-five-minute wait polling, while crash and every named
   invalidation fail closed.

Those repairs preserve the ownership boundary: the main-session orchestrator interprets authored
Concepts; the pure builder constructs a typed request; Python performs mechanical validation and
latest-value atomic storage; providers and adapters only read. No lifecycle database, Markdown
parser, verdict parser, durable evidence ledger, daemon or compatibility reader is introduced.

No finding remains that would make the primary Task/Flow rows falsely authoritative, allow a
reader to extend semantic authority, prevent a fresh supported installation, or make the
publish/wait/clear main path impossible to implement.

## Closure of the second audit

| Prior blocker | Result | Evidence |
| --- | --- | --- |
| N1 — no production semantic construction boundary | **Closed** | The canonical owner is `templates/common/skills/omp-flow/SKILL.md`, deployed through the existing installer to `.agents/skills/omp-flow/` and the selected `.omp/`, `.codex/`, or `.claude/` native Skill root. One exact exported builder, `src/cli/flow-status-semantic-publisher.ts#buildRootFlowPublishRequestV2`, consumes only explicit typed values; tests must import that export. The three installed commands and their stdin-only semantic input are exact ([publisher, lines 13–52](../interfaces/flow-status-publisher-v2.md)). Success is one stdout JSON line/exit 0; validation conflict is one stderr JSON line/exit 2; internal failure uses the same closed envelope/exit 3 ([publisher, lines 259–322](../interfaces/flow-status-publisher-v2.md)). `$flow-status` remains inspection-only ([publisher, lines 21–26](../interfaces/flow-status-publisher-v2.md)). |
| N2 — incomplete current-revision proof for accepted Work | **Closed** | Every request carries `WorkSetBaselineV2`, bounded to 64 unique current Work entries with current Work revision, exact current handoff/implementer and exact current independent Review identity/revision/reviewer/round/result ([publication, lines 354–407](../interfaces/flow-status-publication-v2.md)). The builder derives current Execute detail and one attestation for every currently accepted catalog member; previous non-current Work/handoff, same actor, stale or missing Review, omission, addition and duplicate Work are rejected ([publication, lines 409–457](../interfaces/flow-status-publication-v2.md)). The lists are request-only and discarded after the atomic write; the cache retains only revisions, digests and aggregate ([publication, lines 96–100 and 420–423](../interfaces/flow-status-publication-v2.md)). |
| N3 — normal Implement/Review waits outlive root freshness | **Closed** | A root publication carries a 600,000–900,000 ms lease bound to repository, host session, selected root Task, actor, publication and semantic source revisions ([publisher, lines 152–178](../interfaces/flow-status-publisher-v2.md)). At control-turn boundaries and before each native wait, the main session revalidates selection/session/source and renews when at most 300,000 ms remain; wait polling returns control at least every 300,000 ms ([publisher, lines 122–150](../interfaces/flow-status-publisher-v2.md)). Renew uses full scope/selection/actor/publication/source/lease CAS and changes only lease plus snapshot revisions ([publisher, lines 180–211](../interfaces/flow-status-publisher-v2.md)). Native v1 observations, provider/cache reads and renders hold no lease token and cannot renew. Crash/no control turn expires; scoped clear covers selection, task, session, disconnect, shutdown, archive, user removal and uninstall ([publisher, lines 213–257](../interfaces/flow-status-publisher-v2.md)). |

## Production-path audit

### Typed construction and lifecycle

`RootFlowSemanticInputV2` closes request ID, previous-publication CAS, canonical scope, selected root
Task and selection revision, reversible orientation/detail/measure, complete Work baseline, Wave
detail, publisher/source/publication revisions, semantic observation and lease input
([publisher, lines 54–120](../interfaces/flow-status-publisher-v2.md)). The builder has no
filesystem or authored-document access; semantic interpretation therefore remains in the one
main-session orchestrator rather than migrating into runtime code.

The invocation table covers the complete user-visible lifecycle:

- initial selected Task publication;
- every semantic transition, material Explore reframe, audit/calibration, Work-set/current-Work,
  Review/Rework, Integrate, Wiki and Finish change;
- accepted Review after the current handoff and different-actor Review Concept have been read;
- backtrack, reopen and fresh-session resume;
- bounded waiting with explicit renew; and
- scoped invalidation/clear after archive, selection/session/disconnect/shutdown/removal
  ([publisher, lines 122–147](../interfaces/flow-status-publisher-v2.md)).

The closed movement/CAS rules support initial, same, forward, backtrack, reopen and resume without
turning cache history into lifecycle truth. Exact retry is idempotent, concurrent publication has
one winner, and arbitrary historical replay detection is not claimed
([publication, lines 174–223](../interfaces/flow-status-publication-v2.md)).

### Complete Work truth without a ledger

The baseline is complete for its explicitly supplied current work-set revision, bounded, unique and
current-revision comparable for every Work, handoff and Review. `currentExecution` identifies the
one present Execute focus, while the accepted set is recomputed from all catalog entries. Initial
implementation, first/later Review, Rework, accepted current Work and all-accepted/no-current
shapes have closed local combinations ([publication, lines 331–352 and
403–418](../interfaces/flow-status-publication-v2.md)).

The builder and receiver do not discover any of this by reading a path, heading or verdict. The
orchestrator supplies explicit already-interpreted values; the production builder derives the
attestation set/count/digest; the mechanical receiver compares it to the same request-only
baseline. After one atomic projection write, neither catalog members nor attestations survive.
This is a bounded display assertion, not a second task registry or Evidence ledger.

### Authority-preserving long wait

Renewal is not a timer hidden in the provider. It requires the main session to regain control,
revalidate the still-selected Task/session/source and present the current actor, publication,
source and lease CAS. A renewal cannot change counters, detail, Work aggregate, semantic
observation or native activity. A stale, concurrent, post-expiry or mismatched renewal fails
closed and requires a fresh semantic publication. Consequently repeated control-turn renewal can
keep an honest Implement or Review view alive past one maximum lease, but a crashed, replaced or
disconnected publisher cannot keep old truth alive.

The required fake-clock matrix explicitly runs Implement and Review beyond 900,000 ms through
renewals no farther apart than 300,000 ms, then tests crash/no-renew expiry, selection/session
replacement, disconnect, clear and fresh resume. It also proves that v1 observation, provider,
cache and render never renew ([repair Work, lines 321–327](../work/completion-audit-repair.md)).

## Retained v2 and inherited gates

The repaired design retains the previously sound boundaries:

- one canonical v2 cache envelope, one scope lock/assembler and one atomic write per update;
  independently fresh `rootFlow` and v1 `nativeActivity`; old v1 cache invalidation; no dual write,
  provider assembly or compatibility read ([snapshot, lines 44–107](../interfaces/flow-status-snapshot-v2.md));
- one ccstatusline widget/provider with two exact managed IDs/views and one frame-scoped read,
  complete v2 capability quartet, root Task first beside preserved model/context/Git on row one,
  Flow/detail/at-most-one labelled bar on row two, no Wave and no third owned row
  ([snapshot, lines 109–190 and 264–301](../interfaces/flow-status-snapshot-v2.md));
- ownership manifest v2, staged one-way owned-v1 migration, atomic two-node replacement,
  pending recovery, conflict/partial classification and exact conservative removal
  ([snapshot, lines 192–262](../interfaces/flow-status-snapshot-v2.md));
- separately labelled read-only v1 native activity, explicit Wave drill-down only on the detail
  surface, and no persistent Codex footer claim;
- the exact five-agent Claude `TaskUpdate` guard/binding/progress contract, truthful
  `configured`/`guardConformant`/`nativeE2E` separation, structured attention and fail-closed
  source-denial tests;
- the production supervisor's supported-environment 400 ms trigger, 600 ms degraded return,
  1,000 ms close/PID cleanup and 1,200 ms watchdog boundaries, with 200 warm, 40 cold and 20 hung
  production-path measurements;
- one repository-stable executable fixture tier, source scans, CJK/Windows gates, exact
  Powerline defaults/preservation, package checks, simulated/final archive-link verification,
  fresh independent implementation review and fresh completion audit
  ([repair Work, lines 328–374](../work/completion-audit-repair.md)).

## Verification sufficiency

The revised verification matrix tests the production components rather than a prose or test-only
copy:

- `tests/flow-status-v2-publisher.test.ts` imports the exact builder and covers every invocation,
  transition/counter rule, complete Execute derivation, non-current stale revisions and
  publish/renew/clear envelopes;
- `tests/flow-status-v2.test.py` independently exercises receiver schema, scope/actor/selection
  checks, CAS, adversarial builder output, one-envelope assembly, expiry and cutover;
- fake-clock sequences prove the long-wait lease and every authority-loss path;
- render/setup/detail/installed-artifact suites prove the two views, one shared read, one bar,
  placement/ownership migration, Wave exclusion and exact degradation;
- the inherited Claude guard, supervisor benchmark, fixture/source-denial, Windows, package,
  archive and documentation suites remain mandatory; and
- a different-actor implementation Review plus a fresh completion audit remain required before
  any new completion claim
  ([repair Work, lines 309–381](../work/completion-audit-repair.md)).

These are adequate release gates. A future implementation may report authenticated native Claude
E2E as `unproven` when credentials are unavailable; that does not weaken guard conformance or
permit it to be reported as PASS.

## Non-blocking calibration notes

- The nine-position ordinal is reversible orientation, not initiative percentage. Only a
  position-owned stable-denominator measure may draw the one bar.
- Wiki status wording is intentionally an implementation/documentation gate: it must distinguish
  audited design from shipped availability and pass the simulated and final archive checks before
  completion.
- This PASS accepts the 10–15 minute lease with at-most-five-minute control-turn polling and the
  previously calibrated supported-environment supervisor service budgets. It does not claim hard
  real-time scheduling or an autonomous background heartbeat.

## Required next gate

Present this PASS and its lease/publication tradeoff to the user for explicit human calibration.
Only an explicit linked human approval may authorize bounded implementation dispatch. After
implementation, all named verification, independent Review and a fresh completion audit are still
mandatory; prior v1 reviews and this design PASS cannot prove the feature shipped.
