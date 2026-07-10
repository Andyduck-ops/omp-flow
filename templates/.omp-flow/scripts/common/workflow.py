from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .active_task import resolve_active_task
from .io import WorkflowError, read_json, read_text
from .paths import flow_dir, task_dir


STATE_BLOCK = re.compile(
    r"\[workflow-state:([A-Za-z0-9_-]+)\]\s*\n(.*?)\n\s*\[/workflow-state:\1\]",
    re.DOTALL,
)


def load_state_blocks(repo: Path) -> dict[str, str]:
    content = read_text(flow_dir(repo) / "workflow.md")
    blocks = {match.group(1): match.group(2).strip() for match in STATE_BLOCK.finditer(content)}
    if not blocks:
        raise WorkflowError("workflow.md contains no [workflow-state:STATUS] blocks")
    return blocks


def workflow_state(repo: Path, payload: dict[str, Any] | None = None) -> str:
    active = resolve_active_task(repo, payload)
    blocks = load_state_blocks(repo)
    if not active.task_id:
        key = "no_task"
        header = "No active task for this session."
    elif active.stale:
        key = "stale"
        header = f"Active task pointer is stale: {active.task_id}"
    else:
        data = read_json(task_dir(repo, active.task_id) / "task.json")
        status = str(data.get("status") or "planning")
        phase = str(data.get("phase") or status)
        key = phase if phase in blocks else status
        header = f"Task: {active.task_id}\nStatus: {status}\nPhase: {phase}\nSource: {active.source}"
    body = blocks.get(key)
    if body is None:
        body = f"ERROR: workflow.md is missing [workflow-state:{key}]."
    return f"<workflow-state>\n{header}\n{body}\n</workflow-state>"


def codex_hook_output(repo: Path, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": workflow_state(repo, payload),
        }
    }
