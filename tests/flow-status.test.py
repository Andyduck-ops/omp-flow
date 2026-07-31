from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


root = Path(sys.argv[1]).resolve()
cli = root / ".omp-flow" / "scripts" / "omp_flow.py"
now = int(time.time() * 1000)
session = "native-v1-envelope"
document = {
    "version": 1,
    "taskSet": {
        "state": "available",
        "evidence": {
            "capability": "claudeTaskListV1",
            "claudeCodeVersion": "2.1.220",
            "sessionStartKind": "startup",
            "adapterSequence": 1,
            "confirmedByToolUseId": "native-v1-list",
        },
        "sourceId": "claude-tasks",
        "repositoryRoot": str(root),
        "hostSessionId": session,
        "taskSetId": "native-v1-task-set",
        "membershipRevision": "native-v1-membership",
        "completeness": "complete",
        "observedAtUnixMs": now,
        "maxAgeMs": 30_000,
        "members": [
            {"taskId": "one", "label": "实现", "state": "active"},
            {"taskId": "two", "label": "复核", "state": "pending"},
        ],
        "currentTaskId": "one",
    },
    "assignment": None,
    "progress": None,
    "attention": [],
}

observed = subprocess.run(
    [
        sys.executable,
        "-X",
        "utf8",
        str(cli),
        "--cwd",
        str(root),
        "status",
        "observe",
        "--host",
        "claude",
        "--session",
        session,
    ],
    input=json.dumps(document, ensure_ascii=False),
    capture_output=True,
    text=True,
    encoding="utf-8",
    check=False,
)
check(observed.returncode == 0, observed.stderr)
stored = json.loads(observed.stdout)
check(
    stored["snapshot"]["version"] == 2
    and stored["snapshot"]["rootFlow"] == {"state": "unavailable", "reason": "missing"},
    "a live v1 observation is wrapped in the sole v2 envelope without inventing root Flow",
)
native = stored["snapshot"]["nativeActivity"]
check(
    native["version"] == 1
    and native["taskSet"]["total"] == 2
    and native["currentTask"]["taskId"] == "one",
    "v1 native task activity remains independently visible after v2 cutover",
)

inspected = subprocess.run(
    [
        sys.executable,
        "-X",
        "utf8",
        str(cli),
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
    capture_output=True,
    text=True,
    encoding="utf-8",
    check=False,
)
view = json.loads(inspected.stdout)
check(
    inspected.returncode == 2
    and view["snapshot"]["nativeActivity"]["taskSet"]["active"] == 1,
    "inspect retains native activity even while explicit root Flow is unavailable",
)

print("PASS: v1 native activity remains covered inside the v2 snapshot envelope")
