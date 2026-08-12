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
4. Review accepted decisions, repeated patterns, and confirmed findings for immediate durable value.
   Use the native `omp-flow-wiki` Skill only when the evidence already supports promotion; do not
   invent knowledge to satisfy Finish.
5. Inspect final diff and repository status. Create the requested Git checkpoint before Archive so
   the Task Bundle has a reproducible source commit/tree.
6. Archive the Bundle only after completion is real and no runtime operation is active. Inspect the
   returned `sleepSource`; never reconstruct one from the archive path.
7. When `sleepSource.ready` is true, run `sleep start --source <receipt> --actor-id <native-id>`,
   load the native `omp-flow-sleep` Skill, and forward its complete assignment unchanged as the sole
   native assignment input. Normal `sleep start` delivery is primary. If that delivery is lost or
   visibly truncated while its active receipt is known, recover only by capturing the complete
   `sleep show <receipt>` subprocess/API stdout through successful process completion, parsing all
   captured stdout as JSON into the show run mapping, requiring string `run.assignment`, and
   forwarding that decoded string unchanged as the sole native assignment input, including its
   trailing LF. Rendered Bash/terminal output is diagnostic only: never copy or parse it, add a
   prefix or suffix, reconstruct or reserialize the assignment, fall back to `sleep list`, or issue
   a duplicate `sleep start`. A nonzero exit, incomplete capture, invalid JSON, or missing or
   non-string `run.assignment` is delivery failure and must stop before native dispatch. Complete
   the Sleep run before final handoff; zero Candidates is valid.
8. When the source is not ready, report its exact reason instead of asking the user to operate Sleep
   manually or manufacturing a checkpoint. Sleep Candidate review and Wiki promotion remain
   separate work after the run.

## Final Handoff

Report behavior delivered, important decisions, verification results, archived task path, commit
identity when created, Sleep run/Candidate outputs or the exact unavailable reason, and remaining
non-blocking risks.

## Red Flags

- Do not archive because all implementers returned DONE.
- Do not claim tests passed without fresh output.
- Do not invent Wiki knowledge to satisfy a checklist.
- Do not discard unrelated user changes while preparing a commit.
