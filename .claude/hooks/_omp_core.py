#!/usr/bin/env python3
"""Shared in-process control-plane shim (omp-flow Claude adapter).

Reproduces the ``omp_flow.py hook <kind>`` subprocess contract WITHOUT spawning
a second Python interpreter (task 07-22-dispatch-stutter, ADR-001 direction A').
The four control-plane Hook wrappers import this module (``import _omp_core``
resolves because the running hook's own directory ``.claude/hooks/`` is
``sys.path[0]``) and call ``run_core`` instead of
``subprocess.run([sys.executable, ..., omp_flow.py, "hook", <kind>])``.

Module-top imports are STDLIB ONLY (ADR-002, B'-lite): the heavy ``common.*``
import is deferred into ``run_core`` so callers that never invoke it -- the
``protect-python-owned.py`` fast paths on every Bash/Write/Edit -- never pay
the control-plane load.

Outcome contract (interface ``omp-core-shim-contract``):

- success             -> the exact ``claude_*(repo, payload)`` result dict;
- ``CoreDenied``      -> a core validation/IO failure on a valid install; its
  ``reason`` byte-matches the old subprocess path's ``proc.stderr.strip()``
  (``omp_flow.py main()`` prints ``[omp-flow] ERROR: {exc}`` to stderr and
  returns exit 2);
- ``CoreUnavailable`` -> broken install (import/attribute failure) or unknown
  hook kind; callers fail closed (dispatch/predicate hooks block with exit 2,
  state hooks emit the STOP envelope) -- never a silent allow.

``run_core`` never returns on error, never prints, and never calls
``sys.exit`` -- each hook owns its own rendering and exit-code policy.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path


class CoreUnavailable(Exception):
    """Broken install: the managed core cannot be imported, or the hook kind is
    unknown. Strictly outside the valid-install decision corpus; callers must
    fail closed (exit 2 block or STOP state envelope), never allow."""


class CoreDenied(Exception):
    """A core validation/IO failure on a valid install.

    ``reason`` is ``f"[omp-flow] ERROR: {exc}".strip()`` -- byte-identical to
    the stripped stderr the wrappers previously read from the ``omp_flow.py``
    subprocess (``proc.stderr.strip()``), including exception messages that are
    empty or end in whitespace (both strip to the same bytes).
    """

    def __init__(self, exc: object) -> None:
        self.reason = f"[omp-flow] ERROR: {exc}".strip()
        super().__init__(self.reason)


def run_core(root: Path, kind: str, payload: dict, session_id: str) -> dict:
    """Run the ``claude_*`` control-plane function for ``kind`` in-process.

    Mirrors the thin ``omp_flow.py main()`` hook contract exactly: identity
    env, repo resolution, kind dispatch, and error classification.
    """
    # 1. H1 session-identity parity (finding in-process-session-identity) --
    #    MANDATORY and FIRST. resolve_context_key gives OMP_FLOW_CONTEXT_ID
    #    strict precedence, and the active-task pointer was written under the
    #    resulting explicit-<sha256(session_id)[:20]> key by the env-bridged
    #    Bash lifecycle calls. The subprocess path set this in the child env;
    #    in-process we set it in our own short-lived hook process. Dropping
    #    this line would silently resolve a different / empty session.
    os.environ["OMP_FLOW_CONTEXT_ID"] = session_id

    # 2. H3: bind ``common`` to the managed core, idempotently -- a second
    #    ``run_core`` call in the same process must not duplicate the entry.
    scripts = str(Path(root) / ".omp-flow" / "scripts")
    if scripts not in sys.path:
        sys.path.insert(0, scripts)

    # 3. Lazy heavy import (ADR-002): the ONLY heavy work in this module.
    try:
        from common.io import WorkflowError
        from common.paths import find_repo_root
        from common.workflow import (
            claude_dispatch_context,
            claude_protect_write,
            claude_qbd_report,
            claude_workflow_state,
        )
    except (ImportError, AttributeError, OSError) as exc:
        raise CoreUnavailable(f"omp-flow core unavailable: {exc}") from exc

    # 4. Dispatch table mirrors ``omp_flow.py`` ``hook <kind>`` exactly
    #    (minus the out-of-scope codex adapter).
    dispatch = {
        "claude-workflow-state": claude_workflow_state,
        "claude-dispatch-context": claude_dispatch_context,
        "claude-qbd-report": claude_qbd_report,
        "claude-protect-write": claude_protect_write,
    }
    func = dispatch.get(kind)
    if func is None:
        raise CoreUnavailable(f"Unknown hook kind: {kind}")

    # 5. H7 repo parity with ``omp_flow.py _repo()`` (the subprocess always ran
    #    with ``--cwd <root>``), inside the same catch set as ``main()`` so a
    #    root-resolution failure classifies exactly as it did over stderr.
    # 6. Any core validation/IO failure -> CoreDenied with the byte-identical
    #    ``[omp-flow] ERROR: {exc}`` reason text.
    try:
        repo = find_repo_root(Path(root))
        return func(repo, payload)
    except (WorkflowError, OSError, ValueError, json.JSONDecodeError) as exc:
        raise CoreDenied(exc) from exc
