---
type: "Synthesis"
title: "Minimal Snow and Cursor adapter direction"
---

# Minimal Snow and Cursor adapter direction

The detailed evidence remains in the linked [Hooks](hooks.md),
[agents and Skills](agents-skills.md), and [adapter contract](adapter-contract.md) research. The
implementation direction is deliberately smaller than the investigation.

## Selected direction

Build thin, project-local Snow and Cursor adapters by reusing each Harness's native facilities and
omp-flow resources that already exist. Do not build a new dispatcher, identity layer, Hook merger,
task model, or compatibility schema.

The first adapter needs only:

1. `snow` and `cursor` Harness selection in init/config/update/help.
2. Existing common Skills through `.agents/skills`; no duplicate `.snow/skills` tree.
3. Native project resources under `.snow/agents`/`.snow/hooks` and
   `.cursor/agents`/`.cursor/hooks.json`, using existing omp-flow role and Hook behavior with only
   the required format/command translations.
4. `SNOW_SESSION_ID` recognition and Cursor `conversation_id` Hook bridging for project-session
   task selection.
5. Harness-aware Flow Status handling; never silently read Codex session state from Snow or
   Cursor.
6. Focused install/update/session/Hook tests and documentation.

## Hooks

coordinate global Hooks.
Project Hooks are a normal part of both adapters. There is no product requirement to support or
coordinate global Hooks.
coordinate global Hooks.

Use the available Snow events for bounded jobs:

- `onSessionStart` supplies current project/task orientation;
- `beforeToolCall` checks dispatch inputs and protects omp-flow mechanical paths;
- completion/after events may carry observations or context where useful.

The earlier statement that Hooks "cannot solve identity" has a narrow meaning only: Snow does not
put the unique running `instanceId` in the relevant pre/post sub-agent Hook payloads, so a Hook
cannot prove that two concurrent runs of the same agent type are different native instances. This
does not prevent installing Hooks or using them for normal project work.

## Actor naming

Choose a legal native task name before `operation start`; for Codex use lower-case underscore
names such as `data_researcher`. Never create a receipt with one name and normalize it afterward.
No general-purpose actor grammar or new operation schema is needed for this adapter.

Where Snow does not expose a preselected unique native instance ID, keep that precise correlation
limitation local to the affected dispatch path. Do not fake it with an agent name, but also do not
turn it into the center of the project adapter.

Cursor exposes `conversation_id`, `subagent_id`, and `tool_call_id` to project Hooks. Use those
native values where available; keep the terminal session-context bridge as a small Hook adapter,
not a generalized identity system.

## Non-goals

- global Hook merging or precedence management;
- a custom Snow dispatcher or task database;
- duplicated Skills;
- a generalized cross-Harness identity framework;
- changing Snow upstream as a prerequisite;
- expanding Python into authored workflow semantics.

This is sufficient to proceed to a small Design and implementation map.
