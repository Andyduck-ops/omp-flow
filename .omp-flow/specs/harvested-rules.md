# Harvested Rules

- [Learned Rule] Gotcha: Always check for typescript type safety in OMP extensions.

- [Learned Rule] OMP extension tools that must be hidden from any role MUST be registered with `defaultInactive: true`; `AgentDefinition.tools` alone is not a security boundary for non-defaultInactive extension tools.
- [Learned Rule] Sensitive per-role OMP tool access MUST use physical visibility (`defaultInactive` plus `.omp/agents/*` tool allowlists) as the primary authorization boundary; execute-time role checks MUST NOT rely on prompt text, environment variables, caller-provided role fields, or unavailable extension identity.
- [Learned Rule] Extension-tool execute context MUST be typed only to fields OMP actually supplies; do not invent `agentId`, `taskDepth`, role, or row-binding fields in local extension context types.
- [Learned Rule] Host-provided OMP runtime modules that are absent from workspace dependencies SHOULD be loaded with `createRequire` and lazy `require()` behind the call path that needs them, while ambient declarations provide compile-time types.
- [Learned Rule] Main/orchestrator sessions SHOULD use a lite control-plane toolbelt and delegate implementation; do not expose unnecessary implementation tools when dispatch plus coordination tools are sufficient.
- [Learned Rule] Tool frontmatter parsing MUST accept inline YAML arrays, block YAML arrays, and comma-separated scalar strings without preserving brackets, dashes, quotes, or whitespace.
- [Learned Rule] Control-plane write blockers MUST account for trusted review artifacts; if `.task/*` is blocked, review/grill results need a host-managed write path or explicitly allowed non-control-plane destination.
- [Learned Rule] Main-agent toolbelts SHOULD be kept below gateway schema limits; avoid exposing large implementation tool schemas when the orchestrator only needs read, dispatch, coordination, and decision tools.
- [Learned Rule] Executor and reviewer prompts MUST fail closed when required task context is missing; they MUST NOT infer active row, scope, or completion criteria from repository state.
- [Learned Rule] Evidence append paths MUST preserve historical bytes, handle missing trailing newlines, and append exactly one RFC 4180-encoded row per submission without parsing and rewriting prior rows.
- [Learned Rule] Workflow status checks MUST use the same current evidence contract as row completion checks and MUST NOT treat legacy `.task/{id}.json` verdict fields as passing evidence.
