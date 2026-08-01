---
type: "Handoff"
title: "Flow Status host parity rework"
---

# Flow Status host parity rework handoff

## Result

**DONE** for [Flow Status host parity for Snow and Cursor](../flow-status-host-parity.md).

The review findings are repaired. The read-only Flow Status Skill now defines a closed,
fail-closed current-Harness/session evidence matrix for Claude, Codex, Oh My Pi, Snow, and Cursor
without requiring the three legacy adapters to inject `OMP_FLOW_HOST`. Cursor retains its
Hook-injected explicit host authority, while invalid explicit values, competing host claims, and
disagreeing session identities are unavailable. The main publisher guidance now names the same
exact five-host set in every owned tracked copy. This is implementation evidence, not independent
review.

- Actor ID: `flow_status_host_rework`
- Dispatch receipt: `7070540d42f340a1b4c26f669a52d591`
- Completed predecessor receipt: `eb9e58fd1362426ea3b20ca81176356d`
- Predecessor output: `.omp-flow/tasks/08-01-snow-cli-adapter/work/reviews/flow-status-host-parity.md`
- Output Concept: `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/flow-status-host-parity.md`

## Files changed

Closed executable host contract retained from the reviewed implementation:

- `src/cli/flow-status-semantic-publisher.ts`
- `src/cli/index.ts`
- `templates/.omp-flow/scripts/common/flow_status.py`
- `templates/.omp-flow/scripts/omp_flow.py`

Read-only evidence contract, kept byte-identical as a canonical/tracked pair:

- `templates/common/skills/flow-status/SKILL.md`
- `.agents/skills/flow-status/SKILL.md`

Five-host publisher guidance, kept byte-identical across the canonical and all owned tracked
deployments after the Work boundary was widened:

- `templates/common/skills/omp-flow/SKILL.md`
- `.agents/skills/omp-flow/SKILL.md`
- `.omp/skills/omp-flow/SKILL.md`
- `.claude/skills/omp-flow/SKILL.md`

Focused verification:

- `tests/flow-status-v2-publisher.test.ts`
- `tests/flow-status-v2.test.py`

Handoff:

- `.omp-flow/tasks/08-01-snow-cli-adapter/work/handoffs/flow-status-host-parity.md`

No live `.omp-flow/scripts/**` runtime, runtime/session record, Harness configuration, cache
layout, renderer, lifecycle field, or unrelated concurrent resource was changed.

## Implemented behavior and decisions

- The executable TypeScript/Python closed host set remains exactly `claude`, `codex`,
  `oh-my-pi`, `snow`, and `cursor`; unknown hosts still fail before mutation.
- Claude resolves from native Claude Skill execution plus its bridged `OMP_FLOW_CONTEXT_ID`.
  Codex resolves directly from `CODEX_THREAD_ID`. Oh My Pi resolves from native execution plus
  `OMP_FLOW_CONTEXT_ID`, or from agreeing `OMP_SESSION_ID`/`PI_SESSION_ID`. Snow resolves from
  `SNOW_SESSION_ID`. These existing hosts need no new adapter variable.
- Cursor requires Hook-injected `OMP_FLOW_HOST=cursor` and the matching
  `OMP_FLOW_CONTEXT_ID` carrying its `conversation_id`; it never falls back to an implicit or
  configured host.
- A valid `OMP_FLOW_HOST` is explicit authoritative evidence, but it cannot suppress a competing
  native or host-specific claim. Invalid explicit values, more than one claimed host, missing
  matching session evidence, or differing session identifiers all fail closed.
- `OMP_FLOW_CONTEXT_ID` alone never identifies a host. JSON/YAML configuration, configured order,
  cache recency, task counts, and Markdown are prohibited as host/session selection inputs.
- Focused executable test matrices cover a valid path for all five hosts, absence for every host,
  invalid explicit evidence, cross-host conflicts, same-host session conflicts, Cursor authority,
  and combined configuration non-selection.
- Publish, renew, clear, inspect, scope-key isolation, CAS, and lease behavior retain their prior
  v2 shapes and code paths. No state field, semantic inference path, fallback cache lookup, or
  compatibility reader was added.

## Verification

- `npx tsx -e "...runFlowStatusV2PublisherTests..."` — **PASS**, focused publisher and runtime-
  evidence contract.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — **PASS**.
- `npm run build` — **PASS**, `tsc` completed after the final test edit.
- `npm test` — **PASS**: 439 focused checks, 12 Python unittest cases, and 3 TAP tests. Its
  temporary installation ran `python -X utf8 tests/flow-status-v2.test.py <temporary-project>`
  and `python -X utf8 tests/flow-status.test.py <temporary-project>`; both passed, including exact
  v2 shapes, publish/inspect/renew/stale-CAS/clear, same-session cross-host isolation, and v1
  envelope regression.
- `npm pack --dry-run` — **PASS**, package `omp-flow@0.2.6`, 137 files, 182.8 kB packed and
  844.0 kB unpacked; no tarball was written.
- `git diff --check` — **PASS**; only repository line-ending notices were emitted.
- SHA-256 parity — **PASS**. Both Flow Status Skill copies hash to
  `CEC4319FC8B297DE98075343424EE5D9AA8AB385C0ABE55C4B102D60B5BA9E6C`. The canonical and all
  three tracked `omp-flow` Skill deployments hash to
  `7B2198319C16D4DC2C1FE5E8B9598618692D88ED6218A65509137BF0D4D326CA`.
- `git diff --quiet -- .omp-flow/scripts` — **PASS**, confirming no tracked live runtime edit.

## Caveats and review focus

- Native Harness identity in the Skill contract means the Harness actually executing the Skill;
  it is not inferred from installed/configured Harness order.
- The evidence resolver in focused tests is an executable acceptance oracle for the documented
  read-only Skill contract; it does not add a production inference service or parse Markdown.
- No done condition within this bounded rework remains unproven. Independent review remains
  required before acceptance.
