---
type: "Review"
title: "恢复 init 交互与 Git 名称修复复审"
---

# 恢复 init 交互与 Git 名称修复复审

Verdict: **PASS**

Re-reviews [恢复初始化交互与 Git 名称](../work/restore-init-experience.md) and the updated
[implementation handoff](../work/restore-init-experience-handoff.md), following the initial
[FAIL review](restore-init-experience-review.md), against the [PRD](../prd.md),
[Design](../design.md), repair diff, and focused runtime behavior.

## Findings

No blocking or substantive findings.

The prior High finding is closed. `assertCompatibleInitOptions()` now rejects simultaneous
`force` and `skipExisting` at all relevant entry boundaries:

- `parseInitArguments()` invokes it before `runCLI()` can print the TTY Banner;
- `interactiveInit()` invokes it before Git preflight, prompt selection, Git writes, or deployment;
- `deployInitResources()` invokes it before plan construction or filesystem writes.

The regression tests cover both the CLI and direct `interactiveInit()` paths. They start with
repository-local `user.name=before` and prove the error occurs without Banner/prompt, without
`.omp-flow` creation, and without changing the Git name.

## Independent verification

- `npm run build` — PASS.
- `npm test` — PASS, 378 focused checks.
- `git diff --check -- src/cli/index.ts src/cli/init.ts tests/init-cli.test.ts` — PASS with only
  line-ending conversion warnings.
- Built-bin reproduction:

  ```text
  omp-flow init -u after --codex --force --skip-existing
  exit: 1
  output: [omp-flow Error] Cannot use force and skipExisting together
  Git user after: before
  .omp-flow created: false
  Banner printed: false
  ```

- Direct `interactiveInit()` reproduction with the same conflict — exit 1; Git user remains
  `before`; `.omp-flow` is absent; injected prompt is not called.
- The initial independent review already verified production tarball installation, runtime
  Inquirer presence, and a successful packaged-bin `init -u reviewer-smoke --codex`; the scoped
  repair does not modify dependency or packaging files.

Actor ID: `review-init-tui-v2`

Dispatch receipt: `b7fb5005f23649d791cefce0d9b2fb07`

Predecessor receipt: `bf51902c5b6b4ab8bfb3acb3bded8bb9`
