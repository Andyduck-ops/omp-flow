# First root Task/Flow v2 QbD audit

Verdict: **FAIL**

## Subject

This fresh independent audit evaluates:

- [Completion-audit Flow Status repair](../work/completion-audit-repair.md)
- [Root Task/Flow PRD revision](../prd.md)
- [Root Task/Flow Design revision](../design.md)
- [Root Flow publication v2](../interfaces/flow-status-publication-v2.md)
- [Flow Status snapshot v2](../interfaces/flow-status-snapshot-v2.md)
- [Flow Status v1 snapshot](../interfaces/flow-status-snapshot-v1.md)
- [Flow Status read-only detail surfaces](../interfaces/flow-status-detail-surface.md)
- Observable methodology without lifecycle state:
  `.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`
- Harness-native status-line architecture:
  `.omp-flow/wiki/architecture/harness-flow-statusline.md`

It re-derives the user-approved product intent and challenges whether the revised contracts and
Work boundary are exact enough to dispatch implementation. It does not audit an implementation
and makes no product-code change.

## Decision

The product direction is coherent: the first row should identify the selected root Bundle, the
second should show one reversible nine-position Flow orientation and phase-local detail, Explore
should join Brainstorm and Research, meaningful iteration counts should remain source-owned,
Execute should normally show independently accepted Work, only one honest measure should own the
bar, Wave should remain drill-down, and v1 Harness-native task activity should retain its own
label.

The current revision does not yet define a constructible publication and cutover boundary.
`RootFlowPublicationV2` calls itself closed while leaving `FlowDetail` as prose; no production
publisher surface or exact publisher input exists; accepted-Work evidence named by the acceptance
matrix cannot be represented; v1 and v2 use incompatible Oh My Pi host literals and have no
defined cache assembly/cutover; and the two-view installation has no exact IDs, capability
revision, ownership migration, or dual-placement contract. Several presentation and drill-down
contracts also contradict one another.

Those are design blockers, not implementation details. Dispatch now would force the implementer
either to invent semantic authority in Python/provider code, add a hidden transition/evidence
store, or choose an unreviewed installation migration. The v2 revision therefore is not eligible
for human PASS calibration or implementation dispatch in its present form.

## Blocking findings

### B1 — The claimed closed publication is not an executable closed schema or production surface

The interface declares `detail: FlowDetail`, but never declares the discriminated union itself
([publication v2, lines 32–45](../interfaces/flow-status-publication-v2.md)). The later prose names
some properties but does not define exact JSON keys, required versus nullable fields, text and
integer bounds, or legal combinations for any of the nine variants
([lines 95–121](../interfaces/flow-status-publication-v2.md)). Examples of unresolved choices
include:

- whether Design's optional detail is absent or `null`;
- the exact Decompose work-set, total and focus field names;
- whether Execute may omit a current Work after all Work is accepted;
- how an initial `implement` focus is represented before a first review when `reviewRound` is
  specified as positive;
- which Finish focuses carry a completion-audit attempt; and
- whether Integrate/Wiki detail embeds a measure or only references the top-level measure.

The Work requires closed validation of every discriminator
([work, lines 60–80](../work/completion-audit-repair.md)) and its acceptance requires executable
fixtures over all variants
([lines 263–271](../work/completion-audit-repair.md)). A validator and table-driven fixture cannot
be derived deterministically from the prose union.

There is also no exact production publication surface. The Design says the orchestrator/Harness
"submits" the complete assertion while Python performs only mechanical validation
([design, lines 50–60](../design.md)), and the Work permits changes to the stable CLI and managed
Skill ([work, lines 220–230](../work/completion-audit-repair.md)), but none of the contracts names:

- the command/API and versioned input envelope;
- how repository, selected task, host session and publisher actor are supplied and correlated;
- which orchestrator/Harness component owns the semantic construction;
- how failure, stale selection, or session replacement invalidates a prior publication; or
- the exact output/error response that makes publication testable.

The current `$flow-status` detail Skill is explicitly read-only and the current `status observe`
surface consumes the v1 source observation. Their pre-implementation state is not itself a
failure, but the revised Design must specify the new target boundary before implementation can be
audited.

**Required remediation**

1. Define the complete closed `FlowDetail` union, including exact fields, bounds, nullability and
   relational invariants for all nine positions.
2. Define one explicit versioned publication command/API and envelope, its semantic publisher,
   its selected-task/session/actor correlation, and closed error/degradation results.
3. Keep Bundle interpretation in the orchestrator/Harness. Python may validate the closed envelope
   and active selection but must not discover a title, Flow position, round, attempt, Work or
   verdict from Markdown, paths, roles, receipts or native task counts.
4. Tie V2-1, V2-2 and V2-4 to named executable producer/schema tests after that boundary exists.

### B2 — Accepted Work and review/rework rounds cannot satisfy the stated evidence rule

The PRD requires a Work to enter the numerator only when its **current handoff revision** has a
**different-actor independent accepted review**, and V2-3 explicitly calls for fixtures with
actor, handoff revision, review round and work-set revision boundaries
([PRD, lines 69–73 and 96–101](../prd.md)).

The publication prose carries only a work-set revision/total, accepted count, current Work
ID/title, focus, review/rework round and verdict
([publication v2, lines 108–116](../interfaces/flow-status-publication-v2.md)). It contains no
current Work revision, handoff revision, implementer actor, reviewer actor, or exact source
assertion from which the publisher contract fixture can distinguish:

- same-actor review from different-actor review;
- an accepted review of the previous Work revision from the current revision;
- executor completion from independent acceptance; or
- reopened accepted Work from a stale accepted numerator.

Python and adapters are correctly forbidden to parse an authored review verdict. Consequently,
the missing semantic publisher input cannot be recovered at runtime. Testing an arbitrary
`acceptedWork: 4` number only proves shape, not the acceptance boundary promised to the user.

The round model is also incomplete. A mandatory positive `reviewRound` cannot represent initial
implementation before any review without inventing "review round 1"; current-Work nullability and
the relationships among `focus`, `reviewVerdict`, `reviewRound` and `reworkRound` are unspecified.

**Required remediation**

1. Define an explicit, non-persisted semantic publisher input/assertion contract for current Work
   revision, handoff revision, implementation actor, independent reviewer actor, review result and
   work-set revision, or narrow V2-3 to another equally testable publisher-owned boundary.
2. Define exact legal Execute combinations, including initial implementation, first review,
   changes requested, rework, later review, accepted current Work, all-accepted/no-current-Work,
   and reopened/revised Work.
3. Prove the different-actor/current-revision rule in the semantic publisher tests. Do not copy
   those facts into a durable Evidence ledger and do not ask Python to parse Review Concepts.
4. Require `accepted-work` measure `current/total` to equal the Execute accepted/total assertion
   and the same work-set revision; reject conflicting duplicate ratios.

### B3 — Movement, counter and replay rules require an undefined transition authority

The publication includes `movement` and `fromPosition`
([publication v2, lines 39–45](../interfaces/flow-status-publication-v2.md)), while the Work
requires executable same/forward/backtrack/resume/reopen behavior and meaningful counter rules
([work, lines 69–77 and 263–266](../work/completion-audit-repair.md)). No contract defines:

- the legal first-publication `movement/fromPosition` pair;
- whether `same` must have equal positions;
- whether `forward` or `backtrack` may skip positions;
- how `reopen` differs structurally from `backtrack`;
- whether `resume` must retain a position and use `fromPosition`;
- how a producer proves that resume changed no counter; or
- what replay rejection means for opaque revisions once an older revision is no longer the latest
  value.

At the same time the cache intentionally stores only the latest projection and enforces no
monotonic lifecycle
([snapshot v2, lines 43–46](../interfaces/flow-status-snapshot-v2.md)). That is the correct
architecture boundary, but it means a cache validator cannot prove that an Explore round or audit
attempt increment was meaningful. Requiring it to compare semantic histories would create the
lifecycle/ledger the design forbids.

**Required remediation**

1. Define closed internal relationships for `movement`, `fromPosition` and current position,
   including first publication and every movement value.
2. State explicitly which counter truths are semantic assertions by the orchestrator and which
   are mechanically checkable in one publication.
3. Add a pure publisher test matrix driven by explicit authored inputs for Explore reframing,
   separate audits, resume, reopen and Work review loops. Keep the runtime cache latest-only.
4. Scope replay detection to a constructible latest-value rule, or define a bounded mechanical
   nonce/revision correlation that is not semantic history. Do not claim arbitrary historical
   replay rejection from one retained opaque revision.

### B4 — v1/v2 coexistence is semantically described but mechanically contradictory

The v2 contracts correctly prohibit v1 native task activity from filling missing root-Flow facts.
The actual assembly contract is incomplete:

- v2 names the Oh My Pi host `"omp"`
  ([publication v2, line 36](../interfaces/flow-status-publication-v2.md);
  [snapshot v2, line 17](../interfaces/flow-status-snapshot-v2.md));
- v1 names it `"oh-my-pi"`
  ([snapshot v1, line 22](../interfaces/flow-status-snapshot-v1.md)); and
- v2 says native activity may be attached only when repository, **host** and session agree
  ([snapshot v2, lines 37–41](../interfaces/flow-status-snapshot-v2.md)).

Therefore an Oh My Pi v1 snapshot can never satisfy literal scope equality with its v2 root Flow.
An unstated adapter mapping would be compatibility inference at exactly the boundary that is
supposed to be closed.

The cache cutover is also undefined. The landed observer/provider currently writes and reads a
version-1 cache document, while v2 specifies a latest version-2 snapshot containing optional v1
activity. The revision does not state whether:

- v1 and v2 observations feed one assembler before one atomic write;
- v1 input and v2 publication have separate cache paths and one provider assembles them;
- v2 replaces the existing path and all producers are cut over atomically; or
- an old v1 document is read as compatibility input.

Those choices have different atomicity, stale-branch, performance, rollback and package-upgrade
behavior. Leaving the choice to implementation risks dual write, a compatibility reader, or
native activity silently disappearing during update—all explicitly sensitive boundaries.

**Required remediation**

1. Use one exact host vocabulary across v1, v2, CLI, cache keys and adapters, or define a reviewed
   version-bound normalization at the mechanical input boundary.
2. Specify the exact v1-observation/v2-publication assembly dataflow, cache filenames/envelopes,
   independent freshness rules, update ordering and rollback/cutover behavior.
3. Prove that updating either branch cannot borrow authority from the other and cannot expose a
   mixed repository/session snapshot.
4. Demonstrate one latest projection per bounded scope without a compatibility reader, semantic
   history or dual authoritative write.

### B5 — The two-view ccstatusline installation has no exact capability or ownership cutover

The v2 snapshot example identifies the two instances only by `type` and `view`
([snapshot v2, lines 50–68](../interfaces/flow-status-snapshot-v2.md)). The landed configuration
contract requires every widget to have an ID, owns one ID
`omp-flow-flow-status-v1`, treats any `type: flow-status` as a candidate, rejects more than one,
and stores one widget in an ownership record
(`src/cli/flow-status-setup.ts:15`, `402–415`, `425–430`, `453–465`, `493–505`,
`626–640`). The revised documents do not define:

- two stable unique IDs and exact canonical objects;
- ownership record version and exact two-node identity/placement;
- behavior when a valid v1 ownership record and widget already exist;
- one-way update versus remove/reinstall behavior without a compatibility reader;
- per-view line/position CLI inputs and reports;
- partial-write rollback and interrupted-update recovery for both nodes; or
- duplicate, foreign, modified, missing-one-view and swapped-view classification.

The current pinned build advertises only `flowStatusWidgetV1`, and setup gates only that capability
(`integrations/ccstatusline/flow-status-build.json:17–18`;
`src/cli/flow-status-setup.ts:335–355`). The landed widget does not interpret the new `view`
property. Without a new exact capability/revision gate, setup could accept the old package,
install two instances, and render the same v1 native-activity widget twice while claiming root
Task/Flow support.

The Work also directly contradicts itself. The v2 section requires two owned views
([work, lines 87–101](../work/completion-audit-repair.md)), but the later fresh/existing
configuration section still mandates a **sole** managed widget on line two and singular
insert/move/removal
([lines 157–167](../work/completion-audit-repair.md)).

**Required remediation**

1. Define exact canonical widget objects with stable unique IDs and closed `view` values.
2. Define a new package capability/revision that proves both v2 schema consumption and both view
   renderers; setup/doctor must reject the v1-only package for v2 readiness.
3. Define ownership-record v2, fresh setup, existing foreign config insertion, v1-managed
   cutover, idempotent update, exact removal, duplicate/modified/partial conflict and rollback
   semantics. Choose an explicit one-way cutover rather than silently adding a compatibility
   reader.
4. Revise the CLI options/reports so both placements are explicit and testable.
5. Remove the singular-widget requirements from the current Work rather than relying on readers
   to infer which duplicate paragraph wins.

### B6 — Row order, width, unavailable, shared-read and Wave detail contracts disagree

The default JSON places native model/context/Git widgets before `root-task`
([snapshot v2, lines 53–65](../interfaces/flow-status-snapshot-v2.md)), while every rendered
example places the Task first ([lines 71–92](../interfaces/flow-status-snapshot-v2.md)). No design
rule says ccstatusline may reorder foreign native widgets, and the integration promises to
preserve order. The intended first-row placement therefore is not executable from the stated
default.

The normative snapshot/PRD says width drops the optional title before the explicit task ID
([snapshot v2, line 95](../interfaces/flow-status-snapshot-v2.md);
[PRD, lines 83–85](../prd.md)), while the durable philosophy says a friendly title may **replace**
the full task ID under width pressure
(`.omp-flow/wiki/philosophy/observable-flow-without-lifecycle-state.md`, lines 29–31).
V2-10 cannot have one golden priority until this is reconciled.

Unavailable behavior is left as either a marker or semantic empty "according to configured width
and surface policy" without defining that policy separately for `root-task` and `flow`
([snapshot v2, lines 95–107](../interfaces/flow-status-snapshot-v2.md)). That permits duplicated
unavailable markers, two empty rows, or inconsistent rows and cannot produce exact semantic-empty
goldens.

The landed ccstatusline manifest creates a new widget object and provider for each instance, and
each widget `render()` reads the cache (`integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch:631–674`).
The v2 design calls the two views one provider but does not require one coherent snapshot read per
final render. Two independent reads can straddle an atomic replacement and show a root Task from
one publication with Flow detail from another.

Finally, V2-8 requires Wave to be available in an explicit on-demand detail fixture, but:

- the Wave object has no revision even though the Design says detail includes one
  ([publication v2, lines 47–54](../interfaces/flow-status-publication-v2.md);
  [design, lines 112–114](../design.md)); and
- the read-only detail-surface contract still consumes only snapshot v1 and defines no root-Flow
  or Wave output ([detail surface, lines 8–29](../interfaces/flow-status-detail-surface.md)).

**Required remediation**

1. Choose and encode the exact first-row ordering while preserving native widgets.
2. Make Task-ID/title width priority consistent in PRD, Design, interface and Wiki.
3. Define exact per-view valid, degraded, unavailable and semantic-empty rendering, including
   separator collapse and which row owns an unavailable marker.
4. Require one coherent v2 snapshot value for both views during one ccstatusline render, or prove
   an equivalent correlation rule.
5. Add Wave revision/scope bounds and revise the read-only detail interface plus V2-8 fixtures;
   keep Wave absent from both persistent views.

## Requirements that are sound and retained

The failures above do not reject the user-approved product direction. The following requirements
are justified and should remain unchanged through repair:

- the root Bundle is the primary glanceable Task, not a native task-set member;
- the nine labels are reversible orientation, not initiative percentage or lifecycle state;
- Explore combines Brainstorm and Research and counts only meaningful reframing;
- QbD 1, QbD 2 and Finish completion audit have separate attempt scopes;
- model PASS remains distinct from human calibration;
- Execute uses current Work plus Implement/Review/Rework and normally gives the one bar to
  independently accepted Work;
- Wave remains authored drill-down rather than default footer content;
- v1 native task-set/assignment/progress remains separately labelled native activity;
- Python, adapters, cache and providers do not parse authored Markdown, paths, verdicts, operation
  receipts, Git, prompts or transcripts into task meaning;
- the cache remains ignored, bounded, reconstructable and latest-only;
- Claude remains the primary rich persistent surface, Codex remains honest on-demand detail, and
  Oh My Pi remains exact-version/API gated; and
- the previous Claude guard, doctor-evidence separation, safe install order, supervisor service
  budgets, stable-fixture, Powerline, Windows/CJK, package, archive-link, independent-review and
  fresh-completion-audit gates remain explicitly in scope
  ([work, lines 104–155 and 169–312](../work/completion-audit-repair.md)).

## Executability and read-only evidence

Read-only source inspection found:

```text
RootFlowPublicationV2 / FlowStatusSnapshotV2 product implementation
  no source or test implementation yet

current ccstatusline capability
  flowStatusWidgetV1 only

current setup ownership
  version 1, exactly one widget ID/value

current v1/v2 Oh My Pi host literals
  "oh-my-pi" / "omp"

current detail-surface contract
  snapshot v1 only

prior guard/supervisor/fixture/archive gates
  still named as mandatory in the revised Work
```

The absence of v2 product code is normal at a pre-implementation QbD gate. It does mean the V2
acceptance sources are currently specifications rather than executable artifacts. More
importantly, B1–B6 prevent a future executable test from having one authoritative expected result.
After contract repair, the work should name exact test files/commands for V2-1 through V2-10 and
extend—not replace—the prior accepted gate matrix.

## Required next gate

Repair the PRD, Design, publication/snapshot/detail interfaces, Wiki contradictions, and Work
Concept at the owning design boundary. Then run a fresh different-actor QbD audit. This FAIL is
not human approval and does not authorize implementation dispatch.
