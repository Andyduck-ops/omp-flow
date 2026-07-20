# Internal Benchmark Harness (Trellis vs Vanilla)

> **Internal-only.** Harness, prompts, transcripts, results, and reports live under `tmp/benchmark/` (gitignored). No public blog, no docs-site post, no GitHub artifacts. This task's planning artifacts (this PRD, design.md, implement.md) stay tracked by Trellis but the benchmark code/results never reach git or npm.

## Goal

Produce **pre-registered, reproducible** head-to-head benchmarks proving (or disproving) that Trellis-equipped AI coding agents outperform vanilla Claude Code / Codex on real Trellis-style work, used **internally** to drive improvement priorities — not as marketing.

## Why now

We need real signal on where Trellis wins, where it ties, and where it loses, so the next quarter of work targets the gaps that actually matter. An honest internal benchmark is the cheapest way to avoid "feels good" capability claims.

## Scope (v1)

**In scope**
- Pre-registered evaluation protocol committed to `tmp/benchmark/PROTOCOL.md` *before* any scored runs.
- Internal harness under `tmp/benchmark/` (gitignored), one-command reproduction from this machine.
- 3 arms × 3–4 commits × ≥5 runs each.
- Internal report including ties and losses, kept in `tmp/benchmark/report/`.
- Followups list piped back as new Trellis tasks where wins or losses are actionable.

**Out of scope (explicit)**
- Public blog / docs-site / npm README / GitHub post — anything user-facing.
- Anything that touches `git add` (entire `tmp/` is gitignored; verify).
- Multi-agent / channel benchmarks (too many failure modes for v1).
- `trellis mem` recall benchmark (synthetic history, easy to game).
- "Time to bootstrap N platforms" benchmark.
- Comparing against 10 other frameworks. One peer max (Cline or Aider), deferred to v2.
- Benchmarking all 8 candidate commits (depth > breadth).
- Negative-control commits — drop for v1 since there's no public-credibility argument; revisit if results are surprising.

## Arms

| Arm | Config |
|-----|--------|
| **A — bare** | Latest stable Claude Code, no CLAUDE.md, no skills, no hooks, no MCP beyond stock. |
| **B — docs-only** | Same as A + a single hand-written CLAUDE.md capturing Trellis-equivalent intent (isolates "framework" from "good docs"). |
| **C — Trellis** | `trellis init` on the same repo state, full skill / hook / spec / sub-agent stack. |

Both A and B may use the `Task` sub-agent; C may use `trellis-implement` / `trellis-check`. Same underlying model + version + temperature across arms.

## Candidate commits

User pre-approved top-4 (research rank) for v1:

1. `1d50a01b` — feat: add Reasonix platform support (canonical "add a new platform")
2. `6abde659` — fix(workflow): namespace codex dispatch + default to inline (deep Trellis-internal)
3. `bbdd0f09` — fix(opencode): detect Windows shell dialect (small focused, contract-driven)
4. `04af444c` — fix(pi): isolate npm:pi-subagents via project-level settings (spec-driven)

Default v1 plan: run all 4. May cut to 3 if cost forecasts blow budget; document the cut + reason in PROTOCOL.md.

## Grading rubric (per run)

Weighted, locked in PROTOCOL.md before runs:

| Dimension | Weight | How scored |
|-----------|--------|------------|
| Correctness | 50% | Existing repo tests for that commit pass on the agent's diff. |
| Test discipline | 20% | New / updated tests written by the agent. |
| Spec compliance | 15% | Cites + respects `.trellis/spec/` contracts (judge rubric + spot-check). |
| Scope discipline | 10% | No unrelated edits; diff size within 1.5× reference. |
| Token economy | 5% | Total input+output tokens (report; don't penalize unless quality is equal). |

Judging: LLM judge with published rubric + human spot-check on 20% of runs.

## Acceptance Criteria

- [ ] `tmp/` confirmed gitignored before any benchmark file is written; CI doesn't have to verify because nothing leaves `tmp/`.
- [ ] `tmp/benchmark/PROTOCOL.md` committed-in-tmp before first scored run (treated as frozen via hash recorded in results, even though not under git).
- [ ] Each candidate commit packaged in a frozen state (Docker image or pristine `git worktree`) at the parent SHA with `.git` history truncated to prevent message-leakage.
- [ ] Task prompt derived from PR body re-written by a third party (or scrubbed issue text) — **not** the commit message.
- [ ] ≥3 commits scored; each commit × each arm runs ≥5 times; results report median + IQR + win-rate per arm.
- [ ] Token / wall-clock / USD-cost per run recorded.
- [ ] Internal report (`tmp/benchmark/report/findings.md`) names ties and losses verbatim, with 1 paragraph each on root cause.
- [ ] Actionable follow-ups (Trellis improvements identified by losses/ties) filed as new Trellis tasks.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| `tmp/` accidentally committed | First step: re-confirm gitignore; never run `git add -f`; safe_commit guard already exists. |
| Single-run variance | n ≥ 5 per (commit, arm); report variance not point estimates. |
| Author-judging bias | LLM judge with published rubric + human spot-check 20%. |
| Commit-message prompt leakage | Frozen worktree at parent SHA, prompts derived from rewritten PR text. |
| GitNexus / index reflects post-fix state | Rebuild index at parent SHA inside the frozen harness. |
| Token-spend confound | Report tokens; don't penalize C for higher spend unless quality is equal. |
| Self-deception ("we won") | Pre-commit to filing every loss/tie as a follow-up task before reading aggregate results. |

## Open questions (pre-implementation)

- [ ] Judge model — Opus 4.8 vs GPT-5? (must NOT equal arms' models)
- [ ] USD budget cap per cell (per run)?
- [ ] Docker isolation vs simpler `git worktree` per cell?

## Dependencies

- `architecture-diagram` should land first so the harness's task briefs can reference shared vocabulary.
- No `community-governance` dependency (benchmark is internal; nothing flows back to public artifacts).
