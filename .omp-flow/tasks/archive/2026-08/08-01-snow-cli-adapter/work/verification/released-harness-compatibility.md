---
type: "Verification"
title: "Released Snow and Cursor compatibility evidence"
---

# Released Snow and Cursor compatibility evidence

## Result

Status: **DONE_WITH_CONCERNS** for
[Released-Harness compatibility verification](../released-harness-verification.md).

The accepted `omp-flow@0.2.6` build installs the exact Snow and Cursor resource set and all 17
installed native-file hashes match the rendered packed templates and the installed managed hash
manifest. The available released Harnesses do not establish the full lifecycle claim:

- Snow `0.7.23` executes the installed Windows project `onSessionStart` command on resume and
  demonstrates project-over-global precedence, but its native payload contains only `messages`
  and `messageCount`. It supplies no session identity, cwd, or resume flag, so the installed
  handler correctly returns bounded unavailable orientation and cannot select a task.
- Cursor `3.13.25` is installed outside `PATH`. Its bundled desktop CLI advertises an `agent`
  subcommand, but the non-interactive invocation detached into a desktop process tree, emitted no
  agent CLI result, and produced no Hook capture. Top-level, concurrent, resume, subagent, write
  enforcement, and exact native identity paths therefore remain unavailable.

No receipt or actor value was created, rewritten, normalized, or aliased during these probes. No
failed path selected another session, Harness, or task. No product source was changed.

## Provenance and environment

- Date: `2026-08-01`, timezone `Asia/Shanghai`.
- Repository source revision: `e14b5495830ba9821699898c23ba278680289fcc` with the accepted,
  not-yet-committed implementation worktree described by the linked handoffs/reviews.
- OS: Microsoft Windows `10.0.26200`, x64.
- Shell: PowerShell `7.6.4`.
- Node.js: `v22.22.2`; npm: `10.9.7`; Python: `3.12.7`; Git:
  `2.55.0.windows.2`.
- Packed product: `omp-flow@0.2.6`, SHA-256
  `889fa1c6e67198f0f8c25c126f4f386d8c78ac4529c0fa59fd97425f79842888`.
- Snow: npm package `snow-ai@0.7.23`; entry-bundle SHA-256
  `fc611d7d882d63e2e4458cea30b2f692e0de6a90588bde5279b7db4dba612a75`;
  package metadata SHA-256
  `cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419`.
- Cursor: registered desktop install `3.13.25`, build
  `31e8d61c448c7472e371505838a0fe34083dad50`, x64; `Cursor.exe` SHA-256
  `7c8d34632a703e07e1ce69dea64ce0141a32624e555ec708d5a8015d7ab8371c`.
  `agent`, `cursor-agent`, and `cursor` were absent from `PATH`; the registered bundled
  `resources/app/bin/cursor.cmd` was invoked explicitly.

All Harness runs used an isolated temporary project and isolated user-data/profile directories.
Prompts were fixed synthetic probe labels. Captures below retain only versions, commands, payload
field names, counts, exit/timeout facts, and bounded error categories; they contain no credential,
real conversation, or user-authored content.

## Packed installation and managed hashes

The source was built, packed into an ignored temporary cache, installed with npm into an empty
temporary project, and initialized from the installed binary:

```text
npm run build
npm pack --pack-destination <probe>
npm install --prefix <probe>/project <probe>/omp-flow-0.2.6.tgz --no-audit --no-fund
node <probe>/project/node_modules/omp-flow/bin/omp-flow.js init --snow --cursor --skip-existing
```

The installed config contained exactly `snow,cursor` in normalized order. The two native roots
contained exactly nine Snow and eight Cursor resources. For every row below, the installed file
hash equaled both `.omp-flow/.template-hashes.json` and the independently rendered package
template hash (`{{PYTHON_CMD}} -> python`):

| Installed path | SHA-256 |
|---|---|
| `.cursor/agents/omp-flow-architect.md` | `68c2c7668f9ad135a7eea7ac1ea9f0159df3d9ddfdde381717db3a0501158e57` |
| `.cursor/agents/omp-flow-check.md` | `9ed80108b1766c7f84936bc9b68d210b91b9afdf39f77b384bd0d83e0216666d` |
| `.cursor/agents/omp-flow-implement.md` | `b3dad545b6375003530a5d6208510d0cf1c4d96c90eff8ecc92731e300d861ea` |
| `.cursor/agents/omp-flow-qbd.md` | `3a9e42c00d4ce5ca4baa5284c036cf640557bb81b1e6ca6e8faa66ce4a0625ef` |
| `.cursor/agents/omp-flow-research.md` | `c9c582b20b32697518ead50938dc7a4c730cac4847a1ee9ef03905112233cd19` |
| `.cursor/hooks.json` | `b8d143be7c636569de7150880728505c2ce6ee3697a431fac71eee53ee4cbb4b` |
| `.cursor/hooks/protect-runtime.py` | `96954fc56adf897ee1cca5a0512322648326962e203910fed20d17054b4d9d45` |
| `.cursor/hooks/session-start.py` | `b419503fe2e07b2de282f38f072777057b88abe0e7c526a2b9c364c150aa204c` |
| `.snow/agents/omp-flow-architect.md` | `fdeda5f504f0402b32310cb6553f86fa7d3786e6a3eb4482688c8732abb2bf61` |
| `.snow/agents/omp-flow-check.md` | `771ea425131653b363a1eab0b9dca04cdf9cde790148343a9b2feaf89f95e28b` |
| `.snow/agents/omp-flow-implement.md` | `d3fdd25bc09481c7723131fc59b78bb01dce8c2b47b0e0a9af6fcbd11cba598b` |
| `.snow/agents/omp-flow-qbd.md` | `4fb1cca31640194014d97db90e70a6cad8a720ac2697ba58edf4b8c01cfbf5f5` |
| `.snow/agents/omp-flow-research.md` | `f4c625eeb10175c58e418ced74fb55fd9f46e94304478bbb03461ad7267acb4d` |
| `.snow/hooks/beforeToolCall.json` | `8ff04ad4bb4e28b292aa331dec46fde0495a59bf49f191c12fdaa1179665a45a` |
| `.snow/hooks/onSessionStart.json` | `c4413ad836274daed7f648ff4d19e5b737892c4a19def98a60c6aa40c5737aa7` |
| `.snow/hooks/protect-runtime.py` | `53afd2ae7c2e1c72209ddca1e2e0f1fc688feb3a92c1eb69645288cb01499ee0` |
| `.snow/hooks/session-start.py` | `4ba6623e7bab4bba82c2dcbd07d58cd15d1e0e8b3f680d958d50dc2f175ce459` |

Result: `17/17` hashes matched; zero missing, extra, manifest-mismatched, or
rendered-template-mismatched native files.

## Snow released-runtime matrix

The actual runtime was launched through its installed entry with isolated profile state. A
temporary `python.cmd` placed first on the probe-only `PATH` recorded the command argument, the
synthetic `SNOW_SESSION_ID` label, and the JSON top-level field names before forwarding stdin
unchanged to the real Python executable. The product resource and handler were not edited.

### Native 0.7.23 resume capture anchors

The repair probe used only
`<repo>/.omp-flow/cache/released-harness-verification-369d3d/`, which did not exist before the
probe. The project handler was copied byte-for-byte from the accepted template; both source and
probe copies hashed to
`4ba6623e7bab4bba82c2dcbd07d58cd15d1e0e8b3f680d958d50dc2f175ce459`.
The following are the exact commands and environment assignments with only machine-local roots
redacted:

```powershell
$probe = '<repo>/.omp-flow/cache/released-harness-verification-369d3d'
$env:USERPROFILE = "$probe/profile"
$env:APPDATA = "$probe/profile/AppData/Roaming"
$env:LOCALAPPDATA = "$probe/profile/AppData/Local"
$env:SNOW_SESSION_ID = 'synthetic-parent-env-369d3d'
$env:PATH = "$probe/bin;<original-PATH>"
Set-Location "$probe/project"
node <global-npm>/snow-ai/bundle/cli.mjs -c 11111111-2222-4333-8444-555555555555
```

`node -e "console.log(require('os').homedir())"` under those assignments returned exactly
`<probe>/profile`. The synthetic resume record was
`<probe>/profile/.snow/sessions/11111111-2222-4333-8444-555555555555.json`; it contained no real
conversation or user content. The project event command was exactly
`python .snow/hooks/session-start.py`. The same-event isolated global sentinel command was
exactly `python .snow/hooks/global-sentinel.py`. The recorder-first `python.cmd` forwarded the
original stdin bytes and arguments to the real Python interpreter after recording only the fields
shown below.

The final run had a 15-second supervisor ceiling. It observed the recorder entry before the
ceiling, then stopped its otherwise-interactive process handle after capture at 8,403 ms. Thus the
timeout ceiling was **not reached**, the command had **no natural exit**, forced termination was
**true**, and that process handle's exit code after forced termination was `-1`. The initial
post-run query found zero command lines containing the probe-directory marker. During directory
cleanup, however, Windows reported the project directory still in use; a broader query found one
detached `node` process with the exact synthetic `-c
11111111-2222-4333-8444-555555555555` command but no directory marker. It was uniquely matched and
terminated. The final exact-UUID process count was zero and the validated probe tree was absent.

Bounded sanitized recorder output (one JSONL record) and derived counts:

```json
{"handler":".snow/hooks/session-start.py","snow_session_id":"synthetic-parent-env-369d3d","snow_session_id_category":"synthetic-parent-supplied-non-native","stdin_top_level_keys":["messageCount","messages"]}
{"global_invocation_count":0,"project_invocation_count":1,"recorder_line_count":1}
```

The `SNOW_SESSION_ID` value above was deliberately supplied by the parent probe and is categorized
as synthetic/non-native. It proves that the released Hook child inherited the supplied
environment value; it does **not** prove that Snow `0.7.23` generated or selected its own native
session identity. The stdin capture separately proves that the released resume event supplied
only `messageCount` and `messages` at top level.

| Path | Result | Sanitized observation |
|---|---|---|
| New headless session | **Unavailable** | `snow --ask <synthetic>` entered headless mode, invoked no captured `onSessionStart` command, and reached repeated provider network failures before the 30-second probe timeout. No tool call was made. |
| Resume project Hook on Windows | **Command execution supported; orientation unavailable** | Resuming the synthetic UUID session invoked exactly `python .snow/hooks/session-start.py`. The live stdin keys were exactly `messageCount,messages`; `sessionId`/`session_id`, `cwd`, and `isResume` were absent. The handler exited safely with bounded unavailable output, which Snow `0.7.23` did not inject or display. |
| Two `SNOW_SESSION_ID` values | **Portable resolver supported; native injection unproven** | The packed runtime created and re-read distinct selected tasks under synthetic alpha and beta values. A third value and a missing value both returned `taskId: null`, `source: none`; no project-global fallback occurred. The released Snow payload did not provide these identities, so this is not a native lifecycle support claim. |
| Project-over-global precedence | **Supported for exercised `onSessionStart` path** | An isolated same-event global command was installed beside the generated project Hook. Resume produced one project-handler invocation and zero global-sentinel invocations. No real user global Hook was read or changed. |
| `beforeToolCall` Windows command and unsafe-write deny | **Unavailable** | The isolated provider request failed before Snow produced any tool call, so the released runtime never exercised `beforeToolCall`. Handler fixtures are not substituted for this missing native event. |
| POSIX Hook commands | **Unavailable** | This host is Windows; no POSIX Snow runtime was available. |
| Native role dispatch / exact operation identity | **Unavailable** | `snow --help` exposes no caller-selected unique execution identity for the role path, and no released invocation proved `native item ID = actorId` before `operation start`. Installed cards were not treated as proof. |

### Corroboration only, not native evidence

Snow `0.7.23` installed-bundle inspection corroborates only the observed payload and precedence
behavior: it loads project rules before global rules and calls `onSessionStart` with
`{messages,messageCount}`. The portable resolver fixture separately corroborates isolation and no
fallback for explicitly supplied `SNOW_SESSION_ID` values. Neither source inspection nor the
fixture substitutes for the native capture above. The Bundle's pinned Snow target is `0.8.24`;
that release was not installed and was not claimed as run.

## Cursor released-runtime matrix

The registered Cursor CLI was resolved explicitly because none of its command names was on
`PATH`:

```text
<cursor-install>/resources/app/bin/cursor.cmd --version
<cursor-install>/resources/app/bin/cursor.cmd --help
<cursor-install>/resources/app/bin/cursor.cmd --user-data-dir <isolated> agent
```

The version and help commands exited `0`; help advertised `agent` as “Start the Cursor agent in
your terminal.” In this non-interactive environment, the agent invocation exited its wrapper with
no stdout/stderr, detached into a Cursor desktop process tree under the isolated user-data path,
and produced no Python Hook invocation. The entire verified isolated process tree was terminated;
no pre-existing Cursor process or profile was touched.

| Path | Result | Exact evidence limit |
|---|---|---|
| Top-level `sessionStart` env injection | **Unavailable** | No agent CLI conversation or Hook payload was produced. |
| Two concurrent conversations | **Unavailable** | No first conversation could be established; no `conversation_id` capture exists. |
| Reopen/resume | **Unavailable** | No captured conversation existed to reopen or resume. |
| Subagent inheritance | **Unavailable** | No top-level agent session existed and no `subagentStart` event was captured. |
| Released write deny enforcement | **Unavailable** | No released agent tool event reached `preToolUse`; static handler fixtures are not counted. |
| Exact native operation identity | **Unavailable** | No caller-preselected native item ID was exposed or bound to an `actorId`. |

Because there was no released payload, no `session_id` compatibility observation exists. The only
supported Cursor identity remains the documented `conversation_id`; nothing selected a task from
an alias, absent value, configuration order, or project-global pointer.

## Documentation assessment and routed concern

README remains truthful about these tested boundaries:

- Snow project rules shadow, rather than merge with, same-event global rules.
- Snow protection is bounded and exact receipt-safe native dispatch is unavailable.
- Cursor lifecycle, resume, subagent, deny-enforcement, and exact dispatch paths remain
  unavailable until released-runtime proof exists.
- Both Harnesses reuse `.agents/skills`; no duplicate Skill tree or Cursor rule is installed.

One scoped documentation concern routes back to
[CLI, managed-resource, update, and documentation integration](../cli-managed-resource-integration.md):
the Snow section says Snow uses `SNOW_SESSION_ID` for task-selection isolation without stating a
minimum compatible Snow release. The available released `0.7.23` did not supply the required
native session/cwd payload and could not orient the installed handler. The smallest correction is
to state that the adapter targets the pinned `snow-ai@0.8.24` contract, label `0.7.23` incompatible
for native session orientation, and avoid claiming `0.8.24` released-runtime verification until
that exact release is run. This evidence item does not edit README or product source.

No product-code defect was established against the pinned `0.8.24` Snow contract or an executable
Cursor agent lifecycle, because neither path was available to run.

## Verification commands and results

- `python -X utf8 -m compileall -q templates/.omp-flow/scripts templates/claude/hooks` with
  redirected `PYTHONPYCACHEPREFIX` — **PASS**.
- `npm run build` — **PASS** before packing and again after runtime probes.
- `npm test` — **PASS**: 511 focused checks; 12 Flow Status Python tests; 8 Snow Python tests;
  11 Cursor Python tests; 3 TAP tests.
- `npm pack --dry-run --json` — **PASS**: `omp-flow@0.2.6`, 137 files, 184,580 packed bytes,
  851,930 unpacked bytes.
- Installed native hash comparison — **PASS**, 17 files and zero mismatches.
- Packed installed runtime with two synthetic Snow identities plus absent/third identity —
  **PASS** for resolver isolation and no fallback; not counted as native identity injection.
- Released Snow resume Hook capture — **PARTIAL**: exact Windows resume command, isolated profile,
  one project invocation, zero global invocations, payload keys, supplied synthetic environment
  marker, and forced-exit facts captured; native identity orientation unavailable and write event
  not reached.
- Installed Snow provenance recheck — **PASS**: `npm list -g`, `snow --version`, and installed
  `package.json` all reported `0.7.23`; `package.json` was 3,968 bytes with the corrected
  64-character SHA-256
  `cd6e610116356ee20d380187b39db9dc58dd43ce8f2576c56b745937ddb1c419`; `bundle/cli.mjs` was
  27,502,376 bytes and retained its recorded 64-character digest.
- Released Cursor agent capture — **UNAVAILABLE** for all lifecycle paths; no Hook event captured.
- `git diff --check` — **PASS**; only repository line-ending notices were emitted.

One initial post-pack PowerShell command used an invalid `Select-Object -Single` parameter, so the
install step did not run in that attempt. The already-created tarball was selected correctly,
hashed, and used by the successful isolated install above. This was probe orchestration error, not
product evidence. The first isolated Cursor launch also required explicit cleanup after it
detached; process command lines proved the cleanup target was the probe-only user-data tree.
All probe-owned processes and the complete temporary probe tree were removed. The environment
rejected the first validated `Remove-Item -Recurse` command, so cleanup used the same resolved,
cache-confined path through PowerShell's in-process .NET directory API and then proved the target
absent. In the repair rerun, the first recursive delete exposed the detached exact-UUID Snow
process described above; cleanup terminated only that uniquely identified probe process, retried
the same validated deletion, and proved both process and tree absent.

## Explicitly untested combinations

- Snow `0.8.24` on any OS and every Snow release other than the available `0.7.23`.
- Snow POSIX shell execution, released `beforeToolCall` write denial, terminal/MCP mutation,
  native role callability, Team/background behavior, and caller-preselected execution identity.
- Cursor agent CLI lifecycle in an interactive terminal, authenticated IDE chat lifecycle,
  concurrent conversations, reopen/resume, subagents, Windows native Hook enforcement, and all
  POSIX/macOS/Linux Cursor paths.
- Any receipt-safe native dispatch for Snow or Cursor.

The linked [handoff](../handoffs/released-harness-verification.md) recommends independent review
of this evidence and the scoped README return-to-work item.
