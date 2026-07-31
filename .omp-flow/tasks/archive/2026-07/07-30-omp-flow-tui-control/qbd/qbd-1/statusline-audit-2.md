---
type: "QbD Audit"
title: "QbD 1: repaired omp-flow embedded status line"
---

# QbD 1 audit: repaired omp-flow embedded status line

## Verdict

**PASS**

The repaired [synthesis](../../research/statusline-synthesis.md), [PRD](../../prd.md),
[design](../../design.md), and
[closed snapshot v1](../../interfaces/statusline-snapshot-v1.md) address every blocker in the
[prior audit](statusline-audit.md). The product remains the compact embedded status surface the
user requested, while reporting the current Claude/Codex host asymmetry rather than manufacturing
visual parity. Progress, context pressure, mechanical receipts, authored evidence, and native
activity remain source-distinct. No material QbD 1 blocker remains.

This is an independent model verdict, not human calibration or implementation authorization.

## Prior-blocker assessment

### 1. Host invocation and Codex asymmetry — remediated

The repair replaces the unsupported `/omp` assumption with documented Skill surfaces:

- Claude project Skills are explicitly invokable as `/skill-name`; the selected spelling is
  `/omp-flow-status`. See
  [Claude Code Skills](https://code.claude.com/docs/en/slash-commands) and the
  [status Skill design](../../design.md#read-only-core-and-drill-down-safety).
- Codex repository Skills are discovered from `.agents/skills`, listed through `/skills`, and
  explicitly mentioned as `$skill-name`; the selected spelling is `$omp-flow-status`. See
  [Codex Skills](https://learn.chatgpt.com/docs/build-skills) and
  [PRD R8](../../prd.md#r10--codex-and-oh-my-pi-capability-gating).

The repair does not misrepresent those Skills as footer extensions. The
[synthesis evidence boundary](../../research/statusline-synthesis.md#evidence-boundaries-and-residual-risks),
[installation design](../../design.md#installation-coexistence-and-removal), and
[acceptance criterion 9](../../prd.md#acceptance-criteria) all preserve the current limitation:
Codex `/statusline` and `tui.status_line` select built-in items, so installation leaves that setting
unchanged and reports persistent omp-flow footer embedding unavailable. The direct
`omp-flow status inspect` entry also prevents Skill discovery from becoming a single point of
failure.

### 2. Closed correlated live-fact contract — remediated

[Snapshot v1](../../interfaces/statusline-snapshot-v1.md) now closes the envelope and every
referenced union. It supplies:

- explicit render scope for repository, host, host session, selected task, and mechanical receipt
  digest;
- unique `sourceId` correlation plus source kind, connection epoch, revision, scope, state, time,
  and maximum age;
- closed progress, activity/binding, attention, and source-health schemas;
- exact binding checks against the selected task and current public receipt snapshot; and
- fail-closed behavior for unknown fields, duplicate IDs, invalid bounds, scope mismatch, and
  stale or clock-uncertain observations.

This makes malformed, unbound, wrong-scope, reconnect, attention-ordering, and receipt/progress
separation fixtures deterministic. The receipt digest is mechanical correlation over one public
runtime snapshot; it neither parses authored Markdown nor adds workflow meaning.

### 3. Source-owned progress semantics — remediated

The first release now has one work-bar kind only:
[`codexPlan`](../../interfaces/statusline-snapshot-v1.md#progress-measures). Its producer and
meaning are exact:

- a live Codex app-server `turn/plan/updated` notification;
- exact `threadId` and `turnId` scope;
- the complete current plan replacing the prior measure;
- provider status `completed` as the numerator and current plan length as the denominator; and
- invalidation on replacement, empty/unknown/partial input, replay, thread/turn change, terminal
  turn state, interruption/failure, disconnect, epoch change, expiry, or loss of ordered live
  observation.

The current official app-server protocol documents `turn/plan/updated` plan entries with
`pending`, `inProgress`, and `completed` states. The pinned protocol type also carries both
`thread_id` and `turn_id`; see the Bundle's
[Codex app-server research](../../research/codex-tui-landscape.md#codex-app-server-rich-bidirectional-control)
and the
[official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).

Availability remains truthful: a plan bar exists only while a correlated live app-server source is
connected. It is not inferred from a stored thread, replay, receipt, terminal output, or authored
Concept. Claude's documented status-line stdin has no work denominator, so the
[design explicitly forbids a first-release Claude work bar](../../design.md#flowstatussnapshot-v1).
Claude context is separately typed and labelled `ctx`.

### 4. Testable bounds, coexistence, and cached-action safety — remediated

The [framing/global limits](../../interfaces/statusline-snapshot-v1.md#framing-and-global-limits)
and [cache/action rules](../../interfaces/statusline-snapshot-v1.md#cache-and-action-safety) now
fix the input, string, collection, timestamp, TTL, skew, snapshot, cache, output, and deadline
bounds. The PRD defines warm/cold conditions; the design names 160/100/80/60-column goldens,
Unicode display width, ASCII/no-color behavior, non-ASCII Windows paths, 256 KiB Claude stdin,
4 KiB/two-line output, and the 500 ms deadline.

Installation coexistence is also closed:

- v1 installs only into an empty Claude status-line slot after preview and confirmation;
- an occupied slot remains byte-for-byte unchanged;
- `--segment` is a bounded manual composition contract, so omp-flow never launches or quotes an
  existing user command; and
- uninstall removes only the exact omp-flow-owned field.

The status snapshot remains display-only. Both Skill-routed and direct inspector paths must re-query
the owning adapter and revalidate target, binding, capability revision, freshness, and confirmation
immediately before native preview/focus/attach, interrupt, or process stop. Neither a cached hint
nor an omp-flow receipt can proxy for native authority.

## Ownership assessment

**No ownership violation found.** Authored Concepts remain the sole durable task-meaning layer.
Python remains responsible for public mechanical task/receipt correlation. Harness/app-server
sources own native plans, liveness, and controls. The renderer owns only bounded presentation, and
its ignored latest-snapshot cache is reconstructable, capped, expiring, and contains no event
ledger, inferred phase, approval, review verdict, or semantic history.

## Residual implementation risks

These are verification obligations already represented by the design, not QbD blockers:

- app-server plan availability depends on a live, correlated connection; absence must degrade to no
  work bar;
- installed versions must be schema/capability probed before accepting plan status values or Skill
  discovery; and
- display-column truncation, atomic config edits, cache eviction, and the hard deadline require the
  promised Windows and narrow-width regression fixtures.

## Gate

Present this PASS and the repaired artifacts for human calibration. Only a linked human PASS may
authorize decomposition.
