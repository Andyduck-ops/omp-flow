---
type: "Design"
title: "Project-owned Snow and Cursor Flow Status commands"
---

# Project-owned Snow and Cursor Flow Status commands

This design realizes the direction selected in the
[display synthesis](research/synthesis.md) and the observable contract in the [PRD](prd.md). It
adds one project-owned on-demand command per Harness and leaves the shared `flow-status` Skill as
the sole inspection procedure. It does not add a persistent display.

## Design boundary

The product-owned additions are exactly:

- `templates/snow/commands/flow-status.json`, installed as
  `.snow/commands/flow-status.json` only when Snow is selected; and
- `templates/cursor/commands/flow-status.md`, installed as
  `.cursor/commands/flow-status.md` only when Cursor is selected.

The existing `templates/common/skills/flow-status/SKILL.md`, installed at
`.agents/skills/flow-status/SKILL.md`, remains the only component allowed to resolve the current
Harness, prove the exact session, call `status inspect`, interpret unavailable states, and render
the Agent response. The command resources contain no shell command, Python path, cache path,
session variable, renderer, or fallback-selection procedure.

No product runtime, Hook, persistent status-line integration, user-home file, or new CLI command is
part of this change.

## Exact native resources

### Snow prompt command

`templates/snow/commands/flow-status.json` is UTF-8 JSON with a trailing newline and exactly this
logical value:

```json
{
  "name": "flow-status",
  "command": "Use the shared project `flow-status` Skill now. Report its read-only result as on-demand Agent-chat output. Follow the Skill's exact host/session checks and unavailable behavior; do not infer or fall back when evidence is missing, conflicting, stale, malformed, disconnected, or scope-mismatched. This command does not provide a persistent status line.",
  "type": "prompt",
  "description": "Show project Flow Status on demand in Agent chat.",
  "location": "project"
}
```

The filename makes the native command `/flow-status`. `type: "prompt"` is binding: Snow sends the
`command` value into the current conversation and does not use the session-blind custom-command
shell spawn. `location: "project"` documents the intended source even though Snow's loader also
derives project location from `.snow/commands`. `name` agrees with the filename; Snow 0.8.24
infers and normalizes the effective name from that filename. No argument placeholder or options
are needed.

This format follows the released Snow command contract recorded in
[Snow display research](research/snow-display.md) and the exact upstream revision in the
[Snow 0.8.24 reference](reference/snow-cli-v0.8.24.md).

### Cursor project command

`templates/cursor/commands/flow-status.md` is UTF-8 Markdown with a trailing newline and this exact
body, without frontmatter:

```markdown
Use the shared project `flow-status` Skill now. Report its read-only result as on-demand Agent-chat output. Follow the Skill's exact host/session checks and unavailable behavior; do not infer or fall back when evidence is missing, conflicting, stale, malformed, disconnected, or scope-mismatched. This command does not provide a persistent status line.
```

Cursor derives `/flow-status` from the filename and supplies the Markdown as a reusable prompt in
Agent chat. Omitting frontmatter avoids depending on metadata that the selected project-command
contract does not require. This is an on-demand command for Cursor Agent surfaces, not Cursor
CLI's user-global `statusLine` and not a Cursor Desktop status-bar contribution. The evidence and
remaining persistent-surface unknowns are recorded in
[Cursor display research](research/cursor-display.md).

Using identical instruction text for both Harnesses keeps their semantic promise aligned without
duplicating the Skill procedure. The small Snow-only description and schema fields are native
resource metadata, not a second implementation.

## Invocation and data flow

```text
user invokes /flow-status
  -> Harness loads the project command
  -> command asks the current Agent to use the shared project flow-status Skill
  -> Skill proves one current host and exact session from native/process evidence
  -> Skill executes the project-local read-only status inspect surface
  -> validated fresh result, or explicit unavailable, is reported in Agent chat
```

For Snow, normal Agent terminal execution supplies `SNOW_SESSION_ID`; the custom prompt command
does not attempt to supply it. For Cursor, the existing project `sessionStart` Hook must already
have supplied `OMP_FLOW_HOST=cursor` and matching `OMP_FLOW_CONTEXT_ID`. Missing or conflicting
evidence stops in the Skill as unavailable. Neither command selects another session, enumerates
cache entries, reads Bundle Markdown for status, publishes or renews a lease, or preserves an old
result as current.

Skill execution is model-mediated on both prompt surfaces. The product promise is that the native
command instructs use of the Skill and exposes its result on demand, not that every Harness/model
release deterministically honors every prompt. Documentation and tests must retain that
distinction.

## Component and ownership changes

### CLI resource registration

`src/cli/init.ts` adds one ordinary `ManagedResource` object to `SNOW_RESOURCES` and one to
`CURSOR_RESOURCES`:

| Source | Destination | Group |
|---|---|---|
| `templates/snow/commands/flow-status.json` | `.snow/commands/flow-status.json` | `snow` |
| `templates/cursor/commands/flow-status.md` | `.cursor/commands/flow-status.md` | `cursor` |

They flow through `ALL_MANAGED_RESOURCES`, `getManagedResources`, package-root validation, init,
hash recording, backup, and update exactly like the existing Harness resources. No special
renderer or placeholder substitution is needed in `renderManagedResource`.

There is no new CLI syntax. Existing `init --snow`, `init --cursor`, combined init, `--dry-run`,
`--force`, `--skip-existing`, and `update` behavior automatically applies. The help command already
names the Harness-selection flags, so code in `src/cli/index.ts` needs no new action or option.

### Managed-resource behavior

The existing `.omp-flow/.template-hashes.json` remains the sole project resource-ownership
record. The command files introduce no command-specific manifest.

| Observed destination | Existing machinery's truthful behavior |
|---|---|
| Missing during selected init | Create canonical bytes and record their hash. |
| Existing during normal init | Skip it; do not merge or silently claim foreign content. |
| Existing during explicit `init --force` | Overwrite by explicit user request and record the canonical hash. |
| Missing on update with no stored hash | Treat as a new selected resource, create it, and record its hash. |
| Bytes equal canonical with no stored hash | Report unchanged and leave it unclaimed; a later divergence remains a conflict. |
| Owned bytes unchanged while the packaged template changes | Report `autoUpdate`, back up managed files, replace the command, and update its hash. |
| Owned file deleted | Report `userDeleted` and preserve the deletion, including under update `--force`. |
| Owned file modified, or pre-existing foreign bytes have no hash | Report `changed`; default/skip preserves it, create-new writes `.new`, and explicit force overwrites only after backup. |

These rules apply to the files as indivisible resources. JSON or Markdown is never merged or
parsed to claim individual fields. A user-global command with the same name is outside omp-flow's
ownership. Snow's project command naturally takes its documented project precedence; omp-flow
does not edit the global resource.

### Package and documentation

`package.json` already ships the complete `templates` tree, so no `files` entry or export change is
required. Package verification must nevertheless prove that both exact new template paths occur
in `npm pack --dry-run` output; package-root validation then fails visibly if a selected installed
package omits either source.

README changes are required in four places where applicable:

1. the repository/template tree names the Snow and Cursor `commands/flow-status` resources;
2. the Snow adapter section says `/flow-status` is project-owned, on demand, model-mediated Agent
   chat, while Snow 0.8.24 StatusLine is user-global and lacks current-session identity;
3. the Cursor adapter section says `/flow-status` is a project command for on-demand Agent chat,
   while Cursor CLI `statusLine` is user-global and update-driven and Cursor Desktop persistence
   would require a separate extension boundary; and
4. the Flow Status capability summary replaces the incomplete Snow/Cursor bullets with those
   exact available/unavailable distinctions and keeps `.agents/skills` as their only Skill tree.

Documentation must not say that Snow lacks any native StatusLine API, that Cursor lacks a CLI
status line, that either command is a footer, or that released lifecycle/session behavior has been
proved beyond the existing evidence.

## Failure behavior and compatibility

- Invalid or missing packaged canonical files fail through existing package-root validation; the
  CLI must not synthesize replacement content.
- Foreign, modified, or deliberately deleted project command files remain visible through the
  existing init/update plan and are not silently repaired or merged.
- A missing shared Skill, failure to invoke it, missing exact session evidence, stale lease,
  malformed observation, disconnected publisher, or scope mismatch produces no fallback status
  claim. When the Skill runs, it reports the unavailable condition explicitly as already defined.
- The command response is ephemeral Agent-chat output. There is no persistent old line whose
  content must be cleared and no refresh timer whose operation could imply freshness.
- The Snow schema is anchored to `snow-ai@0.8.24`. Older locally resolved Snow versions are not
  newly claimed as verified; inability to discover or execute the prompt command is an unsupported
  Harness condition, not a reason to install a global plugin or direct execute command.
- Cursor commands remain subject to Cursor's documented beta/model-mediated command behavior.
  Existing uncertainty about real Hook environment propagation can only yield unavailable and is
  not hidden by a project-global session choice.
- Existing projects without the command receive it as a new managed resource on `update` only when
  the destination is absent. Existing content at that path is preserved unless the user explicitly
  selects an overwrite path.
- Snow-only and Cursor-only selection remain isolated. Combined selection still installs one
  shared `.agents/skills/flow-status/SKILL.md`, not one copy per Harness.

No migration of runtime cache data, operation receipts, Hooks, or authored task knowledge is
needed.

## Verification strategy

Extend `tests/snow-cursor-managed-resources.test.ts` rather than introduce a separate lifecycle or
test harness:

1. Parse the canonical Snow JSON and assert its exact keys and values, `type === "prompt"`,
   `location === "project"`, matching name/filename, and bounded non-empty prompt.
2. Read the Cursor Markdown and assert the exact canonical body and absence of frontmatter.
3. For both prompts, assert the shared instruction names `flow-status`, labels output on demand and
   Agent-chat, preserves unavailable behavior, and rejects semantic drift by containing none of
   `.omp-flow/scripts/omp_flow.py`, `status inspect`, cache-selection language, session-variable
   names, direct shell execution, or a persistent-display claim.
4. Assert `getManagedResources(["snow"])`, `getManagedResources(["cursor"])`, and the combined
   selection contain only their applicable command destination, while both installations still
   share the one core Skill and create no `.snow/skills`, `.cursor/skills`, Cursor rule, or global
   plugin/config path.
5. Extend Snow-only, Cursor-only, combined, and mixed init assertions to include the exact command
   bytes and to show unselected Harness commands are absent.
6. Exercise the two command paths themselves through the ownership matrix: freshly owned
   unchanged, owned deletion preserved, owned modification reported as `changed`, pre-existing
   foreign content preserved and reported as `changed`, explicit forced conflict replacement after
   backup, and canonical change over unmodified owned bytes classified `autoUpdate`.
7. Inspect `package.json` and `npm pack --dry-run` output to prove both canonical resources are in
   the package, rather than relying only on the broad `templates` include.
8. Assert README contains the on-demand Snow/Cursor command paths and the persistent-surface
   boundaries, and does not retain the false broad claim that Snow has no status-line API.

Run the repository gates required by the PRD:

```text
python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks templates/snow/hooks templates/cursor/hooks
npm run build
npm test
npm pack --dry-run
git diff --check
```

No integration test should claim that a prompt deterministically activates a Skill. A manual
released-Harness smoke check may confirm discovery and representative Agent-chat behavior, but it
remains observational and must not be converted into a persistent-display guarantee.

## Rejected alternatives

- **Snow StatusLine plugin:** rejected because installation is user-global and its public context
  has no current Snow session ID. Repository `cwd` cannot distinguish concurrent sessions.
- **Snow AnyPanel plugin:** rejected for this task because the plugin is user-global even though
  its panel receives an exact session. It needs a separately approved setup/update/remove and
  collision policy.
- **Snow direct `execute` command:** rejected because the custom-command shell spawn does not
  establish exact current-session identity. The prompt plus shared Skill uses the normal Agent tool
  path without duplicating inspection logic.
- **Cursor CLI `statusLine`:** rejected from normal init because its configuration is user-global,
  refresh is conversation-update-driven rather than proven lease-driven, session/resume equivalence
  is not released-runtime verified, and empty/failure output may retain stale text.
- **Cursor Desktop status-bar extension:** rejected as a materially larger, separately owned IDE
  extension boundary with no project command equivalence.
- **Global Hooks, transcript parsing, newest/sole cache selection, or configured-Harness fallback:**
  rejected because they cannot truthfully prove the current exact session.
- **A duplicate Snow/Cursor Skill, Cursor rule, direct CLI prompt, second renderer, or second cache:**
  rejected because the shared Skill and validated v2 cache already own those responsibilities.
- **New CLI flags, a command ownership manifest, or field-level JSON merge:** rejected because the
  existing Harness selection and whole-file hash ownership machinery already provide the required
  behavior.

## Residual risks and next gate

The remaining non-blocking risks are model-mediated Skill invocation, Snow version availability,
and Cursor Hook environment propagation. They cannot create a false current status because the
commands hold no state and the shared Skill fails unavailable when identity or freshness is not
proved. They do limit the frequency with which users may receive a useful result and must remain
visible in documentation.

This Design does not approve implementation. The next entry is this file for independent QbD 1;
work decomposition must wait for a linked human approval after that audit.
