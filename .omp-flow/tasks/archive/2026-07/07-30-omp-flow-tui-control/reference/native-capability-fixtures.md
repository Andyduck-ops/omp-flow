---
type: "Reference"
title: "Pinned native capability fixtures"
---

# Pinned native capability fixtures

These bounded, redacted fixtures attach the exact positive public payload shapes used by the
[Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md). They are
design evidence and future adapter test inputs, not runtime state or a duplicate task registry.

## Claude Code

The executable fixture will live at
`tests/fixtures/flow-status/claude-task-events-v2.1.220.json`. The bounded repair uses the current
Bundle attachment `reference/fixtures/claude-task-list-v2.1.220.json` only as migration input,
expands it at the canonical destination, and deletes the old payload in the same change. The
fixture combines the official
Claude Code 2.1.220 `PostToolUse` envelope, documented `TaskListOutput`, and documented
`SessionStart.source` values. It proves:

- the successful `TaskList` result is a complete `tasks[]` baseline;
- task IDs, subjects, states, owners, and dependency IDs have exact structured fields;
- exactly one `in_progress` item can be selected as current; and
- `resume`, `compact`, and `fork` are explicit native invalidation inputs.

Sources:

- [PostToolUse and SessionStart hook inputs](https://code.claude.com/docs/en/hooks)
- [TaskList input/output schema](https://code.claude.com/docs/en/agent-sdk/typescript#tasklist)

A local live probe was attempted with installed Claude Code 2.1.220 and a synchronous `TaskList`
capture hook on 2026-07-30. It reached no model turn because the configured third-party CodingPlan
subscription returned HTTP 400 as expired. The attached payload is therefore a published-schema
fixture, not falsely labelled as a locally observed model run. Implementation must replay this
fixture and retain an optional live smoke test for an authenticated environment.

## Oh My Pi

The executable fixture will live at
`tests/fixtures/flow-status/oh-my-pi-task-events-v17.2.1.json`. The bounded repair uses the current
Bundle attachment `reference/fixtures/oh-my-pi-task-events-v17.2.1.json` only as migration input
and deletes it after verified placement at the canonical destination in the same change. The
fixture is transcribed from
the public types and upstream test payloads in the ignored clone:

```text
URL: https://github.com/can1357/oh-my-pi.git
revision: 7a2ced50bea8b97dbab7d9bd579329c4ea704de0
tag/package: v17.2.1 / @oh-my-pi/pi-coding-agent 17.2.1
```

Useful anchors:

- `packages/coding-agent/src/extensibility/extensions/types.ts:228-269,674-699,1178-1186`
- `packages/coding-agent/src/task/types.ts:396-466,538-551`
- `packages/coding-agent/test/modes/controllers/event-controller-task-async-updates.test.ts:27-160`
- `packages/coding-agent/src/task/index.ts:825-889`

The fixture covers capability presence, the distinct flat single-task start shape, a full indexed
batch snapshot, background state, failed and aborted terminals, an incomplete progress array, a
concurrent unselected call, and stale/disconnected invalidation. Only the complete full-snapshot
scenarios can produce positive counts. The adapter must probe the installed version/API and cannot
apply this fixture's authority to the currently installed 16.4.4 binary.

## Codex scope

`codexPlanV1` was removed from the first-release snapshot/source union. The official app-server
plan event remains future research, but no positive Codex task-set capability is claimed until a
project-owned connection/thread/turn fixture and a later reviewed interface exist. First-release
Codex remains the read-only `$flow-status` detail Skill.
