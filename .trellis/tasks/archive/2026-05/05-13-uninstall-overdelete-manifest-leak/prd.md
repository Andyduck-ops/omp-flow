# fix: trellis init over-hashes user files in managed dirs, uninstall wipes user data

## Goal

`trellis uninstall` deletes user-owned files that live under platform-managed dirs (`.codex/sessions/*`, `.claude/projects/*`, `.opencode/*`, pre-existing `AGENTS.md`, etc.). Root cause is upstream: `initializeHashes()` at init time scans the disk for "what trellis manages" by walking dirs / using template-name allowlists, instead of recording "what trellis actually wrote in this init run". uninstall then faithfully unlinks every manifest entry.

Fix: make the manifest track **only files trellis actually wrote during init** (excluding skip-existing and decline-overwrite cases), and add a homedir guard so `trellis init` / `trellis uninstall` refuse to run in `$HOME` (where collisions with platform runtime data are most catastrophic).

## Reproduction

```bash
mkdir -p /tmp/r/.codex/sessions/2026
echo "user-data" > /tmp/r/.codex/sessions/2026/x.jsonl
cd /tmp/r && trellis init --codex --yes
trellis uninstall --yes
ls /tmp/r/.codex/sessions   # → No such file or directory
```

### Variant: pre-existing AGENTS.md (skip-existing case)

```bash
mkdir -p /tmp/r2 && echo "my own AGENTS.md" > /tmp/r2/AGENTS.md
cd /tmp/r2 && trellis init --codex --skip-existing
cat /tmp/r2/AGENTS.md   # unchanged — init correctly skipped
trellis uninstall --yes
ls /tmp/r2/AGENTS.md    # GONE — user's original file deleted
```

Same root cause class: `initializeHashes` puts `AGENTS.md` into manifest because the path exists on disk after init, even though trellis didn't write it this run.

### User reports

- GitHub Issue #221 comment by @darknoll (2026-05-13) — `.codex/sessions/` case.
- GitHub PR #271 comment by @kkz-01 — AGENTS.md skip-existing case.

## Root Cause

`packages/cli/src/utils/template-hash.ts:343` `initializeHashes(cwd)`:

```typescript
const TEMPLATE_DIRS = ALL_MANAGED_DIRS;  // [".trellis",".claude",".codex",...]
for (const dir of TEMPLATE_DIRS) {
  const files = collectFiles(cwd, dir);  // recursive fs.readdirSync
  for (const relativePath of files) {
    hashes[relativePath] = computeHash(content);  // hashes EVERY file
  }
}
```

`collectFiles` is a blind recursive walk. `EXCLUDE_FROM_HASH` only filters a handful of patterns (`workspace/`, `tasks/`, `spec/`, `.template-hashes.json`, …). It does NOT exclude `.codex/sessions/`, `.codex/history/`, `.claude/projects/`, user-added `.codex/skills/<custom>/` etc.

Manifest after `trellis init --codex` with pre-existing user data:

```
.codex/agents/trellis-check.toml          ← trellis-written ✓
.codex/agents/trellis-implement.toml      ← trellis-written ✓
.codex/config.toml                        ← trellis-written ✓
.codex/hooks/inject-workflow-state.py     ← trellis-written ✓
.codex/hooks.json                         ← trellis-written ✓
.codex/sessions/2026/x.jsonl              ← USER FILE — bug
.codex/skills/user-s/note.md              ← USER FILE — bug
```

`uninstall.ts:executePlan` step 2 calls `fs.unlinkSync` on every manifest entry → user data gone.

## Blast Radius

Any user who ran `trellis init` AFTER they already had:

- `.codex/sessions/` — Codex chat history JSONL (darknoll's case)
- `.codex/history/` — Codex prompt history
- `.claude/projects/<sanitized-cwd>/*.jsonl` — Claude Code conversation history (catastrophic — every Claude Code user)
- `.opencode/` — opencode runtime caches, DBs, plugins
- Custom `.codex/skills/<name>/`, `.claude/agents/<name>/` etc. — user-added platform assets

Worst case: user runs `trellis init` in `$HOME` (where these runtime dirs live globally) → ALL Codex/Claude session history gets hashed → later `trellis uninstall` wipes everything.

## Requirements

### R1 — Manifest tracks only files trellis actually wrote in this init run

Scope is narrowed to the two paths that actually cause user data loss on uninstall:

| File class | Currently hashed how | Fix |
|---|---|---|
| Platform dirs (`.codex/`, `.claude/`, `.opencode/`, `.gemini/`, ...) | `collectFiles` walks the whole dir → hashes every file (incl. `.codex/sessions/*`, `.claude/projects/*`, user-added skills) | Use `PLATFORM_FUNCTIONS[id].collectTemplates()` enumeration as source of truth. Hash only paths whose write **actually happened** this init run (skip-existing returns false → not hashed). |
| Root-level files (`AGENTS.md`) | Hashed if the file exists on disk after init, regardless of who wrote it | Hash only if init's `writeFile` returned "wrote" (not "skipped"). |
| `.trellis/` files (`workflow.md`, `scripts/`, `config.yaml`, `spec/`, ...) | `collectFiles` walks `.trellis/` with `EXCLUDE_FROM_HASH` filtering out `workspace/` / `tasks/` / `spec/` | **NOT TOUCHED.** `trellis uninstall` step 3 does `fs.rmSync('.trellis/', { recursive: true, force: true })` regardless of manifest content. Whether `.trellis/` files are in manifest is irrelevant to the uninstall data-loss bug. Refactoring this would be for `trellis update` 3-way-merge accuracy — orthogonal concern, out of scope for this task. |

Implementation shape: configurators that walk-and-write platform dirs return `Set<string>` of paths they actually wrote. `initializeHashes` consumes that set instead of re-walking the disk.

```typescript
// Per-platform configure() now returns Set<string> of paths actually written.
async function configureClaudeCode(cwd, mode): Promise<Set<string>> {
  const written = new Set<string>();
  for (const [k, v] of collectClaudeTemplates()) {
    const didWrite = await writeFile(path.join(cwd, k), v, { mode });
    if (didWrite) written.add(k);  // writeFile returns false on skip-existing
  }
  return written;
}

// init() collects union of written paths from all configurators
const platformWritten = new Set<string>();
for (const id of configuredPlatforms) {
  for (const p of await PLATFORM_FUNCTIONS[id].configure(cwd, mode)) {
    platformWritten.add(p);
  }
}
// Root file (AGENTS.md): track only if actually written
const rootWritten = new Set<string>();
if (await writeRootAgentsMd(cwd, mode)) rootWritten.add('AGENTS.md');

initializeHashes(cwd, {
  platformPaths: platformWritten,
  rootPaths: rootWritten,
  trellisDirWalk: true,  // keep existing walk behavior for .trellis/
});
```

The manifest must NOT include:

- Any platform-dir file not in any `collectTemplates()` enumeration (fixes darknoll's `.codex/sessions/`).
- Any platform-dir file in the enumeration but skipped this run (skip-existing, user-declined-overwrite).
- `AGENTS.md` if init didn't actually write it this run (fixes kkz-01's pre-existing `AGENTS.md`).

### R2 — Homedir guard for `trellis init` and `trellis uninstall`

Refuse to run if cwd is exactly the user's home directory. Compare via `fs.realpathSync.native()` on both sides so symlinks / `..` / case differences (Windows) don't confuse the check. Subdirectories of home (`~/Documents/projects/foo/`) are NOT blocked — only exact-home match.

```typescript
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';

export function isCwdHomedir(): boolean {
  try {
    let cwd = realpathSync.native(process.cwd());
    let home = realpathSync.native(homedir());
    if (process.platform === 'win32') {
      cwd = cwd.toLowerCase();
      home = home.toLowerCase();
    }
    return cwd === home;
  } catch {
    return false;  // permissive on lookup failure — don't crash init for safety check
  }
}
```

Notes:

- `realpathSync.native` (not plain `realpathSync`) — uses OS API, preserves filesystem-canonical case on Windows.
- Try/catch defaults to permissive: if realpath fails (broken symlink, permission error), allow the operation. Better to occasionally not block than to crash on a sanity check.
- Bypass via env var `TRELLIS_ALLOW_HOMEDIR=1` for the rare legitimate case.

Error message:

```
✗ Refusing to run `trellis <init|uninstall>` in your home directory.

Trellis manages platform config dirs like .claude/, .codex/, .opencode/, which
in your home directory also contain runtime data from those CLIs (chat history,
session JSONLs, caches). Running here can wipe that data.

Run trellis from your project directory instead. If you really want to run in
$HOME, set TRELLIS_ALLOW_HOMEDIR=1.
```

### R3 — Self-heal poisoned manifests in already-installed projects

Existing users who ran `trellis init` on a buggy version have `.template-hashes.json` already polluted with user-owned paths. R1 only prevents NEW pollution — doesn't clean existing ones. R3 prunes the poison at two safe entry points:

(a) **On `trellis update`** — before classifying migrations, scan manifest. Any key not present in the union of `collectTemplates()` outputs for currently-configured platforms is an orphan → silently delete from manifest. No file operations, just `.template-hashes.json` rewrite.

(b) **On `trellis uninstall`** — same prune step inserted before plan classification (i.e. BEFORE `buildPlan` enumerates `plan.deletions`). This single step makes the bug self-correct even for users who upgrade-then-immediately-uninstall without ever running `update`.

Same prune logic in both places (extracted helper). Silent operation; orphan keys are logged at debug level only — surfacing every poisoned entry in stderr would alarm users who don't need to know.

```typescript
// Shared helper used by both update and uninstall
export function pruneOrphanManifestKeys(
  cwd: string,
  configuredPlatforms: AITool[],
): { pruned: string[] } {
  const hashes = loadHashes(cwd);
  const knownKeys = new Set<string>();
  for (const id of configuredPlatforms) {
    for (const k of PLATFORM_FUNCTIONS[id].collectTemplates().keys()) {
      knownKeys.add(k);
    }
  }
  knownKeys.add('AGENTS.md');
  // .trellis/ keys: keep all manifest entries under .trellis/ (existing walk
  // behavior is preserved for update accuracy; uninstall nukes the dir anyway).

  const pruned: string[] = [];
  const kept: TemplateHashes = {};
  for (const [k, v] of Object.entries(hashes)) {
    if (k.startsWith('.trellis/') || knownKeys.has(k)) {
      kept[k] = v;
    } else {
      pruned.push(k);
    }
  }
  if (pruned.length > 0) {
    saveHashes(cwd, kept);
  }
  return { pruned };
}
```

(Out of scope: warning if orphan entries don't match a template hash — no template to compare against.)

### R4 — Tests

- Integration test: pre-populate `.codex/sessions/` and `.codex/history/`, run init+uninstall, assert sessions+history preserved (darknoll case)
- Integration test: pre-populate `.claude/projects/<dir>/*.jsonl`, run init+uninstall, assert preserved
- Integration test: pre-existing `AGENTS.md`, run `trellis init --skip-existing` then `trellis uninstall --yes`, assert `AGENTS.md` survives (kkz-01 case)
- Integration test: same as above but user-declines-overwrite prompt path (interactive equivalent)
- Integration test: `cwd === $HOME` → init / uninstall both exit with the guard message; `TRELLIS_ALLOW_HOMEDIR=1` bypasses
- Integration test: pre-poisoned manifest (with `.codex/sessions/foo.jsonl` entry) → `trellis update` silently prunes it; subsequent `trellis uninstall` does not touch `.codex/sessions/foo.jsonl`
- Integration test: pre-poisoned manifest → `trellis uninstall` (no `update` in between) → prune runs at uninstall time, user file survives
- Unit test: `initializeHashes` output matches union of `collectTemplates()` outputs of configured platforms (no extra keys)
- Unit test: when configurator returns subset of `collectTemplates()` paths (skip-existing), only that subset is hashed
- Unit test: `pruneOrphanManifestKeys` keeps `.trellis/` entries and `collectTemplates()` entries; prunes everything else; rewrites manifest only when pruned.length > 0
- Unit test: `isCwdHomedir` returns true for symlinked home path; false for home subdirectory; case-insensitive on Windows (platform mock)

## Acceptance Criteria

- [ ] After `trellis init` in a dir with pre-existing user files in `.codex/`, `.claude/`, `.opencode/`, the manifest contains ONLY trellis-written paths.
- [ ] After `trellis init --skip-existing` in a dir with pre-existing `AGENTS.md`, manifest does NOT include `AGENTS.md`; subsequent `trellis uninstall` leaves it alone.
- [ ] Same for user-declines-overwrite during interactive prompt path.
- [ ] After `trellis uninstall`, no user-owned file under any platform dir is removed (only files trellis wrote at init/update time).
- [ ] `trellis init` and `trellis uninstall` refuse to run in `$HOME` without `TRELLIS_ALLOW_HOMEDIR=1`.
- [ ] On `trellis update`, orphan manifest entries (in manifest but not in current `collectTemplates()` enumeration) are silently pruned.
- [ ] All new tests above pass.
- [ ] No regression: existing tests pass, `trellis init` / `update` / `uninstall` still produce identical disk state for clean repos.

## Definition of Done

- Tests added (unit + integration)
- Lint / typecheck / `pnpm test` green
- Manual repro on macOS: pre-existing `.codex/sessions/` survives full init+uninstall cycle
- Changelog entry for next patch release (0.5.15 / 0.6.0-beta.x)
- Reply to GitHub Issue #221 with fix version

## Out of Scope

- Auditing other commands (`update`, `migrate`) for similar over-hashing — current evidence is init-only, but a quick audit during implementation is wise.
- Restoring data already deleted on users who hit the bug (not recoverable — git LFS / OS undelete is their only option).
- Rewriting `uninstall.ts` to verify each manifest path against `collectTemplates()` at uninstall time. R3 (prune on update) already handles the same goal one step earlier; layering both adds complexity without coverage gain.

## Technical Notes

### Files in play

- `packages/cli/src/utils/template-hash.ts` — `initializeHashes`, `collectFiles`, `EXCLUDE_FROM_HASH`, `TEMPLATE_DIRS`
- `packages/cli/src/configurators/index.ts` — `PLATFORM_FUNCTIONS[id].collectTemplates()`
- `packages/cli/src/configurators/opencode.ts` — `collectOpenCodeTemplates`
- `packages/cli/src/commands/init.ts:848,1770` — call sites for `initializeHashes`
- `packages/cli/src/commands/uninstall.ts` — homedir guard goes in `uninstall()`
- `packages/cli/src/commands/init.ts` — homedir guard goes in `init()`

### `.trellis/` is intentionally not refactored

`.trellis/` files keep the existing walk-based hashing. Rationale: `trellis uninstall` step 3 nukes `.trellis/` wholesale via `fs.rmSync(trellisDir, { recursive: true, force: true })`. Whether `.trellis/` files appear in manifest does not affect uninstall behavior. Refactoring `configureWorkflow` to enumerate-then-write would be a clean-architecture win for `trellis update` 3-way-merge accuracy, but it's a separate concern and not necessary to close this data-loss bug.

If `trellis update` accuracy on `.trellis/` files needs work later, file a separate task.

### Risk: pi platform separate code path

`configurePi` and `collectPiTemplates` already exist and look similar to opencode. Audit during implement to confirm they're self-consistent.

### Risk: writeFile return value

`writeFile` in `utils/file-writer.ts` may not currently return a "did write" boolean. If not, R1 needs to add that. Confirm during implement; if writeFile already returns a writeMode-aware value, reuse. Otherwise extend.

## Reference

- GitHub Issue #221 (closed but with active comments) — @darknoll's `.codex/sessions/` deletion report on 2026-05-13
- GitHub PR #271 review comment by @kkz-01 — pre-existing `AGENTS.md` deletion via skip-existing path
- Reproduction shell session: see local test output in this task's research/ (to be persisted)

## Coordination with PR #271

PR #271 (`fix(claudecode): 初始化Claudecode时使用CLAUDE.md`) is a separate concern — whether `trellis init --claude` should write `CLAUDE.md` instead of / in addition to `AGENTS.md`. That PR continues its own review. This task only addresses the **uninstall-deletes-user-AGENTS.md** symptom that surfaced in its comment thread, which is the same class of bug as darknoll's.
