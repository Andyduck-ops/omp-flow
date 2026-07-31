---
type: "Review"
title: "Flow Status setup, documentation, and installed integration review"
---

# Flow Status setup, documentation, and installed integration review

Verdict: **CHANGES_REQUESTED**

This independently reviews the
[setup, documentation, and integration work](../work/setup-docs-and-integration.md) and its linked
[implementation handoff](../work/handoffs/setup-docs-and-integration.md), after the accepted
[shared snapshot](shared-snapshot-and-inspect-2.md),
[Oh My Pi](oh-my-pi-native-status-2.md), and
[Claude/ccstatusline](claude-ccstatusline-3.md) component reviews.

The implementation predecessor `fcc8b7778b0a4903bcb9714a098818db` is completed by
`executor-flowstatus-integration`, resolves to the required handoff, and differs from this review
actor. The handoff identifies the same bounded work and accurately marks itself
`DONE_WITH_CONCERNS`.

## Findings

### High — the approved reversible setup contract is not implemented

The work Concept owns PRD R13 and requires fresh install, discover, repeat, update, conflict,
decline, unsupported, project/user scope, confirmation, compatible-build selection or offer,
structured widget placement, and exact widget/provider removal. The repaired QbD 2 audit also
explicitly assigns R13 to this work.

The delivered CLI instead exposes only:

```text
omp-flow flow-status doctor
omp-flow flow-status remove
```

`inspectFlowStatusSetup()` is read-only and returns
`manual-compatible-build-required`; it has no confirmed setup/update mutation. The setup tests
manually write a `statusLine.command` before asserting `ready`, rather than exercising a product
setup path. There is no code that offers or selects
`@omp-flow/ccstatusline@2.2.27-flowstatus.1`, adds one Flow Status widget to an existing
ccstatusline layout, records that exact widget identity, or removes it later. `remove` handles the
managed Skills, Claude observer, and observer hooks only.

README and Wiki truthfully disclose the gap: users must build/install the package themselves and
place the widget through the ccstatusline TUI. That disclosure satisfies honesty better than an
unsupported availability claim, but it does not satisfy the approved work and cannot be converted
into an implementation exception inside this work item.

Required repair: implement the explicitly confirmed, non-overwriting R13 setup/update/removal path
with the pinned package/capability gate, additive structured configuration, project/user scope,
idempotence, conflict/decline behavior, and exact owned-widget removal. If manual installation and
placement is now the intended product, return to Design and the human gate to narrow R13 and this
work Concept instead of accepting the implementation under the current contract.

### Medium — Claude settings removal is not atomic and the Windows fixture does not test it

`removeFlowStatusManagedResources()` rewrites `.claude/settings.json` directly with
`fs.writeFileSync`. The template-hash record is also saved with a direct write. An interruption
can therefore leave truncated settings or ownership data, contrary to the work's explicit real
Windows requirement for atomic cache/settings writes.

The packed Windows fixture checks only that `.omp-flow/.runtime` contains no temporary cache/state
member after observation. It does not force or observe a settings rewrite failure, verify
same-directory temporary replacement, or check settings/hash consistency across interruption.

Required repair: use a confined same-directory atomic replace for the settings and ownership
record, define safe ordering/failure behavior between them, and add a real Windows fixture that
exercises successful replacement, injected failure/recovery, no residue, and preservation of the
last complete settings document.

### Medium — status-owner conflict detection is a substring heuristic

`claudeStatusOwner()` classifies any configured command containing the case-insensitive substring
`ccstatusline` as the ccstatusline owner. With a supported executable supplied separately,
`foreign-renderer --label ccstatusline` is therefore reported as `ready`, not a visible conflict.
The existing negative test uses `foreign-renderer --status`, so it misses this false-positive
shape.

Required repair: recognize only the documented supported ccstatusline command ownership shape, or
fail closed when ownership cannot be established without executing the configured command. Add a
foreign command containing `ccstatusline` as data to the conflict fixtures.

### Medium — the installed fixture does not provide the required cross-surface parity coverage

`tests/flow-status-installed.mjs` verifies package entries, managed files, static doctor previews,
one Oh My Pi observation, one native compact render, and removal. It does not render the installed
ccstatusline widget, invoke installed Codex `status inspect`, or compare one shared snapshot across
Claude, Codex, and Oh My Pi. It also lacks the required full/compact/minimal/degraded cross-surface
cases. The Windows workflow is real and correctly runs the fixture, but running an incomplete
fixture on `windows-latest` does not establish the omitted acceptance criteria.

Required repair: extend the packed-artifact fixture (or add a linked installed fixture) so one
versioned snapshot is consumed through every supported installed surface and parity/no-branding is
checked for full, compact, minimal, degraded, ASCII/unknown-width, and semantic-empty cases under
hard deadlines.

## Confirmed behavior

- The canonical Claude observer is registered as a managed resource and the shipped settings no
  longer reference an omitted file.
- `doctor` does not execute the configured Claude status command. An explicit probe uses an
  argument array with `shell: false`, a three-second timeout, and bounded output.
- Hash-matching removal is dry-runnable and idempotent; modified Claude settings preserve both the
  settings and observer instead of creating a dangling hook reference.
- Current Codex configuration, unrelated OMP settings, arbitrary installed ccstatusline
  code/configuration, task Bundles, cache acquisitions, and the live deployed Python runtime are
  not removed.
- The package dry-run contains the canonical Flow Status resources and all three tracked
  ccstatusline integration files, and excludes cache clones and runtime state.
- README and Wiki accurately state the current Codex no-footer limitation and the manual
  ccstatusline acquisition/placement caveat.
- The checked-in Windows workflow uses a real `windows-latest` runner and hard job timeout.

## Independent verification

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS, including Flow Status Python and Claude hook contracts and **264 focused
  checks**.
- `npm pack --dry-run --json` — PASS, **100 package entries**; required Flow Status and
  ccstatusline integration files are present, with no cache clone or runtime state.
- `git diff --check` — PASS; only Windows LF-to-CRLF warnings were emitted.
- Source inspection of `.github/workflows/flow-status-windows.yml` and
  `tests/flow-status-installed.mjs` — the workflow is a real Windows definition, but the fixture
  lacks the settings-atomicity and cross-surface cases described above.
- The unrelated pre-existing modification to
  `templates/.omp-flow/scripts/common/disposition.py` remains outside this review, and the live
  deployed `.omp-flow/scripts/` runtime was not edited by the implementation.

Reviewer actor: `reviewer-flowstatus-integration`

Review dispatch receipt: `49e27d0f01044632815438ec2057bdec`

Implementation predecessor: `fcc8b7778b0a4903bcb9714a098818db`
