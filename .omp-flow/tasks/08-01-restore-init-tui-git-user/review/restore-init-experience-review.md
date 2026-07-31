---
type: "Review"
title: "恢复 init 交互与 Git 名称实现审查"
---

# 恢复 init 交互与 Git 名称实现审查

Verdict: **FAIL**

Reviews [恢复初始化交互与 Git 名称](../work/restore-init-experience.md) and its
[implementation handoff](../work/restore-init-experience-handoff.md), against the
[PRD](../prd.md), [Design](../design.md), and the real working-tree diff.

## Findings

### High — conflicting init flags mutate local Git config before the command fails

`parseInitArguments()` accepts `--force` and `--skip-existing` together
(`src/cli/index.ts:96-101`). `interactiveInit()` then writes `user.name` at
`src/cli/init.ts:387`, while the conflict is not rejected until
`deployInitResources()` reaches `src/cli/init.ts:342` via the later call at line 395.

Independent reproduction in a temporary Git repository:

```text
git config --local user.name before
node <built-bin> init -u after --codex --force --skip-existing

exit: 1
output:
Git user: after
[omp-flow Error] Cannot use force and skipExisting together
git config --local user.name after
.omp-flow created: false
```

The command reports failure but leaves a user-owned Git setting changed. This contradicts the
Design requirement that input errors precede prompt/Git/filesystem side effects, and the Work
verification requirement explicitly calling out the `--force` plus `--skip-existing` combination
with `-u`. The focused test file has no coverage for that combination, so the green suite does not
detect the regression.

Required correction: reject the mutually exclusive flags before Banner/prompt/Git mutation for the
CLI path, and preserve the same no-side-effect invariant for direct `interactiveInit()` callers;
add a regression test that begins with one local Git name, expects failure, and proves it remains
unchanged (plus no project writes/prompt as applicable).

## Verification

- `npm run build` — PASS.
- `npm test` — PASS, 369 focused checks; insufficient for the finding because the conflicting
  flag combination is absent.
- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` — PASS.
- `npm pack --dry-run` — PASS; package reports `omp-flow@0.2.4`.
- Independent production install from a generated tarball with `--omit=dev` — PASS:
  `inquirer` is present, packaged bin `init -u reviewer-smoke --codex` exits 0, local Git name is
  `reviewer-smoke`, and Harness config contains only `codex`.
- `git diff --check` — PASS with existing line-ending warnings only.
- Focused conflicting-flags reproduction — FAIL as documented above.

Actor ID: `review-init-tui-v1`

Dispatch receipt: `fc5e34f3bf6e4874912ac808e9437be5`

Predecessor receipt: `bd947a72ca364aa4976a5c4614c02528`
