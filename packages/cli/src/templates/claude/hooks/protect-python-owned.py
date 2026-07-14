#!/usr/bin/env python3
"""Claude Code ``PreToolUse(Write|Edit|Bash)`` Hook wrapper (omp-flow adapter).

A standard-tool integrity boundary (design 10 / claude-hook-contract "Write
Protection"). It denies ordinary direct mutation of Python-owned workflow state
through Claude's Write/Edit/Bash tools. It is NOT an OS security sandbox:
deliberately obfuscated shell mutation remains a documented residual risk.

- ``Write`` / ``Edit``: resolve the documented ``file_path`` against the payload
  ``cwd`` (else ``CLAUDE_PROJECT_DIR``), normalize via ``Path.resolve``, confine
  to ``CLAUDE_PROJECT_DIR`` (an escape denies), then deny protected normalized
  paths. The ONLY carve-out is the QbD report exception, which applies to
  ``Write`` and NEVER ``Edit``: it is recomputed on every call by the read-only
  Python predicate (``claude-protect-write``) from session task + prepared
  gate/digest/report + exact ``omp-flow-qbd`` identity + exact path.
- ``Bash``: if the command references a protected ``.omp-flow`` path, allow only
  a single strictly tokenized invocation of the managed ``omp_flow.py`` CLI with
  NO shell composition (no pipes, redirection, substitution, or extra commands);
  any direct protected-path access denies. Commands that do not touch ``.omp-flow``
  continue through Claude's normal permission flow.

Exit policy: a recognized denial returns ``permissionDecision: "deny"`` + reason,
exit 0; an allow is either silent (normal Claude flow) or an explicit
``permissionDecision: "allow"`` (QbD report); an environment/parse failure before
a decision exits 2 so Claude blocks the mutation (fail closed).
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

EVENT = "PreToolUse"
CORE_KIND = "claude-protect-write"
CORE_TIMEOUT = 12  # settings.json allots 15s.

# Protected repo-relative (posix) paths. Matched case-sensitively on POSIX and
# case-insensitively on Windows (see ``_rel_key``). The QbD reserved-report Write
# is the sole exception, enforced by the Python predicate, not by omitting it here.
_PROTECTED = (
    re.compile(r"^\.omp-flow/config\.json$"),
    re.compile(r"^\.omp-flow/\.runtime/sessions/[^/]+\.json$"),
    re.compile(r"^\.omp-flow/tasks/[^/]+/task\.json$"),
    # tasks.csv is intentionally NOT protected: decompose authors it and Python has
    # no row-create command, so a Write must be permitted. Aligned with the OMP
    # extension's PYTHON_OWNED_PATHS (which also omits it). See knowhow: the fork
    # must converge all three protected-path sets and add a Python authoring command.
    re.compile(r"^\.omp-flow/tasks/[^/]+/evidence\.csv$"),
    re.compile(r"^\.omp-flow/tasks/[^/]+/\.task/[^/]+\.verdict\.json$"),
    re.compile(r"^\.omp-flow/tasks/[^/]+/qbd/qbd-[12]/(?:[^/]+/)*audit-[^/]*\.md$"),
)
# The one managed CLI a Bash command may reference under .omp-flow.
_MANAGED_SCRIPT = re.compile(r"(?:^|/)\.omp-flow/scripts/omp_flow\.py$")
# Shell metacharacters that compose/redirect/substitute commands. Their presence
# in a .omp-flow command denies (we cannot safely reason about composition).
_SHELL_META = "|&;<>`$(){}\n\r"
_ON_WINDOWS = sys.platform.startswith("win")


def _utf8_streams() -> None:
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
            except (ValueError, OSError):
                pass


def _emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


class _Deny(Exception):
    """A recognized protected mutation -> JSON deny, exit 0."""


class _Internal(Exception):
    """An environment/parse failure before a decision -> stderr, exit 2 (block)."""


def _deny_envelope(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def _allow_envelope(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": EVENT,
            "permissionDecision": "allow",
            "permissionDecisionReason": reason,
        }
    }


def _read_payload() -> dict:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise _Internal(f"invalid JSON payload on stdin: {exc}") from exc
    if not isinstance(payload, dict):
        raise _Internal("payload must be a JSON object")
    return payload


def _project_root() -> Path:
    proj = os.environ.get("CLAUDE_PROJECT_DIR")
    if not proj or not proj.strip():
        raise _Internal("CLAUDE_PROJECT_DIR is not set")
    root = Path(proj).resolve()
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    if not script.is_file():
        raise _Internal(f"managed omp-flow core not found at {script}")
    return root


def _require_session(payload: dict) -> str:
    sid = payload.get("session_id")
    if not isinstance(sid, str) or not sid.strip():
        raise _Deny("mutation payload requires a non-empty string session_id")
    return sid


def _resolve_target(root: Path, payload: dict, raw: str) -> Path:
    candidate = Path(raw)
    if not candidate.is_absolute():
        cwd = payload.get("cwd")
        base = Path(cwd) if isinstance(cwd, str) and cwd.strip() else root
        candidate = base / raw
    return candidate.resolve()


def _rel_key(root: Path, target: Path) -> str | None:
    """Repo-relative posix key, or ``None`` if the target escapes the root."""
    try:
        rel = target.relative_to(root)
    except ValueError:
        return None
    key = rel.as_posix()
    return key.lower() if _ON_WINDOWS else key


def _is_protected(key: str) -> bool:
    return any(rx.match(key) for rx in _PROTECTED)


def _run_predicate(root: Path, payload: dict, target: Path, session_id: str) -> None:
    """Call the read-only Python QbD Write predicate; raise ``_Deny`` if it denies."""
    script = root / ".omp-flow" / "scripts" / "omp_flow.py"
    core_payload = {
        "session_id": session_id,
        "agent_id": payload.get("agent_id"),
        "agent_type": payload.get("agent_type"),
        "path": str(target),
    }
    env = dict(os.environ)
    env["OMP_FLOW_CONTEXT_ID"] = session_id
    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(script), "--cwd", str(root), "hook", CORE_KIND],
            input=json.dumps(core_payload, ensure_ascii=False),
            capture_output=True,
            text=True,
            encoding="utf-8",
            env=env,
            timeout=CORE_TIMEOUT,
        )
    except subprocess.TimeoutExpired as exc:
        raise _Deny(f"QbD Write predicate timed out: {exc}") from exc
    except OSError as exc:
        raise _Internal(f"could not run the omp-flow core: {exc}") from exc
    if proc.returncode != 0:
        raise _Deny((proc.stderr or "QbD Write predicate denied the write").strip())


def _handle_write_or_edit(root: Path, payload: dict, tool_name: str, tool_input: dict) -> dict | None:
    raw = tool_input.get("file_path")
    if not isinstance(raw, str) or not raw.strip():
        raise _Deny(f"{tool_name} requires a string file_path")
    target = _resolve_target(root, payload, raw)
    key = _rel_key(root, target)
    if key is None:
        raise _Deny(f"{tool_name} target escapes the project root: {raw}")
    if not _is_protected(key):
        return None  # not Python-owned -> defer to Claude's normal permission flow.

    if tool_name == "Write":
        agent_type = payload.get("agent_type")
        agent_id = payload.get("agent_id")
        if agent_type == "omp-flow-qbd" and isinstance(agent_id, str) and agent_id.strip():
            # QbD report exception: revalidate against current Python state on THIS write.
            _run_predicate(root, payload, target, _require_session(payload))
            return _allow_envelope("QbD prepared report Write permitted by read-only predicate")

    # Edit never qualifies; a non-QbD (or unidentified) protected Write denies.
    raise _Deny(f"{tool_name} to Python-owned path is denied: {key}")


def _handle_bash(root: Path, tool_input: dict) -> dict | None:
    command = tool_input.get("command")
    if not isinstance(command, str):
        raise _Deny("Bash requires a string command")
    if ".omp-flow" not in command:
        return None  # touches no protected root -> normal Claude permission flow.

    if any(ch in command for ch in _SHELL_META):
        raise _Deny(
            "Bash referencing .omp-flow must not use shell composition "
            "(pipes, redirection, substitution, grouping, or multiple commands)"
        )
    try:
        tokens = shlex.split(command, posix=not _ON_WINDOWS)
    except ValueError as exc:
        raise _Deny(f"Bash command could not be tokenized: {exc}") from exc

    omp_tokens = [t for t in tokens if ".omp-flow" in t.replace("\\", "/")]
    script_tokens = [t for t in omp_tokens if _is_managed_script(t)]
    if not script_tokens:
        raise _Deny("Bash may reference .omp-flow only to invoke the managed omp_flow.py CLI")
    illegal = [t for t in omp_tokens if t not in script_tokens]
    if illegal:
        raise _Deny(f"Bash must not access protected .omp-flow paths directly: {illegal}")
    return None  # single tokenized omp_flow.py invocation -> normal Claude flow.


def _is_managed_script(token: str) -> bool:
    # Strip surrounding quotes before matching: on Windows shlex.split(posix=False)
    # keeps the quote chars inside a token, and quoting is REQUIRED for absolute
    # paths that contain spaces or non-ASCII (e.g. a project dir with CJK). Without
    # this, a legitimate quoted/absolute omp_flow.py invocation fails the `$`-anchored
    # regex and is wrongly denied. Recognition only — the token must still resolve to
    # the exact managed script, and the illegal-token / _SHELL_META checks are intact,
    # so no composition or extra .omp-flow access is admitted.
    norm = token.strip("\"'").replace("\\", "/")
    if _ON_WINDOWS:
        norm = norm.lower()
    return _MANAGED_SCRIPT.search(norm) is not None


def main() -> int:
    _utf8_streams()
    try:
        payload = _read_payload()
        root = _project_root()
        tool_name = payload.get("tool_name")
        tool_input = payload.get("tool_input")
        if not isinstance(tool_input, dict):
            raise _Deny("tool_input must be an object")
        if tool_name in ("Write", "Edit"):
            outcome = _handle_write_or_edit(root, payload, tool_name, tool_input)
        elif tool_name == "Bash":
            outcome = _handle_bash(root, tool_input)
        else:
            raise _Internal(f"protect hook fired for unexpected tool_name {tool_name!r}")
    except _Deny as deny:
        _emit(_deny_envelope(str(deny)))
        return 0
    except _Internal as internal:
        print(f"[omp-flow protect-python-owned] {internal}", file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - fail closed: block the mutation.
        print(f"[omp-flow protect-python-owned] unexpected: {exc}", file=sys.stderr)
        return 2
    if outcome is not None:
        _emit(outcome)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
