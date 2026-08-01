---
type: "Handoff"
title: "Codex native Skill and Hook adapter implementation handoff"
---

# Codex native Skill and Hook adapter implementation handoff

Status: `DONE_WITH_CONCERNS`

This handoff implements [Implement the native Codex adapter](codex-native-adapter.md) within its
approved boundary. The implementation is ready for a different-actor independent Review; this
executor result is not reviewer acceptance.

## Delivered behavior

- Codex no longer manages or installs `.codex/skills/**`. Shared omp-flow and `flow-status`
  Skills remain canonical in `templates/common/skills` and deploy to `.agents/skills`; OMP and
  Claude native Skill roots are unchanged.
- `.codex/hooks.json`, `.codex/hooks/session-start.py`, and
  `.codex/hooks/protect-runtime.py` are Codex managed resources. `hooks.json` and SessionStart
  were removed from the obsolete set at the same time, so update cannot overwrite them and then
  delete them. All current Codex Skill duplicates moved to obsolete ownership.
- The canonical/deployed Hook config has exactly `SessionStart` with
  `^(startup|resume|clear|compact)$` and `PreToolUse` with `^apply_patch$`, each with explicit POSIX
  and Windows launchers rooted through `git rev-parse --show-toplevel`.
- SessionStart validates only the native event/source/session/cwd fields, resolves and confines
  the Git root, sets the child-only `CODEX_THREAD_ID`, removes `OMP_FLOW_CONTEXT_ID`, and invokes
  existing runtime `status`. Success returns bounded mechanical orientation with a non-inference
  reminder. Malformed input, root/runtime/status/UTF-8 failures return exit 0 with bounded
  unavailable context and sanitized stderr, without reading transcript content.
- The apply_patch guard accepts only `tool_input.command`, requires one complete patch envelope,
  extracts add/update/delete and update-move source/destination paths, normalizes Windows
  separators, resolves symlinks and `.`/`..` through platform-normalized containment, and rejects
  absolute, UNC, drive-relative, escaping, malformed, or otherwise unverifiable input. Runtime
  paths return the native runtime deny reason; ordinary repository source, Bundle, Wiki, and
  Unicode/space paths produce no output and exit 0.
- README and the discoverable Wiki architecture Concept describe `.agents`-only Codex Skill
  ownership, `/hooks` trust, the fact that a definition hash does not recursively review the
  referenced scripts, fail-soft/deny degradation, non-`apply_patch` and untrusted/disabled
  coverage limits, and the separate OMP/Codex/Claude native surfaces.
- Package metadata is prepared as `0.2.6`; no publish, commit, archive, runtime/session mutation,
  or Harness configuration change was performed.

## Migration evidence

Focused TypeScript fixtures cover fresh Codex init, exact two-event JSON parsing, byte-identical
handler install, no `.codex/skills` creation, and `.agents/skills` discovery. They also cover:

- init skip and update conflict preservation for foreign Hook definitions and handlers;
- a previously managed, unmodified `hooks.json` and SessionStart becoming one `autoUpdate` entry
  each, with no duplicate obsolete-delete entry;
- backup of every tested overwrite/delete/conflict input;
- deletion of an unmodified managed `omp-flow` Codex Skill duplicate;
- preservation of a modified managed `flow-status` Codex Skill duplicate; and
- visible preservation of a modified formerly-managed Hook definition.

## Changed files

- Installer ownership: `src/cli/init.ts`.
- Canonical Codex resources: `templates/codex/hooks.json`,
  `templates/codex/hooks/session-start.py`, `templates/codex/hooks/protect-runtime.py`.
- Repository-owned deployment: `.codex/hooks.json`, `.codex/hooks/session-start.py`,
  `.codex/hooks/protect-runtime.py`; canonical and deployed files are byte-identical.
- Approved removals: the 14 tracked current `flow-status` / `omp-flow*` files under
  `.codex/skills/**`. Untracked legacy Skill directories were not removed.
- Tests: `tests/codex-hooks.test.py`, `tests/codex-init.test.ts`, `tests/omp-flow.test.ts`.
- Documentation/knowledge: `README.md`, `.omp-flow/wiki/architecture/index.md`,
  `.omp-flow/wiki/architecture/codex-native-hooks.md`.
- Release preparation: `package.json`, `package-lock.json` at `0.2.6`.
- Bundle handoff/navigation: this Concept and `work/index.md`.

The pre-existing unrelated modifications to `.omp-flow/.gitignore` and
`templates/.omp-flow/scripts/common/disposition.py`, plus unrelated untracked cache, old tasks,
legacy directories, and tarballs, were preserved.

## Verification

- `python -X utf8 tests/codex-hooks.test.py -v` — PASS, 11 tests. This includes all four
  SessionStart sources, selected/no-selected status forwarding, fail-soft inputs, exact deny and
  allow shapes, runtime add/update/delete/move, malformed/escaping/absolute/UNC/drive/case and
  symlink paths, Unicode/space/subdirectory paths, and a real Windows `commandWindows` launch for
  both handlers from a Unicode-and-space repository subdirectory.
- `npx tsx -e "...runCodexInitTests..."` — PASS, 26 focused installer/migration checks.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/codex/hooks templates/claude/hooks`
  — PASS.
- `npm run build` — PASS for `omp-flow@0.2.6`.
- `npm test` — PASS: repository aggregate reported `PASS: 390 focused checks`; its embedded Hook
  run passed 10 tests before the final selected-status/case fixture additions, which then passed
  in the standalone 11-test rerun above. Archive/link, Flow Status, Claude Hook, OMP adapter,
  runtime, operation, and installer contracts remained green.
- `npm pack --dry-run --json` — PASS: package `omp-flow@0.2.6`, 120 entries, 177714-byte tarball
  preview / 805805 bytes unpacked. It contains `templates/codex/hooks.json`,
  `templates/codex/hooks/session-start.py`, and `templates/codex/hooks/protect-runtime.py`; it has
  no `templates/codex/skills/**` source.
- `git diff --check` — PASS.
- SHA-256 byte-identity check — PASS for each canonical/deployed Hook resource pair.

## Decisions and residual concerns

- Relative `..` segments are allowed only when resolved containment proves the final target stays
  inside the Git root; a bare `.`/`..`, root escape, existing symlink escape, or unverifiable path
  is denied. This preserves legitimate subdirectory invocation without string-prefix security.
- The Windows launcher is positively exercised on this host. A `bash --version` availability
  probe timed out, so the POSIX launcher was not executed here and receives no positive platform
  claim. Its exact configured command is fixture-checked.
- Real Codex `/hooks` definition review/trust, disabled/untrusted behavior, and IDE/App execution
  were not captured in this environment. Documentation states these limits and the Skill/CLI
  fallback. This is why the handoff is `DONE_WITH_CONCERNS`, not an unqualified cross-platform
  completion claim.
- The guard is defense in depth for supported local `apply_patch`, not an OS sandbox or coverage
  for other mutation tools. Python runtime path/identity/receipt checks remain authoritative.

## Operation correlation

- Actor ID: `hook_impl`
- Dispatch receipt: `bc7d6f72b1c640669a2f9df8734db1f7`
- Predecessor: none
- Output: `.omp-flow/tasks/08-01-codex-native-hooks/work/codex-native-adapter-handoff.md`
- Unproven done conditions: POSIX command execution and real Codex `/hooks`/IDE/App capture, for
  the documented host-availability reasons above. No other done condition is known unproven.
