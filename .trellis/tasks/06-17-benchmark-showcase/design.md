# Design — Internal Benchmark Harness

> All paths below live under `tmp/benchmark/` — gitignored. Nothing in this design ever reaches `git add`.

## Architecture

```
tmp/benchmark/
├── PROTOCOL.md            # pre-registered protocol (frozen by content hash, recorded in results)
├── docker/                # OR worktrees/ if Docker is overkill (see tradeoffs)
│   ├── base.Dockerfile    # node + python + pnpm + claude-cli + codex-cli + gitnexus
│   └── per-commit/        # one image per benchmark commit, anchored at parent SHA
├── arms/
│   ├── A-bare/             # config + system prompt for vanilla arm
│   ├── B-docs-only/        # CLAUDE.md fixture mirroring Trellis intent
│   └── C-trellis/          # full trellis init
├── prompts/
│   ├── <commit>.task.md    # third-party-rewritten PR description → task brief
│   └── <commit>.rubric.md  # per-commit ground truth (files to touch, tests, contracts)
├── runner/
│   ├── run.ts              # one-arm-one-commit-one-seed execution
│   ├── judge.ts            # LLM judge (separate model) + rubric scoring
│   └── collect.ts          # aggregates n runs → median/IQR/win-rate
├── results/
│   └── <date>/             # raw transcripts + per-run scores + summary csv
└── report/
    └── findings.md         # internal report — names ties + losses, lists follow-up tasks
```

## Run contract (per execution)

Input → frozen Docker container with:
- Repo checked out at parent SHA (commit-message-leaking refs scrubbed)
- Selected arm's config applied (A/B/C)
- Task brief from `prompts/<commit>.task.md`
- Token + cost meter active

Output → JSON:
```
{
  "commit": "1d50a01b",
  "arm": "C",
  "seed": 3,
  "tokens": { "input": 12345, "output": 6789 },
  "wallclock_ms": 184000,
  "usd_cost": 0.42,
  "final_diff": "<patch>",
  "transcript_path": "results/2026-06-20/C-1d50a01b-3.jsonl",
  "tests_passing": 14,
  "tests_total": 15,
  "scope_diff_files": 9,
  "spec_citations": ["platform-integration.md#registry"]
}
```

## Judge contract

Separate model run by `runner/judge.ts`:
- Input: task brief, reference commit diff, agent's final diff, transcript summary
- Output: per-dimension scores (0–10) + weighted total + 1-paragraph rationale
- 20% of (commit, arm, seed) triples re-scored by a second judge model AND a human reviewer for drift detection

## Tradeoffs

| Decision | Picked | Alternative | Why |
|----------|--------|-------------|-----|
| Docker per commit | Yes | Single image + checkout | Eliminates network / dep-resolution variance across runs. |
| 3 arms not 2 | A+B+C | A+C only | Without B, critics dismiss results as "you just have better docs". |
| LLM judge + human spot-check | Hybrid | Pure auto / pure human | Cost-bounded but with drift detection. |
| n ≥ 5 per cell | Yes | n=1 (one-shot) | Single runs prove nothing on stochastic models. |
| 3–4 commits | Yes | All 8 | Depth > breadth for credibility. |
| Negative controls | Required | Skip | Without them, the report reads as marketing. |
| Benchmark in subtree | `benchmark/` | Separate repo | Keep harness + protocol close to code being measured; easier first-version. May extract to `mindfold/trellis-benchmark` once stable. |

## Data flow

1. Author writes `PROTOCOL.md` and rubric files; commit + freeze.
2. `docker/per-commit/<sha>.Dockerfile` build → image tagged `bench-<sha>`.
3. `pnpm bench run --commit <sha> --arm <A|B|C> --seed <N>` spins container, runs agent, captures transcript + diff + meters.
4. `pnpm bench judge --commit <sha>` runs judge over all transcripts in `results/<date>/`.
5. `pnpm bench collect` produces summary CSV + Markdown table.
6. Human spot-check pass on 20% sample updates `results/<date>/spot-check.md`.
7. Final report written into `report/methodology.md` and `report/showcase.md` linking architecture diagram.

## Reproduction

- One-command: `pnpm bench reproduce <results-dir>` re-runs every cell with the same seeds, **on this machine only** (nothing checked into CI; `tmp/` is gitignored).
- Drift watch is owner-run, not CI-run.

## Anti-bias measures

- All commit messages, PR titles, and existing related test names scrubbed from agent context.
- Prompts authored by someone who has NOT seen the reference fix.
- Random seed selection from a published seed list (e.g., `[1, 4, 9, 16, 25]`).
- All raw transcripts archived; community can re-judge.

## Dependencies

- Architecture diagram vocabulary (used in task briefs).
- Decision on judge model — must NOT equal arms' models.
- Decision on USD budget cap per run.
- Decision on Docker isolation vs lightweight `git worktree` per cell.

## Rollback / fail-soft

- If protocol turns out broken mid-run: stop, document in `results/<date>/RETRACTED.md`, restart with v2 protocol.
- If a single arm crashes: re-run that cell with logged reason; never silently drop.
- If a leak is discovered (commit message, future ref reachable from agent): mark affected commit `LEAKED`, exclude from headline metrics, keep in raw data, file a follow-up to harden scrubbing.
