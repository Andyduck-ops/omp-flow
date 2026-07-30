# Design: Move OKF knowledge into the project-local Wiki and simplify the Wiki Skill

## Architecture

The design separates procedure from project state:

```text
templates/common/skills/omp-flow-wiki/SKILL.md
        │ managed deployment
        ├──> .omp/skills/omp-flow-wiki/SKILL.md
        ├──> .codex/skills/omp-flow-wiki/SKILL.md
        └──> .claude/skills/omp-flow-wiki/SKILL.md
                         │ all consult and maintain
                         ▼
                 .omp-flow/wiki/index.md
                         │ optional navigation
                         ├── specs/verifiable-claim.md
                         ├── knowhow/detector-pathologies.md
                         └── philosophy/evidence-led-exploration.md
```

The three subdirectories are useful current organization, not a required taxonomy. Future
Concepts may use other paths. `index.md` files are navigation aids, not closed manifests.

### Ownership

| Surface | Owner | Update behavior |
|---|---|---|
| Shared `omp-flow-wiki/SKILL.md` | omp-flow package | Managed and deployed per configured Harness |
| Harness-native Skill copy | omp-flow package | Managed; contains procedure only |
| `.omp-flow/wiki/**` | project | Tracked user data; never managed or overwritten by update |
| Retired Skill paths | one-time migration | Removed through existing obsolete-resource disposition |

## Components and changes

### 1. Wiki seed

Add a small init helper that ensures `.omp-flow/wiki/index.md` exists after managed deployment:

- create the directory and a minimal OKF root index only when the index is absent;
- do nothing when the index exists, regardless of `force`;
- do not return a managed deployment entry and do not write a managed hash.

Replace the retired `.omp-flow/specs/` and `.omp-flow/knowhow/` protected-prefix entries with
`.omp-flow/wiki/`. The existing exact-path disposition still owns cleanup of the retired files;
this task does not revive either store.

### 2. Static one-file Skill deployment

Rename the registered Skill to `omp-flow-wiki`. Build its managed resources directly from
`SKILL_NAMES × configured Harness roots × SKILL.md`.

Delete:

- recursive file discovery;
- its cached result;
- the exported test reset;
- generic missing/empty/opaque nested-tree fixtures.

`resolvePackageRoot` retains its current fail-explicit check for every declared `SKILL.md`.
Init/update continue sharing the same managed-resource list.

### 3. Skill contract

The Skill starts from repository-root `.omp-flow/wiki/index.md` and contains only operation
guidance. It routes two situations:

1. existing durable project knowledge may inform the current work;
2. evidenced, reusable knowledge should be added, revised, or deprecated.

It recommends the strongest proportional evidence but does not mechanically choose a storage
form for the model. Unknown frontmatter is preserved, optional OKF fields remain optional, and
index links are added only when useful.

### 4. Current-project knowledge migration

Create the Wiki directly in this repository and move the substantive content of:

- `Verifiable claim`;
- `Detector pathologies`;
- `Evidence-led exploration`.

Use parseable OKF Concept frontmatter with a non-empty `type`, but keep bodies free-form. The root
index links to the current topic indexes or Concepts for progressive discovery. After review,
delete the old template and three deployed `omp-flow-verifiable-claims` directories so no runtime
knowledge copy remains.

This is a one-time authored migration. It is verified by focused comparison, not a permanent exact
file-count assertion.

### 5. Live guidance and downstream retirement

Replace the retired name in template/project workflow guidance and the shared/deployed brainstorm,
research, and finish Skills. Update stale retirement comments that describe the superseded store.

List the previously managed old Skill files in the existing obsolete-resource mechanism so an
update can remove unchanged downstream copies. Do not install an alias or preserve the old
knowledge layout.

## Data flow

1. Native Skill matching selects `omp-flow-wiki` from frontmatter.
2. The agent resolves the repository root and opens `.omp-flow/wiki/index.md` or a known Concept.
3. The agent reads only the smallest relevant path.
4. When durable evidence warrants a change, the agent edits the project Wiki directly following
   the Skill procedure.
5. Git records and transports the project knowledge; package update does not participate.

## Error behavior

- Missing package-owned `omp-flow-wiki/SKILL.md`: init/update retains the existing explicit
  required-resource failure.
- Missing Wiki root index during init: create it.
- Existing Wiki root index: preserve it byte-for-byte.
- Any future managed resource under `.omp-flow/wiki/`: update fails explicitly as protected user
  data.
- Missing or stale optional index links: tolerate them as OKF navigation hints; do not add a
  release gate.

## Decisions

1. `.omp-flow/wiki/` is the only runtime knowledge truth.
2. The package owns Wiki procedure, while the project owns Wiki content.
3. Init seeds only a missing root index; update never owns the Wiki.
4. Shared Skills are currently one-file resources, so nested recursive packaging is removed.
5. OKF is used for flexible Concepts and progressive disclosure, not as a reason to build a
   validator.
6. Broader Research/Reference unification is explicitly deferred.

## Migration and compatibility

- Current repository: author the Wiki once, compare the migrated knowledge, then remove all old
  live Skill trees.
- Existing installed projects: update retires paths that were previously package-managed.
- Modified downstream old files follow the existing update conflict/disposition behavior; this
  design adds no special compatibility route.
- New projects: init gets a minimal empty Wiki entry point and the native procedure Skill.

## Verification

Permanent automated coverage is limited to executable ownership behavior:

1. registered one-file Skill resources deploy for selected Harnesses;
2. a missing Wiki index is seeded;
3. a pre-existing sentinel Wiki survives repeated/forced init;
4. `.omp-flow/wiki/` is absent from managed resources, survives force update, and its protected
   prefix is confirmed by focused source review;
5. retired managed paths are recognized by existing update behavior.

One-time independent review checks:

- migrated Concept substance;
- the evidence-led exploration Concept matches the selected synthesis;
- no knowledge subtrees remain below live Harness Skills;
- live guidance consistently uses `omp-flow-wiki`.

Then run the repository's standard build, test, compile, and package checks required by
`AGENTS.md`. No generic YAML/Markdown/OKF parser or graph-integrity suite is added.

## Rejected alternatives

- Keep knowledge under each Harness Skill: multiple runtime truths and recursive packaging.
- Manage the Wiki from a template: package update could overwrite project knowledge.
- Keep recursive deployment for hypothetical assets: no current consumer.
- Preserve an old-name alias: extends a superseded boundary without a demonstrated need.
- Enforce exact indexes, headings, link closure, or metadata: contradicts the selected OKF model
  and the user's proportional-verification direction.
