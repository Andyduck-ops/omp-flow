# Enforce jsonl context gate for sub-agent planning (#292)

## Goal

Close GitHub issue #292 by making implement.jsonl/check.jsonl curation an explicit planning/start gate for sub-agent dispatch platforms instead of optional wording that agents can skip.

## Requirements

- Update workflow wording so sub-agent-dispatch platforms treat `implement.jsonl` and `check.jsonl` curation as a required Phase 1 gate before `task.py start`.
- Make the seed-row distinction explicit everywhere the planning/start gate is described: a JSONL file with only the `_example` seed row is not ready.
- Remove or rewrite wording that says seed-only manifests are acceptable at activation time.
- Update the brainstorm quality bar so complex sub-agent-dispatch tasks are not considered planning-complete until both manifests contain real entries, unless the workflow is explicitly inline.
- Keep consumer tolerance intact: hooks and preludes may still skip seed rows and fall back gracefully at runtime, but planning guidance must not present that tolerance as permission to skip curation.

## Acceptance Criteria

- [x] `.trellis/workflow.md` and the packaged workflow template both require real curated JSONL entries for sub-agent-dispatch planning.
- [x] Phase 1.4 and Phase 1.5 no longer describe JSONL curation as merely optional or "when needed" for sub-agent-dispatch tasks.
- [x] The brainstorm skill source and local dogfood copy include the JSONL readiness requirement in their quality bar.
- [x] GitHub issue #292 can be closed by the resulting PR.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
- Marketplace workflow sync PR: https://github.com/mindfold-ai/marketplace/pull/4
