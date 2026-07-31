# Second completion-repair Flow Status QbD audit

Verdict: **FAIL**

## Subject

This fresh independent audit evaluates:

- [Completion-audit repair work](../work/completion-audit-repair.md)
- [Repaired PRD](../prd.md)
- [Repaired Design](../design.md)
- [Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md)
- [First completion-repair audit](completion-repair-audit.md)
- [Pinned native capability fixtures](../reference/native-capability-fixtures.md)

It checks whether every first-audit blocker is now realizable before implementation dispatch. It
does not audit or modify product implementation.

## Decision

The second repair correctly removes blocking `PermissionRequest` attention, replaces unsupported
owner equality with a nonce-bound same-agent `TaskUpdate` handshake, describes adapter ordering
honestly, preserves the accepted fresh/existing Powerline split, and makes the warm/cold
measurement protocol normative.

The work is still not safe to dispatch. The proposed agent tool allowlist grants broader native
mutation authority than the design claims, the Windows stalled-reader release gate still has no
defined way to construct its required production failure mode, and moving the two executable
fixtures creates five additional broken historical links outside the repair boundary. These are
work-design failures, not requests for more assertions around an otherwise executable design.

## Blocking findings

### B1 — the `TaskUpdate` allowlist does not bound native mutation authority

The PRD says the five managed agents may use `TaskUpdate` only for their exact current task and
cannot update another task (`prd.md:118-123`, `prd.md:141-155`). The Design likewise says agent
definitions restrict the tool to binding/progress metadata and may not change another task or its
native status (`design.md:294-316`, `design.md:335-367`). The source contract strengthens this to
“do not gain ... authority to change another task or task status”
(`interfaces/flow-status-source-observation-v1.md:236-242`).

Adding `TaskUpdate` to a custom agent's `tools` frontmatter does not enforce any argument-level
restriction. Claude's documented `tools` field selects which tools the agent can use, while the
native `TaskUpdate` tool can update task status, dependencies, details, or delete a task:

- [Claude custom-subagent tool fields](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)
- [Claude tools reference](https://code.claude.com/docs/en/tools-reference)

The proposed observer validates only a successful `PostToolUse` result. At that point an
out-of-contract owner, status, dependency, description, subject, or deletion mutation has already
happened; rejecting its Flow Status observation cannot undo the native side effect. Claude's
documented prevention boundary is a `PreToolUse` decision, which can deny the call before it runs:

- [Claude PreToolUse decision control](https://code.claude.com/docs/en/hooks#pretooluse-decision-control)

The repair boundary already permits focused Claude hooks, but neither the PRD, Design, source
contract, work steps, nor required verification assigns an exact fail-closed `PreToolUse` guard
for managed-agent `TaskUpdate`.

Required remediation:

1. Add a `PreToolUse(TaskUpdate)` authorization boundary for the five exact managed agent types.
2. Validate the native common `agent_id`, live pending/consumed nonce, repository/session/current
   task/revisions, exact task ID, and the closed binding or progress input before execution.
3. Deny any status, deletion, dependency, subject, description, foreign owner/task, extra metadata,
   missing binding, replay, or expired/mismatched request. Hook failure must deny rather than
   silently grant broader mutation.
4. Test the real hook decision for every allowed binding/progress shape and every forbidden native
   mutation. A prompt instruction or post-use parser test is not authority evidence.

If the product intentionally relies only on model adherence, it must withdraw the stronger
“cannot” and “no authority” claims; that would not satisfy the current bounded-authority
requirement.

### B2 — no executable Windows source produces the required production regular-file stall

The supervisor boundary itself is coherent. The Design starts its 500 ms timer at the successful
child `spawn` event, bounds output, kills the exact child, destroys pipes, and separates the 550 ms
parent watchdog (`design.md:435-455`, `design.md:787-805`). Its diagnostic mode also promises to
call the same exported synchronous reader used by production (`design.md:421-433`).

However, the release gate merely names a “controllably stalled source”
(`design.md:787-796`) and an “operating-system blocking source” (`design.md:852-856`). It does not
define the source primitive, setup, readiness handshake, teardown, or why it blocks the same
regular-file read on pinned Windows Node 22. The current pinned production provider performs:

```text
statSync(path)
metadata.isFile()
readFileSync(path, "utf8")
```

at
`integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch:255-260`.
A named pipe or other non-regular fixture therefore does not exercise that production boundary,
while a sleeping/cooperative reader is explicitly forbidden. Emitting an entry marker proves
reader entry, but it does not make an ordinary NTFS file read stall.

The 20-case gate cannot be implemented reproducibly on `windows-latest` from the authored work as
written. It could pass only by quietly substituting a different source/reader or fail
nondeterministically on storage timing.

Required remediation:

1. Identify a reproducible Windows CI primitive or reviewed helper that makes the exact pinned
   production regular-file read block, including readiness, cleanup, and proof that no fixture
   bytes are emitted.
2. Attach a bounded capability probe showing it works with Node 22 in a CJK path before making it
   a 20-sample release gate.
3. Keep the supervisor's child-spawn clock and PID cleanup contract, or explicitly narrow the
   claim to a deliberately hung diagnostic child and stop calling that a production-reader stall.

The second option is a product/acceptance change and would require fresh human calibration.

### B3 — stable-fixture relocation leaves five historical links outside the archive repair scope

The stable destinations and targeted import scan are correct
(`design.md:706-720`; `work/completion-audit-repair.md:80-95`). The Design also promises that the
archive-aware checker resolves **every** Bundle link before and after the move
(`design.md:722-744`, `design.md:863-866`).

But the allowed repair boundary names only the six historical Concepts containing the previously
known 13 repository-external links. Five additional Concepts currently link directly to the two
JSON payloads that the repair says to move out of the Bundle:

```text
work/claude-ccstatusline.md:13
review/claude-ccstatusline.md:15
qbd/qbd-1/flowstatus-audit-4.md:28
qbd/qbd-1/flowstatus-audit-5.md:14
work/oh-my-pi-native-status.md:14
```

Deleting the movable JSON payloads breaks those links. Retaining duplicate JSON payloads leaves
executable evidence under the movable Bundle and creates two fixture tiers, contradicting the
stable-evidence boundary. None of the five Concepts is among the exact six historical Concepts
owned at `work/completion-audit-repair.md:136-140`.

Required remediation:

1. Expand the allowed boundary to these five exact historical Concepts.
2. Replace their old fixture links with code-form repository paths to the stable fixture names,
   while keeping the Reference Concept as provenance.
3. Add them to the simulated and final archive-checker golden scope and prove the old
   `reference/fixtures/*.json` files are not retained as a second executable tier.

## Prior blockers now closed

The following first-audit findings are substantively repaired and need not be reopened if the
three blockers above are fixed without changing them:

- **Permission attention:** blocking attention is limited to exact
  `AskUserQuestion`/`Elicitation` start-terminal pairs; `PermissionRequest` is explicitly ignored
  as blocking, and `PermissionDenied` is terminal-only (`prd.md:164-174`,
  `design.md:369-385`).
- **Positive assignment production:** the nonce is scoped to repository, session, task-set and
  membership revision, current task, native `agent_id`, and exact `agent_type`; a structured
  same-agent successful owner-plus-metadata `TaskUpdate` is required before assignment
  (`design.md:252-333`). This does not assume automatic owner equality.
- **Progress authorship:** the managed agent explicitly authors 1–32 stable units and closed
  numerator/denominator revisions; a TaskList cannot manufacture or restore progress
  (`design.md:335-367`). The remaining B1 issue is prevention of out-of-contract native mutations,
  not the positive progress schema.
- **Honest ordering:** `adapterSequence` orders only accepted local writes; unobserved Hook loss
  degrades only through the 1–30 second maximum age (`design.md:387-399`).
- **Powerline and configuration ownership:** the fresh golden document has native model/context/
  Git on line one, the sole Flow Status widget on line two, and Powerline enabled with exact
  separator/caps (`design.md:516-572`). Existing configs preserve every prior field and never
  receive the fresh defaults or a Powerline flip (`design.md:574-579`,
  `design.md:687-696`).
- **Warm/cold protocol:** 20 discarded plus 200 real-read warm samples and 40 whole-supervisor
  cold processes use explicit boundaries and nearest-rank p95 (`design.md:775-805`).

## Audit evidence

Read-only evidence gathered:

```text
claude --version
  2.1.220 (Claude Code)

installed sdk-tools.d.ts
  TaskUpdateInput exposes arbitrary metadata and native mutation fields
  TaskUpdateOutput exposes success, taskId, and updatedFields

official Claude hook/subagent/tool documentation
  agent tools frontmatter is a tool-name allowlist
  TaskUpdate has broad native task mutation capability
  PreToolUse can deny before execution; PostToolUse runs after side effects
  SubagentStart additionalContext and subagent hook agent_id/agent_type are documented

pinned ccstatusline patch
  production provider checks isFile() and then calls synchronous readFileSync()

fixture-link source scan
  five direct links to reference/fixtures/*.json outside the enumerated historical repair scope

current provenance
  reference/native-capability-fixtures.md and both old fixture payloads exist
```

No product implementation or synthetic fixture was treated as proof of these design claims.

## Re-audit gate

A fresh independent audit may return `PASS` only after the linked requirements, Design, source
contract, and work boundary jointly:

1. enforce managed `TaskUpdate` at `PreToolUse`, not merely through agent prose and post-use
   rejection;
2. define and positively prove a reproducible production-reader stall source on the normative
   Windows/Node job; and
3. own and repair all five fixture-relocation links in addition to the previously known 13
   archive-depth links.

The accepted attention, handshake, TTL, Powerline, existing-config preservation, and warm/cold
contracts must remain unchanged. A later model `PASS` still requires explicit human calibration
before implementation dispatch.
