# Pre-Ship Dogfood Replay Verification

**Status:** PASS
**Date:** 2026-06-15
**Throwaway dir:** `/tmp/v060-ga-dogfood-verify` (fresh, never reused)
**Built CLI under test:** `/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/dist/cli/index.js` (0.6.0-rc.0)

## Replay procedure

```
rm -rf /tmp/v060-ga-dogfood-verify
mkdir /tmp/v060-ga-dogfood-verify && cd /tmp/v060-ga-dogfood-verify && git init -q .
npx --yes @mindfoldhq/trellis@0.5.19 init -y -u verifier --claude --cursor --codex
TRELLIS=/Users/taosu/workspace/company/mindfold/product/share-public/Trellis/packages/cli/dist/cli/index.js
node $TRELLIS update --migrate --dry-run
yes | node $TRELLIS update --migrate --force
yes | node $TRELLIS update    # idempotency check
```

All four CLI invocations exited 0. `init@0.5.19` wrote `.trellis/.version: 0.5.19`. After `--migrate --force`, `.trellis/.version: 0.6.0-rc.0`. Migration backup landed at `.trellis/.backup-2026-06-15T06-39-15/`.

## Acceptance checks

### 1. Four bundled skills present per active platform — PASS

| Platform dir | trellis-channel | trellis-meta | trellis-session-insight | trellis-spec-bootstrap |
|---|---|---|---|---|
| `.claude/skills/` | 6 files | 24 files | 3 files | 5 files |
| `.cursor/skills/` | 6 files | 24 files | 3 files | 5 files |
| `.agents/skills/` | 6 files | 24 files | 3 files | 5 files |

`.codex/skills/` is empty by design — Codex consumes skills via the `.agents/skills/` tree per `init` log message: "Configuring Codex (also writes .agents/skills/ — read by Cursor, Gemini CLI, GitHub Copilot, Amp, Kimi Code)". The four bundled skills are reachable from Codex through `.agents/skills/`.

### 2. Typoed `trellis-spec-bootstarp` not in any active location — PASS

`find . -name 'trellis-spec-bootstarp'` returns only the three backup paths:

```
./.trellis/.backup-2026-06-15T06-39-15/.agents/skills/trellis-spec-bootstarp
./.trellis/.backup-2026-06-15T06-39-15/.claude/skills/trellis-spec-bootstarp
./.trellis/.backup-2026-06-15T06-39-15/.cursor/skills/trellis-spec-bootstarp
```

All inside the `rename-dir` migration backup tree, as expected.

### 3. `.trellis/agents/{check,implement}.md` exist — PASS

```
.trellis/agents/check.md      (2.5K)
.trellis/agents/implement.md  (2.3K)
```

Both present — bundled in beta.23 to support channel-driven workflow.

### 4. trellis-meta SKILL.md is the 85-line v0.6 rewrite — PASS

`wc -l .claude/skills/trellis-meta/SKILL.md` → **85**. Identical line count in `.cursor/skills/trellis-meta/SKILL.md` and `.agents/skills/trellis-meta/SKILL.md`.

Preamble verified at lines 1-8 mentions all three v0.6 surfaces:

> "Trellis v0.6 adds three architectural surfaces on top of the pre-v0.6 workflow / persistence / platform model. First, a multi-agent collaboration runtime: `trellis channel` ... Second, cross-session memory: `trellis mem list | search | context | extract | projects` ... Third, a dual-package npm release: `@mindfoldhq/trellis` (CLI) and `@mindfoldhq/trellis-core` (SDK ...) ship in lockstep ..."

Description frontmatter also lists `trellis-channel`, `trellis-session-insight`, `trellis-spec-bootstrap`, and "bundled-skill auto-dispatch flow".

### 5. Second update is idempotent — PASS

Final `node $TRELLIS update` (no `--migrate`, no `--force`) output:

```
Project version: 0.6.0-rc.0
CLI version:     0.6.0-rc.0
Latest on npm:   0.5.19

Scanning for changes...
  Unchanged files (will skip):
    ... and 185 more
  User data (preserved):
    .trellis/workspace/, .trellis/tasks/, .trellis/spec/, .trellis/.developer/

✓ Already up to date!
```

No new file writes, no migrations scheduled.

## Summary

| Check | Result |
|---|---|
| init@0.5.19 land at version 0.5.19 | PASS |
| `--migrate --dry-run` reports breaking-change banner, no writes | PASS |
| `--migrate --force` lands at 0.6.0-rc.0 | PASS |
| 4 bundled skills × 3 active platform roots | PASS (12/12) |
| Typoed `trellis-spec-bootstarp` only inside `.backup-*/` | PASS |
| `.trellis/agents/check.md` + `implement.md` shipped | PASS |
| `trellis-meta` SKILL.md = 85 lines, v0.6 preamble | PASS |
| Second plain `update` reports "Already up to date!" | PASS |

**Verdict:** READY TO PROMOTE. Dogfood replay matches the GA expectation: clean migration from 0.5.19 → 0.6.0-rc.0, no orphans in active tree, bundled-skill auto-dispatch deploys all four skills across Claude / Cursor / Codex-via-`.agents/`, channel-workflow runtime agents present, idempotent second pass.
