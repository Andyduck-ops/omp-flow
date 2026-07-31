# Reversible setup, documentation, and integration verification

## Objective

Make the accepted FlowStatus components installable, repeatable, reversible, and truthfully
documented without taking ownership of unrelated Harness or ccstatusline configuration.

## Inputs

- Accepted handoffs and linked independent PASS reviews from
  [shared snapshot](shared-snapshot-and-inspect.md),
  [Claude/ccstatusline](claude-ccstatusline.md), and
  [Oh My Pi](oh-my-pi-native-status.md)
- [Installation design](../design.md#installation-coexistence-and-removal)
- PRD R13 and R15

## In scope

- Managed-resource and CLI setup/update/removal behavior for the canonical Skill, Claude hooks,
  compatible ccstatusline capability/config contribution, and verified Oh My Pi adapter.
- Selection or offered installation of only `@omp-flow/ccstatusline@2.2.27-flowstatus.1` after
  `ccstatusline --capabilities --json` reports `flowStatusWidgetV1: true` and upstream revision
  `83c8ffd551ec700fceeed98fe9ab50de84cb49fa`; any mismatch is unsupported and leaves installed code
  untouched.
- Detection of Harness, scope, current status owner, exact compatible build/capability, conflicts,
  declined installation, and unsupported surfaces before mutation.
- Exact ownership records sufficient to remove only omp-flow-managed additions, using existing
  installer conventions rather than a lifecycle database.
- Preview/verification for supported one- and two-line Powerline layouts and the native OMP entry.
- README and durable Wiki synchronization covering visible effects, limitations, setup, inspect,
  fallback, coexistence, removal, and the absence of a persistent Codex footer.
- Package-content and end-to-end installed-fixture coverage.
- Real Windows CI for the installed fixtures, including UTF-8/CJK paths, atomic cache/settings
  writes, display columns, ASCII fallback, unknown width, process exit, and hard deadlines.
- Cross-surface full/compact/minimal/degraded previews that reject adapter-injected `OMP`, `omp:`,
  logos, and Bundle shorthand while allowing safe source-owned task labels.

## Out of scope

- Uninstalling ccstatusline, replacing another Claude renderer, rewriting user widget lines,
  changing `tui.status_line`, deleting task Bundles, or upgrading an unverified OMP installation.
- A general plugin marketplace, compatibility reader, custom dispatcher, or status-control plane.

## Allowed code and output boundary

- `src/cli/` and existing CLI entrypoints
- package metadata required for shipped files
- `README.md`
- `.github/workflows/flow-status-windows.yml`
- `.omp-flow/wiki/architecture/harness-flow-statusline.md` and its authored index link
- integration/installer/package fixtures under `tests/`
- handoff: `work/handoffs/setup-docs-and-integration.md`

Changes to component-owned implementation files require coordination with and acceptance from the
owning work rather than silent cross-editing.

## Done

- Fresh install, discover, repeat, update, conflict, decline, unsupported, and exact removal paths
  are tested for project/user scopes as applicable.
- Existing ccstatusline lines/widgets/themes and unrelated Claude/Codex/OMP settings are preserved
  byte-for-byte except for explicitly owned structured additions.
- Package dry-run contains every required canonical resource and no cache clone, runtime state, or
  unpublished local dependency.
- A real Windows runner installs the packed artifact and enforces the approved encoding,
  filesystem, width, atomicity, deadline, and process-exit behaviors; a mocked platform flag does
  not satisfy this condition.
- README/Wiki examples show the compact Powerline result and accurately distinguish Claude rich
  status, OMP native status, and Codex on-demand detail.
- End-to-end fixtures verify shared snapshot parity across the supported surfaces.
- Setup previews and documented defaults satisfy the no-injected-branding invariant for both
  presentation adapters.

## Verification

Run:

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

Also inspect the dry-run file list and run installed-fixture setup/removal tests on UTF-8/CJK paths.
