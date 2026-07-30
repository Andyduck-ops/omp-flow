---
type: Interface Contract
title: Bundle and Concept entry for agent assignments
description: Assign agents a task root, a relevant Concept, a bounded objective, and an output boundary instead of a rendered context package.
---

# Assignment contract

Every native assignment MUST provide the task Bundle root or root index, role, bounded objective,
most relevant entry Concept, allowed output path or code scope, and native dispatch receipt when
identity correlation matters.

The receiving agent MUST read the entry Concept and follow only useful links. The caller MUST NOT
pre-render the whole task into XML blocks, row JSON, Reference slices, or JSONL-selected files.

# Role entries

- Brainstorm and research enter through the root index plus the current framing or investigation
  Concept.
- Design enters through the selected synthesis and linked evidence.
- Implementation enters through one descriptive work Concept.
- Independent review enters through that work Concept, its handoff, and the changed code.

Outputs are linked Concepts or bounded code changes. Missing required entry content blocks the
assignment visibly; optional broken links remain tolerable.

# Mechanical correlation

The Harness-native dispatch receipt correlates a live agent with the assignment. It does not
determine persistent filenames, directory structure, semantic ordering, or review meaning.
