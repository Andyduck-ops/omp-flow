---
type: "Reference"
title: "Snow CLI upstream source"
---

# Snow CLI upstream source

The target named by the user is [MayDay-wpf/snow-cli](https://github.com/MayDay-wpf/snow-cli),
published to npm as `snow-ai` with executable `snow`. The upstream repository was cloned with
`--filter=blob:none` into the ignored cache at `.omp-flow/cache/repos/snow-cli/`.

Evidence is pinned to commit `86a18cfbf5844c14a99dcc717eed26b8cf5b89d4` on upstream `main`,
authored `2026-07-31T14:21:27+08:00`. At investigation time on 2026-08-01, both that commit's
`package.json` and the npm `latest` dist-tag reported version `0.8.24`; npm reported its last
modification at `2026-07-31T06:25:18.602Z`.

Useful primary anchors in the pinned clone include:

- `docs/usage/en/05.Sub-Agent Configuration.md`
- `docs/usage/en/07.Hooks Configuration.md`
- `docs/usage/en/18.Skills Command Detailed Guide.md`
- `docs/usage/en/22.Team Mode Guide.md`
- `source/utils/config/projectAgents.ts`
- `source/utils/config/hooksConfig.ts`
- `source/mcp/skills.ts`
- `source/utils/execution/subAgentExecutor.ts`
- `source/utils/execution/toolExecutor.ts`
- `source/mcp/team.ts`

The website and README are useful navigation, but compatibility claims should prefer the pinned
implementation and its tests where documentation diverges. In particular, `source/hooks/` mostly
contains React application hooks and must not be confused with user-configurable workflow Hooks
stored under `.snow/hooks/`.

The clone is evidence cache, not task knowledge. Interpretations and decisions belong in linked
research Concepts.
