---
name: omp-flow-finish
description: Use when accepted omp-flow work has current linked independent Review and is ready for integration verification, Wiki harvest, commit checkpoint, archive, and Sleep Dreaming.
---

# OMP-Flow Finish

## Preconditions

- Complete the reviews required by the selected Workflow and acceptance contract. Full Delivery
  requires a current linked independent Review for every accepted work Concept; Lite follows its
  documented review criteria. Preserve any stricter project or user requirement.
- No accepted requirement or integration risk remains unverified.
- The worktree and task artifacts identify the complete change set.

## Procedure

1. Run the verification required by the selected Workflow and work/Design. Preserve exact commands and results.
2. Compare the result against the work's acceptance criteria and applicable interfaces, migrations, docs, and compatibility requirements.
3. Resolve failures through the owning work/design Concept and repeat independent review or the
   applicable gate. Do not hide failures with warning-only fallbacks.
4. Review accepted decisions, repeated patterns, and confirmed findings for immediate durable value.
   Use the native `omp-flow-wiki` Skill only when the evidence already supports promotion; do not
   invent knowledge to satisfy Finish. Update the Task or Wiki index only when this work adds or
   changes a discoverable link; do not traverse every leaf or maintain hash/graph closure. When
   durable knowledge (`specs/`, `architecture/`, `knowhow/`, `philosophy/`, or a custom Wiki domain)
   changes or is promoted, enrich the existing Concept in place with `type`, `title`, `description`,
   and `tags`, then run `python3 -X utf8 .omp-flow/scripts/omp_flow.py index` before creating the
   Git checkpoint. Use `omp-flow-adr` to extract the Task's decisions as records, and present only
   the records that need human confirmation. Knowledge confirmed here may carry `status: "stable"`
   or `"accepted"`; it lands in Commit 1, so Sleep later treats it as pre-existing trusted Wiki.
5. **Commit 1 — Task checkpoint.** Inspect final diff and repository status. Commit the product
   change, the Bundle's final state, and the Wiki/ADR changes confirmed in Step 4 before Archive so
   the Task Bundle has a reproducible source commit/tree.
6. **Commit 2 — Archive move.** Archive the Bundle with `task archive <task>` only after completion
   is real and no runtime operation is active. Commit the archive move and
   `.omp-flow/tasks/index.md` alone (`chore(tasks): archive <task>`). Inspect the returned
   `sleepSource`; never reconstruct one from the archive path.
7. **Commit 3 — Dreaming consolidation.** When `sleepSource.ready` is true:
   a. Record a `git status --porcelain -uall` snapshot.
   b. Run `sleep start --source <receipt> --actor-id <native-id>`. The `ompFlowSleep` v2 first line
      is not an `ompFlowDispatch` v1 assignment, so do not dispatch it to the `executor`,
      `reviewer`, `researcher`, `architect`, or `qbd-auditor` role cards (the `omp-flow-*` agents):
      their startup gate rejects it. Load the native `omp-flow-sleep` Skill in this Finish session,
      or give it to a host general-purpose sub-agent that has no role-card gate, and forward its
      complete assignment unchanged as the sole native assignment input. Normal `sleep start`
      delivery is primary. If that delivery is lost or visibly truncated while its active receipt is
      known, recover only by capturing the complete `sleep show <receipt>` subprocess/API stdout
      through successful process completion, parsing all captured stdout as JSON into the show run
      mapping, requiring string `run.assignment`, and forwarding that decoded string unchanged as
      the sole native assignment input, including its trailing LF. Rendered Bash/terminal output is
      diagnostic only: never copy or parse it, add a prefix or suffix, reconstruct or reserialize
      the assignment, fall back to `sleep list`, or issue a duplicate `sleep start`. A nonzero exit,
      incomplete capture, invalid JSON, or missing or non-string `run.assignment` is delivery
      failure and must stop before native dispatch.
   c. After `sleep finish`, run `git status --porcelain -uall` again and compare it with the
      snapshot. If any file outside `.omp-flow/wiki/` and `.omp-flow/sleep/runs/` was added,
      modified, or deleted, stop: do not create Commit 3, and report the out-of-bounds change.
   d. Otherwise commit only `.omp-flow/wiki/` and `.omp-flow/sleep/runs/` as Commit 3
      (`chore(wiki): dream <task>`), so one `git revert` undoes the Dreaming run. A run with zero
      `--wiki` outputs is valid and still commits its receipt.
8. When the source is not ready, report its exact reason instead of asking the user to operate Sleep
   manually or manufacturing a checkpoint.

## Final Handoff

Report behavior delivered, important decisions, verification results, archived task path, commit
identities for the three commits when created, the Dreaming commit SHA that `git revert` undoes,
the Sleep run `wikiOutputs` (possibly empty) or the exact unavailable reason, and remaining
non-blocking risks.

## Red Flags

- Do not archive because all implementers returned DONE.
- Do not claim tests passed without fresh output.
- Do not invent Wiki knowledge to satisfy a checklist.
- Do not dispatch an `ompFlowSleep` assignment to an `ompFlowDispatch` role card.
- Do not create the Dreaming commit while a file outside `.omp-flow/wiki/` or
  `.omp-flow/sleep/runs/` changed.
- Do not discard unrelated user changes while preparing a commit.
