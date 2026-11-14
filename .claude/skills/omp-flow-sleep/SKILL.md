---
name: omp-flow-sleep
description: Use when Finish or Main runs post-archive knowledge consolidation with an exact ompFlowSleep v2 descriptor to verify, distill, and maintain .omp-flow/wiki directly.
---

# OMP-Flow Sleep

Sleep is a single, lean Dreaming pass after a Task is archived: it checks what the Task taught
against the few Wiki Concepts it touches, writes new knowledge as `draft`, repairs targeted links,
and leaves a receipt. It runs in the current Finish session or a general-purpose host sub-agent;
it is not an `ompFlowDispatch` role assignment.

Use this Skill only with a complete assignment whose first non-blank line is an exact
`{"ompFlowSleep":{...}}` descriptor produced by `.omp-flow/scripts/omp_flow.py sleep start`.
Do not reconstruct, summarize, or guess a descriptor from an archived path.

## Descriptor contract

Require exactly these 13 keys: `version`, `sourceReceipt`, `sourceTask`, `sourceCommit`,
`sourceTree`, `entry`, `wikiRoot`, `wikiIndex`, `wikiBrief`, `runOutput`, `actorId`, `receipt`,
and `harvesterRevision`. Require `version` exactly `2`, the assignment actor to match `actorId`, and
every supplied path to remain within the repository. Treat `sourceReceipt`, `sourceCommit`,
`sourceTree`, `receipt`, and `harvesterRevision` as opaque mechanical identity, not semantic
evidence. The assignment ends with a `Wiki diagnostics` section computed by Python.

## Single-Pass Lean Dreaming Method

1. **Read narrowly.** Read the archived Task `entry` and only the linked Concepts needed to
   understand accepted outcomes, independent Review, human decisions, and counterexamples. Do not
   read raw Harness transcripts. Read the trailing `Wiki diagnostics`. Do not use embedding, vector
   retrieval, similarity thresholds, automatic taxonomy, a knowledge graph, or a whole-Wiki
   file-by-file scan.
2. **Zero-Edit Fast Path.** When Finish Step 4 already distilled the Task's durable knowledge, the
   1–3 directly related Wiki Concepts agree with the Task evidence, no established counter-default
   conclusion belongs in `wikiBrief`, and `Wiki diagnostics` lists no broken link or status error
   outside `specs/`, stop looking at other domains. Write a short `receipt.md` at `runOutput`
   stating what you checked and why you skipped edits, then finish as completed.
   Zero `--wiki` arguments is valid.
3. **Bounded verification and draft distillation.** Check only the 1–3 existing Concepts directly
   related to the Task; never back-fill `status` on existing active pages that omit it.
   - A Concept newly distilled in this run (other than an ADR) gets `status: "draft"`, or
     `status: "conflict"` for an unresolved contradiction, with `sources` carrying `#heading`
     anchors and `generated: { by: "<actorId>", at: "<ISO-date>" }`. Above about 6,000 characters,
     put the current conclusion at the top.
   - Promote an existing `draft` to `status: "stable"` only when a different actor verifies it
     against code, tests, or a second Task's evidence, and add `verified: { by, at, evidence }`.
     The same `actorId` or the same run never self-promotes its own work to `stable`.
   - When you merge a cross-task claim that no second actor has verified into an existing active
     page, set that page to `status: "draft"` and remove any `wikiBrief` link pointing to it.
   - Do not turn a single failure, timeout, or error into an absolute rule ("Never X"). Record it
     as a dated, scoped observation with its source until another Task confirms it.
   - Before writing prose for a recurring mistake, check whether it belongs at a higher
     enforcement level: architecture, an actionable error or type check, or a behavioral test.
     When a second Task shows the same mistake and it does, put one `Enforcement candidate:` line
     as the first body line after the frontmatter, naming what the check rejects and where it
     would run; Sleep never builds the check itself.
4. **Conflict and human authority.** When newer evidence replaces a value, write the current value
   at the top with a dated note of the old one. When neither side clearly supersedes, keep both
   sources, mark `CONFLICT: ...`, and set `status: "conflict"`; never average a conflict into
   false consensus. An Agent inference, especially a negative one from a search that found
   nothing, never overturns a human decision. Discussion the project did not adopt stays out of the
   Wiki; record disproven leads in `receipt.md` so future runs do not re-litigate them.
5. **Targeted link repair and hard boundaries.** Repair the dangling relative links outside
   `specs/` that `Wiki diagnostics` reports, including inbound links to the just-archived Task
   (`tasks/<id>/...` → `tasks/archive/<YYYY-MM>/<id>/...`). Never touch `.omp-flow/wiki/specs/**`,
   `.omp-flow/workflow/**`, Skills, Hooks, Agent definitions, archived Task directories, or product
   code; record a `specs/` problem under `## Escalations` in `receipt.md`. ADRs follow the
   acceptance rules of `omp-flow-adr`.
6. **`wikiBrief` admission (`.omp-flow/wiki/brief.md`, at most 2,000 characters).** Admit only one
   concrete counter-default conclusion or supersession, with a relative link to a target Concept
   that was already explicitly `stable` or `accepted` (or an existing `specs/**` page) before
   `sleep start`. Never write a broad pre-reading slogan such as "read manual X before doing Y".
   Never link a page created, promoted, or substantively rewritten in this run. `sleep finish`
   enforces this: a changed `brief.md` may link only pages that were `stable` or `accepted` before
   the run, as inline `[text](target)` links, and must not name any other Wiki page in another way.
7. **Receipt and finish.** Write `receipt.md` at `runOutput`: what was read, which Wiki Concepts
   were created or revised, what was skipped or disproven and why, and any escalations. Then run:

   ```text
   python3 -X utf8 .omp-flow/scripts/omp_flow.py sleep finish <receipt> \
     --state completed --actor-id <actorId> [--wiki <path-relative-to-.omp-flow/wiki> ...]
   ```

   On failure, use `--state failed` with no `--wiki`, report the exact blocker, and do not
   manufacture Wiki content or a completion claim. Run `omp_flow.py index wiki` after Wiki edits.

## Optional OKF v0.2 provenance

When a receipt or Wiki Concept benefits from trust context, authors may add ordinary
Markdown/YAML-like prose such as:

```yaml
okf_version: "0.2"
sources:
  - path: "../tasks/archive/<YYYY-MM>/<task>/review/<review>.md#verdict"
generated:
  by: "<actorId>"
  at: "2026-08-26"
verified:
  by: "<different-actor>"
  at: "2026-08-27"
  evidence: "<test-or-second-task-link>"
status: "draft"
stale_after: "2026-11-26"
```

This is an optional authored provenance illustration, not a required body schema. Keep ordinary
links to the archived Task, handoff, Review, and supporting evidence beside it. `status` and
`verified` are human-readable evidence labels; they are not runtime approval state. Omit unknown
fields rather than inventing them.

## Red flags

- Do not accept an archived path without the runtime-produced source receipt and Git checkpoint.
- Do not scan the whole Wiki, rewrite unrelated domains, or force an edit when nothing is new.
- Do not self-promote this run's work to `stable` or link it from `wikiBrief`.
- Do not parse authored Markdown into lifecycle state or mandatory fields.
- Do not claim source stability after the runtime reports source drift.
