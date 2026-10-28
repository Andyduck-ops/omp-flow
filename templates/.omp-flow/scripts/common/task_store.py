from __future__ import annotations

import json
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from .io import WorkflowError, atomic_write_text
from .paths import flow_dir, task_dir, tasks_dir
from .workscope import marker_lock, marker_path, read_marker


def _slug(value: str) -> str:
    pieces: list[str] = []
    separator = False
    for character in value.lower():
        if character.isascii() and character.isalnum():
            if separator and pieces:
                pieces.append("-")
            pieces.append(character)
            separator = False
        else:
            separator = True
    slug = "".join(pieces).strip("-")[:48].rstrip("-")
    return slug or "untitled-task"


def build_task_id(title: str, slug: str | None = None, now: datetime | None = None) -> str:
    stamp = now or datetime.now()
    base = _slug(slug or title)
    if slug is not None:
        # Explicit slugs may already carry a date prefix; avoid doubling it.
        parts = base.split("-", 2)
        if len(parts) == 3 and all(len(part) == 2 and part.isdigit() for part in parts[:2]):
            base = parts[2]
    return f"{stamp.month:02d}-{stamp.day:02d}-{base}"


def _concept(
    concept_type: str,
    title: str,
    body: str,
    *,
    description: str | None = None,
    tags: list[str] | None = None,
) -> str:
    extra = ""
    if description:
        extra += f"description: {json.dumps(description.strip(), ensure_ascii=False)}\n"
    if tags:
        cleaned_tags = [t.strip() for t in tags if t and t.strip()]
        if cleaned_tags:
            extra += f"tags: [{', '.join(json.dumps(t, ensure_ascii=False) for t in cleaned_tags)}]\n"
    return (
        "---\n"
        f"type: {json.dumps(concept_type, ensure_ascii=False)}\n"
        f"title: {json.dumps(title, ensure_ascii=False)}\n"
        f"{extra}"
        "---\n\n"
        f"# {title}\n\n"
        f"{body.rstrip()}\n"
    )


def _bundle_index(title: str) -> str:
    return (
        '---\nokf_version: "0.2"\n---\n\n'
        f"# {title}\n\n"
        "- [Task](task.md) — purpose and durable task identity.\n"
        "- [Brainstorm](brainstorm.md) — questions, hypotheses, and reframing.\n\n"
        "Add and link Concepts as the task grows. Update this map in the same change whenever a "
        "durable Concept is created, renamed, moved, or retired; link each handoff and review back "
        "to its source. This index is navigation, not a closed manifest.\n"
    )


def create_task(
    repo: Path,
    title: str,
    *,
    slug: str | None = None,
    parent: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:

    task_id = build_task_id(title, slug)
    target = tasks_dir(repo) / task_id
    if target.exists():
        raise WorkflowError(f"Task already exists: {task_id}")

    parent_text = ""
    if parent:
        task_dir(repo, parent)
        parent_text = f"\n\nParent: [{parent}](../{parent}/index.md)"

    tasks_dir(repo).mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{task_id}.", dir=tasks_dir(repo)))
    try:
        atomic_write_text(temporary / "index.md", _bundle_index(title))
        atomic_write_text(
            temporary / "task.md",
            _concept(
                "Task",
                title,
                f"Task directory: `{task_id}`.{parent_text}",
                description=description or title,
                tags=tags,
            ),
        )
        atomic_write_text(
            temporary / "brainstorm.md",
            _concept(
                "Brainstorm",
                f"Brainstorm: {title}",
                "Capture questions, hypotheses, alternatives, and reframing here or in linked Concepts.",
                description="questions, hypotheses, and reframing",
            ),
        )
        temporary.replace(target)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    refresh_task_bundle_index(repo, task_id)
    refresh_tasks_index(repo)
    return {"taskId": task_id, "taskDir": str(target)}


def list_tasks(repo: Path) -> list[dict[str, Any]]:
    root = tasks_dir(repo)
    if not root.is_dir():
        return []
    result = []
    for path in sorted(root.iterdir()):
        if path.is_dir() and path.name != "archive" and not path.name.startswith("."):
            if (path / "index.md").is_file():
                result.append({"id": path.name, "taskDir": str(path)})
    return result


def archive_task(repo: Path, task_id: str) -> tuple[Path, dict[str, Any]]:
    repo = repo.resolve(strict=True)
    source = task_dir(repo, task_id)
    from .operation_store import has_active_operations
    from .sleep_store import finalize_sleep_source, prepare_sleep_source

    with marker_lock(repo):
        marker = marker_path(repo)
        marker_snapshot: bytes | None = None
        if marker.is_file() and not marker.is_symlink():
            marker_scope = read_marker(repo)
            if (
                marker_scope is not None
                and marker_scope.task_id == task_id
                and marker_scope.workspace_root == repo
            ):
                marker_snapshot = marker.read_bytes()

        if has_active_operations(repo, task_id):
            raise WorkflowError("Task has active runtime operations")
        month = datetime.now().strftime("%Y-%m")
        destination = tasks_dir(repo) / "archive" / month / task_id
        if destination.exists():
            raise WorkflowError(f"Archive destination exists: {destination}")
        sleep_source = prepare_sleep_source(repo, task_id, source, destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.replace(destination)
        finalized = finalize_sleep_source(repo, sleep_source, destination)
        refresh_tasks_index(repo)

        if marker_snapshot is not None and marker.is_file() and not marker.is_symlink():
            if marker.read_bytes() == marker_snapshot:
                marker.unlink()
        return destination, finalized


STANDARD_CONCEPT_TYPES = {
    "Task",
    "Brainstorm",
    "PRD",
    "Design",
    "Technical Design",
    "Research",
    "Reference",
    "Synthesis",
    "QbD Audit",
    "Human Decision",
    "Decision",
    "Work",
    "Work Map",
    "Implementation Handoff",
    "Handoff",
    "Review",
    "Review Concept",
    "Release Disposition",
    "Experiment Execution",
    "Pilot Comparison",
    "Knowhow",
    "Diagnostic Knowhow",
    "Architecture",
    "Spec",
    "Verification Contract",
    "Philosophy",
    "Working Philosophy",
    "Repository Contract",
    "Methodology Decision",
    "Sleep Run",
    "Sleep Candidate",
}

WIKI_DOMAINS: tuple[tuple[str, str, str], ...] = (
    (
        "specs",
        "Product and Protocol Specs",
        "Use this directory for explicit human-approved product, protocol, and verification contracts. Read only the Spec that governs the active capability or boundary.",
    ),
    (
        "architecture",
        "Architecture",
        "Durable component boundaries, Harness adapters, and integration contracts. Load only the Concept relevant to the active decision.",
    ),
    (
        "knowhow",
        "Diagnostic & Engineering Knowhow",
        "Reusable root-cause patterns, CLI/TTY contracts, verification recipes, and operational pitfalls.",
    ),
    (
        "philosophy",
        "Working Philosophy",
        "Core methodology principles: semantic knowledge, mechanical boundaries, and evidence-led delivery.",
    ),
    (
        "decisions",
        "Decision Records",
        "Any Decision Records: the durable why behind architecture and small design choices. Files are named <context>--<question>--<date>, so the records for one question sort together.",
    ),
    (
        "archive",
        "Archive",
        "Concepts that no longer describe current truth, kept under dated reason folders for history.",
    ),
)

# Statuses that keep a Concept out of the active map; it is listed under "Inactive".
INACTIVE_STATUSES = frozenset({"deprecated", "superseded", "rejected", "archived"})
KNOWN_STATUSES = frozenset({"draft", "stable", "proposed", "accepted"}) | INACTIVE_STATUSES
# Domains that grow without bound are listed in the root map by count only; their own index lists
# every entry. This keeps the root map, which is injected at session start, from growing with them.
ROOT_COLLAPSED_DOMAINS = frozenset({"decisions", "archive"})

TASK_SECTION_ORDER: tuple[tuple[str, str], ...] = (
    ("research", "Research & Reference"),
    ("reference", "Reference"),
    ("qbd", "QbD & Human Calibration"),
    ("work", "Work"),
    ("handoff", "Implementation Handoffs"),
    ("handoffs", "Implementation Handoffs"),
    ("review", "Independent Reviews"),
    ("experiment", "Experiments"),
)

_ENTRY_RE = re.compile(
    r"^\s*-\s*\[(?P<label>[^\]]+)\]\((?P<link>[^)]+)\)"
    r"(?:\s*`\[(?P<tags>[^\]]*)\]`)?"
    r"(?:\s*(?:—|--|-|:)\s*(?P<desc>.+?))?\s*$"
)


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        if value[0] == '"':
            try:
                parsed = json.loads(value)
                if isinstance(parsed, str):
                    return parsed.strip()
            except Exception:
                pass
        return value[1:-1].strip()
    return value


def _parse_tags_value(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw:
        return []
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        if not inner:
            return []
        return [
            _strip_quotes(part)
            for part in inner.split(",")
            if _strip_quotes(part)
        ]
    return [_strip_quotes(part) for part in raw.split(",") if _strip_quotes(part)]


def parse_frontmatter(text: str) -> dict[str, Any]:
    lines = text.splitlines()
    meta: dict[str, Any] = {}
    body_start = 0
    if lines and lines[0].strip() == "---":
        current_list_key: str | None = None
        for idx in range(1, len(lines)):
            line = lines[idx]
            if line.strip() == "---":
                body_start = idx + 1
                break
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if stripped.startswith("- ") and current_list_key:
                item = _strip_quotes(stripped[2:])
                if item:
                    meta.setdefault(current_list_key, []).append(item)
                continue
            current_list_key = None
            if ":" not in line:
                continue
            key, raw_val = line.split(":", 1)
            key = key.strip()
            raw_val = raw_val.strip()
            if key == "tags":
                if not raw_val:
                    meta["tags"] = []
                    current_list_key = "tags"
                else:
                    meta["tags"] = _parse_tags_value(raw_val)
            else:
                meta[key] = _strip_quotes(raw_val)

    heading = ""
    first_sentence = ""
    for line in lines[body_start:]:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            if not heading:
                heading = stripped.lstrip("#").strip()
            continue
        if not stripped.startswith(("-", "*", "|", "`", ">", "[")):
            first_sentence = stripped
            break

    title = str(meta.get("title") or heading or "").strip()
    concept_type = str(meta.get("type") or "").strip()
    description = str(meta.get("description") or "").strip()
    status = str(meta.get("status") or "stable").strip().lower()
    if status not in KNOWN_STATUSES:
        status = "stable"
    raw_tags = meta.get("tags")
    tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()] if isinstance(raw_tags, list) else []
    return {
        "type": concept_type,
        "title": title,
        "description": description,
        "first_sentence": first_sentence,
        "status": status,
        "tags": tags,
        "okf_version": meta.get("okf_version"),
    }


def _parse_existing_index_entries(index_path: Path) -> dict[str, dict[str, Any]]:
    if not index_path.is_file() or index_path.is_symlink():
        return {}
    try:
        text = index_path.read_text(encoding="utf-8")
    except OSError:
        return {}
    entries: dict[str, dict[str, Any]] = {}
    for line in text.splitlines():
        match = _ENTRY_RE.match(line)
        if not match:
            continue
        link = match.group("link").strip()
        if link.startswith("./"):
            link = link[2:]
        label = (match.group("label") or "").strip()
        tags_raw = match.group("tags") or ""
        desc = (match.group("desc") or "").strip()
        tags = _parse_tags_value(f"[{tags_raw}]") if tags_raw else []
        entries[link] = {
            "label": label,
            "description": desc,
            "tags": tags,
        }
    return entries


def _format_entry(
    title: str,
    rel_link: str,
    *,
    description: str = "",
    tags: list[str] | None = None,
    concept_type: str = "",
    status: str = "stable",
) -> str:
    badge_parts: list[str] = []
    if concept_type and concept_type not in STANDARD_CONCEPT_TYPES:
        badge_parts.append(f"type:{concept_type}")
    if status not in ("stable", "accepted"):
        badge_parts.append(status)
    if tags:
        for tag in tags:
            if tag not in badge_parts:
                badge_parts.append(tag)
    tag_segment = f" `[{', '.join(badge_parts)}]`" if badge_parts else ""
    desc_segment = f" — {description.rstrip('.')}" if description else ""
    return f"- [{title}]({rel_link}){tag_segment}{desc_segment}"


def _read_concept_entry(
    file_path: Path,
    rel_link: str,
    fallback_entries: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    try:
        text = file_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise WorkflowError(f"Cannot read Markdown Concept {file_path}: {exc}") from exc
    meta = parse_frontmatter(text)
    fallback = fallback_entries.get(rel_link, {})
    title = meta["title"] or fallback.get("label") or file_path.stem
    description = meta["description"] or fallback.get("description") or ""
    tags = meta["tags"] or fallback.get("tags") or []
    return {
        "title": title,
        "rel_link": rel_link,
        "type": meta["type"],
        "description": description,
        "tags": tags,
        "status": meta["status"],
    }


def refresh_wiki_indexes(repo: Path) -> list[str]:
    repo = repo.resolve(strict=True)
    wiki_root = flow_dir(repo) / "wiki"
    wiki_root.mkdir(parents=True, exist_ok=True)
    root_fallbacks = _parse_existing_index_entries(wiki_root / "index.md")

    known_order = {name: idx for idx, (name, _, _) in enumerate(WIKI_DOMAINS)}
    known_meta = {name: (title, summary) for name, title, summary in WIKI_DOMAINS}

    domain_dirs: list[Path] = []
    for name, _, _ in WIKI_DOMAINS:
        d = wiki_root / name
        if d.is_dir() and not d.is_symlink():
            domain_dirs.append(d)
    for child in sorted(wiki_root.iterdir()):
        if (
            child.is_dir()
            and not child.is_symlink()
            and not child.name.startswith(".")
            and child.name not in known_order
        ):
            domain_dirs.append(child)

    updated: list[str] = []
    domain_summaries: list[tuple[str, str, str, list[dict[str, Any]]]] = []

    for domain_dir in domain_dirs:
        domain_name = domain_dir.name
        domain_title, domain_summary = known_meta.get(
            domain_name,
            (
                domain_name.replace("-", " ").title(),
                f"Domain knowledge and reusable Concepts under `{domain_name}/`.",
            ),
        )
        domain_index_path = domain_dir / "index.md"
        domain_fallbacks = _parse_existing_index_entries(domain_index_path)
        for k, v in root_fallbacks.items():
            prefix = f"{domain_name}/"
            if k.startswith(prefix):
                sub_rel = k[len(prefix) :]
                domain_fallbacks.setdefault(sub_rel, v)

        active_entries: list[dict[str, Any]] = []
        inactive_entries: list[dict[str, Any]] = []

        md_files = sorted(
            p
            for p in domain_dir.rglob("*.md")
            if p.is_file()
            and not p.is_symlink()
            and p.name not in ("index.md", "log.md")
        )
        for md_file in md_files:
            rel_in_domain = md_file.relative_to(domain_dir).as_posix()
            entry = _read_concept_entry(md_file, rel_in_domain, domain_fallbacks)
            # Location decides for archive/: a moved Concept is inactive even if its status lags.
            if entry["status"] in INACTIVE_STATUSES or domain_name == "archive":
                inactive_entries.append(entry)
            else:
                active_entries.append(entry)

        lines = [
            "---",
            'okf_version: "0.2"',
            "---",
            "",
            f"# {domain_title}",
            "",
            domain_summary,
            "",
        ]
        if active_entries:
            for item in active_entries:
                lines.append(
                    _format_entry(
                        item["title"],
                        item["rel_link"],
                        description=item["description"],
                        tags=item["tags"],
                        concept_type=item["type"],
                        status=item["status"],
                    )
                )
            lines.append("")
        else:
            lines.append("No active Concepts promoted in this domain yet.")
            lines.append("")

        if inactive_entries:
            lines.append("## Inactive")
            lines.append("")
            for item in inactive_entries:
                lines.append(
                    _format_entry(
                        item["title"],
                        item["rel_link"],
                        description=item["description"],
                        tags=item["tags"],
                        concept_type=item["type"],
                        status=item["status"],
                    )
                )
            lines.append("")

        atomic_write_text(domain_index_path, "\n".join(lines).rstrip() + "\n")
        updated.append(domain_index_path.relative_to(repo).as_posix())
        domain_summaries.append((domain_name, domain_title, domain_summary, active_entries))

    root_files = sorted(
        p
        for p in wiki_root.glob("*.md")
        if p.is_file() and not p.is_symlink() and p.name not in ("index.md", "log.md")
    )
    root_entries = [
        _read_concept_entry(p, p.name, root_fallbacks)
        for p in root_files
    ]

    root_lines = [
        "---",
        'okf_version: "0.2"',
        "---",
        "",
        "# Project Wiki",
        "",
        "This is the project-owned entry point for durable knowledge. Follow only the topic relevant to the current work; these links aid discovery and do not claim to enumerate everything the project knows.",
        "",
        "## Domains",
        "",
    ]
    for domain_name, domain_title, domain_summary, active_entries in domain_summaries:
        short_summary = domain_summary.split(".")[0].strip()
        root_lines.append(
            f"- [{domain_title}]({domain_name}/index.md) `[{len(active_entries)}]` — {short_summary}"
        )
    root_lines.append("")

    for domain_name, domain_title, _, active_entries in domain_summaries:
        if not active_entries or domain_name in ROOT_COLLAPSED_DOMAINS:
            continue
        root_lines.append(f"## {domain_title} ([index]({domain_name}/index.md))")
        root_lines.append("")
        for item in active_entries:
            root_lines.append(
                _format_entry(
                    item["title"],
                    f"{domain_name}/{item['rel_link']}",
                    description=item["description"],
                    tags=item["tags"],
                    concept_type=item["type"],
                    status=item["status"],
                )
            )
        root_lines.append("")

    if root_entries:
        root_lines.append("## General")
        root_lines.append("")
        for item in root_entries:
            root_lines.append(
                _format_entry(
                    item["title"],
                    item["rel_link"],
                    description=item["description"],
                    tags=item["tags"],
                    concept_type=item["type"],
                    status=item["status"],
                )
            )
        root_lines.append("")

    root_index_path = wiki_root / "index.md"
    atomic_write_text(root_index_path, "\n".join(root_lines).rstrip() + "\n")
    updated.append(root_index_path.relative_to(repo).as_posix())
    return updated


def refresh_task_bundle_index(repo: Path, task_id: str) -> str:
    repo = repo.resolve(strict=True)
    bundle = task_dir(repo, task_id)
    index_path = bundle / "index.md"
    fallbacks = _parse_existing_index_entries(index_path)

    task_md = bundle / "task.md"
    bundle_title = task_id
    if task_md.is_file() and not task_md.is_symlink():
        task_meta = parse_frontmatter(task_md.read_text(encoding="utf-8"))
        if task_meta["title"]:
            bundle_title = task_meta["title"]

    default_core_descs = {
        "task.md": ("Task", "purpose and durable task identity"),
        "brainstorm.md": ("Brainstorm", "questions, hypotheses, and reframing"),
        "prd.md": ("PRD", "requirements, scope boundaries, and acceptance criteria"),
        "design.md": ("Design", "selected architecture, contracts, and tradeoffs"),
    }

    core_order = ("task.md", "brainstorm.md", "prd.md", "design.md")
    core_entries: list[dict[str, Any]] = []
    other_root_entries: list[dict[str, Any]] = []
    section_entries: dict[str, list[dict[str, Any]]] = {}
    inactive_entries: list[dict[str, Any]] = []

    all_md = sorted(
        p
        for p in bundle.rglob("*.md")
        if p.is_file() and not p.is_symlink()
    )
    for md_file in all_md:
        rel = md_file.relative_to(bundle).as_posix()
        if rel in ("index.md", "log.md"):
            continue
        entry = _read_concept_entry(md_file, rel, fallbacks)
        if rel in default_core_descs:
            default_label, default_desc = default_core_descs[rel]
            if rel in ("task.md", "brainstorm.md") and not fallbacks.get(rel):
                entry["title"] = default_label
            if not entry["description"]:
                entry["description"] = default_desc
        if entry["status"] in INACTIVE_STATUSES:
            inactive_entries.append(entry)
            continue
        if "/" not in rel:
            if rel in core_order:
                core_entries.append(entry)
            else:
                other_root_entries.append(entry)
        else:
            top_dir = rel.split("/", 1)[0]
            section_entries.setdefault(top_dir, []).append(entry)

    core_rank = {name: i for i, name in enumerate(core_order)}
    core_entries.sort(key=lambda e: core_rank.get(e["rel_link"], 99))

    lines = [
        "---",
        'okf_version: "0.2"',
        "---",
        "",
        f"# {bundle_title}",
        "",
    ]
    for item in core_entries + other_root_entries:
        lines.append(
            _format_entry(
                item["title"],
                item["rel_link"],
                description=item["description"],
                tags=item["tags"],
                concept_type=item["type"],
                status=item["status"],
            )
        )

    known_sections = dict(TASK_SECTION_ORDER)
    ordered_dirs = [d for d, _ in TASK_SECTION_ORDER if d in section_entries]
    for d in sorted(section_entries):
        if d not in known_sections:
            ordered_dirs.append(d)

    for d in ordered_dirs:
        items = section_entries[d]
        if not items:
            continue
        section_title = known_sections.get(d, d.replace("-", " ").title())
        lines.append("")
        lines.append(f"## {section_title}")
        lines.append("")
        for item in items:
            lines.append(
                _format_entry(
                    item["title"],
                    item["rel_link"],
                    description=item["description"],
                    tags=item["tags"],
                    concept_type=item["type"],
                    status=item["status"],
                )
            )

    if inactive_entries:
        lines.append("")
        lines.append("## Inactive")
        lines.append("")
        for item in inactive_entries:
            lines.append(
                _format_entry(
                    item["title"],
                    item["rel_link"],
                    description=item["description"],
                    tags=item["tags"],
                    concept_type=item["type"],
                    status=item["status"],
                )
            )

    lines.extend(
        [
            "",
            "Add and link Concepts as the task grows. Update this map in the same change whenever a "
            "durable Concept is created, renamed, moved, or retired; link each handoff and review back "
            "to its source. This index is navigation, not a closed manifest.",
            "",
        ]
    )
    atomic_write_text(index_path, "\n".join(lines))
    return index_path.relative_to(repo).as_posix()


def refresh_tasks_index(repo: Path) -> str:
    repo = repo.resolve(strict=True)
    root = tasks_dir(repo)
    root.mkdir(parents=True, exist_ok=True)
    index_path = root / "index.md"
    fallbacks = _parse_existing_index_entries(index_path)

    active_bundles: list[Path] = []
    for child in sorted(root.iterdir(), reverse=True):
        if (
            child.is_dir()
            and not child.is_symlink()
            and child.name != "archive"
            and not child.name.startswith(".")
            and (child / "index.md").is_file()
        ):
            active_bundles.append(child)

    lines = [
        "---",
        'okf_version: "0.2"',
        "---",
        "",
        "# Task Map",
        "",
        "Link Task Bundles here with a short description so a new session can find previous work.",
        "",
    ]
    for bundle in active_bundles:
        rel_link = f"{bundle.name}/index.md"
        task_md = bundle / "task.md"
        meta = (
            parse_frontmatter(task_md.read_text(encoding="utf-8"))
            if task_md.is_file() and not task_md.is_symlink()
            else {"title": bundle.name, "description": "", "tags": [], "status": "stable", "type": "Task"}
        )
        fb = fallbacks.get(rel_link, {})
        title = meta["title"] or bundle.name
        desc = meta["description"] or fb.get("description") or title
        if desc != title and title.lower() not in desc.lower():
            desc = f"{title} — {desc}"
        tags = meta["tags"] or fb.get("tags") or []
        lines.append(
            _format_entry(
                bundle.name,
                rel_link,
                description=desc,
                tags=tags,
                status=meta["status"],
            )
        )

    lines.append("")
    atomic_write_text(index_path, "\n".join(lines))
    return index_path.relative_to(repo).as_posix()


def refresh_indexes(repo: Path, target: str = "all") -> dict[str, Any]:
    repo = repo.resolve(strict=True)
    updated: list[str] = []
    normalized = target.strip() or "all"
    if normalized == "all":
        updated.extend(refresh_wiki_indexes(repo))
        root = tasks_dir(repo)
        if root.is_dir():
            for child in sorted(root.iterdir()):
                if (
                    child.is_dir()
                    and not child.is_symlink()
                    and child.name != "archive"
                    and not child.name.startswith(".")
                    and (child / "index.md").is_file()
                ):
                    updated.append(refresh_task_bundle_index(repo, child.name))
        updated.append(refresh_tasks_index(repo))
    elif normalized == "wiki":
        updated.extend(refresh_wiki_indexes(repo))
    elif normalized == "tasks":
        root = tasks_dir(repo)
        if root.is_dir():
            for child in sorted(root.iterdir()):
                if (
                    child.is_dir()
                    and not child.is_symlink()
                    and child.name != "archive"
                    and not child.name.startswith(".")
                    and (child / "index.md").is_file()
                ):
                    updated.append(refresh_task_bundle_index(repo, child.name))
        updated.append(refresh_tasks_index(repo))
    else:
        updated.append(refresh_task_bundle_index(repo, normalized))
        updated.append(refresh_tasks_index(repo))
    return {"target": normalized, "updated": updated}
