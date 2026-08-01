---
type: "Brainstorm"
title: "Brainstorm: Snow CLI adapter research and compatibility"
---

# Brainstorm: Snow CLI adapter research and compatibility

The initial request is to investigate the latest Snow CLI implementation and determine how
omp-flow should support it, with particular attention to its apparent `.agent` convention,
Hooks, native agents/tasks, Skills or equivalent discovery, and installation/update behavior.
The user authorized cloning the latest upstream source for evidence.

The observable problem is not merely that omp-flow lacks a fourth install flag. A trustworthy
adapter must preserve omp-flow's ownership boundary while speaking Snow's actual native
contracts. Today the repository has explicit native resources for OMP, Codex, and Claude, shared
Skills sourced from `templates/common/skills/`, and mechanical operation correlation that requires
the omp-flow `actorId` to equal the Harness-native task ID. Snow's repository identity, supported
configuration roots, Hook event/payload contract, agent/task ID grammar, sub-agent mechanism, and
Skill discovery semantics are not yet established.

The provisional first-principles anchor is therefore: make an omp-flow installation usable and
mechanically safe in current Snow CLI without teaching Python or Hooks authored workflow meaning.
The principal contradiction is portability versus native exactness: reusing `.agents` or another
common-looking surface could minimize files, but any mismatch in Snow's discovery, task identity,
Hook lifecycle, or trust model could create an adapter that installs successfully yet cannot
dispatch, correlate, protect, or orient real work.

An immediate concrete failure mode sharpens that contradiction. An omp-flow receipt created with
actor ID `data-researcher` cannot be forwarded to a Codex native task whose ID grammar accepts
`data_researcher` but not the hyphenated form. No native task ran and no task output was written;
the unusable receipt must be finished as failed and recreated with the exact legal native ID.
Research must determine Snow's equivalent grammar and whether omp-flow should validate a
Harness-native actor ID before `operation start`, rather than creating a mechanically valid but
undispatchable receipt.

The irreducible outcome of Explore is an evidence-backed compatibility map and selected direction:
the exact upstream project and revision; supported project/user roots; agent, task, Skill, command,
and Hook contracts; identity and concurrency constraints; Windows behavior; and the smallest thin
adapter that can be verified against upstream behavior. Implementation is not authorized merely by
finding analogous filenames.

The strongest counter-hypothesis is that Snow already consumes the universal `.agents` convention
and exposes no stable project Hook or native task API that omp-flow should own. If confirmed, the
correct adapter may be only shared Skill deployment plus documentation, explicit degradation, and
pre-dispatch validation—not a new Hook layer. Evidence that would revise the anchor includes Snow
being an unrelated same-name project, Snow delegating all agent behavior to another runtime, or an
upstream contract that cannot preserve exact actor/task correlation without adding forbidden
semantic state.

Practice evidence on the pinned `snow-ai@0.8.24` source materially narrows the contradiction. Snow
does directly scan project `.agents/skills` as a compatibility root, while native project agent
definitions live at `.snow/agents/**/*.md` and workflow Hooks live in per-event files under
`.snow/hooks/`. Thus Skill duplication is not the hard part. Ordinary sub-agent execution uses the
provider tool-call ID as its running `instanceId`, and Team mode generates an eight-character UUID
for each member; neither path currently exposes a caller-chosen native execution ID. The revised
principal contradiction is therefore exact operation/native identity versus Snow-controlled
execution identity, with Hook/agent installation as a secondary adapter problem.

A legacy archived task, `07-22-snow-cli-adapter`, reached a selected synthesis against
`snow-ai@0.8.19` but left its Design empty and produced no current adapter. Its Claude-shaped,
full-parity Hook direction remains useful counter-evidence, not an accepted current design. It also
predates both Snow's `.agents/skills` compatibility path and omp-flow's present strict assignment
descriptor/actor-correlation contract. Current research must re-test its Hook findings and must not
revive its old schema or duplicate Skill tree merely because the earlier synthesis selected them.

The revised technical recommendation is to accept a Snow adapter only if it can define one honest
native target identifier before `operation start`, or explicitly degrade dispatch correlation
without claiming exact parity. The strongest counter-case is that Snow's configured `agentId`
(rather than the generated execution `instanceId`) is the intended native task ID; this would make
the existing exact contract usable but could collide when the same agent type runs more than once.
Evidence that would overturn the recommendation is an upstream API allowing a stable caller-chosen
instance/member ID, or a repository-level contract showing `agentId` is the unique native task-item
identity across concurrent invocations.

Open evidence questions:

- Which current upstream repository/package does “snow-cli” denote, and what immutable revision is
  the latest relevant release or default branch?
- Does Snow use `.agent`, `.agents`, a user-global directory, embedded config, or several distinct
  mechanisms, and which are stable/public?
- What Hook events, payloads, exit semantics, trust controls, and Windows launch behavior exist?
- How are native sub-agents/tasks declared and spawned, and what grammar and uniqueness rules apply
  to their IDs?
- Can Snow consume the existing common Skills and role definitions directly, or does it require a
  thin platform adapter?
- Where should Harness-specific actor-ID grammar be validated so an unusable operation receipt is
  never produced?

## Research conclusion and scope calibration

The research answers the identity question more strongly than the initial grammar hypothesis.
Snow accepts hyphens in agent IDs and teammate labels, but none of its ordinary sub-agent, Team,
or background-task APIs lets omp-flow choose or reserve the unique native execution ID before the
assignment is submitted. Hooks omit that ID at the relevant boundaries and cannot repair the
ordering. The safe recommendation is therefore the linked [research synthesis](research/synthesis.md):
ship main-session compatibility through existing `.agents/skills` and `SNOW_SESSION_ID`, keep
native operation dispatch fail-closed, and require a future upstream caller-controlled identity
surface before claiming full parity.

The Codex naming failure remains a separate adapter-seam defect. A Harness-specific preflight must
reject or correct the proposed native ID before `operation start`; the portable Python kernel must
not normalize an already-created actor or adopt one Harness's regex as a universal grammar.

The user clarified that omp-flow normally installs and works through project-local Hooks. This
revises the packaging recommendation, not the identity evidence: the Snow adapter should install
managed `.snow/hooks` for project session orientation, dispatch preflight, and bounded runtime
protection. Those Hooks may validate the assignment and receipt data visible in `toolName`/`args`,
but they cannot compare `descriptor.actorId` with the unique Snow execution `instanceId` because
Snow does not include that ID in the relevant Hook payloads. Hook ownership, global-rule
shadowing, Windows shell rendering, and fail-open gaps must therefore remain explicit design
constraints rather than reasons to omit project Hooks.

The user then calibrated the overall approach toward restraint: global Hooks are not part of the
normal project model, most required facilities already exist, and the adapter should be a small
translation layer rather than an identity or compatibility framework. The selected synthesis now
limits work to Harness selection, existing `.agents/skills`, Snow-native project agents/Hooks,
`SNOW_SESSION_ID`, the minimal Flow Status adjustment, and focused tests. The Snow instance-ID
observation remains a local dispatch limitation, not the organizing problem for the adapter.

The user added Cursor to the same compatibility effort. Cursor must follow the same restraint:
confirm its current official project-level agent/rule/Skill/Hook and CLI surfaces, reuse shared
omp-flow resources where Cursor already reads them, and add only the native files or session glue
that are actually missing. Snow and Cursor do not need a new shared abstraction merely because
they are being implemented together.
