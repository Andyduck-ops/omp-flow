# Internal Research 002 — Skill simplification and retirement

## Question

What complexity remains necessary after knowledge moves out of
`omp-flow-verifiable-claims/knowledge/`?

## Findings

1. `omp-flow-verifiable-claims` is the only shared Skill with more than one file: it has six.
   Every other directory under `templates/common/skills/` contains only `SKILL.md`.
2. `src/cli/init.ts:190-257` contains a recursive, extension-agnostic Skill walker, a cache, and a
   test-only cache reset. The walker exists to copy nested Skill payloads to every Harness.
3. `tests/omp-flow.test.ts:369-480` tests missing/empty/opaque recursive trees and exact copies of
   the four knowledge files. These assertions verify the packaging mechanism created for the
   knowledge-bearing Skill, not Wiki behavior.
4. The old name is registered in `src/cli/init.ts:55-69` and appears in the shared brainstorm,
   research, finish, and workflow guidance plus their deployed copies. Those are invocation
   points, not knowledge and should be renamed to `omp-flow-wiki`.
5. The existing obsolete-resource mechanism begins at `src/cli/init.ts:260`. It is sufficient for
   one-time removal of the old managed Skill paths; no permanent compatibility alias is needed.

## Recommended cut

- Replace the old shared source with `templates/common/skills/omp-flow-wiki/SKILL.md`.
- Deploy only that `SKILL.md` to each configured Harness.
- Remove the recursive Skill walker, cache, reset seam, and their generic fixture tests because
  there is no remaining nested Skill consumer.
- Replace exact Bundle-copy tests with small behavior checks:
  - the renamed Skill deploys to configured Harnesses;
  - init seeds the Wiki only when absent;
  - update, including force mode, cannot manage or overwrite Wiki data;
  - obsolete managed copies of the old Skill are retired.
- Update all live workflow invocation text to the new name.

The Skill should contain only:

- when to consult the project Wiki;
- when information deserves persistence;
- how to navigate from `.omp-flow/wiki/index.md`;
- how to add, revise, deprecate, and index an OKF Concept;
- the boundary that the Skill itself contains no project knowledge.

No parser, closed graph, fixed taxonomy, or exhaustive content test is justified.
