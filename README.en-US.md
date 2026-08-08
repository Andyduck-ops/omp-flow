

<div align="center">

# omp-flow

**Consolidate investigation, design, implementation, and independent review into project-local, Git-tracked knowledge.**

Chinese · [English](README_EN.md)

[![npm](https://img.shields.io/npm/v/omp-flow?label=npm)](https://www.npmjs.com/package/omp-flow)
[![GitHub](https://img.shields.io/github/stars/Andyduck-ops/omp-flow?style=flat&label=GitHub)](https://github.com/Andyduck-ops/omp-flow)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<img src="docs/assets/omp-flow-hero.webp" alt="Five Harnesses collaborate via project-local Markdown knowledge" width="100%">

<sub>Task knowledge stays in Git-visible Markdown; models, native Agents, concurrency, and UI stay in your Harness.</sub>

</div>

## Quick Start

Install the CLI globally:

```bash
npm install -g omp-flow@latest
```

Navigate to your project and initialize. The `-u` flag only sets the Git `user.name` for the current repository:

```bash
cd <your-project>
omp-flow init -u "Your Name"
```

The interactive panel will list Oh My Pi, Codex, Claude Code, Snow, and Cursor. All are selected by default on first initialization; use space to toggle and Enter to confirm. Then, open any selected Harness in the project and describe the work to be done as usual. Project-local instructions will guide it to use omp-flow.

To update the global CLI and project-managed files later:

```bash
npm install -g omp-flow@latest
cd <your-project>
omp-flow update
```

Flags like `--omp`, `--codex`, `--claude`, `--snow`, or `--cursor` are only needed for non-interactive environments; you don't need to memorize them for daily use.

## What omp-flow Does

omp-flow provides a portable methodology and a minimal mechanical core for multi-Agent development, while preserving the native execution experience of each Harness.

| Boundary | Owner | Responsibility |
| --- | --- | --- |
| Task Bundle & Concepts | Git-tracked Markdown | Captures framing, sources, requirements, design, decisions, work, handoffs, and review |
| `.omp-flow` Python runtime | omp-flow | Only guarantees sessions, paths, actors, locks, atomic operations, and opaque receipts |
| Native Execution | Your Harness | Continues to handle models, Agent dispatch, concurrency, progress, cancellation, isolation, and UI |

Therefore, omp-flow does not parse Markdown into a lifecycle database, nor does it take over the platform's model or scheduling systems.

## Supported Harnesses

| Harness | Project-Local Integration |
| --- | --- |
| Oh My Pi | Extensions, native Agents, Skills, and settings |
| Codex | Native Agents, Hooks, and shared Skills |
| Claude Code | Native Agents, Hooks, Skills, and settings |
| Snow | Native Agents, Hooks, and shared Skills |
| Cursor | Native Agents, Hooks, and shared Skills |

Initialization only installs the integrations you select; task knowledge remains a single portable Bundle.

## Workflow Overview

```text
brainstorm ↔ research → design → QbD → work map → QbD → implementation → review → finish
```

This is a reasoning direction, not a runtime phase state. Evidence can route work back to framing or design; implementation outcomes must also undergo independent review by different actors. See [workflow.md](templates/.omp-flow/workflow.md) for full semantics.

## Acknowledgements

- The project retains and modifies a pinned version of the [ccstatusline](https://github.com/sirmalloc/ccstatusline/tree/83c8ffd551ec700fceeed98fe9ab50de84cb49fa) software; its upstream license and notices are preserved alongside the integration.

## License

omp-flow is licensed under the [MIT License](LICENSE), with copyright `Copyright (c) 2026 Andyduck-ops`.

The ccstatusline integration continues to be governed by its own [LICENSE](integrations/ccstatusline/LICENSE) and [NOTICE](integrations/ccstatusline/NOTICE).

## Links

[Linux DO](https://linux.do/)
