---
type: "Review"
title: "Snow native resources and session isolation review"
---

# Snow native resources and session isolation review

## Findings

### HIGH — An inherited Harness identity defeats Snow session isolation

`templates/.omp-flow/scripts/common/active_task.py` checks `CODEX_THREAD_ID` and
`CODEX_SESSION_ID` before `SNOW_SESSION_ID`. The Snow session handler sets `SNOW_SESSION_ID` and
removes only `OMP_FLOW_CONTEXT_ID`; it leaves the other Harness identity variables inherited by
the Snow process. Consequently, Snow launched from a Codex terminal, or any equivalent mixed
environment, selects the Codex-scoped pointer rather than the Snow-scoped pointer. Two distinct
Snow sessions then share and overwrite one active-task selection instead of failing closed.

The focused isolation test does not cover this case because it removes every identity variable
before adding `SNOW_SESSION_ID` (`tests/snow-hooks.test.py:298-300`). A temporary deployed-runtime
reproduction retained `CODEX_THREAD_ID=inherited-codex-thread`, selected `task-alpha` under
`SNOW_SESSION_ID=snow-alpha`, selected `task-beta` under `SNOW_SESSION_ID=snow-beta`, and queried
the first Snow session again. All three operations reported the same
`codex-b93b0caa7c5f27cb67f1` context key, and the final query incorrectly returned `task-beta`.

This violates PRD requirement 5 and the Work done condition that two Snow session values remain
isolated. It also permits `onSessionStart` to orient a Snow conversation to another Harness's
task because `templates/snow/hooks/session-start.py:84-85` preserves those competing variables.

Required fix: make Snow identity selection unambiguous while preserving explicit
`OMP_FLOW_CONTEXT_ID` precedence. Rejecting conflicting implicit Harness identities is acceptable;
blindly choosing a stale foreign identity is not. Add focused coverage for both direct Snow CLI
selection and `onSessionStart` with at least one inherited foreign Harness identity.

## Verdict

**FAIL.** The implementation satisfies the native-resource, Hook-shape, path-protection, and
normal single-Harness tests, but the unresolved high-severity identity collision fails a core
session-isolation condition. No implementation code was repaired during this review.

## Scope and correlation

- Reviewed Work: [Snow native resources and session isolation](../snow-native-resources.md)
- Reviewed handoff: [Snow native resources and session isolation implementation](../handoffs/snow-native-resources.md)
- Completed predecessor receipt: `11d3f60ccf0940eab5a596bf59373803`
- Predecessor actor: `snow_native_implementer`
- Reviewer actor: `snow_native_reviewer`
- Review dispatch receipt: `ec1a46339e454d70854d900de3e6a0d6`

The predecessor runtime record is `completed`, names the assigned Work entry, and resolves its
output to the reviewed handoff. The handoff links back to that Work. Reviewer and implementer
actors differ.

The actual implementation paths reported by scoped `git status --short --untracked-files=all`
are confined to the Work's allowed code/test boundary plus its required handoff. `git status` and
`git diff --name-only` over live `.omp-flow/scripts` were empty. Ignored compile caches were not
treated as product changes. The shared worktree contains other concurrent task changes, which
were not attributed to this Work or included in its acceptance decision.

## Independent verification

- `python -X utf8 tests/snow-hooks.test.py` — **PASS**, 8 tests.
- `python -X utf8 -m compileall -q templates/snow/hooks templates/.omp-flow/scripts` — **PASS**.
- `git diff --check` — **PASS**, exit 0; only existing Windows line-ending notices were printed.
- `git status --short -- .omp-flow/scripts` and
  `git diff --name-only -- .omp-flow/scripts` — **PASS**, no live deployed script changes.
- Mixed-environment temporary-deployment reproduction — **FAIL as expected**: both Snow IDs used
  the same Codex context key, and the second selection leaked into the first Snow session.

The reproduction ran the copied portable runtime in a `TemporaryDirectory` with this exact
environment and command sequence:

```text
unset OMP_FLOW_CONTEXT_ID, CODEX_SESSION_ID, OMP_SESSION_ID, PI_SESSION_ID
set CODEX_THREAD_ID=inherited-codex-thread
set SNOW_SESSION_ID=snow-alpha
python -X utf8 <temp>/.omp-flow/scripts/omp_flow.py --cwd <temp> task select task-alpha
set SNOW_SESSION_ID=snow-beta
python -X utf8 <temp>/.omp-flow/scripts/omp_flow.py --cwd <temp> task select task-beta
set SNOW_SESSION_ID=snow-alpha
python -X utf8 <temp>/.omp-flow/scripts/omp_flow.py --cwd <temp> task current
```

Observed result:

```text
snow-alpha select -> contextKey codex-b93b0caa7c5f27cb67f1, task-alpha
snow-beta select  -> contextKey codex-b93b0caa7c5f27cb67f1, task-beta
snow-alpha current -> contextKey codex-b93b0caa7c5f27cb67f1, task-beta
```
