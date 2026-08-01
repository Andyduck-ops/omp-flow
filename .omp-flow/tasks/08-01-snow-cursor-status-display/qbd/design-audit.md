---
type: "QbD Audit"
title: "QbD 1: Project-owned Snow and Cursor Flow Status commands"
---

# QbD 1: Project-owned Snow and Cursor Flow Status commands

## Verdict

**PASS** — risk **moderate**, blocking findings **0**.

The [PRD](../prd.md) and [Design](../design.md) justify a bounded, reversible integration: each
Harness receives a project-owned prompt command, while the existing shared `flow-status` Skill
remains the only inspection procedure. The linked research supports the native resource formats
and explains why the stronger persistent surfaces are outside this task. No unresolved evidence
shows a critical falsehood, authorization/data violation, irreversible effect, or unrealizable
core path for which removal or safe degradation would be insufficient.

This model verdict is not human approval and does not authorize decomposition by itself.

## Decision basis

### Confirmed evidence

- The [selected synthesis](../research/synthesis.md) preserves the first-principles boundary:
  project-owned on-demand commands now; user-global Snow StatusLine/AnyPanel and Cursor CLI
  `statusLine` remain separately gated. The [Snow research](../research/snow-display.md) and its
  [revision-anchored reference](../reference/snow-cli-v0.8.24.md) support `.snow/commands` prompt
  discovery, filename-derived naming, project precedence, shared `.agents/skills` discovery, and
  normal Agent terminal execution carrying `SNOW_SESSION_ID`. The [Cursor research](../research/cursor-display.md)
  supports `.cursor/commands/<name>.md` as an on-demand Agent prompt and explicitly distinguishes
  it from the user-global, update-driven Cursor CLI status line and an out-of-scope Desktop
  extension.
- The proposed Snow JSON matches the checked Snow 0.8.24 loader contract: non-empty string
  `command`, recognized `type: "prompt"`, optional `location`, and a name normalized from the
  filename. The Cursor file relies only on the researched Markdown-command contract and adds no
  speculative metadata.
- The repository's existing managed-resource machinery in
  [`src/cli/init.ts`](../../../../src/cli/init.ts) and
  [`src/cli/update.ts`](../../../../src/cli/update.ts) supports the Design's whole-file behavior:
  selection by Harness group, init skip/explicit force, hashes only for written resources,
  unclaimed canonical equality, new-file creation on update, `autoUpdate` for unchanged owned
  bytes, preserved deletion, visible conflict, `.new`, and backed-up forced update. No JSON or
  Markdown field merge is introduced.
- The proposed verification is proportionate to a prompt-resource feature. Exact JSON/value and
  Markdown/body checks detect native-format and wording drift; Harness-selection and lifecycle
  cases exercise the actual resource paths; explicit package-output and README assertions cover
  distribution and false persistent claims. The Design correctly refuses to present those tests
  as proof of deterministic model behavior.

### Assumptions retained by the decision

- Cursor continues to discover project `.cursor/commands` and shared `.agents/skills` as described
  by the linked current documentation/research.
- When a model follows the command and loads the Skill, its normal tool environment exposes the
  exact evidence required by the Skill: `SNOW_SESSION_ID` for Snow, or the Hook-injected matching
  Cursor host/context pair. The Design already degrades missing or conflicting evidence to
  unavailable.
- The existing broad `templates` npm include remains in place; the required `npm pack --dry-run`
  check is the release-time proof that the two new paths were actually packaged.

### Strongest counter-evidence

- Both entrypoints are model-mediated prompts. A command file can instruct the Agent to load and
  obey the Skill, but it cannot mechanically prove that the model did so. Therefore a useful
  exact-session result is best-effort at invocation time, and a noncompliant model could omit the
  result or answer from conversational context despite the instruction. This weakens the PRD
  Outcome's unqualified phrase "receive ... the result," but the Design and PRD non-goal already
  bound the supported product contract to an instruction plus explicit on-demand/model-mediated
  documentation. The failure is ephemeral and can be safely described as unavailable; it does
  not justify widening scope to a direct shell command or persistent global integration.
- Static tests cannot establish released-Harness Skill activation. Making them claim otherwise
  would be false confidence. The proposed exact-content, lifecycle, package, and documentation
  checks can detect product-owned semantic drift; an optional released-Harness smoke check can
  provide observational evidence only.
- Cursor Hook environment propagation and Snow version availability remain incompletely proven in
  released interactive paths. The shared Skill's exact-evidence gate prevents a cross-session
  fallback when it runs, so these unknowns reduce availability rather than authorizing a false
  cache selection.

### Accepted risk

No human risk acceptance is recorded in the Bundle. The PASS leaves these residual risks for human
calibration: model noncompliance, Snow version availability, Cursor Hook environment propagation,
and the fact that automated verification proves owned prompt semantics rather than end-to-end
model obedience.

## Findings

### Advisory A1 — Keep the observable promise aligned with model mediation

The implementation and README should use the Design's narrower wording: `/flow-status` asks the
current Agent to use the shared Skill and report an on-demand result or unavailable condition; it
does not guarantee deterministic Skill activation for every model/release. If the Skill cannot be
located or executed, the prompt should result in unavailable without status details. This closes
the small tension with the PRD Outcome and avoids presenting a prompt as a mechanically enforced
adapter. It is advisory because truthful safe degradation is already part of the selected design
and no persistent or irreversible effect occurs.

### Advisory A2 — Preserve the verification boundary

The exact canonical-body assertions should remain the primary semantic-drift oracle. Keyword
assertions should distinguish a prohibited positive persistence claim from the required negative
sentence that the command is not persistent. A manual Snow/Cursor smoke may be recorded as
observational evidence, but neither that smoke nor unit tests should become a claim that future
models deterministically invoke Skills.

## Exact next decision

Human calibration must choose one of these options and record it as a linked decision Concept:

1. **Accept PASS and residual risk** — approve this bounded Design for work decomposition, carrying
   Advisory A1 and A2 into work done conditions and verification.
2. **Request clarification before approval** — revise only the PRD/Design promise or verification
   wording around model mediation, then decide whether the clarification is substantive enough to
   warrant a scoped re-audit.
3. **Defer or stop** — do not implement the on-demand commands.

## Assignment correlation

- Bundle: `.omp-flow/tasks/08-01-snow-cursor-status-display`
- Role: `qbd-auditor` (QbD 1)
- Entry: [`design.md`](../design.md)
- Actor ID: `status_display_qbd1`
- Dispatch receipt: `b9dbc8dd1cf14e09b89fa8ab58edff65`
- Predecessor: none
- Output boundary: this Audit Concept only
