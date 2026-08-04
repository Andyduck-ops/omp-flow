from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root / ".omp-flow" / "scripts"))

from common.flow_status import FlowStatusError, renew_root_flow_v2  # noqa: E402

cli = root / ".omp-flow" / "scripts" / "omp_flow.py"
session = "flow-status-v2-session"
actor = "orchestrator-main"
env = {**os.environ, "OMP_FLOW_CONTEXT_ID": session}


def run(args: list[str], document: dict | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-X", "utf8", str(cli), "--cwd", str(root), *args],
        cwd=root,
        env=env,
        input=None if document is None else json.dumps(document, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=20,
        check=False,
    )


created = run(["task", "create", "Flow v2 contract", "--slug", "flow-v2-contract"])
check(created.returncode == 0, created.stderr)
task_id = json.loads(created.stdout)["taskId"]
now = int(time.time() * 1000)
request = {
    "version": 2,
    "capability": "orchestratorFlowPublicationV2",
    "requestId": "python-request-0001",
    "expectedPreviousPublicationRevision": None,
    "scope": {
        "repositoryRoot": str(root),
        "host": "claude",
        "hostSessionId": session,
    },
    "rootTask": {
        "taskId": task_id,
        "title": "Flow v2 contract",
        "selectionRevision": "selection-revision-0001",
    },
    "orientation": {
        "position": "explore",
        "movement": "initial",
        "fromPosition": None,
        "resumeFrom": None,
        "detail": {
            "kind": "explore",
            "mode": "research",
            "round": 2,
            "focus": "receiver",
            "reframe": "evidence",
        },
        "measure": {
            "owner": "explore-local",
            "label": "Questions",
            "current": 2,
            "total": 4,
            "unit": "questions",
            "unitSetRevision": "question-set-revision-0001",
            "sourceRevision": "question-source-revision-0001",
        },
    },
    "workSetBaseline": {"state": "unavailable", "reason": "not-authored"},
    "executeAcceptance": None,
    "drilldown": {"wave": None},
    "publisher": {
        "publisherId": "omp-flow-orchestrator",
        "actorId": actor,
        "sourceRevision": "semantic-source-revision-0001",
        "publicationRevision": "publication-revision-0001",
    },
    "semanticObservedAtUnixMs": now,
    "lease": {
        "leaseId": "lease-identifier-0001",
        "leaseRevision": "lease-revision-0001",
        "ownerActorId": actor,
        "selectionRevision": "selection-revision-0001",
        "issuedAtUnixMs": now,
        "expiresAtUnixMs": now + 600_000,
        "durationMs": 600_000,
    },
}

published = run(
    ["flow-status", "receive", "--host", "claude", "--session", session, "--actor-id", actor],
    request,
)
check(published.returncode == 0, published.stderr)
published_json = json.loads(published.stdout)
check(published_json["state"] == "written", "first publication is atomically written")

replayed = run(
    ["flow-status", "receive", "--host", "claude", "--session", session, "--actor-id", actor],
    request,
)
check(
    replayed.returncode == 0 and json.loads(replayed.stdout)["state"] == "unchanged",
    "identical request retry is idempotent",
)


def renew_document(
    expected_revision: str,
    renewed_revision: str,
    renewed_at: int,
    request_id: str,
) -> dict:
    return {
        "version": 2,
        "capability": "rootFlowLeaseRenewV2",
        "requestId": request_id,
        "scope": request["scope"],
        "rootTaskId": task_id,
        "expectedSelectionRevision": "selection-revision-0001",
        "publisherActorId": actor,
        "expectedPublicationRevision": "publication-revision-0001",
        "expectedSourceRevision": "semantic-source-revision-0001",
        "expectedLeaseId": "lease-identifier-0001",
        "expectedLeaseRevision": expected_revision,
        "renewedLeaseRevision": renewed_revision,
        "renewedAtUnixMs": renewed_at,
        "durationMs": 600_000,
        "semanticAssertion": "unchanged",
    }


def direct_renew(document: dict, fake_now: int) -> dict:
    return renew_root_flow_v2(
        root,
        "claude",
        session,
        actor,
        document,
        now_ms=fake_now,
    )


try:
    direct_renew(
        renew_document(
            "lease-revision-0001",
            "lease-revision-expired",
            now + 600_001,
            "renew-request-expired",
        ),
        now + 600_001,
    )
except FlowStatusError as exc:
    check(exc.code == "expired", "an expired lease cannot be renewed")
else:
    raise AssertionError("expired lease renewal was accepted")

renew_two = renew_document(
    "lease-revision-0001",
    "lease-revision-0002",
    now + 1_000,
    "renew-request-0002",
)
renewed = direct_renew(renew_two, now + 1_000)
check(renewed["state"] == "written", "fresh matching lease CAS renews once")
retry = direct_renew(renew_two, now + 1_001)
check(retry["state"] == "unchanged", "exact renew retry is idempotent")

forged_predecessor = json.loads(json.dumps(renew_two))
forged_predecessor["expectedLeaseRevision"] = "lease-revision-forged-predecessor"
try:
    direct_renew(forged_predecessor, now + 1_001)
except FlowStatusError as exc:
    check(
        exc.code == "replay",
        "same renewal effect with a forged predecessor is not an exact retry",
    )
else:
    raise AssertionError("renew retry accepted a forged predecessor revision")

conflicting = renew_document(
    "lease-revision-0001",
    "lease-revision-0002",
    now + 1_001,
    "renew-request-conflict",
)
try:
    direct_renew(conflicting, now + 1_001)
except FlowStatusError as exc:
    check(exc.code == "replay", "conflicting renewed revision reuse is rejected")
else:
    raise AssertionError("conflicting renewed revision reuse was accepted")

stale = renew_document(
    "lease-revision-0001",
    "lease-revision-stale",
    now + 2_000,
    "renew-request-stale",
)
try:
    direct_renew(stale, now + 2_000)
except FlowStatusError as exc:
    check(exc.code == "compare-failed", "stale expected lease revision fails CAS")
else:
    raise AssertionError("stale renewal CAS was accepted")

contenders = [
    renew_document(
        "lease-revision-0002",
        f"lease-revision-0003-{suffix}",
        now + 2_000,
        f"renew-request-concurrent-{suffix}",
    )
    for suffix in ("a", "b")
]


def compete(document: dict) -> tuple[str, str]:
    try:
        result = direct_renew(document, now + 2_000)
        return ("ok", result["leaseRevision"])
    except FlowStatusError as exc:
        return ("error", exc.code)


with ThreadPoolExecutor(max_workers=2) as pool:
    outcomes = list(pool.map(compete, contenders))
check(
    sum(kind == "ok" for kind, _ in outcomes) == 1
    and sum(kind == "error" and value == "compare-failed" for kind, value in outcomes) == 1,
    f"concurrent renewal has exactly one CAS winner: {outcomes}",
)
current_revision = next(value for kind, value in outcomes if kind == "ok")
for index, renewed_at in enumerate((now + 502_000, now + 1_002_000, now + 1_502_000), start=4):
    next_revision = f"lease-revision-{index:04d}"
    result = direct_renew(
        renew_document(
            current_revision,
            next_revision,
            renewed_at,
            f"renew-request-{index:04d}",
        ),
        renewed_at,
    )
    check(result["state"] == "written", "long waits remain visible through explicit renewals")
    current_revision = next_revision

inspected = run(["status", "inspect", "--host", "claude", "--session", session, "--json"])
view = json.loads(inspected.stdout)
check(
    inspected.returncode == 0
    and view["version"] == 2
    and view["snapshot"]["rootFlow"]["publication"]["orientation"]["position"] == "explore",
    "inspect returns the v2 root Task and Flow publication",
)
check(
    view["snapshot"]["nativeActivity"] is None,
    "native activity stays a separate optional branch",
)

forged = json.loads(json.dumps(request))
forged["requestId"] = "python-request-0002"
forged["orientation"]["measure"]["current"] = 5
rejected = run(
    ["flow-status", "receive", "--host", "claude", "--session", session, "--actor-id", actor],
    forged,
)
check(
    rejected.returncode == 2
    and json.loads(rejected.stderr)["code"] in {"invalid-relation", "malformed"},
    f"receiver rejects contradictory bounded measures: rc={rejected.returncode} out={rejected.stdout!r} err={rejected.stderr!r}",
)

clear_request = {
    "version": 2,
    "capability": "rootFlowClearV2",
    "requestId": "python-clear-0001",
    "scope": request["scope"],
    "rootTaskId": task_id,
    "publisherActorId": actor,
    "expectedPublicationRevision": "publication-revision-0001",
    "expectedLeaseId": "lease-identifier-0001",
    "selectionRevision": "selection-revision-0001",
    "reason": "user-requested",
    "clearedAtUnixMs": int(time.time() * 1000),
}
cleared = run(
    ["flow-status", "clear", "--host", "claude", "--session", session, "--actor-id", actor],
    clear_request,
)
check(
    cleared.returncode == 0 and json.loads(cleared.stdout)["state"] == "cleared",
    f"clear revokes root authority: rc={cleared.returncode} out={cleared.stdout!r} err={cleared.stderr!r}",
)
after_clear = run(["status", "inspect", "--host", "claude", "--session", session, "--json"])
after = json.loads(after_clear.stdout)
check(
    after_clear.returncode == 2
    and after["snapshot"]["rootFlow"] == {"state": "unavailable", "reason": "cleared"},
    "clear retains an explicit unavailable reason without manufacturing Flow state",
)

# Snow and Cursor extend only the closed host scope. The same literal session label must remain
# isolated by host while publish, inspect, renew, stale-CAS rejection, and clear retain v2 shapes.
shared_session = "shared-host-session"
host_states: dict[str, dict] = {}
command_keys = {
    "version",
    "command",
    "state",
    "requestId",
    "scope",
    "rootTaskId",
    "publicationRevision",
    "sourceRevision",
    "leaseId",
    "leaseRevision",
    "snapshotRevision",
    "cacheKey",
}
snapshot_keys = {
    "version",
    "snapshotRevision",
    "generatedAtUnixMs",
    "scope",
    "rootFlow",
    "nativeActivity",
}

for host in ("snow", "cursor"):
    host_now = int(time.time() * 1000)
    host_request = json.loads(json.dumps(request))
    host_request["requestId"] = f"{host}-request-0001"
    host_request["scope"] = {
        "repositoryRoot": str(root),
        "host": host,
        "hostSessionId": shared_session,
    }
    host_request["publisher"]["sourceRevision"] = f"{host}-source-revision-0001"
    host_request["publisher"]["publicationRevision"] = (
        f"{host}-publication-revision-0001"
    )
    host_request["semanticObservedAtUnixMs"] = host_now
    host_request["lease"] = {
        "leaseId": f"{host}-lease-identifier-0001",
        "leaseRevision": f"{host}-lease-revision-0001",
        "ownerActorId": actor,
        "selectionRevision": "selection-revision-0001",
        "issuedAtUnixMs": host_now,
        "expiresAtUnixMs": host_now + 600_000,
        "durationMs": 600_000,
    }

    host_published = run(
        [
            "flow-status",
            "receive",
            "--host",
            host,
            "--session",
            shared_session,
            "--actor-id",
            actor,
        ],
        host_request,
    )
    check(host_published.returncode == 0, host_published.stderr)
    host_published_json = json.loads(host_published.stdout)
    check(
        set(host_published_json) == command_keys
        and host_published_json["scope"] == host_request["scope"],
        f"{host} publish retains the exact v2 success shape and scope",
    )

    host_inspected = run(
        ["status", "inspect", "--host", host, "--session", shared_session, "--json"]
    )
    check(host_inspected.returncode == 0, host_inspected.stderr)
    host_view = json.loads(host_inspected.stdout)
    check(
        set(host_view["snapshot"]) == snapshot_keys
        and host_view["snapshot"]["scope"] == host_request["scope"],
        f"{host} inspect retains the exact v2 snapshot shape and scope",
    )

    renewed_at = host_now + 1_000
    host_renew = {
        "version": 2,
        "capability": "rootFlowLeaseRenewV2",
        "requestId": f"{host}-renew-request-0001",
        "scope": host_request["scope"],
        "rootTaskId": task_id,
        "expectedSelectionRevision": "selection-revision-0001",
        "publisherActorId": actor,
        "expectedPublicationRevision": host_request["publisher"][
            "publicationRevision"
        ],
        "expectedSourceRevision": host_request["publisher"]["sourceRevision"],
        "expectedLeaseId": host_request["lease"]["leaseId"],
        "expectedLeaseRevision": host_request["lease"]["leaseRevision"],
        "renewedLeaseRevision": f"{host}-lease-revision-0002",
        "renewedAtUnixMs": renewed_at,
        "durationMs": 600_000,
        "semanticAssertion": "unchanged",
    }
    host_renewed = run(
        [
            "flow-status",
            "renew",
            "--host",
            host,
            "--session",
            shared_session,
            "--actor-id",
            actor,
        ],
        host_renew,
    )
    check(host_renewed.returncode == 0, host_renewed.stderr)
    host_renewed_json = json.loads(host_renewed.stdout)
    check(
        set(host_renewed_json) == command_keys
        and host_renewed_json["leaseRevision"] == host_renew["renewedLeaseRevision"],
        f"{host} renewal retains the exact v2 success shape",
    )

    stale_renew = json.loads(json.dumps(host_renew))
    stale_renew["requestId"] = f"{host}-renew-request-stale"
    stale_renew["renewedLeaseRevision"] = f"{host}-lease-revision-stale"
    stale_renewed = run(
        [
            "flow-status",
            "renew",
            "--host",
            host,
            "--session",
            shared_session,
            "--actor-id",
            actor,
        ],
        stale_renew,
    )
    check(
        stale_renewed.returncode == 2
        and json.loads(stale_renewed.stderr)["code"] == "compare-failed",
        f"{host} renewal preserves scoped CAS rejection",
    )
    host_states[host] = {
        "request": host_request,
        "renew": host_renew,
        "cacheKey": host_published_json["cacheKey"],
    }

check(
    host_states["snow"]["cacheKey"] != host_states["cursor"]["cacheKey"],
    "the same session label under Snow and Cursor produces isolated cache scopes",
)

cache_root = root / ".omp-flow" / ".runtime" / "flow-status"
before_unknown = sorted(path.name for path in cache_root.glob("*.json"))
unknown = run(
    [
        "flow-status",
        "receive",
        "--host",
        "unknown",
        "--session",
        shared_session,
        "--actor-id",
        actor,
    ],
    host_states["snow"]["request"],
)
after_unknown = sorted(path.name for path in cache_root.glob("*.json"))
check(
    unknown.returncode == 2 and before_unknown == after_unknown,
    "an unknown host fails CLI parsing before cache mutation",
)

for host in ("cursor", "snow"):
    state = host_states[host]
    host_request = state["request"]
    clear_host = {
        "version": 2,
        "capability": "rootFlowClearV2",
        "requestId": f"{host}-clear-request-0001",
        "scope": host_request["scope"],
        "rootTaskId": task_id,
        "publisherActorId": actor,
        "expectedPublicationRevision": host_request["publisher"][
            "publicationRevision"
        ],
        "expectedLeaseId": host_request["lease"]["leaseId"],
        "selectionRevision": "selection-revision-0001",
        "reason": "user-requested",
        "clearedAtUnixMs": int(time.time() * 1000),
    }
    host_cleared = run(
        [
            "flow-status",
            "clear",
            "--host",
            host,
            "--session",
            shared_session,
            "--actor-id",
            actor,
        ],
        clear_host,
    )
    check(host_cleared.returncode == 0, host_cleared.stderr)
    check(
        set(json.loads(host_cleared.stdout)) == command_keys,
        f"{host} clear retains the exact v2 success shape",
    )
    if host == "cursor":
        snow_still_live = run(
            [
                "status",
                "inspect",
                "--host",
                "snow",
                "--session",
                shared_session,
                "--json",
            ]
        )
        check(
            snow_still_live.returncode == 0,
            "clearing Cursor cannot revoke the same-labeled Snow scope",
        )

print("PASS: Flow Status v2 publication/cache and Snow/Cursor host-parity checks")
