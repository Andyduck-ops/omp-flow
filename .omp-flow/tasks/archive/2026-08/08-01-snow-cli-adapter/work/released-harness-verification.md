---
type: "Work"
title: "Released-Harness compatibility verification"
---

# Released-Harness compatibility verification

## Objective

Exercise an installed build on available released Snow and Cursor runtimes, record the exact
supported lifecycle and identity boundaries, and turn any unproven path into visible
unavailability rather than a product claim.

This is the real-platform complement to fixture tests. It realizes the accepted QbD advisory
checks for Cursor lifecycle boundaries and Snow native identity/Hook behavior and validates PRD
requirements 5, 6, 7, and 9 before broad compatibility claims are accepted.

## In scope

- Record exact Harness versions, OS/shell, installed package/build revision, invocation, payload
  anchors, and observed outputs with secrets and user content removed.
- Cursor checks for top-level `sessionStart` shell injection, two concurrent conversations,
  reopen/resume, and subagent behavior, always using the documented `conversation_id` as the
  supported identity.
- Snow checks for two `SNOW_SESSION_ID` values, project-Hook command execution on the available
  Windows and POSIX paths, project-over-global event precedence, and whether any native role path
  exposes a preselected exact execution identity.
- Confirm unsafe runtime-write fixtures are denied only on the Hook paths actually exercised and
  that missing/invalid context cannot fall back to a project-global task pointer.
- Record unsupported or unavailable environments/paths precisely enough for README and review;
  lack of a runtime is an explicit evidence limit, not a passing result.

## Out of scope

- Changing Snow or Cursor upstream, managing global Hooks, or inventing a platform shim.
- Creating an actor alias, rewriting an operation receipt, selecting a generated ID after
  dispatch, or weakening the strict-v1 assignment contract to make a smoke test pass.
- Product-source repair. A material implementation defect routes back to its linked work Concept
  and a new handoff/review rather than being silently fixed within this evidence item.
- Claims about OS/Harness combinations that were not run.

## Useful inputs

- [Approved PRD](../prd.md) and [Design verification map](../design.md#verification-map)
- [Accepted QbD audit](../qbd/design-audit-2.md), observations 1 through 4
- [Snow resources](snow-native-resources.md) and its expected implementation handoff
- [Cursor resources](cursor-native-resources.md) and its expected implementation handoff
- [CLI integration](cli-managed-resource-integration.md) and its expected implementation handoff
- [Snow upstream reference](../reference/snow-cli-upstream.md) and
  [Cursor primary references](../reference/cursor.md)

## Allowed code and output boundary

This work does not edit product source. It may create or edit only:

- `.omp-flow/tasks/08-01-snow-cli-adapter/work/verification/released-harness-compatibility.md`
- sanitized evidence attachments under
  `.omp-flow/tasks/08-01-snow-cli-adapter/work/verification/attachments/` when prose plus exact
  command/output anchors is insufficient
- expected handoff:
  `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/released-harness-verification.md`

Temporary runtime data remains outside Git-tracked task knowledge and must not be copied wholesale
into the Bundle.

## Done conditions

- Cursor evidence distinguishes top-level, concurrent, reopened/resumed, and subagent paths. Each
  is labeled supported with a concrete capture or visibly unavailable/unsupported with the exact
  observed reason.
- Cursor identity evidence uses `conversation_id`; any observed `session_id` is recorded only as
  versioned compatibility evidence and mismatch never selects a task.
- Snow evidence distinguishes session isolation, Hook availability/precedence, and exact native
  operation correlation. Installed agent cards alone are not treated as callable identity proof.
- No tested failure silently selects another session, host, or task. No receipt or actor value is
  normalized after operation creation.
- Documentation claims from the integration handoff are confirmed against the evidence or a
  scoped return-to-work recommendation identifies the smallest required correction.
- The verification Concept contains provenance, caveats, sanitized command/results, and explicit
  untested combinations; it does not manufacture a PASS from absent tooling.

## Focused verification

- Install from the built/packed artifact into a temporary project and verify its managed-resource
  hashes before launching either Harness.
- Run the Cursor lifecycle matrix and Snow session/Hook matrix described above on every available
  claimed platform.
- Re-run `npm test` after installation evidence to ensure the tested artifact corresponds to the
  source handoffs.
- `git diff --check`

## Expected handoff

[Released-Harness verification handoff](handoffs/released-harness-verification.md) must link back
to this work and the verification Concept, list environments and results, enumerate unsupported
paths, state whether documentation remains truthful, and recommend either independent review or
the smallest scoped return to the affected implementation work.
