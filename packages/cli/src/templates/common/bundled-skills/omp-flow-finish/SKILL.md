---
name: omp-flow-finish
description: Complete integration verification, deliberate knowledge harvest, commit, and archive for omp-flow. Use in phase=finish or completed after every exact-topology row has current independent PASS Evidence.
---

# OMP-Flow Finish

## Preconditions

- Every row is `completed` with current Reviewer Evidence.
- No accepted requirement or integration risk remains unverified.
- The worktree and task artifacts identify the complete change set.

## Procedure

1. Run integration build, tests, lint/type checks, and product verification required by the Design. Preserve exact commands and results.
2. Compare the integrated result against PRD acceptance criteria, cross-row interfaces, migrations, docs, and compatibility requirements.
3. Resolve failures through the owning row or an explicit new gated row. Do not hide failures with warning-only fallbacks.
4. Review accepted decisions, repeated patterns, and confirmed findings for durable value.
5. Promote only evidenced, reusable knowledge into specs/knowhow. If nothing qualifies, state that no harvest was needed.
6. Inspect final diff and repository status. Commit through the Harness-native Git workflow when requested.
7. Run `omp-flow task finish`, then `omp-flow task archive` only after completion is real.

## Final Handoff

Report behavior delivered, important decisions, verification results, archived task path, commit identity when created, and remaining non-blocking risks.

## Red Flags

- Do not archive because all implementers returned DONE.
- Do not claim tests passed without fresh output.
- Do not invent knowhow to satisfy a checklist.
- Do not discard unrelated user changes while preparing a commit.
