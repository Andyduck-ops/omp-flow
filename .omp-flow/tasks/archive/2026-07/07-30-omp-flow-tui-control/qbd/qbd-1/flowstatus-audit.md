---
type: "QbD Audit"
title: "QbD 1: Harness-native FlowStatus"
---

# QbD 1 audit: Harness-native FlowStatus

## Verdict

**FAIL**

The selected direction is substantially safer and smaller than the retired branded renderer:
ccstatusline remains the Claude presentation owner, the shared cache is reconstructable and
display-only, Codex persistent status is capability-gated, task-set counts and task-local progress
are semantically separated, and the built-in examples inject no visible `OMP`, `omp:`, logo, or
Bundle shorthand.

It is not ready for human QbD 1 calibration. The current normative chain still permits mutually
exclusive ccstatusline and drill-down implementations, the shared interface cannot itself
represent or validate several source/completeness/binding claims required by the PRD, the role map
does not match the real Harness assignment vocabulary, and the one-line width contract cannot
guarantee the acceptance criteria. Codex and Oh My Pi detail/install surfaces also need exact
supported contracts rather than capability-gating prose alone.

## Blockers

### 1. Task-set completeness, membership, and native binding are asserted outside the closed contract

[PRD R3](../../prd.md#r3--honest-task-set-counts) requires one *complete* source-owned set and
[R4](../../prd.md#r4--current-bounded-task) requires the current task to be a member of the exact
revision. The [snapshot source rules](../../interfaces/flow-status-snapshot-v1.md#source-and-membership-rules)
state those invariants, but the serialized contract contains only aggregate counts and a current
task ID. It carries neither membership nor a source-supplied completeness/proof field from which a
validator can establish that the task ID belongs to the counted set.

The contract also makes `scope.taskSetId` and `taskSet` mandatory. It therefore cannot encode the
PRD's incomplete/unsupported/degraded task-set state while retaining other source health or
attention. Returning no cache entry is sufficient for “not installed” or semantic empty, but it is
not the closed, source-attributed degraded result promised when a set is expected but completeness
is unavailable.

Assignment and progress are nested beneath `currentTask`, but no closed producer-input contract
defines the native task, assignment, repository/session, and revision equalities that authorize
that nesting. The design says the producer performs the correlation; neither the interface nor a
per-Harness source contract makes that assertion independently testable. The same gap applies to
the claim that a progress source owns a stable unit set and denominator.

**Remediation**

- Define a closed absence/degradation union for unavailable, incomplete, stale, and unsupported
  task-set observations, or narrow the product contract so no valid snapshot exists in those
  cases and remove the conflicting visible-degradation promise.
- For each supported Harness/capability revision, define the exact public task-set observation,
  its completeness signal and terminal-state vocabulary, the current-task lookup, assignment
  binding, and progress-unit ownership. A bounded source assertion or membership proof is enough;
  this does not require persisting a duplicate task registry.
- Make the producer validation equalities and revision invalidation rules executable as a closed
  input-to-snapshot contract, then test replacement, partial sets, task removal, replay, and
  denominator changes against that boundary.

### 2. The role-to-position map is not an exact mapping of supported assignment roles

The [methodology table](../../interfaces/flow-status-snapshot-v1.md#methodology-labels) uses prose
families such as `coordinator framing / brainstorm`, `decomposer / planner`, and `implementer`.
Those are not exact role identifiers. In the current repository, Claude implementation dispatch
uses `executor`, and the Oh My Pi adapter normalizes `implement` to `executor`; its managed
vocabulary also includes `orchestrator`, `planner`, `explore`, and `oracle`
(`src/omp/extension.ts` adapter normalization and `tests/omp-flow.test.ts` native-role fixtures).

Consequently, [acceptance criterion 4](../../prd.md#acceptance-criteria) cannot be implemented
deterministically for every supported explicit role. The design's additional permission for a
Harness to supply an “equivalent normalized position directly” is not a closed mapping and could
silently reintroduce lifecycle interpretation.

**Remediation**

- Publish an exact, versioned table from every accepted native role string to one display label or
  `null`, including at least the actual `executor` implementation role.
- State which roles are presentation-neutral (`null`) and why; do not infer a position for
  `explore`, `oracle`, or `orchestrator` from role ordering or authored files.
- Test the literal assignment values emitted by each supported Harness adapter, not descriptive
  synonyms.

### 3. Current selected and Wiki sources still authorize stale contracts

The root index calls the
[FlowStatus synthesis](../../research/flowstatus-synthesis.md) the current selected direction.
That synthesis still permits “an initial Custom Command composition” and names
`$omp-flow-status`. The pre-implementation-authoritative Wiki direction recorded at the time,
whose durable successor is
`.omp-flow/wiki/architecture/harness-flow-statusline.md#claude-code`, also said a Custom Command
could prove the integration.

Those statements conflict with [PRD R8](../../prd.md#r8--claude-code-minimal-extension), the
[ccstatusline distribution boundary](../../design.md#two-line-configuration-and-distribution-boundary), and the
[provider trust boundary](../../design.md#flow-status-provider), which require one native
widget/provider and prohibit the arbitrary-command path. They also conflict with the selected
Codex name `$flow-status`. The pinned ccstatusline evidence establishes that Custom Command
receives the complete host payload, inherits the environment, and executes a shell command, so it
is not a harmless equivalent.

Historical contracts are clearly labelled as superseded in the Bundle index and design, which is
good. The remaining contradiction is more serious because it occurs in two sources explicitly
labelled current and authoritative.

**Remediation**

- Remove the Custom Command alternative from the selected synthesis and Wiki, or supersede those
  Concepts with a newly linked synthesis that selects the one provider/widget path.
- Use one drill-down name everywhere and remove `$omp-flow-status` from the current direction.
- Keep Custom Command facts only as rejected/historical evidence with the transcript,
  environment, and shell-disclosure rationale.

### 4. Width retention is not enforceable in the supported one-line composition

[Acceptance criterion 9](../../prd.md#acceptance-criteria) requires atomic task/progress ratios and
blocking attention to survive at every listed width, including unknown width. The
[widget design](../../design.md#flow-status-widget) instead permits semantic empty at unknown or
very narrow width. It also acknowledges that `maxWidth` bounds only the widget formatter:
ccstatusline owns final whole-line allocation and may ellipsize the composed output, potentially
hiding the atomic facts. A setup warning does not satisfy a retention invariant.

The compaction order is also ambiguous: “task-set detail” is removed before converting the
graphical task-progress bar to a ratio, while the PRD prioritizes the atomic task-set ratio ahead
of graphical fill. Thus an implementation and its golden fixtures cannot derive one required
answer from the documents.

**Remediation**

- Designate the second-line profile as the only retention-guaranteed profile, with a tested final
  ccstatusline allocation, or add a real widget allocation/final-composition contract that lets
  the provider choose content for its actual budget.
- Mark one-line composition explicitly best-effort if outer widgets can consume the line, and
  align the acceptance criteria with that limitation.
- Define one unambiguous priority matrix. Valid blocking attention and atomic task/progress ratios
  must not become semantic empty merely because width is unknown.

### 5. Thin adapters are directionally correct but their public surfaces and installation are not closed

The Codex asymmetry is represented honestly. Current official Codex documentation exposes
configured built-in `tui.status_line` item IDs rather than an arbitrary third-party footer
provider, while repository/user Skills are a supported customization mechanism. Leaving
`tui.status_line` unchanged and using a Skill is therefore a defensible first-release direction
([Codex configuration reference](https://learn.chatgpt.com/docs/codex/config-reference),
[Codex Skills](https://learn.chatgpt.com/docs/build-skills)).

However, `$flow-status` is only named, not designed as an installable Skill artifact: there is no
entry/output contract, discovery scope, setup change, capability identifier, failure behavior, or
exact-owner removal rule. The general installation section describes the ccstatusline widget and
native registrations but not the Codex Skill it promises remains available.

The Oh My Pi path likewise names an advertised status contribution and `/flow-status` fallback
without a pinned public interface, capability key, registration shape, or command contract. The
current repository extension entry exposes hooks, message delivery, and active-tool selection, but
no status/command registration in its local `ExtensionAPI`
(`src/omp/extension-entry.ts`). A future host API may provide those
surfaces; this Bundle has not yet supplied the evidence or adapter interface needed to implement
or test them.

**Remediation**

- Add a bounded Codex Skill Concept/artifact contract and include its project/user install,
  idempotence, discovery, read-only behavior, and exact removal in setup fixtures.
- Pin the supported Oh My Pi public extension revision and define exact positive and negative
  capability probes, status registration, `/flow-status` registration, width/theme input, and
  removal.
- Treat an absent proven surface as unsupported without claiming that the fallback “remains
  available.”

## Non-blocking findings

- [Measure separation](../../interfaces/flow-status-snapshot-v1.md#measure-separation) correctly
  prevents receipts, context, tokens, cost, duration, Git, time, and Markdown from manufacturing
  task progress.
- The explicit warning that methodology labels do not imply prior completion, next work, gates,
  acceptance, or human approval is the right ownership boundary. It needs only the exact role map
  above.
- One native ccstatusline widget/provider is a credible small upstreamable extension. Reusing its
  manifest, editor, Powerline renderer, themes, flex layout, separator repair, and semantic-empty
  line suppression avoids a parallel renderer. The design also correctly excludes transcripts,
  account/credential stores, private APIs, network access, and arbitrary commands from the provider
  hot path.
- Task-set totals are a labelled ratio and the one Flow Status graphical bar is reserved for
  task-local progress. Independently labelled host context/quota bars may coexist without
  contaminating either denominator.
- Cache size, scope count, expiry, freshness, future-clock handling, deadlines, UTF-8, CJK/display
  columns, ASCII fallback, and real Windows CI have useful explicit bounds. Before implementation,
  the cache work Concept should still pin the cache path/key encoding, concurrent writer/lock
  behavior, atomic replacement semantics on Windows, and corrupt-LRU recovery.
- Persistent status is read-only, and later controls must re-query the live native owner. This
  correctly prevents cached display data from authorizing mutation.
- README currently makes no FlowStatus availability claim, so the
  [documentation gate](../../prd.md#r15--documentation-truthfulness) is presently truthful. The
  Wiki also labels the architecture as pre-implementation; its Custom Command conflict must be
  repaired before it remains the durable source.
- The current built-in status examples add no visible `OMP`, `omp:`, logo, or Bundle shorthand.
  Source documents may name omp-flow as architecture provenance; adapters must continue to keep
  that provenance out of injected presentation text.

## Human calibration gate

Do not calibrate this design as approved and do not decompose it for implementation. Repair the
selected synthesis, Wiki direction, PRD/design, and snapshot/source contracts; add the missing
Codex and Oh My Pi adapter evidence; then dispatch a fresh independent QbD 1 audit. A later model
PASS will still require an explicit linked human decision.
