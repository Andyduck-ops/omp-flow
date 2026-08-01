---
type: "Review"
title: "CLI integration documentation revision review"
---

# CLI integration documentation revision review

## Findings

No blocking or non-blocking findings were found in the current documentation revision.

The accepted return from
[Released-Harness compatibility verification re-review](released-harness-verification-2.md) is
closed, and the low-severity tree advisory from the prior
[CLI integration review](cli-managed-resource-integration.md) is closed.

## Verdict

**PASS — ACCEPTED.** The documentation revision satisfies the bounded return to
[CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md).
The current README names the pinned `snow-ai@0.8.24` target contract, accurately labels released
`snow-ai@0.7.23` native session orientation unavailable, does not claim released-runtime
verification for `0.8.24`, preserves the required negative capability boundaries, and fixes the
`.claude/` tree connectors. No substantive finding remains and no file was repaired during this
review.

## Scope and correlation

- Reviewed Work: [CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md)
- Reviewed handoff: [CLI and managed-resource integration implementation](../handoffs/cli-managed-resource-integration.md)
- Completed implementation predecessor receipt: `d2de0a27f4824c52b2a235edb505e099`
- Implementation actor: `cli_docs_rework`
- Reviewer actor: `cli_docs_reviewer`
- Review dispatch receipt: `5352f7e4a7414f8ab61fd9d6ade29d23`
- Predecessor of the documentation rework: `2ac3ba84edf549ffb90c06953a1677a1`

The read-only predecessor operation record is `completed`, belongs to Bundle
`08-01-snow-cli-adapter`, uses `work/cli-managed-resource-integration.md` as its entry, and names
the reviewed handoff as its exact output. The handoff links back to that Work and records the
matching actor and receipt. The reviewer actor differs from the implementation actor. The active
review operation names the completed receipt as its predecessor and this Review Concept as its
output.

The actual tracked README diff and current file were inspected against the prior CLI Review, the
accepted released-Harness re-review, the released compatibility evidence, the pinned Snow
reference, PRD requirement 9, the Design's safe-failure rules, and accepted QbD capability
advice. Because the Bundle is currently untracked and the README diff also contains the already
accepted initial CLI documentation, Git alone cannot isolate the later return revision. A scoped
last-write audit over the exact predecessor operation window independently found only `README.md`
and the linked handoff among authored/product paths.

No code, test, or template file was written during that window. No session, Flow Status, or lock
runtime record was written. The sole operation-store write was the coordinator-owned
`d2de0a27f4824c52b2a235edb505e099.json` atomic completion record, occurring at predecessor
completion; it is required mechanical correlation, not an implementation-authored runtime or
product revision. Thus the documentation revision itself remains confined to `README.md` and its
handoff, with no Harness configuration change.

## Contract assessment

- **Pinned target versus released evidence — PASS.** README identifies the adapter as targeting
  the Bundle-fixed `snow-ai@0.8.24` contract. It separately says the released runtime actually
  exercised was `snow-ai@0.7.23`, whose resume payload contained only `messages` and
  `messageCount` and lacked native session identity and `cwd`. This matches the accepted capture
  and makes `0.7.23` native session orientation explicitly unavailable.
- **No false `0.8.24` runtime claim — PASS.** The README immediately states that
  `snow-ai@0.8.24` has not received released-runtime verification and does not describe its
  runtime behavior as verified. The wording distinguishes the pinned source contract from the
  available released runtime rather than transferring evidence between versions.
- **Negative capability boundaries — PASS.** Snow project-over-global same-event precedence,
  exact-owned/no-merge files, bounded known-write-tool protection, terminal/MCP/Hook/fail-open
  exclusions, unavailable exact receipt-bound dispatch, and the no-alias/no-post-hoc-receipt rule
  remain explicit. Cursor released lifecycle, concurrent/resume/subagent/write-deny behavior and
  exact native dispatch also remain unavailable. Shared `.agents/skills`, no Harness-local Skill
  duplicate, and no Cursor rule remain visible.
- **Project tree — PASS.** `.claude/` is a continuing top-level sibling before `.snow/` and
  `.cursor/`; all eight `.claude/` child lines now use the continuing `│   ` prefix, closing the
  prior cosmetic advisory without changing any documented path.
- **Maintainability and safety — PASS.** The correction is localized, links remain resolvable,
  and the prose preserves evidence/version boundaries instead of adding fallback, inferred
  support, or ambiguous runtime promises.

## Independent verification

- Read-only inspection of
  `.omp-flow/.runtime/operations/d2de0a27f4824c52b2a235edb505e099.json` and
  `5352f7e4a7414f8ab61fd9d6ade29d23.json` — **PASS**: same Bundle/Work, completed predecessor,
  exact handoff output, active review output, matching predecessor link, and different actors.
- `git diff --name-status` plus `git diff -- README.md` — **PASS** for reviewing the real tracked
  README diff and concurrent worktree context. The broader dirty worktree was not attributed to
  this documentation return.
- PowerShell assertion over 11 exact README capability/boundary anchors — **PASS**, all 11 found:
  pinned `0.8.24`, released `0.7.23`, exact payload keys, missing identity/`cwd`, unavailable
  orientation, unverified `0.8.24`, Snow precedence/protection/dispatch boundaries, and Cursor
  lifecycle/dispatch boundaries.
- PowerShell `.claude/` connector assertion — **PASS**, all eight child lines use the required
  continuing prefix.
- PowerShell local Markdown-link check — **PASS**, both README local links resolve.
- `Select-String -Path README.md -Pattern '[ \\t]+$'` equivalent assertion — **PASS**, no trailing
  whitespace.
- Scoped UTC last-write scan for `2026-08-01T13:42:44.059102Z` through completion plus a
  three-second atomic-write allowance — **PASS**: zero `src`/`tests`/`templates` writes; zero
  session/Flow Status/lock writes; exactly `README.md` and the handoff as authored outputs; and
  exactly the expected predecessor completion JSON in the operation store.
- `git diff --check -- README.md` — **PASS**, exit 0 with only the repository CRLF notice.
- `git diff --check` — **PASS**, exit 0 across the current tracked worktree with only repository
  CRLF notices.

No build or product test suite was rerun for this review because the accepted return is prose-only,
the mutation-window audit found no code/test/template change, and the assigned risk-proportional
verification was link, anchor, connector, whitespace, scope, and diff validation.

## Explicitly allowed fix

None performed. This review writes only this assigned Review Concept.
