---
name: flow-status
description: Inspect the current repository's validated Flow Status snapshot without changing tasks, operations, configuration, or terminal status.
---

# Flow Status

Use this Skill only for read-only Flow Status inspection.

1. Resolve the repository root containing `.omp-flow`.
2. Resolve one exact host and session only from the Harness currently executing this Skill and
   current-process runtime evidence. Treat empty or whitespace-only variables as absent.

   | Host | Current-host evidence | Exact session evidence |
   |---|---|---|
   | `claude` | Native Claude Skill execution, optionally confirmed by `OMP_FLOW_HOST=claude` | `OMP_FLOW_CONTEXT_ID` bridged from Claude's `session_id` |
   | `codex` | `CODEX_THREAD_ID`, optionally confirmed by native Codex execution or `OMP_FLOW_HOST=codex` | The same `CODEX_THREAD_ID`; if `OMP_FLOW_CONTEXT_ID` is also present, it must match |
   | `oh-my-pi` | Native Oh My Pi Skill execution, `OMP_SESSION_ID`, or `PI_SESSION_ID`, optionally confirmed by `OMP_FLOW_HOST=oh-my-pi` | `OMP_FLOW_CONTEXT_ID`, `OMP_SESSION_ID`, or `PI_SESSION_ID`; every present value must match |
   | `snow` | `SNOW_SESSION_ID`, optionally confirmed by native Snow execution or `OMP_FLOW_HOST=snow` | The same `SNOW_SESSION_ID`; if `OMP_FLOW_CONTEXT_ID` is also present, it must match |
   | `cursor` | Hook-injected `OMP_FLOW_HOST=cursor`, optionally confirmed by native Cursor execution | The matching Hook-injected `OMP_FLOW_CONTEXT_ID` carrying Cursor's `conversation_id` |

   - A non-empty `OMP_FLOW_HOST` is valid only when it is exactly `claude`, `codex`, `oh-my-pi`,
     `snow`, or `cursor`. A valid value is authoritative explicit evidence; any other value makes
     Flow Status unavailable. Cursor never falls back to an implicit or configured host.
   - Native Harness identity means the Harness actually executing this Skill. It is runtime
     evidence, not a configured Harness name. `OMP_FLOW_CONTEXT_ID` alone does not identify a
     host; it supplies a session only after the current host is established by the table.
   - `CODEX_THREAD_ID`, `OMP_SESSION_ID` or `PI_SESSION_ID`, and `SNOW_SESSION_ID` also claim hosts
     `codex`, `oh-my-pi`, and `snow`, respectively. If explicit, native, or variable-based evidence
     claims more than one host, report ambiguous evidence and stop. If multiple session variables
     apply to the selected host, every non-empty value must be identical.
   - Missing host evidence, missing matching session evidence, invalid explicit evidence, or any
     host/session conflict makes Flow Status unavailable. Never read `.omp-flow/config.json`,
     `.omp-flow/config.yaml`, configured Harness order, cache recency, task counts, or Markdown to
     choose the current host or session.

3. Run the project-local supported inspect surface with those exact values:

   ```text
   python -X utf8 .omp-flow/scripts/omp_flow.py --cwd <repository-root> status inspect --host <host> --session <host-session-id> --json
   ```

   Use `python3` instead of `python` where that is the platform command. Never fall back to another
   host or session cache entry. Do not call another status renderer, inspect transcripts, or infer
   task facts from Markdown.
4. Report the task-set source and freshness, current task, literal assignment role and mapped
   position, task-local progress, and attention exactly when present.
5. If the response is unavailable, stale, clock-uncertain, malformed, disconnected, or
   scope-mismatched, say so. Do not preserve old counts, role, progress, approval, or current-task
   claims as current.

This surface is read-only. Do not use cached status to select or archive a task, start or finish an
operation, approve work, attach to or interrupt an agent, stop a process, edit `tui.status_line`,
or claim that Codex has a persistent third-party footer.
