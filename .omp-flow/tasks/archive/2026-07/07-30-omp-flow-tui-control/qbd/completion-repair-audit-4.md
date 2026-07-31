# Fourth completion-repair Flow Status QbD audit

Verdict: **PASS**

## Subject

This fresh independent audit evaluates:

- [Completion-audit repair work](../work/completion-audit-repair.md)
- [Repaired PRD](../prd.md)
- [Repaired Design](../design.md)
- [Flow Status source observation v1](../interfaces/flow-status-source-observation-v1.md)
- [Third completion-repair audit](completion-repair-audit-3.md)
- [Pinned native capability fixtures](../reference/native-capability-fixtures.md)

It challenges the fourth repair as a design and dispatch boundary. It does not audit an
implementation and makes no product-code change.

## Decision

The fourth revision closes both blockers from the third audit without weakening the previously
accepted requirements.

Normal setup now makes only the claims it can prove without a model turn: exact configuration and
direct conformance of the exact guard boundary. Authenticated native E2E is a separate, optional,
revision-bound fact and remains `unproven` when that environment is unavailable. The safe commit
order installs and verifies the guard and matcher before any managed definition gains
`TaskUpdate`; rollback and removal first restore all five definitions to no-`TaskUpdate`, so they
never intentionally leave broad native mutation authority behind an absent guard.

The supervisor contract is also constructible. A timer scheduled at 400 ms requests Windows
termination; presentation resolution has a separate 600 ms supported-environment budget; child
`close` and PID absence are a later 1000 ms cleanup gate; and a 1200 ms watchdog classifies failure
rather than supplying product timing evidence. The test child exercises the exact production
supervisor/kill function but is explicitly not represented as a provider or synchronous
regular-file stall.

No blocking QbD finding remains. This `PASS` makes the repair eligible for human calibration and,
only after that recorded decision, bounded implementation dispatch.

## Requirement audit

### 1. Setup, doctor, and native-E2E claims are separated truthfully

The PRD defines normal readiness as pinned Hook-contract provenance, deterministic direct
conformance of the exact staged guard, installed executable/matcher/definition digest equality,
and a guard-first commit (`prd.md:140-153`). Doctor reports three orthogonal dimensions:
`configured`, `guardConformant`, and `nativeE2E`; missing credentials produce
`nativeE2E: unproven`, not a fabricated sentinel or setup failure (`prd.md:155-162`).

The Design makes the evidence transfer testable:

- direct tests execute the exact staged command over allowed, denied, malformed, replay,
  concurrency, and injected internal-failure cases (`design.md:369-379`);
- installed configuration is byte/digest checked, and doctor reruns the bounded conformance matrix
  against the exact installed guard with an isolated state root (`design.md:380-387`);
- `configured && guardConformant` is sufficient only for normal local readiness and is never named
  native E2E (`design.md:389-400`); and
- `nativeE2E: proven` requires a controlled authenticated Claude session through the real Hook
  merger, one allowed bind/progress call, one denied mutation with no native side effect, exact
  version/digests/platform, and its own cleanup/evidence (`design.md:401-408`).

The source contract repeats that fixtures never promote native E2E and that the optional claim
requires a separately authenticated model session over the real PreToolUse/native-mutation
boundary (`interfaces/flow-status-source-observation-v1.md:228-235`). Required verification checks
these fields independently and permits a credential-gated job to record `unproven`/skipped without
failing normal setup (`work/completion-audit-repair.md:199-206`).

This closes third-audit B1. The design no longer requires an unavailable deterministic native
`TaskUpdate` simulator and does not relabel direct guard conformance as native runtime proof.

### 2. Native TaskUpdate authority remains fail-closed through commit and rollback

For each exact managed `agent_type`, the synchronous `PreToolUse(TaskUpdate)` guard compares the
complete bind/progress key sets, repository/session/task/revisions, nonce, identity, and
`tool_use_id`; status, deletion, dependency, detail, foreign owner/task, extra fields, invalid
progress, replay, conflict, expiry, and internal failures are denied before execution
(`design.md:318-367`).

The commit order is explicit: commit the guard executable, then the matcher, verify both, and only
then replace the five managed definitions with `TaskUpdate`-enabled versions. On any failure, all
five no-`TaskUpdate` definitions are restored before matcher/guard rollback; removal uses the
reverse safe order (`design.md:380-385`, `work/completion-audit-repair.md:68-77`). Therefore an
interrupted forward commit may expose fewer enabled definitions, but every enabled definition is
behind the already verified guard. A rollback that cannot restore every definition must leave the
guard/matcher in place; it cannot continue to the later removal step.

The required tests cover exact matcher/command/digest equality and safe commit/rollback order
(`work/completion-audit-repair.md:199-204`). Implementation review must inject failure at each
commit and rollback boundary, including the restoration-failure case above; this is executable
acceptance evidence, not an additional design dependency.

### 3. The Windows service budgets describe distinct observable events

The production supervisor has one closed child specification, `shell: false`, bounded stdin/stdout,
and one exported `runSupervisedChild` implementation for timer, pipe, Windows termination, and exit
logic (`design.md:529-575`). On timeout it stops accepting output, destroys stdin, calls default
`ChildProcess.kill()`, destroys stdout/stderr, unreferences the child, and resolves semantic empty
in that order (`design.md:533-550`).

The four clocks are coherent:

1. schedule the termination transition at 400 ms after successful child spawn;
2. require timer lateness at most 50 ms, hence a kill request by 450 ms;
3. resolve the user-visible degraded presentation by 600 ms without awaiting cleanup; and
4. require child `close` plus external PID absence by 1000 ms, while a 1200 ms watchdog is always a
   failed case (`design.md:552-567`, `design.md:921-942`).

Node's official documentation supports the distinction: on Windows the supported signals,
including default `SIGTERM`, kill the process forcefully, while the `close` event occurs only after
process end and stdio closure. Node also makes no exact callback-time guarantee:

- https://nodejs.org/download/release/latest-jod/docs/api/child_process.html
- https://nodejs.org/api/timers.html

The design therefore records `kill()` boolean/error separately from later `close`/PID evidence and
does not confuse a termination request with completed cleanup. It scopes all maxima to a serial
idle Windows job with recorded Node/Python/OS versions and explicitly disclaims synchronous-I/O,
scheduler, arbitrary-OS, and hard-real-time guarantees (`design.md:932-949`; `prd.md:329-339`).
This closes third-audit B2.

### 4. The hanging fixture is not represented as native provider E2E

The 20-case child emits fixed `READY` and deliberately remains alive. It enters the exact exported
production supervisor/termination function, but its path is test-owned and cannot be selected by
production stdin, environment, status input, or user config
(`work/completion-audit-repair.md:148-156`; `design.md:569-575`).

Regular-file provider behavior remains a different boundary: real valid/degraded files exercise
the production `statSync`/`isFile`/`readFileSync` path only after the synchronous call returns.
Warm and normal-cold runs measure that path, but no test claims a reproducible NTFS stall or
in-process interruption (`design.md:944-949`). Likewise the published-schema Claude fixture is
explicitly not labelled a locally authenticated model run
(`reference/native-capability-fixtures.md:32-36`).

### 5. All previously accepted requirements remain testable and in scope

- **Nonce, role, and progress:** the pending binding is repository/session/task-set/revision/task/
  agent scoped and single-use; positive role requires the same agent's successful reserved
  `TaskUpdate`, and progress repeats the immutable binding with a closed monotonic stable
  denominator (`design.md:290-467`;
  `interfaces/flow-status-source-observation-v1.md:184-317`).
- **Attention and source honesty:** only exact `AskUserQuestion` and `Elicitation`
  start/terminal pairs open blocking attention; `PermissionRequest` cannot do so; local adapter
  sequence does not claim to detect an unobserved lost Hook
  (`interfaces/flow-status-source-observation-v1.md:310-338`).
- **Powerline and one/two lines:** a genuinely absent config receives the exact enabled two-line
  Powerline document; an existing config receives only the managed widget and retains every
  previous field/order/Powerline choice (`design.md:636-713`). Final composition remains required
  at 160/120/100/80/60/20 columns with at most one task bar and no injected OMP branding
  (`prd.md:443-453`).
- **Pinned compatibility:** one reviewed ccstatusline build must advertise
  `flowStatusWidgetV1`; setup discloses its package/revision and never hot-patches an arbitrary
  installation (`design.md:715-723`). Codex retains the truthful no-third-party-footer decision,
  and Oh My Pi remains pinned/probed at 17.2.1 with older revisions limited to direct detail
  (`design.md:731-766`).
- **Stable fixtures and archive navigation:** the repair owns both stable fixture destinations,
  deletion of both Bundle payloads, all five historical fixture references, all 13 previously
  identified repository-external links, and simulated plus final archive checks
  (`work/completion-audit-repair.md:110-130`, `work/completion-audit-repair.md:161-186`,
  `design.md:826-878`).
- **Measured performance:** the 20-discarded/200-warm real-reader gate, 40 new whole-supervisor
  cold gate, and 20 exact hanging-child cases retain raw durations, nearest-rank p95, maxima,
  environment versions, and distinct presentation/cleanup clocks
  (`work/completion-audit-repair.md:132-159`, `work/completion-audit-repair.md:216-221`).
- **Completion boundary:** full Windows/build/test/installed-artifact/package/diff gates, a new
  different-actor implementation review, the real post-move archive check, and a rewritten
  evidence-backed completion remain mandatory (`work/completion-audit-repair.md:222-233`).

## Read-only evidence and implementation status

Read-only checks performed for this audit:

```text
official Node child_process documentation
  default kill signal is SIGTERM
  Windows supported signals forcefully terminate
  child close follows process end and stdio closure

official Node timer documentation
  callback timing is not exact

current managed Claude definitions
  all five still omit TaskUpdate

stable fixture destinations
  not present yet

old Bundle fixture payloads
  both still present as migration inputs

five historical Concepts
  old direct reference/fixtures/*.json Markdown links: 0
```

These observations are consistent with a pre-implementation design gate. They are not evidence that
the repair is implemented, reviewed, benchmarked, installed, or archive-safe in its final
location. The stable fixtures, guard, supervisor, configuration changes, Windows results, final
archive checker, handoff, review, and new completion record still have to be produced by the
bounded work.

## Human gate

This audit does not manufacture human approval. Because the revision deliberately replaces the
old 500 ms hard-deadline claim with 400/600/1000 ms supported-environment service budgets, the
linked work explicitly requires fresh human calibration before implementation dispatch
(`work/completion-audit-repair.md:28-30`).
