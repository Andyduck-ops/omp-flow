# Rebrand audit — allowlisted `trellis` hits (row B-A001--001, AC3)

Full-fork sweep: `rg -i --no-ignore -g '!.git' -g '!node_modules' -g '!dist' "trellis"`.

`dist/` is gitignored build output regenerated from `src`; it mirrors the `src`
template residue below and is not a committed artifact.

## Allowlist (permitted `trellis` hits — provenance / AGPL attribution)

- `LICENSE` — verbatim AGPL-3.0 (contains no `trellis` token; unchanged from
  base `bde902c`).
- `COPYRIGHT:1` — program title "a fork of Trellis"; retains the verbatim
  "Copyright (C) 2026 Mindfold LLC" line and adds a modifications line.
- `README.md:4` — upstream attribution: "a fork of the Trellis framework
  (Andyduck-ops/Trellis)".
- `packages/cli/package.json` `repository.url` — fork origin
  `https://github.com/Andyduck-ops/Trellis.git` (provenance).
- `packages/core/package.json` `repository.url` — same fork origin (provenance).

## Downstream-owned residue (NOT in row B's write scope; cleaned by later waves)

Row B (wave 2) is upstream of the rows that own these surfaces; per the wave
DAG and ADR-002/H8 (manifest reset precedes rename cleanup in its own row), B
does not edit them:

- `packages/cli/src/templates/**` (163 files) — band-3 methodology templates;
  replaced wholesale by row F (and `templates/omp-flow/index.ts` restructured by
  row E). Includes the reverted `trellis_config.py` data-file reference and the
  parked-platform `templates/opencode/lib/trellis-context.js`.
- `packages/cli/src/migrations/manifests/**` (118 files) — deleted + reseeded as
  `0.1.0.json` by row C (ADR-002 rule 1 / H8: reset in its own row).
- `packages/cli/scripts/{create-manifest,check-manifest-continuity,release,release-preflight}.js`
  — release tooling repointed by row C.
- `packages/cli/test/**` (48) and `packages/core/test/**` (10) — test suite
  disposition + fixture port by row G.

## B-scope verification (clean)

- `rg "TRELLIS_" packages/{cli,core}/src` (excl templates/manifests): empty.
- `rg '"\.trellis' packages/cli/src` (excl templates/manifests): empty.
- `rg -o "OMP_FLOW_[A-Z_]+"` includes `OMP_FLOW_CONTEXT_ID`.
- `pnpm build` exits 0; `omp-flow --version` = 0.1.0; bin map = {"omp-flow":"./bin/omp-flow.js"}.
- `git diff bde902c -- LICENSE` empty.
