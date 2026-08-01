---
type: "Handoff"
title: "Snow native resources and session isolation implementation"
---

# Snow native resources and session isolation implementation

## Result

Status: **DONE**

This implements [Snow native resources and session isolation](../snow-native-resources.md) within
its declared boundary. Five Snow role cards, the two Snow event files and their stdlib handlers,
Snow-scoped portable session identity, and focused fixtures/tests are present.

Revision 2 repairs the mixed-Harness identity collision identified by the linked
[independent review](../reviews/snow-native-resources.md). Explicit `OMP_FLOW_CONTEXT_ID` remains
authoritative; otherwise a present `SNOW_SESSION_ID` is selected before inherited foreign Harness
identity variables. The Snow session-start handler also removes foreign implicit identity variables
from the runtime subprocess environment, so its payload session cannot orient against a stale
Codex, OMP, or Pi pointer.

All five role cards are installed, but strict native omp-flow operation dispatch through them is
explicitly unavailable. At pinned Snow 0.8.24, a Markdown agent ID/name is a reusable definition,
not the unique native execution ID, and Snow cannot expose or reserve that execution ID before
`operation start`. Each card therefore requires the strict-v1 assignment fields and then stops
without executing, writing its promised output, or finishing the receipt. No card creates a
receipt, infers predecessor state, normalizes `actorId`, or aliases its type/name to execution
identity.

## Files changed

Revision 2 changed only:

- `templates/.omp-flow/scripts/common/active_task.py`
- `templates/snow/hooks/session-start.py`
- `tests/snow-hooks.test.py`
- `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/snow-native-resources.md`

The complete Work implementation comprises:

- `templates/snow/agents/omp-flow-research.md`
- `templates/snow/agents/omp-flow-architect.md`
- `templates/snow/agents/omp-flow-qbd.md`
- `templates/snow/agents/omp-flow-implement.md`
- `templates/snow/agents/omp-flow-check.md`
- `templates/snow/hooks/onSessionStart.json`
- `templates/snow/hooks/beforeToolCall.json`
- `templates/snow/hooks/session-start.py`
- `templates/snow/hooks/protect-runtime.py`
- `templates/.omp-flow/scripts/common/active_task.py`
- `tests/fixtures/snow/hook-cases.json`
- `tests/snow-hooks.test.py`
- `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/snow-native-resources.md`

No live `.omp-flow/scripts/**` deployment or runtime/session record was edited.

## Verification

- `python -X utf8 tests/snow-hooks.test.py` — PASS, 8 tests.
- `python -X utf8 -m compileall -q templates/snow/hooks templates/.omp-flow/scripts` — PASS.
- The event-file test rendered and parsed both `onSessionStart.json` and
  `beforeToolCall.json` with `python` and `python3`, asserted direct project-relative commands,
  and rejected added `sh -c` / `cmd /c` wrappers — PASS.
- The temporary-deployment test selected separate tasks under `snow-session-alpha` and
  `snow-session-beta` while both inherited `CODEX_THREAD_ID`, proved distinct `snow-<digest>`
  context keys with no selection leakage, and proved explicit `OMP_FLOW_CONTEXT_ID` still wins
  without overwriting the Snow-scoped selection — PASS.
- The `onSessionStart` test supplied inherited Codex, OMP, and Pi identities plus an ambient
  explicit override, then proved the child runtime received only the payload-derived
  `SNOW_SESSION_ID` — PASS.
- `git diff --check` — PASS. The command reported only existing Windows line-ending notices and
  no whitespace error.
- Focused trailing-whitespace scan over the changed code/tests — PASS, no matches.

An initial focused test run reported two failures because the unsafe relative-path fixtures were
incorrectly invoked from a nested directory where those paths remained repository-confined. The
test was corrected to use Snow's project-root `cwd`; the handler was unchanged for that finding,
and the complete suite then passed twice, including after exact session-payload validation was
added.

## Decisions and capability limits

- Snow `onSessionStart` returns one bounded top-level `additionalContext` JSON result. Malformed
  input returns bounded fail-soft orientation text and never manufactures task meaning.
- Snow `beforeToolCall` covers only `filesystem-create`, `filesystem-edit`, and
  `filesystem-replaceedit`. It exits 1 for direct `.omp-flow/.runtime` targets, repository escapes,
  remote/unverifiable paths, and malformed input; verified ordinary project paths are a no-op.
- The guard is defense in depth. It does not cover `terminal-execute`, arbitrary MCP mutators,
  missing/disabled Hooks, or Snow's known upstream fail-open paths.
- A non-empty project `.snow/hooks/<event>.json` replaces the same-event global rules; Snow does
  not merge them. Both managed event descriptions preserve this user-visible precedence fact for
  later README integration.
- Hook commands are executable project configuration. This work does not add global Hook trust,
  composition, or merge behavior.
- `SNOW_SESSION_ID` is recognized only in the canonical portable active-task template. Explicit
  `OMP_FLOW_CONTEXT_ID` remains first precedence; Snow precedes only implicit foreign Harness
  identities, and no project-global fallback was added.

## Identity

- Revision 2 actor ID: `snow_native_rework`
- Revision 2 dispatch receipt: `d7322714f25842bfb8541fcc7bbe80c9`
- Revision 2 predecessor receipt: `ec1a46339e454d70854d900de3e6a0d6`
- Revision 2 predecessor output:
  [Snow native-resources review](../reviews/snow-native-resources.md)
- Revision 1 actor ID: `snow_native_implementer`
- Revision 1 dispatch receipt: `11d3f60ccf0940eab5a596bf59373803`

## Unproven done conditions

None within this Work Concept. Installation/registration, package integration, README wording,
real Snow released-runtime capture, and independent re-review/acceptance belong to linked work or
review; this implementation result is not an independent review.
