# Second root Task/Flow v2 QbD audit

Verdict: **FAIL**

## Subject

This fresh different-actor audit evaluates:

- [Completion-audit Flow Status repair](../work/completion-audit-repair.md)
- [Root Task/Flow PRD revision](../prd.md)
- [Root Task/Flow Design revision](../design.md)
- [Root Flow publication v2](../interfaces/flow-status-publication-v2.md)
- [Flow Status snapshot v2](../interfaces/flow-status-snapshot-v2.md)
- [Flow Status read-only detail surfaces](../interfaces/flow-status-detail-surface.md)
- [Flow Status v1 snapshot](../interfaces/flow-status-snapshot-v1.md)
- [Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md)
- Observable methodology without lifecycle state:
  `.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`
- Harness-native status-line architecture:
  `.omp-flow/wiki/architecture/harness-flow-statusline.md`
- [First root Task/Flow v2 QbD FAIL](flow-status-v2-audit-1.md)

It independently re-derives the repaired publication, acceptance, cache, installation,
presentation and verification boundaries. It does not inspect a v2 implementation, authorize
dispatch, or change product code.

## Decision

The revision closes most of the first audit's structural findings. The request and stored
publication now have bounded closed shapes and all nine detail variants; movement/CAS rules are
latest-value constructible; v1 and v2 share the literal `oh-my-pi` host and one atomic v2
envelope; the two ccstatusline views have exact IDs, capabilities, shared-frame read, placement
inputs and ownership migration; and the Task/Flow rows now have coherent ordering, title
compaction, unavailable behavior, one-bar semantics and Wave drill-down.

Three release-critical boundaries are still not constructible:

1. the receiver command is exact, but no production component inside the authorized Work
   boundary constructs the semantic request or implements the claimed pure publisher table;
2. the accepted-Work request cannot prove or reject stale revisions for accepted Works other than
   the one optional `currentWork`; and
3. every root publication expires after at most 30 seconds, with no authority-preserving refresh
   mechanism while the orchestrator waits for ordinary implementation or review.

The first two gaps leave V2-2/V2-3 dependent on a test-only publisher that is not the production
publisher. The third makes the main user-visible Flow row disappear during the long native work
that it is meant to explain. Dispatch would force implementers to invent an unreviewed semantic
builder, refresh authority, or hidden source comparison. The current design therefore is not
eligible for human PASS calibration or implementation dispatch.

## Prior blocker closure

| Prior finding | Result | Evidence |
| --- | --- | --- |
| B1 closed union and receiver surface | **Partially closed** | The command, request/stored objects, primitive bounds, nine `FlowDetail` variants and closed error-code vocabulary now exist ([publication, lines 19–89](../interfaces/flow-status-publication-v2.md), [98–176](../interfaces/flow-status-publication-v2.md), [263–363](../interfaces/flow-status-publication-v2.md)). The production semantic constructor and exact failure envelope remain missing; see N1. |
| B2 accepted Work and Execute combinations | **Partially closed** | Initial round zero, review/rework/accepted/null-Work combinations and the attestation object are explicit ([publication, lines 304–414](../interfaces/flow-status-publication-v2.md)). Non-current accepted revisions still have no comparison source; see N2. |
| B3 movement/counters/replay | **Closed at the latest-value receiver boundary** | Initial/same/forward/backtrack/reopen/resume relations, current CAS, idempotent winner retry and bounded replay claims are exact ([publication, lines 187–259](../interfaces/flow-status-publication-v2.md)). Semantic counter construction remains coupled to N1 rather than cache history, which is the right architectural direction. |
| B4 v1/v2 host and cache cutover | **Closed** | Both versions use `claude`, `codex`, `oh-my-pi`; one scope lock/assembler writes one v2 envelope, invalidates old v1 cache, retains independently fresh branches and forbids compatibility read/dual write ([snapshot, lines 41–95](../interfaces/flow-status-snapshot-v2.md)). |
| B5 two-view capability and ownership | **Closed** | The capability quartet, two canonical IDs/views, fixed line plus explicit position inputs, ownership v2, one-way owned-v1 migration, pending recovery, partial/conflict classification and exact removal are specified ([snapshot, lines 97–249](../interfaces/flow-status-snapshot-v2.md)). |
| B6 row rendering/shared read/Wave | **Closed for design dispatch once N1–N3 are repaired** | One frame freezes one snapshot, Task precedes native widgets in the fresh profile, ID/title priority is consistent, unavailable/semantic-empty behavior is exact, one bar compacts to the same labelled ratio, and Wave is detail-only ([snapshot, lines 97–178](../interfaces/flow-status-snapshot-v2.md), [251–288](../interfaces/flow-status-snapshot-v2.md); [detail, lines 13–34](../interfaces/flow-status-detail-surface.md)). |

## Blocking findings

### N1 — The semantic publisher is named but has no production construction boundary

The design correctly says the main-session omp-flow orchestrator is the sole semantic
publication/transition authority and the portable command only validates its completed request
([design, lines 51–84](../design.md)). The publication interface likewise assigns round,
attempt, review and reopen truth to that orchestrator and says executable pure publisher tests
will prove the construction table ([publication, lines 231–259](../interfaces/flow-status-publication-v2.md)).

However, the repair's allowed implementation boundary does not identify or authorize the
production publisher that performs that construction. It names the portable receiver, adapters
and `templates/common/skills/flow-status/`
([work, lines 240–278](../work/completion-audit-repair.md)). That named Skill is normatively
read-only and may run only `status inspect`
([detail surface, lines 41–58](../interfaces/flow-status-detail-surface.md);
[design, lines 824–837](../design.md)). The canonical omp-flow routing/coordination Skills that
actually guide a main-session orchestrator are not in the Work boundary, and no Harness callback
or closed semantic-builder API is designated instead.

Consequently, `tests/flow-status-v2.test.py` can test the receiver or contain a hand-authored
transition table, but it cannot exercise the same production component that reads the authored
decision and constructs `RootFlowPublishRequestV2`. This matters because the receiver explicitly
does not and must not validate the cross-publication semantic counter rules. A test-only builder
would not prove that production Explore rounds, QbD attempts, review rounds or reopen semantics
follow the table.

The failure surface is also only partially closed. Success has an exact JSON object and failures
have a finite list of codes, but the interface does not specify the failure JSON version/shape,
stdout versus stderr, or code-to-exit mapping
([publication, lines 68–89](../interfaces/flow-status-publication-v2.md)). The Work nevertheless
requires exact success/error results ([work, lines 281–288](../work/completion-audit-repair.md)).
The generic existing v1 inspection wrapper cannot be assumed to be the v2 publication contract.
Likewise, immediate invalidation names a generic `status clear` without an exact scoped
host/session/actor request.

**Required remediation**

1. Designate one production semantic-construction component used by the main-session
   orchestrator, authorize its canonical source in the Work boundary, and state how Claude,
   Codex and Oh My Pi main sessions invoke it. It may receive closed explicit semantic inputs from
   the orchestrator, but must not teach Python/adapters to parse Markdown.
2. Make the pure transition fixtures call that exact production builder or validator boundary;
   do not duplicate the rules only in tests or prompt prose.
3. Keep `$flow-status` read-only. If an omp-flow coordination Skill owns publication, name the
   exact canonical/deployed Skill resources and safe invocation points.
4. Define the exact versioned failure JSON/stream/exit contract and the scoped invalidation
   command/result so selection change, session end and disconnect are executable rather than
   prose callbacks.

### N2 — Accepted-Work attestations cannot prove current revisions for the complete numerator

The repaired attestation is materially better: it carries Work-set, Work, handoff, implementer,
review, reviewer, review round, independence and accepted-result fields
([publication, lines 388–405](../interfaces/flow-status-publication-v2.md)). The runtime can
validate unique IDs, same work-set revision, different actors, nonempty fields, digest equality,
and the one attestation matching `currentWork`
([lines 407–414](../interfaces/flow-status-publication-v2.md)).

It still has no request-only source against which to establish that every accepted entry's
`workRevision` and `handoffRevision` are the **current** authored revisions. `ExecuteDetail`
contains only one `currentWork`; all other accepted Work IDs have no current Work/handoff
revision map in the request. `workSetRevision` scopes the set but does not prove a Work or handoff
revision. `acceptanceDigest` seals the submitted assertions but does not make them current.

For example, with `acceptedWork: 4`, a unique attestation for a previously accepted revision of
one of the three non-current Works satisfies every stated local relation as long as its
`workSetRevision` string matches. The runtime cannot reject it, and the request contains no
separate closed publisher input from which a production semantic builder can reject it before
publication.

That contradicts the required negative case that rejects a previous Work/handoff revision
([work, lines 289–292](../work/completion-audit-repair.md)) and the user-facing rule that the
numerator represents independently accepted **current** Work. Discarding request-only evidence
after derivation is sound; the missing piece is a complete request-time comparison source, not a
durable ledger.

**Required remediation**

1. Define a bounded request-only semantic publisher input containing the complete current Work
   identity/revision and current handoff/review facts needed to derive acceptance, or another
   equally complete current-revision comparison contract.
2. Have the production publisher derive the attestation set/count/digest from that input and
   prove different implementer/reviewer, independent review identity, accepted result and current
   Work/handoff revisions for **every** numerator member.
3. Discard the complete source list after the one atomic write as already intended; retain only
   count/set revision/digest in the cache.
4. Make the named negative fixtures mutate a non-current accepted Work and handoff revision, not
   only the displayed `currentWork`, so they demonstrate the complete numerator rule.

### N3 — Root Flow freshness expires during normal long-running native work

`RootFlowPublishRequestV2` limits `maxAgeMs` to 1,000–30,000 ms
([publication, lines 19–36](../interfaces/flow-status-publication-v2.md)), and consumers mark the
root branch unavailable as soon as `observedAtUnixMs + maxAgeMs` passes
([lines 466–472](../interfaces/flow-status-publication-v2.md)). A native v1 observation is
explicitly forbidden from refreshing root Flow
([snapshot, lines 41–47](../interfaces/flow-status-snapshot-v2.md)).

No contract assigns an authority-preserving republish/heartbeat action. The sole semantic
publisher is the main-session orchestrator; child implementers/reviewers do not invoke the
command. During an ordinary implementation, independent review, authenticated Claude model turn,
or the 40-process integration work, the orchestrator may correctly wait for minutes. After at
most 30 seconds the first row becomes `Task · unavailable` and the Flow row becomes semantic
empty even though the selected task, session, current Flow and Work are still valid. This defeats
the exact waiting/implement/review state that the status line is intended to expose.

Letting `status observe` or the read-only provider refresh the timestamp would borrow semantic
authority from native activity. Replaying the last semantic assertion from an adapter timer would
confidently preserve facts the adapter is forbidden to interpret, and an always-on refresher
would conflict with the no-daemon boundary. The current V2 tests cover expiry but do not prove
visibility through a normal long-running Work interval.

**Required remediation**

1. Define freshness according to the actual lifetime of root authored facts and their explicit
   invalidators. Either use selection/session/connection invalidation with a suitable bounded
   lease, or define an orchestrator-owned republish mechanism that revalidates the semantic
   source before renewal.
2. Name the refresh owner and trigger in the production publisher boundary. Native observation,
   cache reads and view rendering must remain unable to extend semantic freshness.
3. Add deterministic tests longer than the maximum lease for active Implement and Review waits,
   followed by selection change, disconnect and resume. They must prove useful continuity without
   stale cross-session replay, a daemon, dual write or authority borrowing.

## Additional documentation inconsistency

The durable Wiki correctly explains the user-approved two-row model and iteration rationale, but
its status text predates the repaired formal contracts. It still says the direction “requires
formal PRD and Design revision”
(`.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`, lines 194–204)
and calls the v2 facts “not a committed JSON schema”
(`.omp-flow/wiki/architecture/harness-flow-statusline.md`, lines 101–108).
The accurate state is that formal PRD/Design/interfaces exist but have failed this QbD and remain
unimplemented. This is not the reason for FAIL, but the same repair should update the Wiki so the
user-requested durable methodology record remains truthful.

## Retained contract and test assessment

The following design and verification boundaries are adequate and should remain:

- exact nine-position detail shapes, legal local combinations and position-owned measures;
- reversible initial/same/forward/backtrack/reopen/resume orientation with current-value CAS,
  one-winner concurrency, exact retry and no arbitrary-history claim;
- one literal host vocabulary and one v2 lock/assembler/cache with live v1
  `nativeActivity`, independent freshness, one write per update, no old-v1 read, no dual write and
  no provider assembly;
- one ccstatusline widget kind/provider with exact `root-task`/`flow` IDs, v2 capability quartet,
  one frame/one read, fixed rows, explicit positions, ownership v2, one-way v1 migration,
  dedupe/conflict/partial recovery, rollback and exact removal;
- Task-first fresh profile, explicit ID/title priority, one unavailable marker, semantic-empty
  Flow fallback, CJK/ASCII/Powerline coverage, one adaptive labelled bar and no Wave/third owned
  row;
- read-only Wave detail with ID/title/revision/work-set/ordinal/focus and separately labelled v1
  native activity;
- the complete prior Claude nonce/TaskUpdate guard, independent doctor dimensions, safe
  install/remove order, structured attention, supervisor 400/600/1000/1200 service boundaries,
  stable fixture tier, source-denial scans, Windows/CJK, package, archive checker, independent
  review and fresh completion-audit gates preserved in
  [the repair Work, lines 124–239 and 307–342](../work/completion-audit-repair.md).

The named render, setup, detail, installed-artifact, benchmark, archive and legacy Claude tests
are sufficient for those retained boundaries. `tests/flow-status-v2.test.py` is not sufficient
for V2-2/V2-3 until it exercises the production semantic builder and a complete current-revision
acceptance input. No prior PASS or accepted v1 review waives these new v2 blockers.

## Required next gate

Repair the publisher ownership/input/failure boundary, complete accepted-Work current-revision
proof, and make root freshness viable during long native work. Update the stale Wiki status text
at the same design boundary. Then run a fresh different-actor QbD audit. This FAIL is not human
approval and does not authorize implementation dispatch.
