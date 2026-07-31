---
type: "QbD Audit"
title: "QbD 2: FlowStatus implementation map"
---

# QbD 2 audit: FlowStatus implementation map

## Verdict

**FAIL**

The four work Concepts provide a coherent core-first sequence, bounded component handoffs, and
independent review intent, but the map is not ready for native implementation dispatch. One
material distribution decision remains delegated to the Claude implementer, and two approved
verification requirements have no correct work owner.

## Blockers

### 1. The ccstatusline distribution artifact is still an implementation-time design choice

The [Claude work Concept](../../work/claude-ccstatusline.md#in-scope) permits “a reproducible
reviewed patch/build artifact or equivalent source boundary.” Those alternatives have different
package contents, build/install commands, update and removal behavior, provenance, and ownership.
The [setup work](../../work/setup-docs-and-integration.md#in-scope) merely consumes a “compatible
ccstatusline capability/config contribution,” so no boundary defines the exact artifact it must
install.

That defers a material decision required by
[PRD R8](../../prd.md#r8--claude-code-minimal-extension) and the
[distribution design](../../design.md#two-line-configuration-and-distribution-boundary), which require a
disclosed pinned reviewed build and exact package/revision rather than an arbitrary equivalent
chosen during implementation.

**Repair:** select one concrete first-release distribution form in the work map. Name the pinned
upstream URL/revision, shipped patch/source/build-manifest paths, deterministic build and
verification command, resulting package identity/revision, `flowStatusWidgetV1` probe, package
inclusion, and the exact interface handed to setup/update/removal. If choosing among those forms
would change the approved install contract, return that choice to Design first.

### 2. Real Windows CI has no work owner or allowed code boundary

[PRD acceptance criterion 16](../../prd.md#acceptance-criteria) and the
[verification design](../../design.md#verification-strategy) require **real Windows CI** for
UTF-8/CJK paths, atomic writes, display columns, ASCII fallback, process exit/deadlines, and
unknown width. The work Concepts mention UTF-8 fixtures and local verification, but none owns a CI
workflow path. The repository currently has no `.github` workflow directory, and
[setup/integration's allowed boundary](../../work/setup-docs-and-integration.md#allowed-code-and-output-boundary)
does not permit creating one.

Mocked platform tests or running the normal suite on the current machine do not satisfy the
approved real-runner claim.

**Repair:** add a dedicated Windows verification work Concept or explicitly give integration work
ownership of the selected CI workflow path. Its Done criteria must run the approved installed
fixtures on a real Windows runner and enforce the listed encoding, filesystem, width, atomicity,
deadline, and process-exit behaviors.

### 3. The no-injected-branding requirement is assigned to the non-presenting core

The [coverage map](../../work/index.md#coverage) assigns PRD R1–R7, including R2, to shared
snapshot work. The
[shared Concept](../../work/shared-snapshot-and-inspect.md) does not own Claude or Oh My Pi
presentation and cannot prove that their built-in text, separators, previews, degradation
markers, or native registration inject no `OMP`, `omp:`, logo, or Bundle shorthand.

The Claude Concept's PRD inputs omit R2, and neither presentation Concept makes the branding
invariant an explicit Done/verification condition. Consequently,
[PRD R2](../../prd.md#r2--no-injected-product-branding) and the no-branding part of acceptance
criterion 9 can pass through the map without an accountable adapter-level test.

**Repair:** assign R2 to both presentation works and to final integration. Require fixtures over
Claude full/compact/minimal/degraded output, Oh My Pi compact/degraded output, setup previews, and
documented defaults that reject any adapter-injected `OMP`, `omp:`, logo, or Bundle shorthand
while allowing safe source-owned task text.

## Confirmed strengths

- [Ordering](../../work/index.md#ordering-and-parallelism) correctly establishes the shared
  snapshot/cache/inspect boundary before the disjoint Claude and Oh My Pi adapters, then places
  setup and cross-surface verification after their handoffs.
- Shared Python work explicitly forbids editing the live deployed `.omp-flow/scripts/` runtime
  while it coordinates this in-flight task, satisfying the repository's live-runtime safety rule
  at `AGENTS.md#authoritative-source`.
- Claude and Oh My Pi implementation code boundaries are disjoint. The intentional later overlap
  in `src/cli/`, package metadata, and integration tests is sequenced through setup work and
  requires coordination rather than silent cross-editing.
- Each bounded implementation promises a linked handoff and independent review. Setup should
  consume accepted component reviews as well as handoffs so later review repairs cannot invalidate
  its installation fixtures.
- Trust boundaries remain intact: no Custom Command, transcript/credential/private API path,
  Markdown inference, cached control, native dispatch takeover, or unverified Oh My Pi capability
  is delegated to implementation.

## Gate

Repair the authored work map and affected work Concepts, then run a fresh independent QbD 2 audit.
This model FAIL is not human calibration and does not authorize implementation dispatch.
