---
type: "Interface"
title: "Standalone host and Git presentation input v1"
---

# Standalone host and Git presentation input v1

This contract defines transient, bounded presentation facts used only by the standalone
[status-line renderer](../design.md). It is separate from the closed
[omp-flow snapshot](statusline-snapshot-v1.md): host and Git facts never become Bundle meaning,
work progress, approval, or control authority.

## Claude host allowlist

The standalone Claude adapter may extract only these documented status-line JSON fields:

```ts
type ClaudeHostPresentationRaw = {
  session_id: string;
  cwd?: string;
  workspace: {
    current_dir: string;
    project_dir?: string;
  };
  model?: {
    id?: string;
    display_name?: string;
  };
  cost?: {
    total_cost_usd?: number;
    total_duration_ms?: number;
  };
  context_window?: {
    used_percentage?: number;
    remaining_percentage?: number;
  };
};
```

The complete stdin remains capped at 262,144 UTF-8 bytes. `session_id`, paths, model strings, and
display labels are capped at 512 UTF-8 bytes before normalization; control characters are
rejected. Cost must be finite and within `0..1_000_000` USD. Duration must be a finite integer
within `0..31_536_000_000` milliseconds. Negative, non-finite, wrong-type, oversized, or
inconsistent fields become `degraded` when expected and otherwise `unsupported`.

Context normalization follows the snapshot contract: the canonical value is whole percent used,
fill increases as use increases, valid `used_percentage` wins only when a supplied
`remaining_percentage` agrees within one percentage point after rounding, and remaining-only input
is converted with `100 - remaining`.

Other raw fields—including `transcript_path`, raw token totals, account data, future unknown
fields, and output-style metadata—are discarded after top-level parsing. Raw stdin and discarded
fields never reach logs, caches, debug output, or error messages.

## Normalized host facts

```ts
type Presence = "value" | "empty" | "notApplicable" | "unsupported" | "degraded";

type HostPresentationV1 = {
  version: 1;
  repositoryRoot: string;
  host: "claude";
  hostSessionId: string;
  model: Present<string>;
  contextUsedPercent: Present<number>;
  sessionCostUsd: Present<number>;
  sessionDurationMs: Present<number>;
};

type Present<T> =
  | { state: "value"; value: T }
  | { state: "empty" | "notApplicable" | "unsupported" | "degraded" };
```

Unknown fields in the normalized form are rejected. Model prefers non-empty `display_name`, then
`id`. Cost and duration are opt-in presentation only and are never accumulated locally.

## Normalized Git facts

Git is read only from the canonical repository using bounded public commands with
`GIT_OPTIONAL_LOCKS=0`, no network, and the renderer deadline:

```ts
type GitPresentationV1 = {
  version: 1;
  repositoryRoot: string;
  branch: Present<string>;
  detachedSha: Present<string>;
  dirty: Present<boolean>;
  staged: Present<number>;
  unstaged: Present<number>;
  untracked: Present<number>;
  conflicts: Present<number>;
  ahead: Present<number>;
  behind: Present<number>;
  observedAtUnixMs: number;
  maxAgeMs: 2000;
};
```

Branch is 1–256 UTF-8 bytes without control characters; detached SHA is 7–64 lowercase
hexadecimal characters; counts are integers in `0..1_000_000`. `repositoryRoot` must equal the
current render scope. Unknown, oversized, wrong-root, expired, or malformed cached Git data is
rejected or visibly degraded. No PR/CI network query is part of v1.

## Data handling and verification

Only normalized `HostPresentationV1`, normalized `GitPresentationV1`, and the closed status
snapshot may reach rendering or a presentation cache. Raw host bytes and ignored fields may exist
only for the lifetime of the adapter invocation. Bounded redacted errors may name the failing
allowlisted field but never include its value.

Fixtures cover every presence state, used/remaining context orientation, bad numeric values,
oversized/control-character strings, detached HEAD, Git counts, wrong repository, corrupt/stale
cache, raw-field redaction, Windows UTF-8 paths, and proof of no transcript, credential, account,
Keychain, network, or arbitrary child-command access.
