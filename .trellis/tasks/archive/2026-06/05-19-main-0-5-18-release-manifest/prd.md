# Main 0.5.18 Release Manifest

## Goal

Create the stable `0.5.18` migration manifest and matching docs-site changelog entries for the main release line.

## Scope

- Analyze changes from `v0.5.17..HEAD` on `main`.
- Include user-visible source behavior and release/update continuity items.
- Create `packages/cli/src/migrations/manifests/0.5.18.json`.
- Create `docs-site/changelog/v0.5.18.mdx` and `docs-site/zh/changelog/v0.5.18.mdx`.
- Update `docs-site/docs.json` changelog navigation to point at `v0.5.18`.

## Acceptance Criteria

- Manifest JSON parses and follows the migration manifest schema.
- English and Chinese changelog pages exist and mirror each other structurally.
- Docs changelog wiring check passes when applicable.
- Manifest continuity check passes.
