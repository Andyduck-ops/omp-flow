# Decision — Project Wiki ownership

## Status

Selected for QbD 1 by `research/90-synthesis-001-project-wiki.md`.

## Contract

- `.omp-flow/wiki/` MUST be the only runtime store for durable project knowledge.
- Wiki files MUST be project-authored, version-controlled user data.
- Init MUST create `.omp-flow/wiki/index.md` only when absent.
- Init and update MUST NOT record or treat Wiki files as managed resources.
- Update MUST reject any managed destination under `.omp-flow/wiki/`, including in force mode.
- Package-managed Harness Skills MUST contain procedure only and MUST NOT carry Concept copies.

The package may ship the code that writes a minimal missing root index. It must not ship or later
apply default Concept content.

## Provenance

- `research/10-internal-001-wiki-ownership.md`
- `research/90-synthesis-001-project-wiki.md`
