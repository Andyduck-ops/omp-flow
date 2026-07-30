---
type: Architecture Decision
title: Semantic knowledge belongs to documents; code owns only mechanics
description: Agents interpret task meaning from linked Markdown while runtime code coordinates only irreducible process and side-effect facts.
---

# Decision

The task Bundle is the source of truth for task meaning. Documents own framing, evidence,
relationships, requirements, work intent, reviews, gates, and decisions. Agents read that meaning
directly from normal Markdown and links.

Code owns only active-session identity, safe paths, native process/agent identity, locking, atomic
external side effects, and native dispatch receipts. Runtime state lives outside the portable
Bundle and MUST NOT duplicate semantic knowledge.

# Consequences

- No regular-expression or fixed-structure interpretation of authored Markdown.
- No Python-owned phase, topology, evidence meaning, selected design, or row status.
- No synchronized JSON/CSV/JSONL projection of facts already present in Concepts.
- A new machine field requires a demonstrated mechanical guarantee that documents and native
  runtime receipts cannot provide.

# Provenance

Selected synthesis `research/90-synthesis-001-semantic-task-bundle.md`; PRD sections “Semantic
navigation” and “Minimal mechanical runtime”; user-confirmed rejection of Markdown parsing.
