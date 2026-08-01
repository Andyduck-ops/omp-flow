---
type: "Handoff"
title: "Cursor native resources implementation"
---

# Cursor native resources implementation handoff

## Result

**DONE_WITH_CONCERNS** for [Cursor native resources and session bridge](../cursor-native-resources.md).

The bounded canonical Cursor resources are implemented and the linked Review findings are
repaired. Safe matched writes now emit explicit valid allow JSON under `failClosed`; malformed,
unsafe, and unverifiable known writes remain denied. The `subagentStart` fixture now uses the
current documented pre-spawn fields and the identity caveat is narrowed to what evidence actually
supports. Released Cursor lifecycle behavior and caller-preselected native identity correlation
remain deliberately unavailable until separate released-Harness verification captures them. This
handoff is implementation evidence, not independent review.

- Rework actor ID: `cursor_native_rework`
- Rework dispatch receipt: `b3d9a4fb5fe54667bcfeb53780c319be`
- Review predecessor receipt: `bcf5ac18d7f7486291164815cc600c87`
- Review predecessor: [Cursor native resources and session bridge review](../reviews/cursor-native-resources.md)
- Original implementation actor/receipt: `cursor_native_implementer` /
  `3e397ad7c0614b9d81196b03928d199b`

## Files changed

Canonical native resources:

- `templates/cursor/agents/omp-flow-research.md`
- `templates/cursor/agents/omp-flow-architect.md`
- `templates/cursor/agents/omp-flow-qbd.md`
- `templates/cursor/agents/omp-flow-implement.md`
- `templates/cursor/agents/omp-flow-check.md`
- `templates/cursor/hooks.json`
- `templates/cursor/hooks/session-start.py`
- `templates/cursor/hooks/protect-runtime.py`

Focused verification:

- `tests/cursor-hooks.test.py`
- `tests/fixtures/cursor/session-start-valid.json`
- `tests/fixtures/cursor/session-start-empty.json`
- `tests/fixtures/cursor/session-start-mismatch.json`
- `tests/fixtures/cursor/session-start-malformed.json`
- `tests/fixtures/cursor/pre-tool-use-runtime.json`
- `tests/fixtures/cursor/pre-tool-use-safe.json`
- `tests/fixtures/cursor/subagent-start.json`
- `tests/fixtures/cursor/command-rendering.json`
- `tests/fixtures/cursor/conversation-isolation.json`

Handoff:

- `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/cursor-native-resources.md`

No shared CLI integration, README/package integration, live runtime/session record, Cursor rule,
or Cursor Skill tree was changed.

## Implemented behavior and decisions

- Five native role cards use Cursor frontmatter, `model: inherit`, strict-v1 assignment startup,
  explicit Bundle/output/actor/receipt fields, their common role Skill, and a workflow-subspawn
  prohibition. All cards set `readonly: false` because every assigned role must write its bounded
  Concept, Review, or handoff; prose boundaries restrict all other mutation.
- `sessionStart` requires the documented non-empty `conversation_id`. A present `session_id` is
  accepted only when non-empty and identical, as compatibility evidence rather than primary
  identity. Missing, blank, malformed, or conflicting identity returns no `env` and selects no
  task.
- Valid session output exports exactly the same identity through `OMP_FLOW_CONTEXT_ID` and sets
  `OMP_FLOW_HOST=cursor`. Runtime status is read using that explicit context and included only as
  bounded mechanical orientation. Status failure keeps the valid identity bridge but reports
  orientation unavailable without manufacturing workflow meaning.
- `preToolUse` is registered only for the known native `Write`, `StrReplace`, and `Delete` shapes.
  Every safe matched write emits `{"permission":"allow"}` so `failClosed` receives valid JSON.
  Writes into `.omp-flow/.runtime`, malformed input, and unverifiable known-write paths emit a
  bounded deny response. Unmatched events and other tools remain silent. This is bounded
  protection, not universal write-policy enforcement.
- `templates/cursor/hooks.json` is one version-1 exact-owned resource with rendered,
  project-relative `{{PYTHON_CMD}}` commands. It registers only `sessionStart` and `preToolUse`.
- `subagentStart` is intentionally **not registered**. Its current documented event occurs before
  spawn and supplies `subagent_id`, `subagent_model`, `is_parallel_worker`, `subagent_type`,
  `task`, parent conversation, and tool-call data. Neither the static fixture nor released-runtime
  evidence proves that the caller can preselect that `subagent_id` to equal the strict descriptor
  `actorId` before submitting the assignment. Observing or comparing the ID in a Hook would not
  establish the required caller-controlled binding or make dispatch safe.
- Consequently, the research, architect, QbD, implement, and check native operation paths all
  remain unavailable for exact receipt-safe Cursor dispatch until a released runtime proves
  `native item ID = actorId` before submission. Cards and Hooks do not create aliases or rewrite
  receipts to hide that gap.

## Verification

- `python -X utf8 tests/cursor-hooks.test.py` — **PASS**, 11 tests in 13.434 seconds.
  Covers version-1 config parsing, POSIX/Windows Python command rendering, native command launch,
  strict agent-card fields, valid and invalid session identities, bounded output, known-write
  deny protection, explicit allow JSON for all three safe matched write tools, current documented
  `subagentStart` fields and deliberate absence, and two simultaneous explicit-context task
  selections against a temporary deployment.
- `python -X utf8 -m compileall -q templates/cursor/hooks` — **PASS**. Generated `__pycache__`
  files were removed after verification.
- `rg -n "[ \t]+$" templates/cursor tests/cursor-hooks.test.py tests/fixtures/cursor` — **PASS**,
  no trailing whitespace.
- `git diff --check -- templates/cursor tests/cursor-hooks.test.py tests/fixtures/cursor` —
  **PASS**.
- `Get-Command agent,cursor-agent` (checked individually) — neither executable is available on
  this machine; no released-runtime claim was made.

## Unproven lifecycle and enforcement paths

The following require [Released-Harness compatibility verification](../released-harness-verification.md)
and remain unsupported/unavailable rather than inferred from fixtures:

- top-level Cursor CLI/IDE `sessionStart.env` propagation into real agent-issued shell commands;
- two genuinely concurrent released Cursor conversations;
- reopen/resume persistence of `OMP_FLOW_CONTEXT_ID` and `OMP_FLOW_HOST`;
- subagent inheritance of the injected environment and bounded `additional_context` delivery;
- real Windows and POSIX Cursor Hook command execution beyond the local rendered-command smoke;
- real matcher coverage and deny enforcement for `Write`, `StrReplace`, and `Delete` on each
  claimed Cursor release/surface;
- preselected exact native identity for all five role cards and any receipt-safe operation path.

The temporary deployed runtime proves omp-flow's existing explicit-context precedence isolates two
conversation IDs and has no project-global fallback. It does not substitute for these native
lifecycle captures.

## Caveats and review focus

- Cursor Hook delivery/enforcement is a Harness property. Static handler success cannot establish
  that every released IDE, CLI, resume, remote, or subagent path invokes and honors the Hook.
- Review should confirm that writable role cards are necessary for their assigned output Concepts
  and that their explicit boundaries are preferable to Cursor `readonly: true`, which would make
  the required handoff/audit/review writes impossible.
- Shared CLI registration and managed-resource ownership tests are intentionally deferred to the
  linked CLI integration Work; these canonical files are not yet installed by this handoff alone.
