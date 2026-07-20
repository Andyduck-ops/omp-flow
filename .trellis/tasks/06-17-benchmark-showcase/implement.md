# Implement — Internal Benchmark Harness

Ordered, with verification gates. Stop on red. **All harness state lives in `tmp/benchmark/` (gitignored).**

## Phase 0 — Lock the protocol (no runs yet)

- [ ] 0.0 Verify `tmp/` is gitignored: `grep -nE '^tmp/?$' .gitignore` returns a hit. (Already confirmed at PRD time.)
- [ ] 0.1 User confirms judge model (e.g. claude-opus-4-8 if arms are sonnet/haiku, or GPT-5 if arms are claude-only).
- [ ] 0.2 User confirms USD budget cap per cell.
- [ ] 0.3 User confirms Docker vs `git worktree` isolation.
- [ ] 0.4 Write `tmp/benchmark/PROTOCOL.md` (full): commit list, arms, rubric, n, seeds, judge protocol, scrub rules.
- [ ] 0.5 Record PROTOCOL.md sha256 in results metadata; further changes require a versioned `PROTOCOL-v2.md` next to it — never silent edits.
- **Gate**: PROTOCOL is frozen by hash.

## Phase 1 — Harness scaffolding

- [ ] 1.1 Pick isolation approach per 0.3:
  - If Docker: `tmp/benchmark/docker/base.Dockerfile` (node 20 + python 3.12 + pnpm + claude-cli + codex-cli + gitnexus + jq + git) and per-commit Dockerfiles anchored at parent SHA with `.git` truncated.
  - If worktrees: `tmp/benchmark/worktrees/<commit>/` snapshots, repo cloned to a fresh path with `.git` truncated.
- [ ] 1.2 `tmp/benchmark/arms/A-bare/`, `B-docs-only/`, `C-trellis/`: each contains a `setup.sh` preparing the arm.
- [ ] 1.3 `tmp/benchmark/runner/run.ts`: spawn isolated cell, run agent against task brief, capture token meters + transcript + final diff.
- [ ] 1.4 `tmp/benchmark/runner/judge.ts`: call judge model with rubric, return structured score.
- [ ] 1.5 `tmp/benchmark/runner/collect.ts`: walk `results/<date>/`, emit summary CSV + Markdown.
- [ ] 1.6 `tmp/benchmark/runner/scrub.ts`: util to strip commit messages / PR titles / related test names from any text fed to agents.
- **Verify**: dry-run on one commit × arm A × seed=0 returns expected JSON shape.

## Phase 2 — Prompt authoring (one pass per commit)

For each commit:
- [ ] 2.x.1 Third-party author drafts `prompts/<commit>.task.md` from rewritten PR body, blind to the actual fix.
- [ ] 2.x.2 Author writes `prompts/<commit>.rubric.md`: files-must-touch, tests-must-pass, contracts-must-respect, scope-cap.
- [ ] 2.x.3 Sign-off recorded in PROTOCOL.md § Prompts (with date).
- **Verify**: control reviewer reads `<commit>.task.md` and cannot reverse-engineer the fix.

## Phase 3 — Pilot run (n=1 per cell)

- [ ] 3.1 One commit × 3 arms × seed=0 → smoke test pipeline.
- [ ] 3.2 Inspect logs for: token meter accuracy, transcript completeness, judge structured output, no error noise.
- [ ] 3.3 Patch any harness issues, re-pin images / worktree state, re-record PROTOCOL hash if rubric changed.
- **Verify**: end-to-end pilot completes; `results/pilot/` summary looks sane.

## Phase 4 — Full run

- [ ] 4.1 Schedule: 4 commits × 3 arms × 5 seeds = 60 cells. Estimate cost; confirm budget.
- [ ] 4.2 Run via `pnpm bench run-batch`. Failures get logged + retried at most once with logged reason.
- [ ] 4.3 Judge pass: `pnpm bench judge`.
- [ ] 4.4 Human spot-check: pick 12 random cells (20%), human reviewer scores; compute Cohen's κ vs LLM judge.
- **Verify**: κ ≥ 0.6; if lower, investigate judge drift before trusting the headline numbers.

## Phase 5 — Internal report + follow-ups

- [ ] 5.1 `tmp/benchmark/report/findings.md`: per-arm × per-commit table, median + IQR + win-rate. Name losses + ties verbatim.
- [ ] 5.2 For each loss / tie / surprise: 1-paragraph root-cause analysis.
- [ ] 5.3 **Convert actionable losses into new Trellis tasks** via `task.py create`. Example: if Arm C loses on `04af444c`, file `task.py create "Improve pi platform-integration spec for npm:* keys"` with a link back to the relevant `results/.../*.jsonl` transcript inside `tmp/benchmark/`.
- [ ] 5.4 (Optional) anonymized summary numbers shared with team via Discussion (no transcripts).
- **Verify**: every loss/tie has a follow-up task OR an explicit "won't fix — known limitation" note in findings.md.

## Phase 6 — Wrap

- [ ] 6.1 `pnpm bench reproduce` works from a clean local checkout (you re-run all 60 cells locally and get the same headline numbers).
- [ ] 6.2 Confirm `git status` shows zero benchmark files staged or untracked-but-not-ignored.
- [ ] 6.3 task.py finish + archive (planning artifacts only; benchmark state stays in `tmp/`).

## Validation commands

```bash
grep -nE '^tmp/?$' .gitignore
git check-ignore tmp/benchmark/PROTOCOL.md  # should print the path → confirmed ignored
git status --porcelain tmp/ | head           # should be empty
pnpm bench run --commit 1d50a01b --arm C --seed 0
pnpm bench judge --results tmp/benchmark/results/2026-06-20/
pnpm bench collect --results tmp/benchmark/results/2026-06-20/ --out tmp/benchmark/report/summary.csv
pnpm bench reproduce tmp/benchmark/results/2026-06-20/
```

## Rollback points

- After Phase 1: if Docker is too heavy, drop to `git worktree` per cell; document in PROTOCOL.md.
- After Phase 3 pilot: if any arm cannot complete tasks at all → adjust task briefs (not rubric).
- After Phase 4: if spot-check disagreement is high → re-judge with rubric clarifications; record both judge passes.
- Any phase: if scope blows up → cut to 3 commits and 3 seeds before cutting rigor.

## Out-of-scope reminder

If any of these come up during implementation, push back and file as new tasks:
- Anything that leaves `tmp/` (e.g. committing harness or report to git).
- Public blog post / docs-site / npm README content.
- Negative-control commits (revisit in v2 if internal results suggest cherry-picking concerns).
- Channel multi-agent benchmarks.
- Comparing against Cline / Aider (v2 deferred).
