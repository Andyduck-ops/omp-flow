---
name: omp-flow-finish
description: Complete integration verification, deliberate knowledge harvest, commit, and archive after accepted work has linked independent review.
---

# OMP-Flow Finish

## Preconditions

- Every accepted work Concept has a current linked independent Review Concept.
- No accepted requirement or integration risk remains unverified.
- The worktree and task artifacts identify the complete change set.

## Procedure

1. Run integration build, tests, lint/type checks, and product verification required by the Design. Preserve exact commands and results.
2. Compare the integrated result against PRD acceptance criteria, cross-row interfaces, migrations, docs, and compatibility requirements.
3. Resolve failures through the owning work/design Concept and repeat independent review or the
   applicable gate. Do not hide failures with warning-only fallbacks.
4. Review accepted decisions, repeated patterns, and confirmed findings for durable value.
5. Use the native `omp-flow-wiki` Skill to promote only evidenced, reusable knowledge. If nothing qualifies, state that no harvest was needed.
6. Inspect final diff and repository status. Commit through the Harness-native Git workflow when requested.
7. Archive the Bundle only after completion is real and no runtime operation is active.

## Final Handoff

Report behavior delivered, important decisions, verification results, archived task path, commit identity when created, and remaining non-blocking risks.

## Red Flags

- Do not archive because all implementers returned DONE.
- Do not claim tests passed without fresh output.
- Do not invent Wiki knowledge to satisfy a checklist.
- Do not discard unrelated user changes while preparing a commit.
