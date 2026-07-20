# Create migration manifest for 0.5.15

## Goal

Create the release migration manifest and docs-site changelog for Trellis `0.5.15`, based on source changes since the previous `0.5.x` release.

## What I already know

- Target version is `0.5.15`.
- npm `latest` currently points to `0.5.14`.
- `v0.5.14` is the previous stable release tag.
- `0.5.15` needs a new manifest and docs-site changelog.

## Requirements

- Use `v0.5.14` as the previous release baseline for the `0.5.15` patch release.
- Inspect commits and `src/` diffs from `v0.5.14..HEAD`.
- Confirm the manifest changelog covers all user-observable `src/` changes.
- Confirm English and Chinese docs changelogs mirror each other structurally.
- Keep `breaking: false`, `recommendMigrate: false`, and `migrations: []` unless the diff shows a migration requirement.

## Acceptance Criteria

- [ ] Manifest JSON exists and parses.
- [ ] Manifest fields match the release impact.
- [ ] English changelog exists and follows the release-note voice.
- [ ] Chinese changelog exists and mirrors the English changelog.
- [ ] `docs-site/docs.json` points changelog navigation at the newest intended docs release without breaking existing `0.6.0-beta` navigation.

## Out of Scope

- Do not bump package versions.
- Do not run frontend dev/build/start/serve commands.
- Do not modify already-published `0.5.14` release artifacts.

## Technical Notes

- Project docs require changelog sections in this order when present: `Enhancements`, `Bug Fixes`, `Internal`, `Upgrade`.
- Patch releases typically use no migration entries unless files were renamed or deleted.
