---
type: "Reference"
title: "Cursor primary references"
---

# Cursor primary references

Inspected 2026-08-01. Cursor is proprietary, so the adapter is pinned to current official product
documentation and dated changelog contracts rather than a source clone.

Primary sources:

- [Cursor CLI overview](https://cursor.com/docs/cli/overview) — `agent`/`cursor-agent`, interactive
  and print modes, and resumable sessions.
- [Using Cursor CLI](https://cursor.com/docs/cli/using) — project `.cursor/rules`, root
  `AGENTS.md`/`CLAUDE.md`, MCP, permissions, and resume behavior.
- [Cursor CLI parameters](https://cursor.com/docs/cli/reference/parameters) — current public CLI
  options and commands.
- [Cursor Rules](https://cursor.com/docs/rules) — project `.cursor/rules/*.mdc` and legacy
  `.cursorrules` deprecation.
- [Agent Skills](https://cursor.com/docs/skills) — project `.agents/skills` and
  `.cursor/skills` discovery using `SKILL.md`.
- [Subagents](https://cursor.com/docs/subagents) — project `.cursor/agents/*.md` definitions and
  native delegation.
- [Hooks](https://cursor.com/docs/hooks) — project `.cursor/hooks.json`, event payloads, command
  protocol, and completion/permission outcomes.
- [Cursor 2.4 changelog](https://cursor.com/changelog/2-4) (2026-01-22) — Skills, subagents,
  expanded Hooks, CLI support, and Claude Code Hook compatibility.
- [Cursor 2.5 changelog](https://cursor.com/changelog/2-5) (2026-02-17) — plugins packaging
  Skills, subagents, Hooks, rules, and MCP resources.

Local verification limitation: neither `agent` nor `cursor-agent` is installed on this machine's
`PATH`, so released-runtime smoke tests cannot be captured during Research. Design should rely on
official file contracts and add fixture/managed-resource tests here; a real Cursor smoke test can
remain a bounded release check.
