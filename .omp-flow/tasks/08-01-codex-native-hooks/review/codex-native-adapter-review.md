---
type: "Review"
title: "Independent review of the Codex native Skill and Hook adapter"
---

# Independent review of the Codex native Skill and Hook adapter

## Verdict

**FAIL** — one medium-severity correctness/security-contract finding returns the implementation to
[Implement the native Codex adapter](../work/codex-native-adapter.md). This review inspected the
completed different-actor [implementation handoff](../work/codex-native-adapter-handoff.md), the
real tracked and untracked diff, the approved PRD/Design/QbD decisions, focused fixtures, canonical
and deployed resources, documentation, and package contents.

## Findings

### Medium — unknown patch directives can be ignored instead of failing closed

`templates/codex/hooks/protect-runtime.py:88-113` extracts recognized Add/Update/Delete/Move paths,
but its malformed-directive check only matches broken spellings whose prefix is already one of
those known forms. Any other line beginning with an apply-patch-style `*** ...` directive is
silently ignored. If the same envelope contains one recognized safe file, path extraction succeeds
and the guard allows the patch.

Independent probe:

```text
*** Begin Patch
*** Update File: safe.txt
@@
*** Rename File: .omp-flow/.runtime/hidden.json
*** End Patch
```

Calling the shipped `_extract_paths` and `_check_paths` on that envelope printed:

```text
['safe.txt']
ALLOW
```

This violates the approved Design requirement that an unknown or broken file directive is
malformed and receives the native unverifiable-path denial. The currently documented grammar does
not define `Rename File`, so this probe is not evidence that today's stock `apply_patch` accepts
that exact directive; it is evidence that the Hook itself does not enforce its closed-parser,
fail-closed contract. A later/alternate directive or malformed wire input can therefore pass the
guard whenever a safe recognized directive is also present.

Required rework: reject every directive-like `*** ...` line not valid in the closed envelope grammar
(while preserving valid hunk/content lines), and add a focused fixture that proves mixed known-safe
plus unknown/broken directives return `permissionDecision: deny`. A different actor must review the
rework; this reviewer did not repair it.

## Scope and contract review

No additional blocking finding was found in the reviewed scope:

- `src/cli/init.ts` removes current `.codex/skills/**` duplicates from Codex managed resources,
  adds all three Hook resources, and removes both reused Hook paths from the obsolete set. Focused
  migration fixtures demonstrate single managed-update entries, deletion of unmodified duplicates,
  and preservation of modified/foreign files.
- `SessionStart` uses `CODEX_THREAD_ID`, removes `OMP_FLOW_CONTEXT_ID` only in the child environment,
  confines the resolved cwd/root, bounds output, avoids transcript input, and fails soft.
- Absolute, drive-relative, UNC, escaping and existing-symlink paths are denied; ordinary source,
  Bundle, Wiki, Unicode and space paths are allowed. The finding above concerns completeness of the
  parser before path validation.
- Canonical and deployed `hooks.json`, `session-start.py`, and `protect-runtime.py` are byte-identical.
- README and the linked Wiki Concept distinguish Hook definition-hash trust from review of referenced
  scripts and accurately limit disabled, untrusted, non-`apply_patch`, IDE/App, and OS-sandbox claims.
- Package version is `0.2.6`; dry-run includes the three canonical Codex Hook resources and no
  `templates/codex/skills/**` source.
- The unrelated dirty `.omp-flow/.gitignore` and
  `templates/.omp-flow/scripts/common/disposition.py` remain outside the implementation edits
  described by the handoff; no destructive cleanup of other untracked files was observed.

## Independent verification

- `python -X utf8 tests/codex-hooks.test.py -v` — PASS, 11 tests, including the real Windows launcher
  smoke from a Unicode/space subdirectory.
- `npx tsx -e 'import { runCodexInitTests } from "./tests/codex-init.test.ts"; ...'` — PASS; focused
  Codex init/ownership/migration checks completed.
- `python -X utf8 -c "import runpy; ... _extract_paths(...); _check_paths(...); ..."` with the mixed
  safe-update/unknown-runtime-directive envelope above — FAIL contract probe: `['safe.txt']`, then
  `ALLOW`.
- SHA-256 comparison of each `templates/codex/hooks*` resource against its `.codex/hooks*` deployed
  counterpart — PASS, all three pairs equal.
- `npm pack --dry-run --json` — PASS package inspection: `omp-flow-0.2.6.tgz`, 120 entries; contains
  `templates/codex/hooks.json`, `templates/codex/hooks/session-start.py`, and
  `templates/codex/hooks/protect-runtime.py`; contains zero `templates/codex/skills/**` entries.
- `git diff --check` — PASS (exit 0; only existing LF-to-CRLF working-copy warnings).
- Full `npm test` was not repeated, per reviewer direction to prioritize the real diff and focused
  fixtures; the handoff's recorded aggregate PASS was read but does not override the independent
  failing adversarial probe.

## Operation correlation

- Reviewer actor ID: `hook_review`
- Review dispatch receipt: `48023ce6ee614f91b081f6efdd5adae1`
- Predecessor receipt: `bc7d6f72b1c640669a2f9df8734db1f7`
- Predecessor actor ID/state: `hook_impl` / `completed`
- Predecessor output: `.omp-flow/tasks/08-01-codex-native-hooks/work/codex-native-adapter-handoff.md`
- Review output: `.omp-flow/tasks/08-01-codex-native-hooks/review/codex-native-adapter-review.md`
