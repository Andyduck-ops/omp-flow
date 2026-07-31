---
type: "Interface"
title: "Composable omp-flow status-line segment v1"
---

# Composable omp-flow status-line segment v1

This interface defines the bounded presentation seam between an existing status-line compositor
and the [omp-flow status-line design](../design.md). It consumes the closed
[status snapshot](statusline-snapshot-v1.md) and emits display-only text. It is not a widget
plugin API, a capability token, or workflow state.

## Command

```text
omp-flow statusline render --segment [--profile compact|standard|expanded] [--width COLUMNS]
```

The command reads at most 262,144 UTF-8 bytes from stdin, emits at most one line and 2,048 UTF-8
bytes on stdout, emits no ANSI unless explicitly enabled, and exits within the renderer's
500-millisecond hard deadline. It never executes another command.

`--width` is the outer compositor's allocated width and must be an integer from 20 through 64.
It is required for ccstatusline composition. ccstatusline's `terminal_width` is only the whole
terminal ceiling, never a segment allocation; the effective budget is
`min(--width, terminal_width)` when both are valid. Minimal callers may supply an
`allocatedWidth`; absent allocation outside ccstatusline selects the conservative 32-column
budget. `--profile` defaults to `compact`.

## Accepted input shapes

The preferred minimal input is:

```ts
type SegmentInputV1 = {
  kind: "ompFlowSegmentInput";
  version: 1;
  workspace: {
    cwd: string;
    repositoryRoot?: string;
  };
  host?: {
    kind?: "claude" | "codex" | "omp";
    sessionId?: string;
  };
  allocatedWidth?: number;
};
```

Unknown fields are rejected in this minimal form. The exact string
`kind: "ompFlowSegmentInput"` is the discriminator. If `kind` is present, the command must parse
only this minimal form and must not fall back to the compositor form after any validation failure.
Paths are resolved and confined to the current repository before any public runtime or Git query.

For explicit ccstatusline composition, absence of `kind` selects the ccstatusline branch. That
branch requires a non-empty `workspace.current_dir` and allowlists only:

- `workspace.current_dir` as the candidate working directory;
- `session_id` only as a source-binding candidate;
- `terminal_width` only as the whole-terminal upper bound.

All other fields, including `transcript_path`, model, cost, context, account-like data, and future
unknown fields, are ignored before snapshot assembly. They are not logged, echoed, cached,
forwarded, or used to discover other files. The outer compositor remains responsible for model,
Git, context, cost, duration, and theme presentation.

A hybrid payload containing `kind` plus ccstatusline fields is always treated as minimal v1 and
therefore rejected for unknown fields. A payload without `kind` that lacks
`workspace.current_dir`, has wrong allowlisted types, or exceeds the input bound is rejected; it
never falls through to another parser.

The supported ccstatusline recipe uses the same integer for command `--width` and Custom Command
`maxWidth`; the recommended allocation is 32 display columns. If `--width` is absent, outside
`20..64`, or does not match the reviewed `maxWidth`, setup reports nonconforming composition and
does not claim final-line width guarantees.

The process inherits an environment because that is normal child-process behavior, but the
segment implementation reads only documented omp-flow configuration and ordinary process settings
needed for UTF-8/color behavior. It does not enumerate, serialize, or expose inherited
environment variables.

## Output semantics

The segment contains only the omp-flow zone:

```text
omp:<bundle> [plan current/total | ops ✓n ↻n ✕n] [activity] [attention] [action]
```

- Composition mode never emits a graphical bar. Eligible work progress is a labelled ratio such
  as `plan 3/5`; this prevents collision with an outer context or quota bar.
- Context, Git, cost, duration, tokens, quota, and receipt counts never become work percentage.
- Missing optional facts collapse without stray separators.
- Expected stale or failed facts remain visibly degraded.
- Whole hidden detail is disclosed with bounded `+N`.
- Text is compacted by display columns; ANSI bytes and UTF-8 byte length are not treated as
  terminal width.

The segment is separator-safe: it has no leading or trailing outer separator. The compositor owns
spacing, flex placement, and the separator between its host zone and this segment.

## Failure behavior

- Invalid, oversized, unsafe-path, or malformed input emits no stale progress and returns a
  nonzero status with bounded redacted stderr.
- A missing task may emit `omp:no-task`.
- Public runtime or Git failure may emit a compact degraded marker but never private raw data.
- Timeout emits the safest already-built prefix or nothing, then exits.
- Snapshot data and output text cannot authorize open, attach, interrupt, stop, receipt mutation,
  or any other action.

## Coexistence and installation

omp-flow does not edit an occupied status-line command or install a ccstatusline Custom Command
widget automatically. Setup may print an exact user-reviewed example and preview its output.
Uninstall removes only an exact omp-flow-owned standalone command; it does not edit independently
owned compositor configuration.

## Verification

Fixtures cover discriminated minimal input, ccstatusline full payload, hybrid input, unknown/private
fields, missing ccstatusline workspace, future fields, non-ASCII Windows paths, invalid width,
missing/mismatched ccstatusline allocation and `maxWidth`, effective whole-terminal ceiling,
oversized stdin, separator collapse, ratio-only work progress, stale snapshots, output bounds,
timeout, redacted stderr, and proof that transcript/account/credential paths, inherited secrets,
and the network are never read.
