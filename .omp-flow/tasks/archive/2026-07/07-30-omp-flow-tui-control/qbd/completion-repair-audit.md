# Completion-repair Flow Status QbD audit

Verdict: **FAIL**

## Subject

This independent audit evaluates the reopened completion repair described by:

- [Completion-audit repair work](../work/completion-audit-repair.md)
- [Repaired PRD](../prd.md)
- [Repaired Design](../design.md)
- [Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md)
- [Pinned native capability fixtures](../reference/native-capability-fixtures.md)

It specifically challenges production reachability from Claude Code 2.1.220 structured hooks,
fresh-versus-existing ccstatusline configuration ownership, stable fixture and archive-link
durability, and the normative 50 ms / 250 ms / 500 ms measurement protocol. It does not audit a
repair implementation and makes no product-code change.

## Decision

The fresh-install/configuration split and the warm/cold benchmark definitions are materially
improved and can support implementation. The repair is nevertheless not safe to dispatch. Four
claimed Claude facts do not yet have the exact positive structured path the contracts require,
the 500 ms deadline has no interruptible implementation boundary, and the stated archive repair
cannot change all links that the required post-move audit already proves will break.

These are design/work-boundary failures, not requests for more unit tests over the current
implementation.

## Blocking findings

### B1 — `PermissionRequest` cannot be correlated by the required `tool_use_id`

The PRD R7, Design Claude attention table, and source-observation interface all require a
`PermissionRequest` start to open blocking approval attention under its exact `tool_use_id`, then
close it through `PostToolUse`, `PostToolUseFailure`, or `PermissionDenied`.

Claude Code's official hook contract says the opposite: `PermissionRequest` receives
`tool_name` and `tool_input` **without `tool_use_id`**. The same reference says
`PermissionDenied` has a `tool_use_id`, but fires only for an auto-mode classifier denial, not for
a manually denied dialog, a `PreToolUse` denial, or a matching deny rule:

- [PermissionRequest input](https://code.claude.com/docs/en/hooks#permissionrequest-input)
- [PermissionDenied](https://code.claude.com/docs/en/hooks#permissiondenied)

`prompt_id`, tool name/input, time, or adapter sequence cannot substitute for a unique native tool
identity when permission requests may be concurrent. Doing so would be semantic inference and
could clear or preserve the wrong blocking claim.

Required remediation:

1. Remove blocking `PermissionRequest` attention from v1, retaining only structured terminal
   warnings that have their own native ID; **or**
2. identify a documented, revision-pinned Claude surface that provides one exact start/terminal
   identity and attach positive/negative fixtures for it.

Do not manufacture an ID from tool input, notification text, ordering, or elapsed time. This
changes R7 and the source interface and therefore requires a fresh design audit and human
calibration.

### B2 — managed agents cannot publish the proposed task-local progress

There is partial positive evidence: the installed, exact Claude Code 2.1.220 package exports
`TaskUpdateInput.metadata`, and `TaskUpdateOutput` includes `success`, `taskId`, and
`updatedFields`:

- `D:/nvm4w/nodejs/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:2509`
- `D:/nvm4w/nodejs/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:2543`
- `D:/nvm4w/nodejs/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:3618`

The official hook reference also documents `agent_id` and `agent_type` on tool hooks executed
inside a subagent:

- [Claude Code hook common input fields](https://code.claude.com/docs/en/hooks#common-input-fields)

However, every managed omp-flow Claude agent currently allowlists only role work tools and
explicitly says it has no `Agent` or `Task` tool. None includes `TaskUpdate`. For example:

- `templates/claude/agents/omp-flow-implement.md:5`
- `templates/claude/agents/omp-flow-implement.md:10`
- `templates/claude/agents/omp-flow-check.md:5`
- `templates/claude/agents/omp-flow-qbd.md:5`

The repair's allowed implementation boundary excludes these agent definitions and the shared
role Skills. It therefore cannot make an exactly bound agent issue
`TaskUpdate(metadata.flowStatusProgressV1)` in production. A fixture that directly feeds such a
payload to the observer would prove parser behavior, not producer reachability.

Required remediation:

1. Decide who authors the progress units and revisions.
2. If the managed agent owns them, add `TaskUpdate` to the exact applicable agent tool allowlists,
   give those agents a bounded publication contract, and expand the repair boundary and tests to
   cover real tool availability and successful output.
3. Otherwise remove Claude current-task-local progress from v1 and retain the separately labelled
   task-set ratio.

The denominator and revision strings must remain explicit source data; they must not be derived
from tool count, tokens, duration, Concepts, prompts, or filenames.

### B3 — `TaskList.owner == SubagentStart.agent_id` is a hypothesis, not positive capability evidence

The structured pieces exist independently:

- `TaskListOutput.owner?: string` is exported by Claude Code 2.1.220
  (`sdk-tools.d.ts:3628-3635`);
- `SubagentStart` supplies a unique `agent_id` and exact frontmatter-derived `agent_type`;
- tool hooks inside a subagent carry the same agent identity.

No linked source or fixture proves that spawning a normal custom subagent automatically writes
that `agent_id` into the current native task's `owner`, and the omp-flow execute Skill does not
perform such a native owner update. The existing pinned Claude fixture contains an arbitrary
`owner` but no correlated `SubagentStart`, so it cannot establish the equality. The official
`TaskUpdate` schema describes `owner` only as a string; it does not document this automatic
binding.

Without an explicit producer step, most real omp-flow subagent runs can yield a valid
`SubagentStart` and a valid TaskList while still producing `assignment: null`. That makes the
advertised methodology position unreachable even though both fixture parsers pass.

Required remediation:

- attach a bounded live or upstream fixture from Claude Code 2.1.220 proving automatic equality;
  or
- design an explicit native operation that writes and verifies the current task owner after the
  subagent ID is known, without parsing a prompt, dispatch descriptor, transcript, Markdown, or
  operation history.

That operation must be within the implementation boundary and its invalidation/rollback behavior
must be tested. An arbitrary owner string in a synthesized fixture is not sufficient.

### B4 — the adapter cannot detect a skipped structured hook as a “sequence gap”

The source interface requires a sequence gap or hook failure to revoke the task set, assignment,
progress, and attention. Claude hook inputs provide event-specific IDs and the adapter can detect
a replayed ID, but they provide no complete native event sequence. `adapterSequence` is generated
only after the observer accepts an event; it cannot reveal an event whose hook never ran, timed
out, was disabled, or was lost.

Claude also documents that tool hooks run for subagent calls and that multiple matching hooks/tool
events can execute concurrently. A locally incremented number therefore proves serialization of
observed events, not completeness of the native event stream.

Required remediation:

- define the honest guarantee as invalidation on an **observed** mismatch/replay plus bounded
  expiry for an unobserved loss; or
- use a documented source that supplies a complete monotonically sequenced snapshot/event stream.

Tests must not inject a gap into an adapter-owned counter and claim that this proves detection of a
missing native hook.

### B5 — a pre-I/O monotonic check cannot enforce the 500 ms stalled-read deadline

The warm and cold definitions are testable: they define sample counts, discarded warm-ups,
nearest-rank p95, real cache replacement, distinct cold processes, the measured boundaries, raw
durations, and pinned Windows Node/Python jobs. The 50 ms and 250 ms thresholds are aggressive but
valid release gates once the exact installed artifact is measured.

The hard-deadline design is not sufficient. The pinned provider currently performs synchronous
`statSync` and `readFileSync`:

- `integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch:32`
- `integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch:255`
- `integrations/ccstatusline/patches/ccstatusline-v2.2.27-flow-status-v1.patch:260`

A monotonic timestamp established before synchronous I/O can classify an overrun only after that
I/O returns; it cannot interrupt a stalled filesystem read or guarantee autonomous process exit
by 500 ms. An injected reader that cooperatively returns at the deadline would test the fake, not
the production failure mode. The outer 550 ms watchdog would be the only actual enforcement,
which the contract explicitly counts as failure.

Required remediation:

1. Specify an interruptible isolation boundary compatible with ccstatusline's synchronous widget
   contract, including handle cleanup and process-exit behavior; or narrow the claim to a
   realistically enforceable boundary.
2. Define whether the 500/550 ms clocks begin before process spawn or immediately before provider
   I/O, and make parent and child results distinguish those measurements.
3. Make the stalled-read injector exercise the same production read boundary and prove that the
   implementation, not the watchdog or mock, terminates it.

If worker/process isolation is selected, re-audit it against the no-resident-accessory rule and
the 250 ms cold gate before implementation.

### B6 — the archive-safe link repair is outside the allowed work boundary

The stable executable fixture destination is correct:

```text
tests/fixtures/flow-status/claude-task-events-v2.1.220.json
tests/fixtures/flow-status/oh-my-pi-task-events-v17.2.1.json
```

Keeping provenance in the Bundle while tests load only repository-stable fixtures is also sound.
The source scan must distinguish a fixture dependency from legitimate runtime tests of
`.omp-flow/tasks/`; a blanket ban on that string would incorrectly reject
`tests/omp-flow.test.ts`.

The archive-link portion is not yet realizable by the bounded work. A read-only hypothetical move
of the current Bundle to
`.omp-flow/tasks/archive/2026-07/07-30-omp-flow-tui-control` found **13 Markdown targets that would
break**, including:

- `research/flowstatus-synthesis.md` to the Wiki;
- `research/native-harness-flow-capabilities.md` to canonical source files;
- `qbd/qbd-1/flowstatus-audit*.md` to the Wiki and source files;
- `qbd/qbd-2/flowstatus-workmap-audit.md` to `AGENTS.md`; and
- `work/handoffs/setup-docs-and-integration.md` to the Wiki.

The current Wiki simultaneously contains an archived backlink whose target is absent and an
active-task backlink. The repair correctly says this must be fixed only at final placement, but
its allowed boundary includes README/Wiki and a new handoff, not the historical Bundle Concepts
that contain the 13 depth-sensitive links.

Required remediation:

- expand the archive/finalization boundary to the exact affected Bundle Concepts;
- add one archive-aware link command that validates the hypothetical/final path, anchors, README,
  Wiki, completion, handoff, and review;
- run it after the actual atomic archive move and record its output from the final location.

Historical external repository links may be converted to code-form repository paths as already
required by the Design. Internal links that stay inside the moving Bundle should remain ordinary
relative links.

## Accepted portions

The following parts do not block a repaired re-audit:

- Fresh absence and existing configuration are now separate ownership modes.
- The exact fresh document enables Powerline, keeps native model/context/Git widgets on line one,
  and places the sole managed Flow Status widget on line two.
- Existing configuration is not normalized: only the exact owned widget may be inserted or moved,
  and existing Powerline/theme/refresh/unknown fields remain user-owned.
- Digest-constrained removal of a wholly managed fresh config and conservative widget-only
  removal after user modification are appropriate.
- The stable test-fixture destination and the ban on movable Bundle fixture imports are durable.
- The 200-after-20 warm and 40-process cold p95 definitions use the correct nearest-rank rule and
  provide adequate raw evidence fields.

These accepted portions do not waive the blockers above.

## Audit evidence

Read-only checks performed:

```text
claude --version
  2.1.220 (Claude Code)

npm view @anthropic-ai/claude-code@2.1.220 version dist.tarball --json
  version 2.1.220, published package available

rg over installed sdk-tools.d.ts
  TaskUpdate metadata and updatedFields present; TaskList owner present

rg over templates/claude/agents
  managed agents do not allow TaskUpdate and explicitly have no Task tool

rg over the pinned ccstatusline patch
  provider uses synchronous statSync/readFileSync

archive-path link simulation
  BROKEN_AFTER_ARCHIVE=13

current internal-Bundle link scan
  ALL_INTERNAL_LINK_TARGETS_EXIST
```

The local authenticated Claude model turn remains unavailable as already disclosed by the
[fixture provenance](../reference/native-capability-fixtures.md); no live payload is claimed.

## Re-audit gate

A fresh independent audit may return PASS only after the PRD, Design, source interface, repair
work boundary, and pinned fixtures jointly prove:

1. every positive Claude role/progress/attention fact has an executable structured producer;
2. permission attention uses a real native correlation identity or is removed;
3. skipped-hook behavior is described without claiming an unavailable native sequence;
4. the production read boundary can autonomously satisfy the stated hard deadline;
5. the repair scope owns all archive-sensitive links; and
6. the accepted fresh/existing configuration and warm/cold benchmark contracts remain intact.

Human approval is still required after any later model PASS.
