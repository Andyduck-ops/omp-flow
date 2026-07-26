# Claude Code Adapter — Verification & Provenance Record

Task: `07-11-claude-code-adapter`, Row F (`F-D001E001--001`, documentation + release gate).
Branch: `feat/claude-code-adapter`.

> **Status: template / fixture-validated only.** This record establishes no
> live-runtime, workspace-trust, supported-version, or platform conclusion. See
> "Deferred native validation" below.

## 1. Fixture provenance

Claude Hook payload fixtures live under `tests/fixtures/claude-hooks/` with a
sibling `_provenance.json`:

- `provenance: "hand-authored"`
- `conformsTo: "documented Claude Code Hook contract for >= 2.1.199"`
  (`context/interface/claude-hook-contract.md`)
- `capturedFromLiveRun: false`

The payloads were authored to the **documented 2.1.199+ field names**, not
captured from a live Claude Code run or an interactive trust dialog. They are the
current deterministic acceptance boundary for the Row-D Hook wrappers. Fixture
files present:

- `session-start.json` (SessionStart)
- `user-prompt-submit.json` (UserPromptSubmit)
- `pretooluse-agent-executor.json` (PreToolUse Agent)
- `pretooluse-task-qbd.json` (PreToolUse Task compatibility alias)
- `subagent-start-check.json` (SubagentStart)
- `pretooluse-write-protected.json` (PreToolUse Write, denied)
- `pretooluse-write-qbd-report.json` (PreToolUse Write, QbD report exception)
- `pretooluse-bash-omp-flow.json` (PreToolUse Bash, allowed CLI invocation)

**Invariant:** if a later captured payload differs, only the strict parser field
names or the settings records may change. The fail-closed semantics MUST NOT
weaken — no guessed field aliases, no silent Hook no-op for a reserved role, no
global-task fallback, no pull-context fallback, and no no-active-task / persistent
authorization route for QbD.

## 2. What the committed evidence proves (static contract)

Per the deterministic tests (`tests/omp-flow.test.ts`, Tests 1/1c/1d/8h/8i/10) and
the static settings/agent-card contract, against the fixtures above:

- `SessionStart` (startup/resume/clear/compact) and `UserPromptSubmit` emit the
  documented `hookSpecificOutput.additionalContext` workflow-state envelope; a
  bootstrap failure returns a fail-closed STOP envelope, never empty context.
- Strict dispatch mutates only `tool_input.prompt`, prepends
  `<!-- omp-flow-claude-dispatch:v1 -->`, and preserves other native fields;
  malformed / mismatched / stale descriptors return `permissionDecision: "deny"`.
- Reserved-namespace typos (`omp-flow-*` unknown) deny; unknown non-`omp-flow`
  agents pass through unchanged.
- Exactly-once identity injection: each of the five agent names has one and only
  one `SubagentStart` matcher, injecting `<!-- omp-flow-claude-identity:v1 -->`
  with the payload `agent_id`/`agent_type`.
- Reviewer (`omp-flow-check`) passes the injected native `agentId` unchanged as
  `--reviewer-agent-id`.
- `Write`/`Edit`/`Bash` protection denies Python-owned / escaped paths; the QbD
  `Write` report exception is recomputed per Write and never applies to `Edit`.
- UTF-8 stdin/stdout handling and the Bash session bridge
  (`OMP_FLOW_CONTEXT_ID` appended to `CLAUDE_ENV_FILE`) are exercised at the
  wrapper level against the fixtures.

These are **static-contract** proofs over hand-authored payloads. They are not
evidence of live Claude behavior.

## 3. Final verification gate (Row F, executed)

Repo root, Windows, `python` = `python`:

| Command | Result |
|---|---|
| `python -X utf8 -m compileall -q templates/.omp-flow/scripts` | PASS (compileall OK) |
| `npm run build` | PASS (clean + tsc, exit 0) |
| `npm test` | PASS ("All portable workflow tests passed.", exit 0) |
| `npm pack --dry-run` | PASS — 98 files, 91.7 kB; all 11 `templates/claude/*` files ship (settings.json + 5 agents + 5 hooks); no `__pycache__` in tarball |

Project-level init/update smoke check (scratch dir, `node bin/omp-flow.js`):

| Step | Result |
|---|---|
| `init --claude` | PASS — deploys `.claude/{settings.json,agents/*,hooks/*,skills/*}` |
| `.omp-flow/config.json` | `{"schemaVersion":1,"harnesses":["claude"]}` |
| deployed `.claude/settings.json` | 0 residual `{{PYTHON_CMD}}`; substituted to `python` |
| `update --dry-run` | PASS — Summary: new 0, unchanged 37, changed 0, obsolete 0 |
| `doctor` | `{"ok":true,"findings":[]}` |

## 4. Deferred native validation (MUST be captured before any live claim)

From `context/finding/claude-version-trust-risks.md`. Interactive Claude runtime
validation is deferred to the maintainer and is **not** a completion condition for
this task.

1. Capture raw 2.1.199+ **and** current-stable payloads for every selected event
   and the exact `Agent` tool input; exercise the compatibility `Task` if the
   runtime permits.
2. Prove the separate exact settings matchers load without duplicate dispatch;
   parse all five mandatory frontmatter names and prove each gives exactly one
   `SubagentStart` identity injection with matching `agent_id`/`agent_type`.
3. Prove Windows command quoting, UTF-8 stdin/stdout, non-ASCII project paths, and
   actual Bash sourcing of the appended `OMP_FLOW_CONTEXT_ID` export.
4. Prove an interactively trusted project loads every Hook, and identify how an
   enterprise `allowManagedHooksOnly` policy presents when project Hooks are
   denied. Non-interactive print mode disables the trust dialog and is **not**
   approval evidence.
5. Validate the strict Write/Edit/Bash field parsers against real payloads and
   retain the limitation that shell obfuscation is not an OS-level sandbox. The
   Write payload must prove availability of the session and identity fields used
   by the QbD report exception; otherwise the implementation must deny that
   exception and the design must be revised before release.
6. Upgrade any local Claude Code install below 2.1.199 before native validation.

Until these are captured, the adapter makes **no** claim of interactive project
trust, a supported/tested Claude version beyond the 2.1.199 floor, Windows/macOS/
Linux runtime support, or live Hook behavior.

## 5. Known implementation gaps vs PRD R7 (documented, not patched)

Row F scope is documentation + honest boundaries; these are reported, not fixed:

- **No automated version preflight.** `omp-flow init --claude` copies templates
  but does not invoke `claude --version` or reject versions < 2.1.199 (PRD R7.1).
  The floor is currently a manual maintainer prerequisite.
- **`doctor` does not report Claude state.** `doctor` reports only legacy
  artifacts (`legacy-active-task`, `legacy-plan`, `legacy-depends-on`,
  `legacy-qbd2-whole-digest`, `legacy-structure`, `superseded-store-file`); it
  does not report missing/old Claude, missing managed files, or settings/Hook
  drift for a configured Claude harness (PRD R7.1).
- **No Claude-specific init trust/print-mode notice.** `init` prints a post-init
  note for Codex only; it emits no workspace-trust warning for Claude (PRD R7.2).

Documentation (README, AGENTS) reflects the actual behavior above and does not
claim these unimplemented checks exist.
