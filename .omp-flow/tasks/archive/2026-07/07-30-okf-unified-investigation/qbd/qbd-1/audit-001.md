---
gate: qbd1
verdict: PASS
risk: high
evidenceDigest: sha256:6797c66635ebb9585d7867de86a3c7409db918133020624e09330ec27396eb92
---

# QbD 1 audit

## Verdict

PASS. The evidence justifies the problem and selected direction, defines a coherent
semantic/mechanical ownership boundary, rejects schema-preserving Markdown translation, and
specifies a direct cutover with visible failure behavior. The high risk reflects the breadth and
irreversibility of the consumer cutover, not a contradiction that prevents decomposition.

## Blocking findings

None.

## Evidence anchors

- `research/90-synthesis-001-semantic-task-bundle.md` identifies the central failure as
  cross-coupled projections of the same workflow knowledge and selects a task-root OKF Bundle plus
  a minimal mechanical runtime. It explicitly rejects an OKF facade, a Markdown DSL, encoded
  topology filenames, and speculative compatibility machinery.
- `prd.md` turns that direction into testable outcomes: one portable Bundle, ordinary relative
  link navigation, connected brainstorm/research, work and review as Concepts, Git versioning,
  direct cutover, no legacy fallback, and visible failure at natural entry points.
- `design.md` supplies the required interfaces and ownership split. Documents own task meaning;
  runtime storage owns session/path/process identity, locking, dispatch receipts, atomic external
  effects, and directory operations. This is consistent with
  `context/decision/semantic-knowledge-boundary.md`.
- `context/finding/legacy-projection-coupling.md` provides concrete current-system anchors for the
  duplication claim across scaffold, context construction, review submission, and Reference
  digestion. This supports removal of synchronized projections rather than one-for-one migration.
- `context/interface/bundle-agent-entry.md` defines a bounded assignment interface that preserves
  role, objective, entry context, output scope, and native correlation without reconstructing
  semantic manifests.
- `context/brief/direct-cutover.md` and `design.md` agree that consumers move before their stores
  disappear, while no accepted/released state may dual-write or fall back.
- The accepted Reference is pinned in `prd.md` to OKF v0.2 at commit
  `3fcbb9f828c2f23d109c855ee403c3a4c81f3a96`; the selected synthesis uses only its permissive
  Bundle/Concept/link/index model and does not claim that OKF supplies workflow lifecycle
  semantics.

## Non-blocking risks and required decomposition treatment

1. **Cutover breadth — non-blocking, high risk.** Skills, Hooks, agent cards, source acquisition,
   dispatch/review coordination, Python lifecycle/gates, templates, and tests are active
   consumers. Decomposition must inventory these consumers, order each consumer replacement
   before store deletion, and reserve an integration check proving there is neither active legacy
   fallback nor dual-write behavior.

2. **Semantic gates and independence — non-blocking.** Human decisions and review verdicts become
   prose interpreted by Skills rather than Python-owned phase mutations. Decomposition must keep
   the design's explicit role/output boundaries and native receipt correlation, and must include
   a dogfood path demonstrating that implementation cannot legitimately proceed without the
   applicable linked human decision and that review remains independent and traceable. This must
   not be solved by parsing Markdown into hidden state.

3. **Git visibility and archive behavior — non-blocking.** The target requires active Bundles to
   become tracked although current task storage is ignored, and archive relocation must preserve
   useful relative navigation. Decomposition must include the ignore-policy change and an
   observable check that new Bundle edits are tracked while runtime/cache data remains ignored,
   plus a copy/archive navigation demonstration.

4. **Proportional verification — non-blocking.** Direct inspection is appropriate for authored
   semantics, but retained mechanical guarantees require executable checks. Decomposition must
   bind focused verification for path confinement, session selection, receipt identity and
   reviewer correlation, duplicate-side-effect prevention, atomic create/archive behavior, and
   Git/cache boundaries. The real dogfood task must cover alternating exploration, design,
   grouped work, linked handoff/review, human decision, and archive without fixed Markdown
   structure or generated context.

5. **Required versus optional links — non-blocking.** The design correctly tolerates optional
   broken links while failing on a missing assignment entry. Work briefs must identify their
   required entry Concepts explicitly so that failure is visible at dispatch rather than
   ambiguously deferred to agent interpretation.

## Required remediation

No pre-decomposition design remediation is required. The five non-blocking treatments above must
be represented in the exact topology, row briefs, bindings, and QbD 2 verification coverage.
