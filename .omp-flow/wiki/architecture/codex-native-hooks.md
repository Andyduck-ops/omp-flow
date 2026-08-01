---
type: "Architecture"
title: "Codex native Skill and Hook adapter"
---

# Codex native Skill and Hook adapter

Codex discovers omp-flow project Skills only from `.agents/skills`. The shared source remains
`templates/common/skills`; there is deliberately no second managed `.codex/skills` copy. During
update, an old duplicate is deleted only when its stored template hash still matches. Missing
ownership or user modification is a visible conflict and is preserved.

The Codex-specific adapter is an exact-owned `.codex/hooks.json` plus two stateless, stdlib-only
handlers:

- `SessionStart(startup|resume|clear|compact)` passes the native `session_id` as
  `CODEX_THREAD_ID`, removes `OMP_FLOW_CONTEXT_ID` from the child environment, and reads the
  existing runtime `status`. Its bounded additional context is mechanical orientation only; it
  never reads a transcript or infers Task, Flow, approval, verdict, or progress. Failure is a
  short fail-soft orientation message.
- `PreToolUse(apply_patch)` accepts only `tool_input.command`, extracts add/update/delete/move
  paths from one closed patch envelope, resolves them against the payload `cwd` and Git root, and
  denies runtime paths or anything it cannot verify. Safe source, Bundle, and Wiki paths produce
  no output. This is defense in depth; Python runtime validation remains authoritative.

## Trust and review

Run Codex `/hooks` after install or update and review the project definition source and hash.
Trusting that definition hash does not recursively establish that the referenced Python scripts
were reviewed: inspect `.codex/hooks/session-start.py` and `.codex/hooks/protect-runtime.py` as
actual executable inputs whenever they change. The installer neither edits a trust store nor
uses a trust-bypass option. Foreign or modified Hook files are not parsed, merged, overwritten,
or silently trusted.

If project Hooks are untrusted, disabled through `[features].hooks=false`, unsupported by the
current surface, timed out before output, or bypassed by a non-`apply_patch` mutation, no Hook
guarantee exists. Continue with `.agents` Skills, `$flow-status`, or the explicit
`.omp-flow/scripts/omp_flow.py` CLI. Do not describe this guard as an OS sandbox or as IDE/App
parity without separate platform capture.

## Three native surfaces

- Oh My Pi owns its native agents, Skills, extension, task dispatch, and optional Flow Status
  presentation.
- Codex owns TOML agents, `.agents/skills` discovery, and the two-event project Hook adapter.
- Claude owns its native agents, Skills, settings, identity/runtime Hooks, structured task
  observation, and optional compatible status renderer.

These surfaces share Bundle knowledge and the portable runtime kernel, but no adapter infers
semantic workflow state or borrows another Harness's files.
