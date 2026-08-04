from __future__ import annotations

import json
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[1]
HOOK = SOURCE_ROOT / "templates" / "claude" / "hooks" / "flow-status-observe.py"
GUARD = SOURCE_ROOT / "templates" / "claude" / "hooks" / "flow-status-task-update-guard.py"
RUNTIME = SOURCE_ROOT / "templates" / ".omp-flow" / "scripts"
FIXTURE = (
    SOURCE_ROOT
    / "tests"
    / "fixtures"
    / "flow-status"
    / "claude-task-events-v2.1.220.json"
)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def invoke(root: Path, payload: dict, *, version: str = "2.1.220") -> subprocess.CompletedProcess[str]:
    environment = {
        "CLAUDE_PROJECT_DIR": str(root),
        "CLAUDE_CODE_VERSION": version,
    }
    return subprocess.run(
        [sys.executable, "-X", "utf8", str(HOOK)],
        cwd=root,
        env=environment,
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
        check=False,
    )


def inspect(root: Path, session: str) -> dict:
    completed = subprocess.run(
        [
            sys.executable,
            "-X",
            "utf8",
            str(root / ".omp-flow" / "scripts" / "omp_flow.py"),
            "--cwd",
            str(root),
            "status",
            "inspect",
            "--host",
            "claude",
            "--session",
            session,
            "--json",
        ],
        cwd=root,
        env={},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
        check=False,
    )
    check(completed.returncode in {0, 2}, completed.stderr or completed.stdout)
    return json.loads(completed.stdout)


def native(view: dict) -> dict:
    activity = view["snapshot"]["nativeActivity"]
    check(activity is not None, "Claude observation remains a distinct native-activity branch")
    return activity


def observer_state(root: Path, session: str) -> Path:
    key = hashlib.sha256(session.encode("utf-8")).hexdigest()
    return (
        root
        / ".omp-flow"
        / ".runtime"
        / "flow-status"
        / "claude-observer"
        / f"{key}.json"
    )


with tempfile.TemporaryDirectory(prefix="omp-flow-claude-status-") as directory:
    root = Path(directory).resolve()
    (root / ".omp-flow").mkdir()
    shutil.copytree(RUNTIME, root / ".omp-flow" / "scripts")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    scenarios = {item["name"]: item for item in fixture["scenarios"]}
    check(
        {
            "managed-agent-binding-request",
            "managed-agent-progress-request",
            "correlated-user-attention",
        }.issubset(scenarios),
        "stable Claude fixture carries binding, progress, and correlated attention payloads",
    )
    guard_self_test = subprocess.run(
        [sys.executable, "-X", "utf8", str(GUARD), "--self-test"],
        cwd=root,
        env={"CLAUDE_PROJECT_DIR": str(root)},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
        check=False,
    )
    check(
        guard_self_test.returncode == 0
        and json.loads(guard_self_test.stdout)["guardConformant"] is True,
        "the exact installed guard passes deterministic allow/deny conformance",
    )
    baseline = scenarios["complete-task-list-baseline"]["input"]
    session = baseline["session_id"]

    startup = {
        "session_id": session,
        "cwd": str(root),
        "hook_event_name": "SessionStart",
        "source": "startup",
    }
    result = invoke(root, startup)
    check(result.returncode == 0, "SessionStart observer is non-blocking")
    start_view = inspect(root, session)
    check(
        native(start_view)["taskSet"]["state"] == "unavailable"
        and native(start_view)["taskSet"]["reason"] == "incomplete",
        "startup is unavailable until a full TaskList baseline",
    )

    baseline = json.loads(json.dumps(baseline))
    baseline["cwd"] = str(root)
    result = invoke(root, baseline)
    check(result.returncode == 0 and not result.stderr, "complete TaskList is accepted")
    view = inspect(root, session)
    task_set = native(view)["taskSet"]
    check(
        task_set["state"] == "available"
        and task_set["total"] == 3
        and task_set["completed"] == 1
        and task_set["active"] == 1
        and task_set["pending"] == 1,
        "full baseline produces honest complete counts",
    )
    check(
        native(view)["currentTask"]["label"] == "Powerline widget",
        "the active Claude task is the bounded current label",
    )

    update = {
        "session_id": session,
        "cwd": str(root),
        "hook_event_name": "PostToolUse",
        "tool_name": "TaskUpdate",
        "tool_input": {"taskId": "task-002", "status": "completed"},
        "tool_response": {"ok": True},
        "tool_use_id": "toolu_update_001",
    }
    check(invoke(root, update).returncode == 0, "TaskUpdate delta is non-blocking")
    updated = native(inspect(root, session))
    check(
        updated["taskSet"]["completed"] == 2
        and updated["taskSet"]["active"] == 0
        and updated["currentTask"] is None,
        "a correlated delta updates only the established baseline",
    )

    create = {
        "session_id": session,
        "cwd": str(root),
        "hook_event_name": "PostToolUse",
        "tool_name": "TaskCreate",
        "tool_input": {"subject": "CJK 宽度"},
        "tool_response": {"task": {"id": "task-004"}},
        "tool_use_id": "toolu_create_001",
    }
    check(invoke(root, create).returncode == 0, "TaskCreate delta is non-blocking")
    created = native(inspect(root, session))["taskSet"]
    check(
        created["total"] == 4 and created["pending"] == 2,
        "TaskCreate adds one known pending member after the baseline",
    )

    second_active = {
        **update,
        "tool_input": {"taskId": "task-003", "status": "in_progress"},
        "tool_use_id": "toolu_update_active_002",
    }
    first_active = {
        **update,
        "tool_input": {"taskId": "task-002", "status": "in_progress"},
        "tool_use_id": "toolu_update_active_001",
    }
    check(invoke(root, first_active).returncode == 0, "first active delta is accepted")
    check(invoke(root, second_active).returncode == 0, "second active delta is accepted")
    multi_active = native(inspect(root, session))
    check(
        multi_active["taskSet"]["active"] == 2 and multi_active["currentTask"] is None,
        "multiple active members never manufacture one current task",
    )

    delete_baseline = json.loads(json.dumps(baseline))
    delete_baseline["tool_use_id"] = "toolu_delete_baseline"
    check(invoke(root, delete_baseline).returncode == 0, "delete test baseline is accepted")
    delete_current = {
        **update,
        "tool_input": {"taskId": "task-002", "status": "deleted"},
        "tool_use_id": "toolu_delete_001",
    }
    check(invoke(root, delete_current).returncode == 0, "known deleted member delta is accepted")
    deleted = native(inspect(root, session))
    check(
        deleted["taskSet"]["total"] == 2
        and deleted["taskSet"]["active"] == 0
        and deleted["currentTask"] is None,
        "deleted removes exactly the known member and cannot retain it as current",
    )

    unknown_delete = {
        **delete_current,
        "tool_input": {"taskId": "missing-task", "status": "deleted"},
        "tool_use_id": "toolu_delete_unknown",
    }
    check(invoke(root, unknown_delete).returncode == 0, "unknown delete remains non-blocking")
    unknown_deleted = native(inspect(root, session))["taskSet"]
    check(
        unknown_deleted["state"] == "unavailable"
        and unknown_deleted["reason"] == "malformed",
        "unknown deleted member never bootstraps or silently changes membership",
    )

    stale_baseline = json.loads(json.dumps(baseline))
    stale_baseline["tool_use_id"] = "toolu_stale_baseline"
    check(invoke(root, stale_baseline).returncode == 0, "stale test baseline is accepted")
    state_path = observer_state(root, session)
    state = json.loads(state_path.read_text(encoding="utf-8"))
    state["lastObservedAtUnixMs"] = int(time.time() * 1000) - 30_001
    state_path.write_text(
        json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    os.utime(state_path, None)
    stale_delta = {
        **create,
        "tool_response": {"task": {"id": "task-stale"}},
        "tool_use_id": "toolu_stale_delta",
    }
    check(invoke(root, stale_delta).returncode == 0, "stale delta remains non-blocking")
    stale = native(inspect(root, session))["taskSet"]
    check(
        stale["state"] == "unavailable" and stale["reason"] == "stale",
        "stored observation time, not fresh filesystem mtime, expires delta authority",
    )

    replay_baseline = json.loads(json.dumps(baseline))
    replay_baseline["tool_use_id"] = "toolu_replay_baseline"
    check(invoke(root, replay_baseline).returncode == 0, "replay test baseline is accepted")
    replay_delta = {
        **update,
        "tool_use_id": "toolu_replayed_update",
    }
    check(invoke(root, replay_delta).returncode == 0, "first delta receipt is accepted")
    check(invoke(root, replay_delta).returncode == 0, "replayed delta remains non-blocking")
    replayed = native(inspect(root, session))["taskSet"]
    check(
        replayed["state"] == "unavailable" and replayed["reason"] == "malformed",
        "a replayed tool-use result cannot refresh membership authority",
    )

    persisted_member = {
        "taskId": "task-001",
        "label": "Persisted member",
        "state": "pending",
    }
    corrupt_states = {
        "empty-object": [{}],
        "missing-id": [{"label": "Missing id", "state": "pending"}],
        "empty-id": [{"taskId": "", "label": "Empty id", "state": "pending"}],
        "duplicate-id": [persisted_member, dict(persisted_member)],
        "bad-status": [{**persisted_member, "state": "unknown"}],
        "bad-label": [{**persisted_member, "label": 42}],
        "non-object": ["not-a-member"],
        "extra-field": [{**persisted_member, "unexpected": True}],
    }
    for index, (name, corrupt_members) in enumerate(corrupt_states.items()):
        corrupt_baseline = json.loads(json.dumps(baseline))
        corrupt_baseline["tool_use_id"] = f"toolu_corrupt_baseline_{index}"
        check(
            invoke(root, corrupt_baseline).returncode == 0,
            f"{name} test baseline is accepted",
        )
        corrupt_state_path = observer_state(root, session)
        corrupt_state = json.loads(corrupt_state_path.read_text(encoding="utf-8"))
        corrupt_state["tasks"] = corrupt_members
        corrupt_state_path.write_text(
            json.dumps(corrupt_state, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        corrupt_delta = {
            **update,
            "tool_input": {"taskId": "task-001", "status": "completed"},
            "tool_use_id": f"toolu_corrupt_delta_{index}",
        }
        corrupt_result = invoke(root, corrupt_delta)
        check(
            corrupt_result.returncode == 0 and "Traceback" not in corrupt_result.stderr,
            f"{name} persisted member corruption remains on the closed hook path",
        )
        corrupt_view = native(inspect(root, session))
        check(
            corrupt_view["taskSet"]["state"] == "unavailable"
            and corrupt_view["taskSet"]["reason"] == "malformed"
            and corrupt_view["currentTask"] is None,
            f"{name} corruption revokes task and current-task authority",
        )
        check(
            not corrupt_state_path.exists(),
            f"{name} corruption deletes the local observer baseline",
        )
        if index == 0:
            later_delta = {
                **corrupt_delta,
                "tool_use_id": "toolu_corrupt_followup",
            }
            check(invoke(root, later_delta).returncode == 0, "post-corruption delta is non-blocking")
            later_view = native(inspect(root, session))["taskSet"]
            check(
                later_view["state"] == "unavailable"
                and later_view["reason"] in {"incomplete", "malformed"},
                "a later delta cannot bootstrap after corrupt-state revocation",
            )

    partial = json.loads(json.dumps(baseline))
    partial["tool_use_id"] = "toolu_partial_baseline"
    partial["tool_response"] = {"tasks": [{"id": "missing-fields"}]}
    check(invoke(root, partial).returncode == 0, "partial payload does not block Claude")
    malformed = native(inspect(root, session))["taskSet"]
    check(
        malformed["state"] == "unavailable" and malformed["reason"] == "malformed",
        "partial payload revokes the prior authoritative baseline",
    )

    resume = scenarios["resume-invalidates-baseline"]["input"]
    resume = {**resume, "cwd": str(root)}
    check(invoke(root, resume).returncode == 0, "resume invalidation is non-blocking")
    resumed = native(inspect(root, session))["taskSet"]
    check(
        resumed["state"] == "unavailable" and resumed["reason"] == "incomplete",
        "resume removes authority until another complete baseline",
    )

    check(invoke(root, create).returncode == 0, "post-resume delta is ignored safely")
    no_bootstrap = native(inspect(root, session))["taskSet"]
    check(
        no_bootstrap["state"] == "unavailable" and no_bootstrap["reason"] == "incomplete",
        "TaskCreate never bootstraps an unknown set",
    )

    hook_text = HOOK.read_text(encoding="utf-8")
    check("transcript_path" not in hook_text, "observer never reads Claude transcripts")
    check("shell=True" not in hook_text, "observer uses argv execution without a shell")
    print("PASS: Claude Flow Status hook contract checks")
