---
type: "Completion"
title: "Codex native Hook adapter completion"
---

# Codex native Hook adapter completion

## Outcome

Codex now uses the universal `.agents/skills` root without a duplicated `.codex/skills` tree and
receives an exact-owned native `.codex/hooks.json` adapter. SessionStart provides mechanical task
orientation, while PreToolUse guards `.omp-flow/.runtime/` writes made through `apply_patch` with a
closed, fail-soft parser. Installer/update behavior preserves foreign or modified Hook resources
instead of merging or overwriting them.

The first independent Review found one material closed-parser gap for unknown `***` directives.
The bounded rework fixed that gap, added mixed-directive regression coverage, and a different actor
independently re-reviewed it as PASS with no material blocker.

## Integration verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/codex/hooks templates/claude/hooks` — PASS.
- `npm run build` — PASS for `omp-flow@0.2.6`.
- `npm test` — PASS: 394 focused TypeScript/runtime checks and 12 Codex Hook Python tests.
- `npm pack --dry-run --json` — PASS: `omp-flow-0.2.6.tgz`, 120 files, 177695 packed bytes,
  805828 unpacked bytes.
- `git diff --check` — PASS; only existing working-copy line-ending warnings were emitted.
- Canonical/deployed SHA-256 pairs for `hooks.json`, `session-start.py`, and
  `protect-runtime.py` are identical.
- Runtime operation list contains no active operation for this Bundle.

## Knowledge harvest

Durable ownership, migration, trust, and fail-soft guidance is recorded in
`.omp-flow/wiki/architecture/codex-native-hooks.md`. README describes the user-visible native
integration and project trust boundary.

## Residual evidence boundary

The Windows integration suite covers real Unicode/space-path launch behavior. This host did not
positively execute the POSIX launcher or a real Codex `/hooks` trust prompt, IDE, or App session;
the release therefore makes no stronger platform claim. Those are evidence limits, not known
implementation blockers.

## Archive disposition

The Bundle remains under active tasks because the current Windows Codex session retains a source
directory handle and the runtime's atomic archive rename correctly failed visibly with
`WinError 5`. Implementation, Review, release verification, and commit are not blocked. Archive
should be retried through `omp-flow task archive 08-01-codex-native-hooks` after that session handle
is released; no copy/delete fallback was used.
