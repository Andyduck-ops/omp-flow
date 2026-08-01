---
type: "Research"
title: "omp-flow Snow adapter contract"
---

# omp-flow Snow adapter contract

This Concept answers the adapter and operation-correlation questions in the
[Brainstorm](../brainstorm.md). It uses the pinned
[Snow upstream Reference](../reference/snow-cli-upstream.md) and current repository code. It does
not authorize implementation.

## Conclusion

The evidence **revises**, but does not falsify, the provisional anchor. Snow 0.8.24 can run the
portable omp-flow main-session methodology with a small adapter because it already discovers
project `.agents/skills`. It cannot currently satisfy omp-flow's strict native-work invariant that
`actorId` equal the unique Harness-native execution/task ID for either ordinary sub-agents or Team
teammates. The blocking fact is not an ID character grammar: Snow accepts hyphens in project agent
IDs and teammate names. The blocking fact is that the unique execution IDs are generated inside
Snow after the assignment must already have been supplied, and the pre/post sub-agent Hook payloads
do not expose those instance IDs.

The smallest mechanically honest direction is therefore a **degraded Snow adapter**: support Snow
as a main-session Harness, reuse only the universal `.agents/skills`, bind Snow's session UUID into
the portable runtime, and document native operation dispatch/review as unsupported. Do not install
Snow operation agents or claim receipt correlation until a pinned upstream surface supplies a
caller-chosen or pre-reservable unique instance ID and exposes it at completion. A Hook cannot make
the missing identity trustworthy.

## Provenance and scope

- Upstream is `MayDay-wpf/snow-cli`, npm package `snow-ai` 0.8.24, commit
  `86a18cfbf5844c14a99dcc717eed26b8cf5b89d4`, authored 2026-07-31 and inspected
  2026-08-01. The task-local clone and primary anchors are recorded in the
  [Reference Concept](../reference/snow-cli-upstream.md).
- External links below are immutable commit URLs. Internal evidence refers to the current
  omp-flow repository at commit `e14b5495830ba9821699898c23ba278680289fcc` (2026-08-01), with
  existing unrelated working-tree changes deliberately left untouched.
- The decision affected is whether Snow can be added as a full native execution Harness now, or
  only as a main-session compatibility surface. Hook protocol details beyond their effect on
  identity and managed-resource ownership remain the responsibility of the linked Hooks research.

## Confirmed internal contracts

### Harness selection and managed resources

1. The Harness type and persisted `config.json` validator currently admit only `omp`, `codex`, and
   `claude`; unknown values fail. Stable ordering also comes from that fixed array
   (`src/cli/harness.ts:4-19`, `src/cli/harness.ts:22-38`). The CLI parser and help independently
   enumerate the same three flags (`src/cli/index.ts:65-123`, `src/cli/index.ts:269-296`). Snow
   support therefore requires coordinated type, parser, prompt, help, and config tests—not merely
   a template directory.
2. Common methodology Skills are sourced once from `templates/common/skills` and are always
   deployed to `.agents/skills`; Harness-specific resources are selected by a `group`
   (`src/cli/init.ts:85-101`, `src/cli/init.ts:122-168`, `src/cli/init.ts:232-239`,
   `src/cli/init.ts:303-306`). This is already the correct source-of-truth shape for Snow Skills.
3. Init records the exact rendered content hash after writing (`src/cli/init.ts:349-375`). Update
   auto-updates only when the current content still equals its stored hash, preserves a user
   deletion, treats unknown or modified content as a visible conflict, and deletes obsolete files
   only when the stored hash still owns them (`src/cli/update.ts:64-144`). It backs up managed and
   obsolete files before mutation (`src/cli/update.ts:147-176`, `src/cli/update.ts:284-300`). Snow
   resources should use this exact-file ownership model; no Snow config or Hook merger is needed.
4. The existing tests require all selected resources to deploy, require canonical/deployed copies
   to be byte-identical, and verify universal Skill parity (`tests/omp-flow.test.ts:122-178`). The
   Codex-specific tests also establish the intended collision behavior: foreign Hook files are
   skipped and modified formerly-managed files are preserved (`tests/codex-init.test.ts:70-97`,
   `tests/codex-init.test.ts:175-188`).

### Operation identity and dispatch

1. `create_operation` confines entry/output paths and currently validates `actor_id` only by
   trimming and checking non-emptiness; it applies no Harness grammar
   (`templates/.omp-flow/scripts/common/operation_store.py:77-99`). It stores the actor unchanged
   and `finish_operation` requires exact equality with that stored actor
   (`templates/.omp-flow/scripts/common/operation_store.py:112-128`,
   `templates/.omp-flow/scripts/common/operation_store.py:161-192`). This explains how a valid
   receipt can nevertheless be impossible to submit to a native Harness.
2. `operation start` is the sole producer of the strict v1 descriptor. The descriptor copies the
   stored actor into `actorId`, includes the opaque receipt and predecessor correlation, and must
   be the first non-blank assignment line (`templates/.omp-flow/scripts/omp_flow.py:158-201`,
   `templates/.omp-flow/scripts/omp_flow.py:204-223`).
3. The current OMP adapter verifies `descriptor.actorId === input.id`, then checks the descriptor
   against the still-active runtime operation and completed predecessor
   (`src/omp/extension.ts:240-290`). Tests prove exact descriptor shape, different-actor review,
   unchanged forwarding, and malformed-descriptor rejection (`tests/omp-flow.test.ts:571-621`,
   `tests/omp-flow.test.ts:629-660`, `tests/omp-flow.test.ts:675-734`). This exact relation is the
   contract Snow must meet; agent type/name is not an acceptable substitute for a unique native
   execution ID.
4. The durable adapter boundary says Harnesses may share Bundle knowledge and the portable kernel,
   but must not borrow another Harness's files or infer semantic workflow state
   (`.omp-flow/wiki/architecture/codex-native-hooks.md:41-50`).

### Session and Flow Status compatibility gaps

1. The portable active-task resolver recognizes an explicit `OMP_FLOW_CONTEXT_ID`, payload session
   keys, and Codex/OMP/Pi environment variables, but not Snow
   (`templates/.omp-flow/scripts/common/active_task.py:14-20`,
   `templates/.omp-flow/scripts/common/active_task.py:44-61`). Without a Snow binding,
   `task select` fails when invoked only with Snow's native child-process environment
   (`templates/.omp-flow/scripts/common/active_task.py:84-99`).
2. `flow-status` is installed in the universal `.agents` root, so Snow will discover it, but its
   current instruction hardcodes `status inspect --host codex`
   (`templates/common/skills/flow-status/SKILL.md:8-20`). Both the TypeScript publisher and Python
   receiver admit only `claude`, `codex`, and `oh-my-pi`
   (`src/cli/flow-status-semantic-publisher.ts:24`,
   `src/cli/flow-status-semantic-publisher.ts:293`,
   `templates/.omp-flow/scripts/common/flow_status.py:25`). A Snow-only init must not silently expose
   a Skill that reads a Codex-scoped snapshot.

## Confirmed Snow 0.8.24 facts

### Skills and agent definitions

1. Snow scans Skills from bundled, global `.agents`, global `.snow`, project `.agents`, and project
   `.snow` roots in ascending precedence. At the same scope, native `.snow/skills` silently
   overrides compatibility `.agents/skills`
   ([`skills.ts` lines 178-243](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/mcp/skills.ts#L178-L243)).
   Therefore omp-flow's existing `.agents/skills` is directly consumable. Creating a second
   `.snow/skills` copy would introduce silent shadowing and two sources of truth.
2. Snow's project agent root is `.snow/agents/**/*.md`; global agents are optionally loaded from
   `~/.snow/agents`. `id` comes from frontmatter or the filename stem, with no character-regex
   check in the parser
   ([`projectAgents.ts` lines 13-47 and 53-132](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/projectAgents.ts#L13-L132)).
   Upstream tests explicitly use `trellis-implement` and `my-agent`, confirming that hyphenated
   agent IDs are valid
   ([`projectAgents.test.ts` lines 14-69](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/test/projectAgents.test.ts#L14-L69)).
3. Project agent definitions override global/user/builtin definitions with the same agent ID
   ([`subAgentResolver.ts` lines 9-22](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/subAgentResolver.ts#L9-L22)).
   Exact-owned omp-flow files can coexist with unrelated Snow agents, but a same-ID foreign or
   modified project file is a real collision that init/update must preserve and report.
4. Pinned 0.8.24 has a consequential discovery/dispatch gap. Resolution merges project Markdown
   agents, but the callable sub-agent tool catalog is built from `getUserSubAgents()` plus hard-coded
   built-ins, and the MCP manager wraps only that returned catalog
   ([`subagent.ts` lines 93-105 and 204-233](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/mcp/subagent.ts#L93-L233),
   [`mcpToolsManager.ts` lines 452-474](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/mcpToolsManager.ts#L452-L474)).
   A new `.snow/agents` ID may appear in discovery/pickers yet not become a model-callable
   `subagent-*` tool. A project override of an existing built-in can resolve, but arbitrary new
   operation roles are unproven/broken in the pinned release.

### Ordinary sub-agent identity is not caller-controlled

1. Snow constructs a sub-agent tool call as `subagent-<agentId>`, then registers the running
   execution with `instanceId: toolCall.id`; it passes the same `toolCall.id` into the child
   execution
   ([`toolExecutor.ts` lines 394-460](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/toolExecutor.ts#L394-L460)).
   Thus the agent definition ID selects a role/type, while the provider/model tool-call ID is the
   unique execution instance.
2. Snow's own tracker documents this distinction: the unique instance ID is typically the tool
   call ID; `agentId` is the agent type; multiple parallel instances are distinguished by prompt
   and instance ID
   ([`runningSubAgentTracker.ts` lines 21-32 and 65-104](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/runningSubAgentTracker.ts#L21-L104)).
3. Although the executor receives `instanceId`, `beforeSubAgentStart` sends only `agentId`,
   `agentName`, prompt, cwd, and session ID to Hooks
   ([`subAgentExecutor.ts` lines 54-67 and 102-135](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/subAgentExecutor.ts#L54-L135)).
   `onSubAgentComplete` likewise contains agent ID/name, content, success, and usage but no instance
   ID
   ([`hooksConfig.ts` lines 94-125](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/hooksConfig.ts#L94-L125)).
   Hooks therefore cannot bind or finish the correct receipt when two instances of one agent run.

### Team names are controllable, but Team IDs are not

1. `spawn_teammate` lets the caller supply `name` and `prompt`, and permits Chinese/English letters,
   digits, `_`, and `-`
   ([`team.ts` lines 1047-1083](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/mcp/team.ts#L1047-L1083)).
   This is counter-evidence to treating a hyphen as a universal Snow ID failure.
2. Snow creates the member internally with `randomUUID().slice(0, 8)`; the supplied name is a
   separate field
   ([`teamConfig.ts` lines 111-136](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/team/teamConfig.ts#L111-L136)).
   `spawn_teammate` sends the prompt, starts the child, and only then returns that generated
   `memberId`
   ([`team.ts` lines 247-388](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/mcp/team.ts#L247-L388)).
   An omp-flow receipt/assignment cannot name that member ID before the native prompt is submitted.
3. The teammate-name sanitizer is for worktree paths and allows `_`/`-`; it does not make the name
   the member ID
   ([`teamWorktree.ts` lines 6-38](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/team/teamWorktree.ts#L6-L38)).
   `addMember` has no duplicate-name check, and existing same-name worktree paths are reused, so a
   name is not a safe unique execution identity.
4. Snow Team's shared task list is a third identity domain: `create_task` also generates an
   independent eight-character UUID and does not accept a caller-supplied task ID
   ([`teamTaskList.ts` lines 62-87](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/team/teamTaskList.ts#L62-L87)).
   Equating an omp-flow operation actor with a Team task ID would still not identify the teammate
   process that received the assignment.

### Hooks and session identity do not repair execution identity

1. Snow Hook files are per-event JSON files under project or global `.snow/hooks`. A non-empty
   project event file replaces, rather than merges with, the global rules for that event
   ([`hooksConfig.ts` lines 139-215 and 241-249](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/config/hooksConfig.ts#L139-L249)).
   Installing a project Hook is therefore a user-visible precedence decision, not a harmless
   additive resource.
2. `beforeSubAgentStart` is explicitly fail-open on Hook error
   ([`subAgentExecutor.ts` lines 102-127](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/subAgentExecutor.ts#L102-L127)).
   It also lacks `instanceId`, so it cannot be an authoritative identity gate.
3. Snow does provide a useful main-session mechanical seam: terminal, Hook, and sub-agent child
   environments receive the native `SNOW_SESSION_ID`, plus `SNOW_CWD` and `SNOW_PLATFORM`
   ([`sessionIdentityEnv.ts` lines 16-46](https://github.com/MayDay-wpf/snow-cli/blob/86a18cfbf5844c14a99dcc717eed26b8cf5b89d4/source/utils/execution/sessionIdentityEnv.ts#L16-L46)).
   The portable runtime can recognize this UUID directly without any Snow Hook and without
   inferring authored task meaning.

## Three compatibility options

| Option | Proposed actor/native mapping | Evidence result | Decision |
|---|---|---|---|
| Ordinary Snow sub-agent | `actorId = agentId` or anticipated tool-call ID | `agentId` is reusable role identity; unique `toolCall.id` is generated by Snow/provider and is absent from pre/post Hook payloads | **Not strict-compatible.** Do not dispatch omp-flow operations through this path. |
| Snow Team | `actorId = teammate name`, generated member ID, or Team task ID | Name is caller-supplied but not the unique member ID; member/task IDs are internal random UUID fragments; member ID returns after prompt submission | **Not strict-compatible.** Name substitution would weaken correlation; post-spawn operation creation cannot put the receipt into the already-submitted assignment. |
| Degraded main-session adapter | No native operation actor; Snow main session uses portable Skills/runtime only | `.agents/skills` is natively discovered; `SNOW_SESSION_ID` is available to child commands | **Compatible now.** Explicitly disable/defer native Execute/Review/QbD/Research assignments until upstream identity capability exists. |

Possible workarounds were actively rejected:

- Creating one `.snow/agents/<receipt>.md` per operation still makes the receipt an agent-type ID,
  not Snow's unique execution instance ID, and introduces runtime-managed project files.
- Serializing all work through one agent ID only hides the ambiguity; it does not prove which
  native execution completed or survive cancellation/replay.
- Using teammate name as actor conflicts with the stated exact-ID invariant and has no enforced
  uniqueness.
- Starting an operation after `spawn_teammate` returns cannot work with the existing strict
  assignment, because the child already received its prompt.
- A `beforeSubAgentStart` Hook cannot reserve/correlate the missing ID because the payload omits it
  and failures are fail-open.

## Smallest internal change surface for the degraded adapter

The following is a candidate design input, not implementation authority:

1. **Harness UX/config:** add `snow` to the `Harness` union and stable order; accept `--snow`; add
   it to interactive choices, non-TTY diagnostics, help, README examples, and config validation.
   A Snow-only selection may legitimately deploy core resources with no Snow-specific agents.
2. **Skills:** keep `templates/common/skills` as the sole source and deploy only `.agents/skills`.
   Do not create `templates/snow/skills` or `.snow/skills`; native `.snow` precedence would silently
   shadow the shared copy.
3. **Session identity:** recognize `SNOW_SESSION_ID` as platform `snow` in the portable
   `active_task.py` environment-key list. This is mechanical session correlation, within Python's
   existing ownership, and requires no Hook or Markdown interpretation.
4. **Flow Status:** either add a root-publication/read-only `snow` host through the TypeScript host
   union, CLI validator/help, Python host set, and Skill instructions, or explicitly make
   `$flow-status` report Snow unsupported. Leaving the current Codex-hardcoded Skill visible in
   Snow is not acceptable. No persistent Snow status renderer need be claimed.
5. **Native agents:** do not initially install `.snow/agents/omp-flow-*` operation roles. If they
   are later added for non-operation assistance, their cards must state that they cannot accept a
   strict `ompFlowDispatch`; otherwise users will reasonably infer unsupported receipt safety.
   Full design must also wait for the pinned custom-Markdown tool-registration gap to be fixed or
   contradicted by released-build evidence.
6. **Hooks:** install no Snow Hook merely for parity. If separate Hook research justifies
   orientation or runtime defense-in-depth, own exact per-event JSON and handler files, preserve
   foreign/modified content through the existing hash model, disclose that project rules replace
   global rules for that event, and never rely on a fail-open Hook for operation identity.
7. **Packaging/docs:** package `templates/snow` only if Snow-specific files actually exist. Update
   the Harness tree, capability table, install/update examples, degraded-operation statement, and
   pinned upstream provenance. The package already includes the whole `templates` directory
   (`package.json:21-28`).

## Where actor-ID validation belongs

The Codex `data-researcher`/`data_researcher` failure is real, but Snow disproves a universal
"underscore-only" rule. Validation must be target-Harness-specific and must occur **before**
`operation start` creates a receipt:

1. The caller must first select a concrete native Harness and proposed native item ID.
2. A thin Harness identity preflight validates the exact pinned native grammar and whether the ID
   is caller-controlled and unique—not merely whether its characters match a regex.
3. Only a successful preflight may call `operation start`; the returned actor must then be copied
   unchanged into the native item ID and strict descriptor.
4. If the Harness does not reveal/reserve the native ID before assignment, as in Snow 0.8.24, the
   preflight returns **not representable** and no operation receipt is created.
5. Python continues to own exact stored-actor/finish/predecessor correlation; adapters do not
   normalize, rewrite, or alias actor IDs after receipt creation.

Design still needs to choose whether this preflight is an explicit `--harness`/capability on the
operation-start boundary or a required native-adapter call immediately before it. A prose-only
check is insufficient, while a single repository-wide actor regex is incorrect. Any interface
that adds Harness identity to the operation record/descriptor must be treated as a deliberate
strict-descriptor version decision, not slipped into v1.

For future full Snow support, the sufficient upstream capability is one of:

- a caller-supplied, uniqueness-checked `instanceId` accepted before the sub-agent prompt;
- a `reserve instance` API that returns the ID before prompt submission; or
- an equivalent native assignment API whose item ID is caller-chosen and whose completion event
  returns that exact ID.

The same ID must appear in pre-spawn validation, running-task observation, cancellation/result
delivery, and completion. Exposing it only after launch or only in UI is insufficient.

## Verification obligations

### Degraded adapter

- Add CLI tests for `--snow`, stable normalization, interactive defaults, Snow-only non-TTY init,
  invalid config values, help text, and no writes on argument failure, parallel to
  `tests/init-cli.test.ts:41-185`.
- Add Snow init/update tests proving a Snow-only install deploys canonical core resources, creates
  no `.snow/skills`, preserves foreign/modified Snow paths, maintains hash ownership, backs up
  changed resources, and includes any declared Snow templates in `npm pack --dry-run`.
- Add Python tests proving two distinct `SNOW_SESSION_ID` values select isolated task pointers and
  that an explicit `OMP_FLOW_CONTEXT_ID` retains precedence.
- Add Flow Status tests proving either exact `host=snow` scope/CAS/lease behavior or an explicit
  unsupported result; never allow a Snow invocation to read a Codex snapshot.
- Add contract tests over the five Snow role/operation capability statements so no installed
  resource claims native dispatch, independent review, or receipt completion while degraded.
- Run the repository's required `compileall`, build, test, package dry-run, and `git diff --check`
  suite after implementation.

### Gate for full native operation support

Static source inspection is not enough. A pinned Snow build must be captured on Windows and one
other supported platform, demonstrating for ordinary sub-agent and/or Team execution:

- the ID is known and validated before `operation start`;
- `descriptor.actorId` is byte-for-byte equal to the native running item ID;
- two concurrent instances of the same role stay distinguishable;
- result, failure, cancellation, replay, and completion all return the same ID;
- predecessor and different-actor review remain enforceable; and
- no Hook, agent name, prompt parsing, or generated semantic state is used to reconstruct identity.

Until this capture passes, executor/reviewer success in Snow must not be presented as an accepted
omp-flow operation.

## Counter-evidence, unknowns, and decision impact

**Counter-evidence tested:** Snow already consumes `.agents/skills`, so a large adapter and duplicate
Skill tree are unnecessary. Snow also accepts hyphens in agent IDs and teammate names, so carrying
Codex's underscore constraint into Snow would be false. Conversely, Snow's rich Team mode does not
solve strict identity: it creates more native IDs, none caller-controlled at the required time.

**Unknowns:** no public upstream contract was found for reserving a sub-agent tool-call ID, forcing a
Team member ID, or emitting instance ID in both `beforeSubAgentStart` and `onSubAgentComplete`.
Actual Snow trust prompts and Windows shell behavior for any future managed Hook require the linked
Hooks study and real-platform capture. Upstream may add an identity surface after the pinned commit;
that must be re-pinned and re-tested rather than assumed.

**Decision impact:** return to Brainstorm for a material scope calibration. The original goal can
proceed as main-session Snow compatibility, but "full Snow native agent/task adapter" is not
currently the same problem and cannot be honestly selected without either upstream work or relaxing
the human-owned exact actor/native-ID invariant. The research recommends keeping that invariant and
shipping/decomposing only the degraded adapter first.

## Assignment handoff

- Output: `.omp-flow/tasks/08-01-snow-cli-adapter/research/adapter-contract.md`
- Conclusion: Snow 0.8.24 supports shared Skills and main-session correlation, but neither ordinary
  sub-agent nor Team identity can satisfy strict pre-dispatch `actorId = native item ID`.
- Decision impact: return to Brainstorm and select degraded main-session support or upstream
  identity capability first; do not design full native operation dispatch from the current facts.
- Unresolved: upstream caller-controlled/reservable instance identity, project Markdown custom-tool
  registration, and any Hook/platform behavior still under the linked Hook investigation.
- Source anchors: the pinned [Reference](../reference/snow-cli-upstream.md), immutable upstream URLs
  above, and the cited internal CLI/runtime/adapter/tests/Wiki lines.
- Actor ID: `snow_adapter_researcher`
- Dispatch receipt: `fc25f114331e4a6e8a0306c3a1d84bd8`
