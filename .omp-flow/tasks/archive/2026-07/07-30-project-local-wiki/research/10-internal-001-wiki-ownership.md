# Internal Research 001 — Wiki ownership

## Question

How can `.omp-flow/wiki/` follow the project as its durable knowledge source without becoming
another package-managed copy?

## Findings

1. Managed init resources are copied from `templates/` and recorded in the managed hash map
   (`src/cli/init.ts:300-340`). A file placed in that list is therefore package-owned, and
   `omp-flow update --force` may overwrite a changed copy (`src/cli/update.ts:305-318`).
2. Init already has a separate user-data setup stage after managed deployment
   (`src/cli/init.ts:345-359`). It creates missing directories directly and does not add them to
   the managed resource manifest. This is the right ownership seam for a Wiki root.
3. Update rejects any managed resource whose destination is under a protected user-data prefix
   (`src/cli/update.ts:37-46,355-365`). The list still names the retired `.omp-flow/specs/` and
   `.omp-flow/knowhow/` stores but does not yet name `.omp-flow/wiki/`.
4. `.omp-flow/wiki/` is not ignored by the repository `.gitignore`; it is tracked by default.
   This matches the requirement that knowledge follows the project and is portable with it.

## Recommended ownership contract

- `.omp-flow/wiki/` is project-authored, version-controlled user data.
- Init creates `.omp-flow/wiki/index.md` only when it does not exist.
- The Wiki is not a managed resource and receives no managed hash.
- Update protects the whole `.omp-flow/wiki/` prefix and never overwrites its contents, including
  under `--force`.
- New projects receive only a small root index. Package updates do not seed Concepts later.
- This repository migrates its existing Concepts once into its own Wiki; that migration is not a
  permanent package copy.

This gives one runtime truth. The package owns the procedure that teaches agents how to use the
Wiki, while each project owns the knowledge itself.
