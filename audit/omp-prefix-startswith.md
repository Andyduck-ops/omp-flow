# `startsWith(".omp")` boundary audit (row B-A001--001, AC14)

Command: `rg -n "startsWith\((['\"]).omp" packages/cli/src packages/core/src`
(excluding migrations/manifests).

`.omp` (the `omp` platform configDir) and `.omp-flow` (the workflow dir) coexist and
must never false-match each other (finding: rebrand-collision-hazards H2).

| Site | Expression | Disposition |
|---|---|---|
| `packages/cli/src/utils/manifest-prune.ts:143` | `key.startsWith(".omp-flow/") \|\| key === ".omp-flow"` | SAFE — trailing-`/` boundary + exact-equality; cannot match `.omp` paths. |
| `packages/cli/src/templates/opencode/lib/trellis-context.js:237` | `normalized.startsWith(".omp-flow/")` | SAFE — trailing-`/` boundary. Parked-platform (M2) template data, owned by row F. |

No bare `startsWith(".omp")` (without a `/` boundary or exact-equality guard)
exists in the tree, so `.omp` vs `.omp-flow` cannot collide.
