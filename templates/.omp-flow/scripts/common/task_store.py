from __future__ import annotations

import json
import os
import re
import shutil
import stat
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote

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
        "Use this directory for explicit human-approved product, protocol, and verification contracts; read only the Spec governing the active capability or boundary.",
    ),
    (
        "architecture",
        "Architecture",
        "Durable component boundaries, Harness adapters, and integration contracts; read when work touches cross-module ownership or interfaces.",
    ),
    (
        "knowhow",
        "Diagnostic & Engineering Knowhow",
        "Reusable root-cause patterns, CLI/TTY contracts, verification recipes, and operational pitfalls; read when debugging or verifying similar surfaces.",
    ),
    (
        "philosophy",
        "Working Philosophy",
        "Core methodology principles on semantic knowledge, mechanical boundaries, and evidence-led delivery; read when shaping workflow or governance rules.",
    ),
    (
        "decisions",
        "Decision Records",
        "Any Decision Records capturing the durable why behind architecture and design choices (<context>--<question>--<date>); read before changing an established convention.",
    ),
    (
        "archive",
        "Archive",
        "Historical Concepts that no longer describe current truth, kept under dated reason folders for provenance.",
    ),
)

BRIEF_FILENAME = "brief.md"
BRIEF_CHAR_LIMIT = 2_000
BRIEF_BYTE_LIMIT = 1_000_000
TASK_MAP_WARN_CHARS = 9_000

# Statuses that keep a Concept out of the active map; it is listed under "Inactive".
INACTIVE_STATUSES = frozenset({"deprecated", "superseded", "rejected", "archived"})
# Active statuses that are worth a visible badge.
ACTIVE_BADGE_STATUSES = frozenset({"draft", "proposed", "conflict"})
# Active statuses that render no badge and raise no warning; "" means status was omitted.
SILENT_ACTIVE_STATUSES = frozenset({"", "stable", "accepted"})
KNOWN_STATUSES = frozenset({"stable", "accepted"}) | ACTIVE_BADGE_STATUSES | INACTIVE_STATUSES

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
_SUPERSEDED_SUFFIX_RE = re.compile(r"\s*\(→ [^)]*\)\s*$")

UNCLOSED_FRONTMATTER = "unclosed frontmatter fence"
UNSUPPORTED_YAML = "unsupported complex YAML syntax"

_TOP_KEY_RE = re.compile(r"^(?P<key>[A-Za-z0-9_][A-Za-z0-9_.-]*)[ \t]*:(?:[ \t]+(?P<val>.*))?$")
_MAPPING_LINE_RE = re.compile(r"^[^\s#:'\"\[\]{}-][^:]*:(?:\s|$)")
_BLOCK_HEADER_RE = re.compile(r"^(?P<style>[|>])(?P<a>[+-]?)(?P<indent>[1-9]?)(?P<b>[+-]?)\s*(?:#.*)?$")
_SCALAR_FIELDS = ("type", "title", "description", "status", "superseded_by", "okf_version")


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


def _indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" \t"))


def _is_comment_or_blank(line: str) -> bool:
    stripped = line.strip()
    return not stripped or stripped.startswith("#")


def _looks_like_mapping(text: str) -> bool:
    return bool(_MAPPING_LINE_RE.match(text))


def _parse_inline_scalar(text: str) -> tuple[str | None, bool]:
    """Parse one YAML flow scalar. Returns (value, supported)."""
    value = text.strip()
    if not value:
        return "", True
    first = value[0]
    if first == '"':
        index = 1
        while index < len(value):
            if value[index] == "\\":
                index += 2
                continue
            if value[index] == '"':
                break
            index += 1
        if index >= len(value):
            return None, False
        rest = value[index + 1 :].strip()
        if rest and not rest.startswith("#"):
            return None, False
        quoted = value[: index + 1]
        try:
            parsed = json.loads(quoted)
        except ValueError:
            return quoted[1:-1], True
        return (parsed, True) if isinstance(parsed, str) else (quoted[1:-1], True)
    if first == "'":
        index = 1
        while index < len(value):
            if value[index] == "'":
                if index + 1 < len(value) and value[index + 1] == "'":
                    index += 2
                    continue
                break
            index += 1
        if index >= len(value):
            return None, False
        rest = value[index + 1 :].strip()
        if rest and not rest.startswith("#"):
            return None, False
        return value[1:index].replace("''", "'"), True
    if first in "&*{[":
        return None, False
    # Plain scalar: a '#' that starts the value or follows whitespace opens a comment.
    return re.sub(r"(?:^|\s)#.*$", "", value).strip(), True


def _split_flow_items(inner: str) -> list[str] | None:
    items: list[str] = []
    current: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(inner):
        character = inner[index]
        if quote:
            current.append(character)
            if quote == '"' and character == "\\" and index + 1 < len(inner):
                current.append(inner[index + 1])
                index += 2
                continue
            if character == quote:
                quote = None
        elif character in ('"', "'"):
            quote = character
            current.append(character)
        elif character == ",":
            items.append("".join(current))
            current = []
        elif character in "[]{}":
            return None
        else:
            current.append(character)
        index += 1
    if quote:
        return None
    items.append("".join(current))
    return items


def _parse_flow_sequence(text: str) -> tuple[list[str] | None, bool]:
    value = text.strip()
    quote: str | None = None
    close = -1
    for index, character in enumerate(value[1:], start=1):
        if quote:
            if character == quote:
                quote = None
            continue
        if character in ('"', "'"):
            quote = character
        elif character == "]":
            close = index
            break
    if close < 0:
        return None, False
    rest = value[close + 1 :].strip()
    if rest and not rest.startswith("#"):
        return None, False
    pieces = _split_flow_items(value[1:close])
    if pieces is None:
        return None, False
    items: list[str] = []
    for piece in pieces:
        item, ok = _parse_inline_scalar(piece)
        if not ok:
            return None, False
        if item:
            items.append(item)
    return items, True


def _fold_lines(lines: list[str]) -> str:
    """Fold stripped lines: adjacent text joins with a space, each blank line keeps a newline."""
    result = ""
    blanks = 0
    started = False
    for line in lines:
        if not line:
            if started:
                blanks += 1
            continue
        if started:
            result += "\n" * blanks if blanks else " "
        result += line
        blanks = 0
        started = True
    return result


def _block_scalar(match: re.Match[str], block: list[str]) -> str:
    style = match.group("style")
    chomp = match.group("a") or match.group("b")
    nonblank = [line for line in block if line.strip()]
    if not nonblank:
        return ""
    explicit = match.group("indent")
    indent = int(explicit) if explicit else min(_indent_of(line) for line in nonblank)
    body = [line[indent:] if line.strip() else "" for line in block]
    trailing = 0
    while body and body[-1] == "":
        body.pop()
        trailing += 1
    if style == "|":
        text = "\n".join(body)
    else:
        text = ""
        blanks = 0
        previous = ""
        for position, line in enumerate(body):
            if position == 0:
                text = line
                previous = line
                continue
            if line == "":
                blanks += 1
                continue
            if blanks:
                text += "\n" * blanks
            elif line.startswith((" ", "\t")) or previous.startswith((" ", "\t")):
                text += "\n"
            else:
                text += " "
            text += line
            previous = line
            blanks = 0
    if chomp == "-":
        return text
    if chomp == "+":
        return text + "\n" + "\n" * trailing
    return text + "\n"


def _parse_block_list(block: list[str]) -> tuple[list[str] | None, bool]:
    items: list[list[str]] = []
    item_indent: int | None = None
    for line in block:
        if _is_comment_or_blank(line):
            continue
        indent = _indent_of(line)
        stripped = line.strip()
        is_item = stripped == "-" or stripped.startswith("- ")
        if is_item and (item_indent is None or indent == item_indent):
            item_indent = indent
            text = stripped[1:].strip()
            if text and (_looks_like_mapping(text) or text[0] in "[{|>-&*"):
                return None, False
            items.append([text] if text else [])
        elif item_indent is not None and indent > item_indent and items:
            if _looks_like_mapping(stripped):
                return None, False
            items[-1].append(stripped)
        else:
            return None, False
    values: list[str] = []
    for parts in items:
        value, ok = _parse_inline_scalar(" ".join(parts))
        if not ok:
            return None, False
        if value:
            values.append(value)
    return values, True


def _parse_value(raw_val: str, block: list[str]) -> tuple[Any, bool]:
    header = raw_val.strip()
    block_match = _BLOCK_HEADER_RE.match(header)
    if block_match:
        return _block_scalar(block_match, block), True
    content = [line for line in block if not _is_comment_or_blank(line)]
    if not header:
        if not content:
            return "", True
        first = content[0].strip()
        if first == "-" or first.startswith("- "):
            return _parse_block_list(block)
        if _looks_like_mapping(first):
            return None, False
        folded = _fold_lines([line.strip() for line in block if not line.strip().startswith("#")])
        return _parse_inline_scalar(folded)
    if header.startswith("["):
        joined = " ".join([header] + [line.strip() for line in content])
        return _parse_flow_sequence(joined)
    if any(_looks_like_mapping(line.strip()) or line.strip().startswith("- ") for line in content):
        return None, False
    if header[0] in ('"', "'"):
        joined = _fold_lines([header] + [line.strip() for line in block])
        return _parse_inline_scalar(joined)
    first_value, ok = _parse_inline_scalar(header)
    if not ok or not content:
        return first_value, ok
    pieces = [first_value or ""]
    for line in block:
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        piece, piece_ok = _parse_inline_scalar(stripped) if stripped else ("", True)
        if not piece_ok:
            return None, False
        pieces.append(piece or "")
    return _fold_lines(pieces), True


def _frontmatter_lines(lines: list[str]) -> tuple[list[str], int, str | None]:
    """Return (frontmatter lines, body start index, error)."""
    if not lines or lines[0].lstrip("﻿").rstrip() != "---":
        return [], 0, None
    for index in range(1, len(lines)):
        if lines[index].rstrip() == "---":
            return lines[1:index], index + 1, None
    return [], 1, UNCLOSED_FRONTMATTER


def _parse_top_level(fm_lines: list[str]) -> tuple[dict[str, Any], str | None]:
    meta: dict[str, Any] = {}
    error: str | None = None
    index = 0
    count = len(fm_lines)
    while index < count:
        line = fm_lines[index]
        if _is_comment_or_blank(line):
            index += 1
            continue
        if _indent_of(line) > 0 or line.startswith("-"):
            # Indented text or a sequence item with no owning key.
            error = error or UNSUPPORTED_YAML
            index += 1
            continue
        match = _TOP_KEY_RE.match(line.rstrip())
        if not match:
            error = error or UNSUPPORTED_YAML
            index += 1
            continue
        key = match.group("key")
        raw_val = match.group("val") or ""
        allow_flush_items = not raw_val.strip() or raw_val.strip().startswith("#")
        block: list[str] = []
        cursor = index + 1
        while cursor < count:
            candidate = fm_lines[cursor]
            if not candidate.strip() or _indent_of(candidate) > 0:
                block.append(candidate)
            elif allow_flush_items and (candidate.rstrip() == "-" or candidate.startswith("- ")):
                block.append(candidate)
            else:
                break
            cursor += 1
        if raw_val.strip().startswith("#"):
            raw_val = ""
        value, ok = _parse_value(raw_val, block)
        if ok:
            meta[key] = value
        else:
            error = error or UNSUPPORTED_YAML
        index = cursor
    return meta, error


def _first_heading(lines: list[str]) -> str:
    fence: tuple[str, int] | None = None
    for line in lines:
        fence_match = _FENCE_RE.match(line)
        if fence is not None:
            if _closes_fence(fence_match, fence):
                fence = None
            continue
        if fence_match:
            fence = (fence_match.group(1)[0], len(fence_match.group(1)))
            continue
        stripped = line.strip()
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
            if heading:
                return heading
    return ""


def parse_frontmatter(text: str) -> dict[str, Any]:
    """Read top-level YAML frontmatter plus the first Markdown heading.

    Supports single-line, block (| and >), continued, and list values. Nested mappings,
    anchors/aliases, and unterminated quotes or brackets set ``frontmatter_error`` while the
    remaining top-level keys are still read. Missing ``status`` stays ``""``.
    """
    lines = text.replace("\r\n", "\n").split("\n")
    fm_lines, body_start, error = _frontmatter_lines(lines)
    meta, parse_error = _parse_top_level(fm_lines)
    error = error or parse_error

    def scalar(key: str) -> str:
        value = meta.get(key)
        if isinstance(value, str):
            return value.strip()
        return ""

    if any(isinstance(meta.get(key), list) for key in _SCALAR_FIELDS):
        error = error or UNSUPPORTED_YAML

    frontmatter_title = scalar("title")
    raw_tags = meta.get("tags")
    if isinstance(raw_tags, list):
        tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
    elif isinstance(raw_tags, str):
        tags = [part.strip() for part in raw_tags.split(",") if part.strip()]
    else:
        tags = []
    okf_version = meta.get("okf_version")
    return {
        "type": scalar("type"),
        "title": frontmatter_title or _first_heading(lines[body_start:]),
        "frontmatter_title": frontmatter_title,
        "description": scalar("description"),
        "raw_status": scalar("status").lower(),
        "superseded_by": scalar("superseded_by"),
        "tags": tags,
        "okf_version": okf_version.strip() if isinstance(okf_version, str) else None,
        "frontmatter_error": error,
    }


_FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")
_INLINE_CODE_RE = re.compile(r"(`+)(.+?)\1")
_LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
_URI_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]+:")
_LINK_TITLE_RE = re.compile(r"^(?P<target>.*?)\s+(?:\"[^\"]*\"|'[^']*')$")


def _closes_fence(match: re.Match[str] | None, fence: tuple[str, int]) -> bool:
    if match is None:
        return False
    marker = match.group(1)
    return marker[0] == fence[0] and len(marker) >= fence[1] and not match.group(2).strip()


def _clean_link_target(inner: str) -> str:
    target = inner.strip()
    if target.startswith("<"):
        end = target.find(">")
        if end > 0:
            target = target[1:end].strip()
    else:
        titled = _LINK_TITLE_RE.match(target)
        if titled:
            target = titled.group("target").strip()
    if not target or target.startswith("#") or _URI_SCHEME_RE.match(target):
        return ""
    return target


def extract_relative_markdown_links(text: str) -> list[tuple[int, str]]:
    """Return (1-based line, target) for ordinary links outside code fences and inline code.

    Images, pure anchors, and targets with a URI scheme of two or more letters are skipped;
    root-relative and drive-letter targets are kept so path confinement can judge them.
    """
    lines = text.replace("\r\n", "\n").split("\n")
    _, start, error = _frontmatter_lines(lines)
    if error:
        start = 0
    links: list[tuple[int, str]] = []
    fence: tuple[str, int] | None = None
    for index in range(start, len(lines)):
        line = lines[index]
        head = line.lstrip()
        fence_match = _FENCE_RE.match(line) if head[:1] in ("`", "~") else None
        if fence is not None:
            if _closes_fence(fence_match, fence):
                fence = None
            continue
        if fence_match:
            fence = (fence_match.group(1)[0], len(fence_match.group(1)))
            continue
        if "](" not in line:
            continue
        masked = _INLINE_CODE_RE.sub(lambda found: "x" * len(found.group(0)), line)
        for link in _LINK_RE.finditer(masked):
            target = _clean_link_target(line[link.start(1) : link.end(1)])
            if target:
                links.append((index + 1, target))
    return links


def _parse_existing_index_entries(index_path: Path) -> dict[str, dict[str, Any]]:
    """Read a Task map's old entries as a fallback. Badges and supersession suffixes are
    rendering output, so they are dropped instead of being mistaken for authored tags."""
    if not index_path.is_file() or index_path.is_symlink():
        return {}
    try:
        text = index_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return {}
    badge_tokens = ACTIVE_BADGE_STATUSES | INACTIVE_STATUSES
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
        desc = _SUPERSEDED_SUFFIX_RE.sub("", (match.group("desc") or "").strip())
        tags = _parse_tags_value(f"[{tags_raw}]") if tags_raw else []
        tags = [
            tag
            for tag in tags
            if not tag.startswith(("type:", "status:")) and tag not in badge_tokens
        ]
        entries[link] = {
            "label": label,
            "description": desc,
            "tags": tags,
        }
    return entries


def _single_line(text: str) -> str:
    return re.sub(r"\s*\n\s*", " ", text).strip()


def _format_entry(
    title: str,
    rel_link: str,
    *,
    description: str = "",
    tags: list[str] | None = None,
    concept_type: str = "",
    status_badge: str = "",
    superseded_by: str = "",
) -> str:
    badge_parts: list[str] = []
    if concept_type and concept_type not in STANDARD_CONCEPT_TYPES:
        badge_parts.append(f"type:{concept_type}")
    if status_badge:
        badge_parts.append(status_badge)
    if tags:
        for tag in tags:
            if tag not in badge_parts:
                badge_parts.append(tag)
    tag_segment = f" `[{', '.join(badge_parts)}]`" if badge_parts else ""
    summary = _single_line(description).rstrip(".")
    desc_segment = f" — {summary}" if summary else ""
    successor = f" (→ {_single_line(superseded_by)})" if superseded_by else ""
    return f"- [{_single_line(title)}]({rel_link}){tag_segment}{desc_segment}{successor}"


def _status_placement(raw_status: str, *, archive: bool = False) -> tuple[str, bool, bool]:
    """Return (badge, inactive, unknown) for a Concept's raw status."""
    if raw_status in SILENT_ACTIVE_STATUSES:
        return ("archived" if archive else ""), archive, False
    if raw_status in ACTIVE_BADGE_STATUSES:
        return raw_status, archive, False
    if raw_status in INACTIVE_STATUSES:
        return raw_status, True, False
    return f"status:{raw_status}", archive, True


def _render_entry(item: dict[str, Any]) -> str:
    return _format_entry(
        item["title"],
        item["rel_link"],
        description=item["description"],
        tags=item["tags"],
        concept_type=item["type"],
        status_badge=item["status_badge"],
        superseded_by=item["superseded_by"] if item["raw_status"] == "superseded" else "",
    )


def _read_markdown(file_path: Path) -> str:
    try:
        return file_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise WorkflowError(f"Cannot read Markdown Concept {file_path}: {exc}") from exc


def _read_concept_entry(
    file_path: Path,
    rel_link: str,
    fallback_entries: dict[str, dict[str, Any]],
    *,
    archive: bool = False,
) -> dict[str, Any]:
    meta = parse_frontmatter(_read_markdown(file_path))
    fallback = fallback_entries.get(rel_link, {})
    title = meta["title"] or fallback.get("label") or file_path.stem
    description = meta["description"] or fallback.get("description") or ""
    tags = meta["tags"] or fallback.get("tags") or []
    badge, inactive, _ = _status_placement(meta["raw_status"], archive=archive)
    return {
        "title": title,
        "rel_link": rel_link,
        "type": meta["type"],
        "description": description,
        "tags": tags,
        "raw_status": meta["raw_status"],
        "status_badge": badge,
        "inactive": inactive,
        "superseded_by": meta["superseded_by"],
    }


def _wiki_root(repo: Path) -> Path:
    return flow_dir(repo) / "wiki"


def _wiki_domain_dirs(wiki_root: Path) -> list[Path]:
    if not wiki_root.is_dir():
        return []
    known = {name for name, _, _ in WIKI_DOMAINS}
    domain_dirs: list[Path] = []
    for name, _, _ in WIKI_DOMAINS:
        candidate = wiki_root / name
        if candidate.is_dir() and not candidate.is_symlink():
            domain_dirs.append(candidate)
    for child in sorted(wiki_root.iterdir()):
        if (
            child.is_dir()
            and not child.is_symlink()
            and not child.name.startswith(".")
            and child.name not in known
        ):
            domain_dirs.append(child)
    return domain_dirs


def _domain_defaults(domain_name: str) -> tuple[str, str, bool]:
    for name, title, summary in WIKI_DOMAINS:
        if name == domain_name:
            return title, summary, True
    return (
        domain_name.replace("-", " ").title(),
        f"Domain knowledge and reusable Concepts under `{domain_name}/`.",
        False,
    )


def _domain_markdown(domain_dir: Path) -> tuple[list[Path], list[Path]]:
    """Return (regular Concept files, symlinked Concept files) excluding index.md and log.md."""
    regular: list[Path] = []
    linked: list[Path] = []
    for path in sorted(domain_dir.rglob("*.md")):
        if path.name in ("index.md", "log.md"):
            continue
        if path.is_symlink():
            linked.append(path)
        elif path.is_file():
            regular.append(path)
    return regular, linked


def _read_brief(repo: Path) -> tuple[str | None, str | None]:
    """Return (CRLF-normalized brief text, problem). Both are None when brief.md is absent."""
    current = repo
    for part in (".omp-flow", "wiki", BRIEF_FILENAME):
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            return None, None
        except OSError as exc:
            return None, exc.strerror or str(exc)
        if stat.S_ISLNK(info.st_mode):
            return None, "symbolic link"
        if part != BRIEF_FILENAME and not stat.S_ISDIR(info.st_mode):
            return None, "not a directory"
    if not stat.S_ISREG(info.st_mode):
        return None, "not a regular file"
    if info.st_size > BRIEF_BYTE_LIMIT:
        return None, f"larger than {BRIEF_BYTE_LIMIT} bytes"
    try:
        raw = current.read_bytes()
    except OSError as exc:
        return None, exc.strerror or str(exc)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None, "invalid UTF-8"
    return text.replace("\r\n", "\n"), None


def _resolve_link(base: str, candidate: str, dir_cache: dict[str, str]) -> str:
    """realpath() of base/candidate, caching each directory's real path."""
    joined = os.path.join(base, candidate)
    directory, name = os.path.split(joined)
    if name in ("", ".", ".."):
        return os.path.realpath(joined)
    real_directory = dir_cache.get(directory)
    if real_directory is None:
        real_directory = os.path.realpath(directory)
        dir_cache[directory] = real_directory
    resolved = os.path.join(real_directory, name)
    if os.path.islink(resolved):
        resolved = os.path.realpath(resolved)
    return resolved


def _link_resolves(repo_text: str, base: str, link_path: str, dir_cache: dict[str, str]) -> bool:
    candidates = [link_path]
    decoded = unquote(link_path)
    if decoded != link_path:
        candidates.append(decoded)
    prefix = repo_text.rstrip(os.sep) + os.sep
    for candidate in candidates:
        try:
            resolved = _resolve_link(base, candidate, dir_cache)
        except (OSError, ValueError):
            continue
        if resolved != repo_text and not resolved.startswith(prefix):
            continue
        if os.path.exists(resolved):
            return True
    return False


def _dangling_links(
    repo: Path, source: Path, text: str, dir_cache: dict[str, str] | None = None
) -> list[str]:
    links = extract_relative_markdown_links(text)
    if not links:
        return []
    cache = {} if dir_cache is None else dir_cache
    repo_text = str(repo)
    rel_source = source.relative_to(repo).as_posix()
    base = str(source.parent)
    warnings: list[str] = []
    for line_no, raw_target in links:
        link_path = raw_target.split("#", 1)[0]
        if not link_path:
            continue
        if not _link_resolves(repo_text, base, link_path, cache):
            warnings.append(f"{rel_source}:{line_no}: dangling relative link '{raw_target}'")
    return warnings


def _comparable(text: str) -> str:
    return re.sub(r"[.。]+$", "", " ".join(text.split())).casefold()


def inspect_wiki_diagnostics(repo: Path) -> list[str]:
    """Read-only mechanical scan of .omp-flow/wiki/. Never writes; returns ordered warnings."""
    repo = repo.resolve(strict=True)
    wiki_root = _wiki_root(repo)
    brief_warnings: list[str] = []
    link_warnings: list[str] = []
    status_warnings: list[str] = []
    stray_warnings: list[str] = []
    summary_warnings: list[str] = []
    if not wiki_root.is_dir():
        return []
    dir_cache: dict[str, str] = {}

    brief_rel = f".omp-flow/wiki/{BRIEF_FILENAME}"
    brief_text, brief_problem = _read_brief(repo)
    if brief_problem:
        brief_warnings.append(f"{brief_rel} is unavailable ({brief_problem})")
    elif brief_text is not None:
        if len(brief_text) > BRIEF_CHAR_LIMIT:
            brief_warnings.append(
                f"{brief_rel} is {len(brief_text)} chars (budget: {BRIEF_CHAR_LIMIT})"
            )
        link_warnings.extend(
            _dangling_links(repo, wiki_root / BRIEF_FILENAME, brief_text, dir_cache)
        )

    for domain_dir in _wiki_domain_dirs(wiki_root):
        domain_name = domain_dir.name
        archive = domain_name == "archive"
        regular, linked = _domain_markdown(domain_dir)
        if not archive:
            for path in linked:
                link_warnings.append(
                    f"{path.relative_to(repo).as_posix()} is a symbolic link; skipped by Wiki diagnostics"
                )
        for path in regular:
            rel = path.relative_to(repo).as_posix()
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError) as exc:
                link_warnings.append(f"{rel} is unreadable ({exc})")
                continue
            meta = parse_frontmatter(text)
            raw_status = meta["raw_status"]
            if raw_status and raw_status not in KNOWN_STATUSES:
                status_warnings.append(f"Unknown frontmatter status '{raw_status}' in {rel}")
            if archive:
                continue
            link_warnings.extend(_dangling_links(repo, path, text, dir_cache))
            title = meta["title"] or path.stem
            if not meta["description"]:
                summary_warnings.append(f"Missing frontmatter 'description' in {rel}")
            elif _comparable(meta["description"]) == _comparable(title):
                summary_warnings.append(f"Frontmatter 'description' repeats title in {rel}")

        _, _, builtin = _domain_defaults(domain_name)
        index_path = domain_dir / "index.md"
        index_rel = index_path.relative_to(repo).as_posix()
        index_meta: dict[str, Any] | None = None
        if index_path.is_file() and not index_path.is_symlink():
            try:
                index_meta = parse_frontmatter(index_path.read_text(encoding="utf-8"))
            except (OSError, UnicodeError) as exc:
                summary_warnings.append(f"Cannot safely rewrite {index_rel}: {exc}")
        if index_meta is not None and index_meta["frontmatter_error"]:
            summary_warnings.append(
                f"Cannot safely rewrite {index_rel}: {index_meta['frontmatter_error']}"
            )
        elif not builtin and not (index_meta or {}).get("description"):
            summary_warnings.append(
                f"Custom Wiki domain '{domain_name}' is missing frontmatter 'description' in {index_rel}"
            )

    for path in sorted(wiki_root.glob("*.md")):
        if path.name in ("index.md", BRIEF_FILENAME, "log.md"):
            continue
        if path.is_dir() and not path.is_symlink():
            continue
        stray_warnings.append(
            f"Stray Wiki root file '{path.relative_to(repo).as_posix()}' is outside domain "
            "directories and omitted from wiki/index.md"
        )

    return brief_warnings + link_warnings + status_warnings + stray_warnings + summary_warnings


def _frontmatter_header(title: str, description: str) -> list[str]:
    lines = ["---", 'okf_version: "0.2"']
    if title:
        lines.append(f"title: {json.dumps(title, ensure_ascii=False)}")
    if description:
        lines.append(f"description: {json.dumps(description, ensure_ascii=False)}")
    lines.append("---")
    return lines


def inspect_and_refresh_wiki_indexes(repo: Path) -> tuple[list[str], list[str]]:
    """Rebuild every <domain>/index.md and the Domains-only root map from Concept frontmatter."""
    repo = repo.resolve(strict=True)
    wiki_root = _wiki_root(repo)
    wiki_root.mkdir(parents=True, exist_ok=True)
    warnings = inspect_wiki_diagnostics(repo)

    planned: list[tuple[Path, str]] = []
    domain_rows: list[str] = []
    for domain_dir in _wiki_domain_dirs(wiki_root):
        domain_name = domain_dir.name
        archive = domain_name == "archive"
        default_title, default_summary, _ = _domain_defaults(domain_name)
        index_path = domain_dir / "index.md"
        rel_index = index_path.relative_to(repo).as_posix()
        authored_title = ""
        authored_description = ""
        if index_path.is_file() and not index_path.is_symlink():
            index_meta = parse_frontmatter(_read_markdown(index_path))
            if index_meta["frontmatter_error"]:
                raise WorkflowError(
                    f"Cannot safely rewrite {rel_index}: {index_meta['frontmatter_error']}"
                )
            authored_title = index_meta["frontmatter_title"]
            authored_description = index_meta["description"]
        domain_title = authored_title or default_title
        domain_summary = authored_description or default_summary

        active_entries: list[dict[str, Any]] = []
        inactive_entries: list[dict[str, Any]] = []
        regular, _ = _domain_markdown(domain_dir)
        for md_file in regular:
            rel_in_domain = md_file.relative_to(domain_dir).as_posix()
            entry = _read_concept_entry(md_file, rel_in_domain, {}, archive=archive)
            (inactive_entries if entry["inactive"] else active_entries).append(entry)

        lines = _frontmatter_header(authored_title, authored_description)
        lines.extend(["", f"# {_single_line(domain_title)}", "", domain_summary, ""])
        if active_entries:
            lines.extend(_render_entry(item) for item in active_entries)
            lines.append("")
        else:
            lines.extend(["No active Concepts promoted in this domain yet.", ""])
        if inactive_entries:
            lines.extend(["## Inactive", ""])
            lines.extend(_render_entry(item) for item in inactive_entries)
            lines.append("")
        planned.append((index_path, "\n".join(lines).rstrip() + "\n"))
        domain_rows.append(
            f"- [{_single_line(domain_title)}]({domain_name}/index.md) "
            f"`[{len(active_entries)}]` — {_single_line(domain_summary)}"
        )

    root_lines = [
        "---",
        'okf_version: "0.2"',
        "---",
        "",
        "# Project Wiki",
        "",
        "This is the project-owned entry point for durable knowledge. Follow only the topic relevant to the current work; these links aid discovery and do not claim to enumerate everything the project knows.",
        "",
    ]
    brief_text, brief_problem = _read_brief(repo)
    if brief_text is not None and brief_problem is None:
        brief_meta = parse_frontmatter(brief_text)
        brief_title = _single_line(brief_meta["frontmatter_title"]) or "Wiki Brief"
        brief_description = (
            _single_line(brief_meta["description"])
            or "Cross-task counter-default rules and supersessions"
        )
        root_lines.extend([f"- [{brief_title}]({BRIEF_FILENAME}) — {brief_description}", ""])
    root_lines.extend(["## Domains", ""])
    root_lines.extend(domain_rows)
    planned.append((wiki_root / "index.md", "\n".join(root_lines).rstrip() + "\n"))

    updated: list[str] = []
    for path, content in planned:
        atomic_write_text(path, content)
        updated.append(path.relative_to(repo).as_posix())
    return updated, warnings


def refresh_wiki_indexes(repo: Path) -> list[str]:
    return inspect_and_refresh_wiki_indexes(repo)[0]


def refresh_task_bundle_index(repo: Path, task_id: str) -> str:
    repo = repo.resolve(strict=True)
    bundle = task_dir(repo, task_id)
    index_path = bundle / "index.md"
    fallbacks = _parse_existing_index_entries(index_path)

    task_md = bundle / "task.md"
    bundle_title = task_id
    if task_md.is_file() and not task_md.is_symlink():
        task_meta = parse_frontmatter(_read_markdown(task_md))
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
        if entry["inactive"]:
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
        lines.append(_render_entry(item))

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
            lines.append(_render_entry(item))

    if inactive_entries:
        lines.append("")
        lines.append("## Inactive")
        lines.append("")
        for item in inactive_entries:
            lines.append(_render_entry(item))

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
            parse_frontmatter(_read_markdown(task_md))
            if task_md.is_file() and not task_md.is_symlink()
            else {"title": bundle.name, "description": "", "tags": [], "raw_status": "", "type": "Task"}
        )
        fb = fallbacks.get(rel_link, {})
        title = meta["title"] or bundle.name
        desc = meta["description"] or fb.get("description") or title
        tags = meta["tags"] or fb.get("tags") or []
        badge, _, _ = _status_placement(meta["raw_status"])
        lines.append(
            _format_entry(
                bundle.name,
                rel_link,
                description=desc,
                tags=tags,
                status_badge=badge,
            )
        )

    lines.append("")
    atomic_write_text(index_path, "\n".join(lines))
    return index_path.relative_to(repo).as_posix()


def _task_map_warnings(repo: Path) -> list[str]:
    index_path = tasks_dir(repo) / "index.md"
    try:
        text = index_path.read_text(encoding="utf-8").replace("\r\n", "\n")
    except (OSError, UnicodeError):
        return []
    if len(text) <= TASK_MAP_WARN_CHARS:
        return []
    return [
        f".omp-flow/tasks/index.md is {len(text)} chars (threshold: {TASK_MAP_WARN_CHARS}); "
        "archive completed tasks to keep startup orientation compact"
    ]


def _active_bundle_ids(repo: Path) -> list[str]:
    root = tasks_dir(repo)
    if not root.is_dir():
        return []
    return [
        child.name
        for child in sorted(root.iterdir())
        if child.is_dir()
        and not child.is_symlink()
        and child.name != "archive"
        and not child.name.startswith(".")
        and (child / "index.md").is_file()
    ]


def refresh_indexes(repo: Path, target: str = "all") -> dict[str, Any]:
    repo = repo.resolve(strict=True)
    updated: list[str] = []
    warnings: list[str] = []
    normalized = target.strip() or "all"
    if normalized in ("all", "wiki"):
        wiki_updated, wiki_warnings = inspect_and_refresh_wiki_indexes(repo)
        updated.extend(wiki_updated)
        warnings.extend(wiki_warnings)
    if normalized in ("all", "tasks"):
        for task_id in _active_bundle_ids(repo):
            updated.append(refresh_task_bundle_index(repo, task_id))
    elif normalized != "wiki":
        updated.append(refresh_task_bundle_index(repo, normalized))
    if normalized != "wiki":
        updated.append(refresh_tasks_index(repo))
        warnings.extend(_task_map_warnings(repo))
    return {"target": normalized, "updated": updated, "warnings": warnings}
