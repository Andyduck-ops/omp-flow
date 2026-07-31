from __future__ import annotations

import sys
from pathlib import Path


root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root / ".omp-flow" / "scripts"))

from common.flow_status import format_inspection  # noqa: E402


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


publication = {
    "rootTask": {"taskId": "07-30-omp-flow-tui-control", "title": "TUI 状态栏返工"},
    "orientation": {
        "position": "execute",
        "movement": "advanced",
        "measure": {
            "label": "Work",
            "current": 4,
            "total": 13,
            "unit": "work",
        },
        "detail": {
            "acceptedWork": 3,
            "workTotal": 13,
            "currentWork": {
                "workId": "flow-status-v2",
                "title": "状态栏接入",
                "focus": "ownership",
                "reviewRound": 2,
                "reworkRound": 1,
            },
        },
    },
    "drilldown": {
        "wave": {
            "waveId": "wave-2",
            "ordinal": 2,
            "total": 4,
            "revision": "wave-revision-2",
            "workSetRevision": "work-set-revision-1",
            "focusWorkIds": ["flow-status-v2"],
        },
    },
}
inspection = {
    "state": "available",
    "freshness": "fresh",
    "snapshot": {
        "scope": {
            "host": "claude",
            "repositoryRoot": str(root),
            "hostSessionId": "detail-session",
        },
        "rootFlow": {"state": "available", "publication": publication},
        "nativeActivity": None,
    },
}
text = format_inspection(inspection)
check("Root Task: 07-30-omp-flow-tui-control · TUI 状态栏返工" in text, "detail names the root Task")
check("Flow: 6/9 · execute · advanced" in text, "detail reports the explicit Flow position")
check("Measure: Work 4/13 work" in text, "detail reports the bounded position-local measure")
check("Current Work: 状态栏接入 · ownership · review 2 · rework 1" in text, "detail reports current Work")
check("Wave: wave-2 · 2/4 · work-set-revision-1" in text, "Wave stays available only in detail")
check("Native activity: unavailable" in text, "native absence does not erase root Flow detail")

degraded = {
    **inspection,
    "state": "unavailable",
    "freshness": "unavailable",
    "snapshot": {
        **inspection["snapshot"],
        "rootFlow": {"state": "unavailable", "reason": "expired"},
        "nativeActivity": {
            "taskSet": {
                "state": "available",
                "completed": 2,
                "total": 3,
                "active": 1,
                "failed": 0,
            },
        },
    },
}
degraded_text = format_inspection(degraded)
check("Root Task: unavailable (expired)" in degraded_text, "expired root authority fails closed")
check("Native activity: 2/3 complete · 1 active · 0 failed" in degraded_text, "native activity degrades independently")

print("PASS: Flow Status v2 detail and Wave-only inspection checks")
