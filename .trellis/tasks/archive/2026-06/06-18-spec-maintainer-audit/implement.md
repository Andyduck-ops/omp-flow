# Implementation Plan

## Checklist

- [x] Confirm current package/source truth from manifests and GitNexus.
- [x] Add active package map to `.trellis/config.yaml`.
- [x] Add `.trellis/spec/tech/repo/index.md` with repo/package/spec map.
- [x] Add a minimal core spec layer if package-context output would otherwise
      show `core` with no configured specs.
- [x] Update `.trellis/spec/guides/index.md` to include the existing
      cross-platform guide.
- [x] Update stale historical task references in `platform-integration.md` to
      archived paths or historical wording.
- [x] Update `quality-guidelines.md` so the `create_bootstrap.py` case study
      reflects the file's current removed state.
- [x] Clarify `commands-channel.md` core-vs-CLI boundary:
      `@mindfoldhq/trellis-core/channel` owns reusable store APIs, while
      CLI-local `commands/channel/store/*` wrappers remain for supervisor /
      spawn / kill runtime paths during migration.
- [x] Update existing spec indexes only where package/context loading would be
      misleading.
- [x] Re-run drift scanner and inspect remaining candidates.
- [x] Run `uv run python ./.trellis/scripts/get_context.py --mode packages`.
- [x] Run `uv run python ./.trellis/scripts/check_package_map.py` if present;
      record absence if the repo does not provide it.
- [x] Run targeted `rg` checks for the stale facts repaired in this task.
- [x] Run `git diff --check -- .trellis/config.yaml .trellis/spec`.
- [x] Run GitNexus `detect_changes` before any commit plan.

## Validation Commands

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/trellis-spec-maintainer/scripts/scan_spec_drift.py"
uv run python ./.trellis/scripts/get_context.py --mode packages
uv run python ./.trellis/scripts/check_package_map.py
git diff --check -- .trellis/config.yaml .trellis/spec
rg -n "packages/api|apps/web|primary_channel_id|daemon|single-repo|packages/core|@mindfoldhq/trellis-core" .trellis/spec .trellis/config.yaml
```

If `check_package_map.py` is absent, record that result instead of inventing a
replacement script.

## Review Gates

- Do not start Phase 2 until `prd.md`, `design.md`, and `implement.md` exist.
- Do not broaden the task into code rewrites unless a validation failure cannot
  be corrected in spec/config.
- Do not include unrelated dirty paths from other active tasks in any commit.
