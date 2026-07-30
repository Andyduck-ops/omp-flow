# Guidance Specification: Move OKF knowledge into the project-local Wiki and simplify the Wiki Skill

## Research Gate

- Inspect init/update ownership semantics for project-maintained `.omp-flow` files. Determine how
  a default Wiki can be seeded once without treating future project knowledge as package-managed
  content.
- Inventory every registration, workflow mention, deployed copy, package artifact, and test tied
  to `omp-flow-verifiable-claims`.
- Establish whether recursive Skill deployment has any consumer after knowledge leaves the Skill.
- Compare the prior task's intended knowledge trigger model with the corrected split: native Skill
  for procedure, `.omp-flow/wiki/` for project runtime truth.
- Keep investigation proportional. Do not design a parser, database, graph closure, or exhaustive
  compatibility matrix.

## Reference Candidates

- Archived task `07-26-knowledge-skills`: synthesis, PRD, Design, and row briefs describing the
  superseded knowledge-bearing Skill decision.
- `src/cli/init.ts`: current managed resource ownership and recursive Skill deployment.
- `templates/common/skills/omp-flow-verifiable-claims/`: current Skill and duplicated Bundle.
- `.omp-flow/workflow.md` and shared phase Skills: current invocation and harvest semantics.
- Local OKF v0.2 source already captured by the archived task.

## Design Constraints

- `.omp-flow/wiki/` is the only runtime knowledge source.
- `omp-flow-wiki` contains only usage and maintenance procedure.
- Every Harness-native Skill entry resolves the project-local Wiki instead of carrying knowledge.
- Project-authored Wiki changes must not be overwritten by package update behavior.
- Preserve OKF flexibility and progressive disclosure.
- Prefer deletion over compatibility layers without a demonstrated current consumer.
- Verification stays proportional to executable behavior; authored Wiki content is inspected.
