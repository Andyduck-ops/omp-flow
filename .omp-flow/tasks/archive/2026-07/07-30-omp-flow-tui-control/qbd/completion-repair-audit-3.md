# Third completion-repair Flow Status QbD audit

Verdict: **FAIL**

## Subject

This fresh independent audit evaluates:

- [Completion-audit repair work](../work/completion-audit-repair.md)
- [Repaired PRD](../prd.md)
- [Repaired Design](../design.md)
- [Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md)
- [Second completion-repair audit](completion-repair-audit-2.md)
- [Pinned native capability fixtures](../reference/native-capability-fixtures.md)

It re-derives the completion-repair requirements and checks whether the exact Claude authorization,
setup, supervisor/deadline, regular-file performance, fixture migration, and archive-navigation
paths are constructible before implementation dispatch. It does not audit or modify product code.

## Decision

The third revision substantively closes the second audit's native-mutation and fixture-scope
findings. Claude's documented command-Hook input can identify a managed subagent and its exact
`TaskUpdate` call before execution; the closed bind/progress key sets can therefore prevent foreign
or mutating shapes. The revision also stops pretending that synchronous `readFileSync` is
interruptible, retains meaningful real-file warm and whole-process cold measurements, and owns all
five additional fixture references alongside the prior 13 repository-external links.

The work is nevertheless not ready to dispatch. Setup requires a real exit-code-2 native
`TaskUpdate` side-effect probe but defines no deterministic way to create and invoke that probe.
Separately, the deadline contract starts a 500 ms Node timer at child spawn while requiring the
timer callback to kill the Windows child, close pipes, prove PID absence, and return by that same
500 ms boundary. A timer callback cannot complete cleanup before the delay at which it first
becomes eligible to run. These are reachability and acceptance-contract failures, not missing unit
test cases.

## Blocking findings

### B1 — the setup sentinel is a requirement without a constructible native invocation

The authorization boundary itself is now sound. For an exact managed `agent_type`, the Design
requires the synchronous `PreToolUse(TaskUpdate)` guard to compare the complete input and reserve
the intent under `tool_use_id` before returning allow (`design.md:318-367`). Setup then promises
not to expose `TaskUpdate` in any of the five managed definitions until a smoke call proves that
the exact installed guard exits 2 and the sentinel native side effect does not occur
(`design.md:369-374`; `prd.md:118-141`; source interface `:214-227`).

Claude's official Hook contract supports the prevention claim:

- project settings Hooks also run inside subagents, and tool-Hook input carries `agent_id` and
  `agent_type` for those calls;
- `PreToolUse` additionally receives `tool_name`, complete `tool_input`, and `tool_use_id`;
- exit 2 blocks the tool call before permission rules are evaluated.

Evidence:

- [Claude Hook common input and subagent propagation](https://code.claude.com/docs/en/hooks#common-input-fields)
- [Claude PreToolUse input and decision control](https://code.claude.com/docs/en/hooks#pretooluse-input)
- [Claude permission-Hook ordering](https://code.claude.com/docs/en/permissions#how-hooks-relate-to-permissions)

But the authored work never defines the other half of the probe: the exact temporary native task,
the exact managed subagent invocation, how a `TaskUpdate` is forced without relying on model
choice, how the sentinel side effect is observed, or how all probe state is removed. The pinned
CLI exposes normal interactive/`--print` model sessions and agent/tool configuration; it exposes
no documented direct `TaskUpdate` or Hook-decision simulator. Calling the guard executable
directly proves only its exit code, not that Claude suppresses the native task mutation. Asking a
model to call `TaskUpdate` is authenticated, billable, and nondeterministic, and the linked fixture
provenance already discloses that an authenticated local model turn is unavailable.

This is fail-closed for safety but not positive capability: setup can always leave `TaskUpdate`
absent, making the nonce-bound assignment and progress path unreachable while still satisfying
the negative branch. Fixture-fed `PreToolUse` tests cannot substitute for the setup claim that the
pinned Claude runtime itself blocked a native side effect.

Required remediation:

1. Specify the complete setup-time probe protocol, including its native task and managed-agent
   creation, exact call trigger, sentinel observation, no-model or explicitly required
   authentication boundary, timeout, cleanup, and failure result.
2. Demonstrate that the probe reaches Claude's real Hook merger and native `TaskUpdate`, rather
   than invoking only the guard process or a local simulator.
3. Make setup's atomic ordering explicit: no persisted managed definition may contain
   `TaskUpdate` before the successful probe, and any probe or commit failure must restore all five
   definitions to the no-`TaskUpdate` state.
4. If no deterministic public surface can perform this probe, revise the capability contract
   rather than leaving the positive assignment/progress path permanently unavailable.

### B2 — a timer that starts at 500 ms cannot prove cleanup and return by 500 ms

The revised isolation boundary is otherwise correct. Production regular-file reads remain
synchronous and make no interruption claim (`design.md:474-491`, `design.md:848-891`). The status
supervisor owns child execution, passes a closed pinned child spec, uses no shell, bounds output,
and exposes one production `runSupervisedChild` function (`design.md:493-521`).

The normative clocks are not self-consistent:

- the production timeout is a 500 ms timer started on the child's successful `spawn` event
  (`design.md:499-505`);
- each of 20 cases must return semantic empty **by 500 ms from child spawn**, terminate the exact
  PID, and leave no live PID (`work/completion-audit-repair.md:124-140`);
- the PRD says the exact production path “terminates child execution at 500 ms” and exits before a
  550 ms watchdog (`prd.md:438-445`);
- the benchmark requires termination request, child close/PID result, and supervisor exit to be
  recorded (`design.md:867-884`).

Node documents that `setTimeout(500)` schedules a callback after the delay and gives no exact
callback-timing guarantee. The callback can only request termination after it is scheduled. Node
also documents that a child's `close` event occurs after process exit and stdio closure. Therefore
Windows termination, pipe teardown, `close`, PID-absence confirmation, serialization, and
supervisor return necessarily occur after the callback begins and cannot be deterministically
completed within the same 500 ms boundary.

Evidence:

- [Node timers: no exact callback timing guarantee](https://nodejs.org/api/timers.html#settimeoutcallback-delay-args)
- [Node child process close/kill behavior, including Windows](https://nodejs.org/api/child_process.html#class-childprocess)

The Design also says “terminate” without selecting the exact Windows primitive and result
predicate. `ChildProcess.kill()` is a direct production option on Windows; spawning `taskkill`
would itself conflict with the claim that the supervisor spawns only the pinned renderer. Tests
cannot silently choose one and claim they proved an unspecified production path.

Required remediation:

1. Define the exact Windows termination operation, pipe-close order, event/result awaited, PID
   liveness probe, and error behavior inside `runSupervisedChild`.
2. Separate the kill-request threshold from the externally observed completion deadline. For
   example, reserve a documented cleanup margin and request termination before 500 ms, or define
   500 ms as the termination-request boundary and 550 ms as the cleanup/return bound.
3. Make the 20-case assertion match that realizable clock contract and record timer lateness,
   kill request, child `close`, PID absence, and supervisor return independently.
4. If “semantic-empty return plus no PID by 500 ms” remains the product requirement, provide a
   constructible mechanism that can meet it; `setTimeout(500)` cannot.

Changing the meaning of the 500 ms acceptance target requires fresh human calibration.

## Re-derived requirement disposition

### Proven constructible in this revision

- **PreToolUse authority:** exact managed subagent identity and exact tool input are available
  before execution. Closed top-level and metadata key equality denies status, deletion,
  dependency, subject, description, `activeForm`, foreign owner/task, extra fields, replay,
  conflict, expiry, and invalid progress transitions (`design.md:318-367`).
- **Reservation and observation:** an allowed intent is atomically reserved by `tool_use_id`, and
  only the matching successful `PostToolUse` can commit it (`design.md:348-382`). The installed
  Claude 2.1.220 type surface exposes arbitrary `TaskUpdateInput.metadata` and
  `TaskUpdateOutput.success`, `taskId`, and `updatedFields`.
- **Nonce/revision/progress:** the pending binding is repository/session/task/revision/agent scoped;
  owner mutation creates a new membership revision; progress repeats the immutable binding, holds
  `label`, `unit`, `total`, and `unitSetRevision` stable, strictly increases `current`, and uses a
  fresh `sourceRevision` (`design.md:290-433`; source interface `:184-289`).
- **Attention and loss honesty:** only `AskUserQuestion` and `Elicitation` use documented
  start-terminal identities; `PermissionRequest` cannot open blocking attention; a local adapter
  sequence does not claim to reveal a Hook that never ran (`design.md:435-459`).
- **Regular-file performance:** 20 discarded plus 200 measured warm calls perform real
  open/read/decode/validate/format work over freshly replaced valid files; 40 cold samples measure
  newly spawned complete supervisor-plus-pinned-renderer invocations over distinct repository and
  cache directories (`design.md:855-866`). These are meaningful production-reader/process gates,
  even though they deliberately do not claim a cold operating-system page cache.
- **No fake synchronous-read deadline:** production regular-file semantic tests cover valid,
  missing, stale, oversized, malformed, partial, future-clock, CJK, and non-regular inputs only
  after synchronous return; the hanging child is explicitly a process-lifetime fixture, not a
  provider-read stall (`design.md:867-891`).
- **Fresh/existing configuration split:** the fresh managed default enables the exact two-line
  Powerline profile; existing configurations preserve their theme, Powerline choice, refresh,
  unknown fields, widgets, order, and unrelated Claude settings.
- **Fixture ownership:** the repair owns both stable destinations, deletion of both old Bundle
  JSON payloads, the five newly identified historical references, and the six Concepts containing
  the prior 13 archive-breaking links (`work/completion-audit-repair.md:96-170`;
  `design.md:772-824`). The final checker is required to reject a second payload tier and
  simultaneous active/archive Wiki backlinks.
- **Prior accepted scope:** the accepted Oh My Pi adapter, Codex negative footer capability,
  shared snapshot schema, one ccstatusline widget/provider, no-branding rule, and existing
  configuration ownership are not weakened by this revision.

### Not implementation evidence

At audit time the stable fixture directory is not yet present and the two old Bundle JSON files
still exist. The five historical references have already been converted to code-form stable paths,
and a read-only scan found no broken ordinary Bundle link in either the active location or the
simulated dated location. This proves the authored migration scope is now complete; it does not
prove the later one-tier move, final Wiki backlink, final archive checker, Windows benchmark, or
installed user-visible path. Those remain required implementation/review/completion evidence.

## Read-only audit evidence

```text
claude --version
  2.1.220 (Claude Code)

installed sdk-tools.d.ts
  TaskUpdateInput: taskId, subject, description, activeForm, status,
  addBlocks, addBlockedBy, owner, metadata
  TaskUpdateOutput: success, taskId, updatedFields, optional error/statusChange

official Claude docs
  subagent tool hooks carry agent_id and agent_type
  PreToolUse carries tool_input and tool_use_id
  exit 2 blocks before permission evaluation
  no documented direct native TaskUpdate/Hook-probe CLI surface

official Node docs
  setTimeout has no exact callback-time guarantee
  child close follows process exit and stdio closure
  Windows ChildProcess.kill is forceful for the supported signals

current Bundle link simulation
  ordinary active Bundle links broken: 0
  ordinary simulated dated-archive Bundle links broken: 0
  old direct fixture Markdown links in the five repaired Concepts: 0
  stable payload tier present: no
  old Bundle JSON payload count: 2
```

No product implementation, fixture-fed Hook call, or narrower timer unit test was treated as
proof of the missing setup/runtime and deadline guarantees.

## Re-audit gate

A fresh independent audit may return `PASS` only after the linked PRD, Design, source contract,
and work Concept jointly:

1. define a deterministic real Claude setup probe that can positively authorize installation
   without granting `TaskUpdate` before the probe succeeds; and
2. replace the contradictory 500 ms timer/return contract with one exact, executable Windows
   termination and cleanup clock.

The accepted fail-closed input shapes, nonce/revision/progress invariants, attention boundaries,
fresh/existing Powerline ownership, real-file warm/normal-cold measurements, one-tier fixture
migration, complete archive-navigation scope, and prior accepted product boundaries must remain
unchanged. A later model `PASS` still requires explicit human calibration before implementation
dispatch.
