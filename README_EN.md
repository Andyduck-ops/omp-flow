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

The interactive panel lists Oh My Pi, Codex, Claude Code, Snow, and Cursor, with all five selected by default on first initialization. Toggle with Space and confirm with Enter. Then open any selected Harness in the project and describe the work as usual; the project-local instructions guide it through omp-flow.

Later, update the global CLI and the managed project files:

```bash
npm install -g omp-flow@latest
cd <your-project>
omp-flow update
```

Only non-interactive environments need `--omp`, `--codex`, `--claude`, `--snow`, or `--cursor`; ordinary use does not.

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

This is a reasoning direction, not runtime phase state. Evidence can return work to framing or design, and implementation results still require independent review by a different actor. See [workflow.md](templates/.omp-flow/workflow.md) for the complete semantics.

## Credits

- [pi-maestro-flow](https://github.com/catlog22/pi-maestro-flow/blob/089f067ca669b90de7b80b38251ae3d9dfddad98/README.md) inspired the public README presentation.
- This project retains and modifies pinned [ccstatusline](https://github.com/sirmalloc/ccstatusline/tree/83c8ffd551ec700fceeed98fe9ab50de84cb49fa) software; its upstream license and notice remain beside the integration.

## License

omp-flow is available under the [MIT License](LICENSE) with `Copyright (c) 2026 Andyduck-ops`.

The ccstatusline integration remains subject to its separate [LICENSE](integrations/ccstatusline/LICENSE) and [NOTICE](integrations/ccstatusline/NOTICE).

## Friendly links

[Linux DO](https://linux.do/)
