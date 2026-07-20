# omp-flow 0.2.0 human release runbook

This runbook is for the reviewed canonical repository at
`https://github.com/Andyduck-ops/omp-flow.git`. Automation may prepare and
verify the release candidate, but a human maintainer owns the integration PR,
main merge, tag and npm publication. Do not publish from the Trellis reference
repository or from an unreviewed row worktree.

## 1. Verify the release candidate

Run these commands from the canonical integration checkout after the final
verification row has passed. Replace the path once; do not change repositories
between verification and publication.

```powershell
$ReleaseRepo = 'D:\git有趣\omp-flow-integration-0.2.0-attempt-002'
git -C $ReleaseRepo status --porcelain
git -C $ReleaseRepo remote get-url product
git -C $ReleaseRepo branch --show-current
git -C $ReleaseRepo rev-parse HEAD
pnpm -C $ReleaseRepo -v
node "$ReleaseRepo\packages\cli\scripts\release-preflight.js" check-versions
node "$ReleaseRepo\packages\cli\scripts\check-manifest-continuity.js"
Get-ChildItem -LiteralPath "$ReleaseRepo\packages\cli\src\templates" -Recurse -Directory -Filter __pycache__
```

The status and `__pycache__` commands must print nothing, the remote must be
exactly `https://github.com/Andyduck-ops/omp-flow.git`, the branch must be the
reviewed integration branch, pnpm must be `10.32.1`, and both package versions
must be `0.2.0`. Retain the final verification record containing the exact
commit/tree, tarball names and SHA256 values. A dry run is not provenance proof.

The final release gate also requires three consecutive green executions of:

```powershell
pnpm -C $ReleaseRepo --filter omp-flow-core test
pnpm -C $ReleaseRepo --filter omp-flow test
```

After verification, a human may push the integration branch and merge it into
`Andyduck-ops/omp-flow` through a reviewed PR. Never force-push or update main
outside that reviewed merge.

## 2. Prepare canonical main and npm identity

Use a clean canonical checkout after the PR is merged. The reviewed merge
commit must be the commit being tagged and published.

```powershell
git -C $ReleaseRepo switch main
git -C $ReleaseRepo pull --ff-only product main
git -C $ReleaseRepo status --porcelain
git -C $ReleaseRepo rev-parse HEAD
git -C $ReleaseRepo tag v0.2.0
git -C $ReleaseRepo rev-parse v0.2.0^{commit}
npm whoami
npm owner ls omp-flow
npm view omp-flow-core version --registry=https://registry.npmjs.org/
```

The worktree must be clean, the tag commit must equal `HEAD`, `npm whoami`
must be `rongfeng`, and `npm owner ls omp-flow` must include
`rongfeng <sikjmyhre@gmail.com>`. Before its first publication,
`npm view omp-flow-core` must return E404; any other authentication, ownership
or registry result stops the release. Do not mutate npm credentials from this
runbook.

## 3. Publish — human only, core first

The order is load-bearing because the packed CLI depends on exactly
`omp-flow-core@0.2.0`.

```powershell
Set-Location "$ReleaseRepo\packages\core"
pnpm publish --access public --no-git-checks

Set-Location "$ReleaseRepo\packages\cli"
pnpm publish --access public --no-git-checks
```

The human supplies the npm OTP for each command. `--no-git-checks` is safe only
because sections 1 and 2 already bind a clean, reviewed canonical commit and
tag; it does not waive those checks. Never substitute `npm publish`: pnpm is
required to rewrite `workspace:*` to the exact core version.

The CLI `prepublishOnly` runs tests and build, then copies the root README and
LICENSE into `packages/cli`. If it aborts before upload, the CLI was not
published; remove those copied files if present, investigate, and rerun the
same CLI command. Remove the copied files after a successful publication too;
they are package staging files, not commits.

Optional, human-only and OTP-protected, after reviewing the impact:

```powershell
npm deprecate omp-flow@"<=0.1.5" "0.1.x was an unrelated earlier project (oh-my-pi/maestro); the omp-flow methodology toolchain starts at 0.2.0." --otp=<code>
```

## 4. Verify publication, then push the tag

```powershell
node "$ReleaseRepo\packages\cli\scripts\release-preflight.js" verify-npm --package all
npm owner ls omp-flow
npm owner ls omp-flow-core
git -C $ReleaseRepo push product v0.2.0
```

Both packages must resolve at 0.2.0 and both owner lists must include
`rongfeng <sikjmyhre@gmail.com>` before the tag is pushed. Then validate from a
brand-new repository, with registry-lag retry if necessary:

```powershell
npx omp-flow@0.2.0 --version
npx omp-flow@0.2.0 init --claude -y
npx omp-flow@0.2.0 update --dry-run
npx omp-flow@0.2.0 init --codex -y
npx omp-flow@0.2.0 update --dry-run
```

Record the Claude and Codex init/update results. The exact local tarball smoke
belongs to the pre-publication verification record; this registry smoke checks
the artifacts that humans actually published.

## 5. Prohibitions

- Do not invoke `packages/cli/scripts/release.js` for this release.
- Do not run `npm publish` or `npm pack`; release artifacts use pnpm only.
- Do not publish, tag or push from the Trellis reference repository.
- Do not force-push, directly push main, or rewrite either history.
- Do not cite a dry run as proof of npm provenance behavior.
