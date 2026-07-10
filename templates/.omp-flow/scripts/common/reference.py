from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .io import WorkflowError, atomic_write_json, atomic_write_text, confined_path, read_json, read_text
from .paths import task_dir


REF_SPEC = re.compile(r"^ref:([a-z0-9][a-z0-9-]*)(?:#L(\d+)(?:-(\d+))?)?$")


def digest_file(
    repo: Path,
    task_id: str,
    source_repo: str,
    source_path: str,
    *,
    line_start: int | None = None,
    line_end: int | None = None,
    summary: str = "",
    intent: str = "",
) -> dict[str, Any]:
    source_root = confined_path(repo, source_repo)
    reference_root = confined_path(repo, "reference")
    try:
        source_root.relative_to(reference_root)
    except ValueError as exc:
        raise WorkflowError("source-repo must be under repository reference/") from exc
    if not source_root.is_dir():
        raise WorkflowError(f"Reference repository not found: {source_root}")
    source = confined_path(source_root, source_path)
    if not source.is_file():
        raise WorkflowError(f"Reference source not found: {source}")
    if (line_start is None) != (line_end is None):
        raise WorkflowError("line-start and line-end must be provided together")
    content = read_text(source)
    lines = content.splitlines()
    if line_start is not None:
        if line_start < 1 or line_end is None or line_end < line_start or line_end > len(lines):
            raise WorkflowError("Invalid reference line range")
        selected = "\n".join(lines[line_start - 1:line_end])
        source_lines = f"L{line_start}-{line_end}"
    else:
        selected = content
        source_lines = "full"
    repo_part = re.sub(r"[^a-z0-9]+", "-", source_repo.lower()).strip("-")
    file_part = re.sub(r"[^a-z0-9]+", "-", source_path.lower()).strip("-")
    slug = f"{repo_part}-{file_part}" or "reference"
    output = task_dir(repo, task_id) / "reference" / f"{slug}{source.suffix}"
    meta_path = task_dir(repo, task_id) / "reference" / f"{slug}.meta.json"
    metadata = {
        "slug": slug,
        "sourceRepo": source_repo,
        "sourcePath": source.relative_to(source_root).as_posix(),
        "sourceLines": source_lines,
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "summary": summary or f"Digest of {source_path}",
        "intent": intent,
    }
    atomic_write_text(output, selected)
    atomic_write_json(meta_path, metadata)
    return metadata


def list_references(repo: Path, task_id: str) -> list[dict[str, Any]]:
    root = task_dir(repo, task_id) / "reference"
    return [read_json(path) for path in sorted(root.glob("*.meta.json"))]


def render_references(repo: Path, task_id: str, specs: str) -> str:
    root = task_dir(repo, task_id) / "reference"
    blocks = ["<omp-flow-references>"]
    for spec in [part.strip() for part in specs.split(";") if part.strip()]:
        match = REF_SPEC.fullmatch(spec)
        if not match:
            raise WorkflowError(f"Invalid reference spec: {spec}")
        slug, start_raw, end_raw = match.groups()
        metadata = read_json(root / f"{slug}.meta.json")
        candidates = [path for path in root.glob(f"{slug}.*") if path.name != f"{slug}.meta.json"]
        if len(candidates) != 1:
            raise WorkflowError(f"Reference slice not uniquely resolved: {slug}")
        content = read_text(candidates[0])
        source_lines = str(metadata.get("sourceLines", "full"))
        if start_raw:
            start = int(start_raw)
            end = int(end_raw or start_raw)
            lines = content.splitlines()
            if start < 1 or end < start or end > len(lines):
                raise WorkflowError(f"Invalid reference selection: {spec}")
            content = "\n".join(lines[start - 1:end])
            source_lines = f"L{start}-{end}"
        attrs = {
            "slug": slug,
            "sourceRepo": metadata.get("sourceRepo", ""),
            "sourcePath": metadata.get("sourcePath", ""),
            "sourceLines": source_lines,
            "summary": metadata.get("summary", ""),
        }
        attr_text = " ".join(f'{key}={json.dumps(str(value))}' for key, value in attrs.items())
        blocks.append(f"<reference {attr_text}>\n{content}\n</reference>")
    blocks.append("</omp-flow-references>")
    return "\n".join(blocks)
