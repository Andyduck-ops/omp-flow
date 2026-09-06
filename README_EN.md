<div align="center">

# omp-flow

**Turn research, design, implementation, and independent review into project-local, Git-tracked knowledge.**

[中文](README.md) · English

[![npm](https://img.shields.io/npm/v/omp-flow?label=npm)](https://www.npmjs.com/package/omp-flow)
[![GitHub](https://img.shields.io/github/stars/Andyduck-ops/omp-flow?style=flat&label=GitHub)](https://github.com/Andyduck-ops/omp-flow)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="docs/assets/omp-flow-hero.webp" alt="Five Harnesses collaborating through project-local Markdown knowledge" width="100%">

<sub>Task knowledge stays in Git-visible Markdown; models, native agents, concurrency, and UI stay in your Harness.</sub>

</div>

## Quick start

Install the CLI globally:

```bash
npm install -g omp-flow@latest
```

Enter your project and initialize it. `-u` sets Git `user.name` for this repository only:

```bash
cd <your-project>
omp-flow init -u "Your Name"
```

Later, update the global CLI and the managed project files:

```bash
npm install -g omp-flow@latest
cd <your-project>
omp-flow update
```

Preview the plan first:

```bash
omp-flow update --dry-run
```

`--dry-run` prints the plan without writing files. `new` creates a newly managed template;
`autoUpdate` means the project copy still matches the previously installed version and can be
safely upgraded; `unchanged` is skipped. `changed` means the project copy has local differences,
so the CLI asks whether to overwrite it, keep it, or save the new template as `.new`. To preserve
all local differences while still applying `new` and `autoUpdate` entries, use:

```bash
omp-flow update --skip-all
```

Before a plan writes files, omp-flow backs up existing managed files under
`.omp-flow/.backup-<timestamp>/`. Task Bundles, Wiki user content, and runtime data are not
template-overwrite targets. User-deleted managed files remain deleted unless explicitly recreated.
`--force` overwrites every `changed`
file and is not recommended for routine updates.

Only non-interactive environments need `--omp`, `--codex`, `--claude`, `--snow`, or `--cursor`; ordinary use does not.

### Upgrading from 0.4.x to 0.5.0

`0.5.0` completes the Task-first WorkScope cutover. Commands that operate on a Task require an
explicitly opened Task and workspace:

```bash
npm install -g omp-flow@0.5.0
cd <your-project>
omp-flow update
omp-flow task open <task> --workspace <path>
omp-flow task show <task> --workspace <path>
```

Omit `--workspace` to use the current repository; add `--replace` only when intentionally replacing
an existing WorkScope marker. Update backs up and removes the retired `active_task.py` only when its
template hash still matches. Customized legacy files are reported and preserved for manual cleanup.
Task Bundles, Wiki, runtime data, and user-owned instruction files are never migration-overwrite
targets. The operation descriptor remains v1; model PASS, executor success, and receipt completion
do not constitute human approval.

## What omp-flow does

omp-flow provides a portable method and a small mechanical kernel for multi-agent development while preserving each Harness's native execution experience.

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Task Bundles and Concepts | Git-tracked Markdown | Preserve questions, sources, requirements, designs, decisions, work, handoffs, and reviews |
| `.omp-flow` Python runtime | omp-flow | Guarantee only sessions, paths, actors, locks, atomic operations, and opaque receipts |
| Native execution | Your Harness | Continue to own models, agent dispatch, concurrency, progress, cancellation, isolation, and UI |

Accordingly, omp-flow neither parses Markdown into a lifecycle database nor takes over a platform's model or scheduling system.

## Supported Harnesses

| Harness | Project-local integration |
| --- | --- |
| Oh My Pi | Extension, native agents, Skills, and settings |
| Codex | Native agents, Hooks, and shared Skills |
| Claude Code | Native agents, Hooks, Skills, and settings |
| Snow | Native agents, Hooks, and shared Skills |
| Cursor | Native agents, Hooks, and shared Skills |

Initialization installs only the integrations you select; task knowledge remains one portable Bundle.

## Workflow at a glance

```text
brainstorm ↔ research → design → QbD → work map → QbD → implementation → review → finish
```

This is a reasoning direction, not runtime phase state. Evidence can return work to framing or design, and implementation results still require independent review by a different actor. See the [Workflow index](templates/.omp-flow/workflow/index.md) for the complete semantics.

## Project knowledge and documentation

omp-flow separates knowledge with different lifetimes and confidence levels while keeping all of it as ordinary Markdown:

| Location | Purpose | Boundary |
| --- | --- | --- |
| `.omp-flow/tasks/<task>/` | The current task's problem, sources, requirements, design, decisions, handoffs, and reviews | Belongs to one Task Bundle and can be archived after completion |
| `.omp-flow/wiki/` | Reusable architecture, conventions, experience, and project facts | Keeps evidenced knowledge worth maintaining across tasks |
| `.omp-flow/sleep/` | Cross-task knowledge candidates distilled from an archived Task | A Candidate requires review before entering the Wiki and is never promoted automatically |

`omp-flow init` and `omp-flow update` install and maintain the templates, Skills, and runtime needed by these directories.

After a completed Task is archived, Sleep can read that exact Git checkpoint and produce zero or more reviewable Candidates. It does not read raw Harness transcripts or use vector clustering to rewrite the Wiki automatically; people and Agents still decide from evidence whether a Candidate deserves durable project authority.

```text
Task Bundle → finish / archive → Sleep Candidate ──human review──→ Wiki
```

`0.5.0` also updates the shared Workflow Skills and Harness-native Agent instructions so Brainstorm, Research, Design, QbD, Implementation, Review, and Finish more clearly preserve practice evidence, independent review, recoverable assignments, and the boundary between human decisions and model judgment.

## Credits

- [pi-maestro-flow](https://github.com/catlog22/pi-maestro-flow/blob/089f067ca669b90de7b80b38251ae3d9dfddad98/README.md) inspired the public README presentation.

## License

omp-flow is available under the [MIT License](LICENSE) with `Copyright (c) 2026 Andyduck-ops`.

## Friendly links

[Linux DO](https://linux.do/)
