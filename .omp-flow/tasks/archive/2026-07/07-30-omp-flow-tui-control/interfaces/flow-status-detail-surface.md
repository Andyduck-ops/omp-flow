---
type: "Interface"
title: "Flow Status read-only detail surfaces"
---

# Flow Status read-only detail surfaces

This contract defines the first-release drill-down surfaces for the
[Harness-native Flow Status design](../design.md). They consume
[Flow Status snapshot v2](flow-status-snapshot-v2.md), including its separately labelled optional
[v1 native activity](flow-status-snapshot-v1.md), are read-only, and never authorize control.

## Direct CLI

```text
omp-flow status inspect [--json]
```

The command resolves the current repository and session through the normal portable runtime
boundary, validates the latest snapshot, and prints:

- selected root Task ID and explicit title, semantic observation/publication/source revision,
  lease owner/revision/expiry and selection/session authority;
- current Flow index/position, movement, exact phase detail, measure source/unit-set revision and
  denominator;
- Execute work-set revision, accepted count/digest, current Work and review/rework round, without
  exposing discarded request-only acceptance attestations;
- authored Wave drill-down when present: ID/title, revision, work-set revision, ordinal/total and
  bounded focus Work IDs;
- separately labelled `Native activity`: task-set state/source/revision/digest/counts, current
  native assignment/task-local progress and attention; and
- explicit unavailable, unsupported, stale, malformed, disconnected, and unbound explanations.

It performs no publication, mutation, attach, interrupt, process stop, receipt finish, task
selection, archive, or approval. `--json` returns the validated `FlowStatusSnapshotV2` plus one
closed inspection-state/error wrapper; it never reconstructs absent v2 fields from native
activity. Wave is detail only and is absent from both persistent ccstatusline views.

## Codex Skill

The canonical managed source is:

```text
templates/common/skills/flow-status/SKILL.md
```

Codex project installation deploys the identical file to:

```text
.agents/skills/flow-status/SKILL.md
.codex/skills/flow-status/SKILL.md
```

The Skill name is `flow-status`, description is read-only status inspection, and explicit Codex
invocation is `$flow-status`. It instructs Codex to run only
`omp-flow status inspect`, summarize source/freshness and degraded reasons, and make no status or
control claim that is absent from the response. It may explain root Task/Flow, phase detail and
Wave only when the v2 branch explicitly supplies them; it labels v1 facts `Native activity`.

Setup adds the two files through the existing managed-resource deployment path for selected Codex
projects. Repeated setup is byte-identical. Removal deletes only files whose content/hash matches
the exact managed revision; modified or user-owned files remain and produce a visible conflict.
Discovery is verified through the installed Codex Skills surface. No Codex config or
`tui.status_line` field is changed.

If the Skill is missing or undiscoverable, setup and status report `unsupported`; they do not claim
that `$flow-status` remains available.

## Oh My Pi

The positive first-release capability is pinned to `@oh-my-pi/pi-coding-agent` 17.2.1 at upstream
revision `7a2ced50bea8b97dbab7d9bd579329c4ea704de0`. Its public extension API provides
`ctx.ui.setStatus(key, text)` and `pi.registerCommand`. The omp-flow extension:

- contributes compact read-only footer text under the unique key `flow-status`;
- registers `/flow-status` once for the same bounded detail view as
  `omp-flow status inspect`;
- refreshes after accepted source updates and clears the exact key on invalidation, session
  switch, shutdown, or extension disposal; and
- leaves the built-in footer, other status keys, widgets, commands, dispatch, cancellation, and
  result delivery under Oh My Pi ownership.

The footer text uses the host sanitizer and width truncation and therefore contains no ANSI or
Powerline control sequences. `/flow-status` renders read-only native detail and owns no mutation.
Repeated activation is idempotent. If the command name is already user- or extension-owned, setup
reports a conflict and keeps the existing registration; it does not create numeric aliases.
Removal clears only the exact `flow-status` key and command registration owned by the installed
extension revision.

Older or unverified versions remain unsupported and fall back to direct
`omp-flow status inspect`; they do not receive a guessed API shape. The current local handwritten
`ExtensionAPI` declaration is an implementation gap to widen to the pinned public contract, not
evidence that upstream lacks the capability.

## Claude

Claude's persistent detail is the ccstatusline Flow Status widget. Direct
`omp-flow status inspect` remains available for root Flow, Wave and native-activity provenance. No
Custom Command or slash command is required by v2.

## Bounds and failures

All surfaces redact raw payloads, prompts, transcripts, credentials, native opaque IDs by default,
and environment values. Missing, corrupt, expired, stale-selection, unsupported, or
scope-mismatched snapshots return
bounded explanations and nonzero status where appropriate; they never fall back to Markdown,
private stores, or receipt inference.

Fixtures cover direct text/JSON output, every degraded state, root/native separation, Wave
present/absent/revision/scope bounds, Codex canonical deployment,
discovery, idempotence, modified-file preservation, exact-owner removal, unchanged
`tui.status_line`, Oh My Pi positive/version-gated status and command registration, command
conflict, exact-key cleanup, old-version fallback, and absence of all mutation commands.
