# PRESHIP-VERIFY — `0.6.0.json` migration manifest

Target: `packages/cli/src/migrations/manifests/0.6.0.json`
File size: 6587 bytes total (changelog field: 4420 bytes / 4.32 KB; notes field: 1753 bytes).

## Criterion-by-criterion

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Valid JSON (no parse errors) | PASS | `python3 -c "import json; json.load(open(...))"` succeeded |
| 2a | `version == "0.6.0"` | PASS | `"version": "0.6.0"` |
| 2b | `breaking == false` | PASS | `"breaking": false` |
| 2c | `recommendMigrate == true` | PASS | `"recommendMigrate": true` |
| 2d | `migrations == []` | PASS | `"migrations": []` |
| 3 | description is a single sentence summarizing v0.6 | PARTIAL (matches v0.5.0 precedent) | Field is two sentences: headline (multi-agent channel, `trellis mem`, `trellis-core` SDK, 15-platform incl. Reasonix + Pi) + "Stable promotion of rc.0 with no new src/ changes." v0.5.0.json uses identical two-sentence shape, so this conforms to precedent rather than the literal "single sentence" wording in the check criteria. No action required. |
| 4 | changelog length 3-5 KB (target 3-4 KB) | PASS (4.32 KB, within 3-5 KB band; precedent v0.5.0 is 4.77 KB so 4.32 is actually closer to the stated target than precedent) | `len(changelog) == 4420` |
| 5 | Changelog has explicit bullets for trellis-channel bundled skill (CRITIQUE C1 fix) | PASS | "Bundled skills" section includes: ``- `trellis-channel` (new in GA cycle): when to reach for `trellis channel` for multi-agent collaboration, forum/thread boards, dispatcher-wait patterns.`` |
| 6 | Section headers in order: Channel runtime, Memory, SDK extraction, Platform coverage, Workflow + planning, Updater, Bundled skills, Migration & update flow, Bug fixes, Out of scope | PASS | Positions in changelog string: Channel runtime=335, Memory=865, SDK extraction=1193, Platform coverage=1498, Workflow + planning=2080, Updater=2440, Bundled skills=2843, Migration & update flow=3242, Bug fixes=3731, Out of scope=4232. All present, strictly increasing. Note: "Bug fixes" appears as "**Bug fixes (cut window)**" — matches the prefix check. |
| 7a | notes covers 0.5.x users with --migrate | PASS | "**Users on 0.5.x** ... run `trellis update --migrate`. The `--migrate` flag is REQUIRED ..." |
| 7b | notes covers 0.6.0-prerelease users with plain update | PASS | "**Users on any 0.6.0 prerelease** (`beta.X` / `rc.0`): plain `trellis update` is a clean version bump — no `--migrate` needed ..." |
| 7c | notes covers Codex users | PASS | "**Codex users**: the v0.6 cycle flipped `codex.dispatch_mode` default ... no longer write a `[features.multi_agent_v2]` block ..." |
| 7d | notes covers channel runtime opt-in | PASS | "**Channel runtime is opt-in.** The single-agent workflow you know from 0.5 still works unchanged. ..." |
| 7e | notes covers OpenCode degradation (CRITIQUE C3 fix) | PASS | "**OpenCode users**: `trellis mem` returns empty on OpenCode 1.2+ in this build — the SQLite reader was reverted at `0.6.0-beta.4` due to native-dependency install failures on Windows. A re-enable is planned post-0.6.0." |
| 7f | notes covers install command | PASS | "Install: `npm install -g @mindfoldhq/trellis`" |

## Manifest continuity

`ls packages/cli/src/migrations/manifests/` (tail):
```
0.6.0-beta.21.json
0.6.0-beta.22.json
0.6.0-beta.23.json
0.6.0-beta.2.json
... (out of natural sort because of lexicographic ordering; semver order resolves correctly via manifest tooling)
0.6.0-beta.9.json
0.6.0-rc.0.json
0.6.0.json
```
- `0.6.0.json` sits after `0.6.0-rc.0.json` (rc.0 < 0.6.0 GA per semver).
- No next-version file present (no `0.6.0-rc.1.json`, no `0.6.1.json`, no `0.7.0-*.json`). 0.6.0 is the chain head. PASS.

## `release-preflight check-versions` output

```
$ node packages/cli/scripts/release-preflight.js check-versions
ok versions match: @mindfoldhq/trellis-core@0.6.0-rc.0 = @mindfoldhq/trellis@0.6.0-rc.0
EXIT=0
```

Note: at this point both packages are still at `0.6.0-rc.0`; `bump-versions.js promote` in Phase D2 flips them to `0.6.0`. The check confirms CLI/core lockstep is intact pre-bump. The script does NOT walk the migration manifest chain — it only verifies the two `package.json` versions match (and optionally the `GITHUB_REF` tag). Manifest continuity is asserted via the directory listing above.

## Summary

- 13/14 criteria PASS; 1 PARTIAL (description is two sentences — matches v0.5.0 precedent verbatim, not a regression). No fixes applied.
- All CRITIQUE C1 (trellis-channel bullet in Bundled skills) and C3 (OpenCode degradation paragraph in notes) requirements are met.
- File is ready for commit as-is.
