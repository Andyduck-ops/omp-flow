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
- ``Bash``: if the command references a ``.omp-flow`` path, apply the quote-aware
  segment policy (see ``context/interface/bash-guard-segment-policy.md``): a
  quote-aware liveness scan (bash rules, fail closed on unterminated quotes),
  wholesale deny on any LIVE ``< > ` $ ( ) { }`` or a live lone ``&``
  (backgrounding), then top-level segmentation on live ``&& || ; | \n \r``. Each
  segment must independently be (i) ``.omp-flow``-free, (ii) a strictly tokenized
  managed ``omp_flow.py`` invocation (a Python-interpreter head or the script
  itself), or (iii) a name-exact read-only command
  (``cat head tail wc ls stat grep``) whose ``.omp-flow`` targets all resolve
  inside the project root to non-protected paths (content heads require existing
  regular FILES; ``ls``/``stat`` may list directories). Commands that do not touch
  ``.omp-flow`` continue through Claude's normal permission flow.

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
_ON_WINDOWS = sys.platform.startswith("win")

# --- Bash segment-policy vocabulary (interface: bash-guard-segment-policy) ------
# LIVE occurrences of these wholesale-deny a .omp-flow command (redirection,
# substitution, grouping). A live LONE `&` (backgrounding) is denied separately in
# the scanner; `&&` is a segment separator, not a hard metachar.
_HARD_META = frozenset("<>`$(){}")
# Read-only allowlist heads, matched name-EXACT and lowercase — deliberately NOT
# case-folded even on Windows (CAT/Cat deny). The interpreter heads below keep the
# separate, frozen Windows case-fold + .exe strip rule.
_READONLY_HEADS = ("cat", "head", "tail", "wc", "ls", "stat", "grep")
# Metadata heads may list directories; content heads need an existing regular FILE
# (so recursive/directory-mediated reads of protected content deny without flag
# parsing). See interface step 5(iii).
_METADATA_HEADS = frozenset({"ls", "stat"})
_CONTENT_HEADS = frozenset({"cat", "head", "tail", "wc", "grep"})
# The frozen interpreter set for a managed-CLI segment's argv[0]. This is a
# platform-independent SEMANTIC allowlist, so it is assembled from parts to shield
# the literal from the deploy step's command-oriented `python3`->platform rewrite
# (replacePythonCommandLiterals): the frozen set must stay {python, python3, py}
# on every platform, including the Windows-deployed copy.
_PY3 = "python" + "3"
_INTERPRETERS = frozenset({"python", _PY3, "py"})
# Ordered display for the teaching messages (matches the frozen message-class regex
# and, like _INTERPRETERS, survives the deploy rewrite intact).
_INTERPRETER_DISPLAY = "python, " + _PY3 + ", py"
_GLOB_CHARS = frozenset("*?[")
# Allowlist exclusions (documented, with reasons): sed (-i writes in place),
# sort (-o), find (-exec/-delete), awk (system()), tee (writes), xargs (arbitrary
# exec), bash/sh/python/any shell (arbitrary exec). Deferred (NOT special-cased):
# the 2>/dev/null stderr residue — a live `>` still denies.


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


def _hardmeta_deny(ch: str) -> _Deny:
    """M-hardmeta: a LIVE hard metacharacter (or lone `&`) wholesale-denies."""
    role = "backgrounds" if ch == "&" else "redirects, substitutes, or groups"
    # Retains the legacy phrase "shell composition" that pre-M4 deny locks assert.
    return _Deny(
        f"Bash referencing .omp-flow must not use live shell composition: the "
        f"character {ch!r} {role} the command. Quote metacharacters to use them "
        f"literally (single-quoted spans are fully inert; $ and backtick stay live "
        f"inside double quotes), and run the managed omp_flow.py CLI as its own "
        f"top-level '&& || ; |' segment."
    )


def _scan_segments(command: str) -> list[str]:
    """Quote-aware liveness scan (bash rules on both platforms).

    Single-quoted spans are fully inert; inside double quotes only ``$`` and
    backtick stay LIVE; an unterminated quote or trailing backslash fails closed.
    Raises ``_Deny`` on a live hard metacharacter or a live lone ``&``. Otherwise
    returns the top-level segments split on live ``&& || ; | \n \r``. ``shlex`` is
    never the liveness decider — it only tokenizes segments in step 5.
    """
    segments: list[str] = []
    seg_start = 0
    i = 0
    n = len(command)
    state = "U"  # U unquoted, S single-quoted, D double-quoted
    while i < n:
        ch = command[i]
        if state == "S":
            if ch == "'":
                state = "U"
            i += 1
            continue
        if state == "D":
            if ch == "\\":
                if i + 1 >= n:
                    raise _Deny(
                        "Bash command has an unterminated quote or trailing "
                        "backslash; the .omp-flow guard fails closed. Balance the "
                        "quotes/escapes and retry."
                    )
                i += 2  # backslash escapes the next char inside double quotes
                continue
            if ch == '"':
                state = "U"
            elif ch in ("$", "`"):
                raise _hardmeta_deny(ch)
            i += 1
            continue
        # state U (unquoted)
        if ch == "\\":
            if i + 1 >= n:
                raise _Deny(
                    "Bash command has an unterminated quote or trailing backslash; "
                    "the .omp-flow guard fails closed. Balance the quotes/escapes "
                    "and retry."
                )
            nxt = command[i + 1]
            if nxt in _HARD_META or nxt == "&":
                raise _hardmeta_deny(nxt)  # escaped hard metachar is conservatively LIVE
            i += 2  # ordinary escape (e.g. `\ ` in a path) -> literal
            continue
        if ch == "'":
            state = "S"
            i += 1
            continue
        if ch == '"':
            state = "D"
            i += 1
            continue
        if ch in _HARD_META:
            raise _hardmeta_deny(ch)
        if ch == "&":
            if i + 1 < n and command[i + 1] == "&":
                segments.append(command[seg_start:i])  # `&&` connector
                i += 2
                seg_start = i
                continue
            raise _hardmeta_deny("&")  # live lone `&` (backgrounding)
        if ch == "|":
            segments.append(command[seg_start:i])
            i += 2 if (i + 1 < n and command[i + 1] == "|") else 1
            seg_start = i
            continue
        if ch in (";", "\n", "\r"):
            segments.append(command[seg_start:i])
            i += 1
            seg_start = i
            continue
        i += 1
    if state != "U":
        raise _Deny(
            "Bash command has an unterminated quote or trailing backslash; the "
            ".omp-flow guard fails closed. Balance the quotes/escapes and retry."
        )
    segments.append(command[seg_start:n])
    return segments


def _strip_quotes(token: str) -> str:
    return token.strip("\"'")


def _is_interpreter_head(head: str) -> bool:
    """argv[0] is a bare or absolute-path Python interpreter in the frozen set.

    A relative path containing a separator (``./python``, ``bin/python``) denies
    (planted-fake-interpreter shape); versioned heads (``python3.11``) are outside
    the frozen set and fail closed into M-segment.
    """
    h = _strip_quotes(head).replace("\\", "/")
    if "/" in h:
        # Must be absolute (leading `/` or a drive letter); relative-with-separator denies.
        if not re.match(r"^([a-zA-Z]:)?/", h):
            return False
        base = h.rsplit("/", 1)[-1]
    else:
        base = h
    if _ON_WINDOWS:
        base = base.lower()
        if base.endswith(".exe"):
            base = base[:-4]
    return base in _INTERPRETERS


def _is_managed_script_head(root: Path, payload: dict, head: str) -> bool:
    """Direct-shebang: argv[0] IS the managed script, resolving to it in-root."""
    if not _is_managed_script(head):
        return False
    target = _resolve_target(root, payload, _strip_quotes(head))
    key = _rel_key(root, target)
    managed = ".omp-flow/scripts/omp_flow.py"
    return key == (managed.lower() if _ON_WINDOWS else managed)


def _check_readonly_targets(root: Path, payload: dict, head: str, omp_tokens: list[str]) -> None:
    """Read-only allowlist (iii). Per-token evaluation order is NORMATIVE:
    glob -> resolve/containment -> _is_protected -> head-class FILE rule. The deny
    class is assigned by the FIRST failing check (interface step 5(iii))."""
    for tok in omp_tokens:
        norm = _strip_quotes(tok).replace("\\", "/")
        if any(c in norm for c in _GLOB_CHARS):
            raise _Deny(
                f"Bash .omp-flow token {tok!r} contains a glob/wildcard character "
                f"(*, ?, or [). Name the file explicitly; globbing over protected "
                f"state is denied."
            )
        target = _resolve_target(root, payload, _strip_quotes(tok))
        key = _rel_key(root, target)
        if key is None:
            raise _Deny(
                f"Bash .omp-flow token {tok!r} resolves outside the project root; denied."
            )
        if _is_protected(key):
            raise _Deny(
                f"Bash may not read the Python-owned path {key!r} directly. Read "
                f"protected workflow state through the managed omp_flow.py CLI: "
                f"'task show', 'topology list', or 'gate inspect'. (A grep/search "
                f"PATTERN that spells a protected path also trips this rule because "
                f"the pattern resolves to a protected path — use the platform search "
                f"tools instead.)"
            )
        if head in _CONTENT_HEADS and not target.is_file():
            raise _Deny(
                f"Bash content head ({'/'.join(sorted(_CONTENT_HEADS))}) needs an "
                f"existing non-protected regular FILE, but {key!r} is a directory or "
                f"does not exist. Use 'ls'/'stat' to list directories, or 'topology "
                f"list' / 'task show' to read workflow state. Note: a literal "
                f"'.omp-flow' search PATTERN (e.g. grep \".omp-flow\" <file>) trips "
                f"this rule because the pattern resolves to the .omp-flow directory — "
                f"use the platform search tools or a pattern without the leading dot."
            )


def _check_segment(root: Path, payload: dict, seg: str) -> None:
    """Per-segment policy (interface step 5). Passes silently or raises _Deny."""
    if ".omp-flow" not in seg:
        return  # (i) .omp-flow-free -> normal Claude flow governs it.
    try:
        tokens = shlex.split(seg, posix=not _ON_WINDOWS)
    except ValueError as exc:  # scanner already fails closed on unbalanced quotes
        raise _Deny(f"Bash segment could not be tokenized: {exc}") from exc
    if not tokens:
        return
    head = tokens[0]
    omp_tokens = [t for t in tokens if ".omp-flow" in t.replace("\\", "/")]

    # (ii) Managed-CLI segment: every .omp-flow token is the managed script AND
    #      argv[0] is a frozen interpreter or the script itself (direct shebang).
    if omp_tokens and all(_is_managed_script(t) for t in omp_tokens) and (
        _is_interpreter_head(head) or _is_managed_script_head(root, payload, head)
    ):
        return

    # (iii) Read-only allowlisted segment: bare, name-exact (NOT case-folded) head.
    head_bare = _strip_quotes(head)
    if "/" not in head_bare and "\\" not in head_bare and head_bare in _READONLY_HEADS:
        _check_readonly_targets(root, payload, head_bare, omp_tokens)
        return

    raise _Deny(
        f"Bash segment {seg.strip()!r} is neither .omp-flow-free, a managed "
        f"omp_flow.py invocation, nor a read-only allowlisted command. Allowed "
        f"read-only heads: cat head tail wc ls stat grep. To run the control plane, "
        f"invoke it as 'python .omp-flow/scripts/omp_flow.py ...' with an "
        f"interpreter head in {{{_INTERPRETER_DISPLAY}}} (a versioned head like "
        f"{_PY3}.11 is rejected — use a bare {_INTERPRETER_DISPLAY.replace(', ', '/')})."
    )


def _handle_bash(root: Path, payload: dict, tool_input: dict) -> dict | None:
    command = tool_input.get("command")
    if not isinstance(command, str):
        raise _Deny("Bash requires a string command")
    if ".omp-flow" not in command:
        return None  # touches no protected root -> normal Claude permission flow.

    # Quote-aware liveness scan (fail closed) + wholesale hard-meta / lone-& deny +
    # top-level segmentation, then the per-segment policy. See the segment-policy
    # interface entry; the Write/Edit handler, _PROTECTED, and exit policy are intact.
    for segment in _scan_segments(command):
        _check_segment(root, payload, segment)
    return None  # every segment passed -> normal Claude permission flow.


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
            outcome = _handle_bash(root, payload, tool_input)
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
