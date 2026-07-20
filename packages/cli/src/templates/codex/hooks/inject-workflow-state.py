#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def find_repo(start: Path) -> Path | None:
    current = start.resolve()
    while current != current.parent:
        if (current / ".omp-flow" / "scripts" / "omp_flow.py").is_file():
            return current
        current = current.parent
    return None


def main() -> int:
    repo = find_repo(Path.cwd())
    if repo is None:
        return 0
    script = repo / ".omp-flow" / "scripts" / "omp_flow.py"
    result = subprocess.run(
        [sys.executable, "-X", "utf8", str(script), "--cwd", str(repo), "hook", "codex-workflow-state"],
        input=sys.stdin.buffer.read(),
        stdout=sys.stdout.buffer,
        stderr=sys.stderr.buffer,
        check=False,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
