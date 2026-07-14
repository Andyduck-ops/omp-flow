# omp-flow

omp-flow is a disciplined AI workflow control plane for Claude Code. It is built
on a fork of the Trellis framework (Andyduck-ops/Trellis); see `COPYRIGHT` for
upstream attribution and modifications.

## Install / usage

Build the workspace and run the CLI:

    pnpm install
    pnpm build
    node packages/cli/bin/omp-flow.js init --claude

`init` deploys the omp-flow methodology (workflow control plane, Claude agents,
hooks, and skills) into the target repository.

## Status

Milestone M1 is Claude-first: only the Claude Code platform is accepted by
`init`. Other platforms are parked for later milestones.

## License

AGPL-3.0-only. See `LICENSE` and `COPYRIGHT`.
