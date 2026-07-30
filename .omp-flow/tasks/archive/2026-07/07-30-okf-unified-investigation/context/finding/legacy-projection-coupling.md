---
type: Confirmed Finding
title: Legacy task stores are synchronized projections, not independent requirements
description: Current lifecycle, work, context, Reference, and review events are copied across multiple active formats and consumers.
---

# Finding

Task creation seeds `task.json`, CSV ledgers, JSONL manifests, `context/index.json`, planning
Markdown, and paired Reference storage together
(`.omp-flow/scripts/common/task_store.py:70-104`).

Executor/reviewer context joins task state, topology rows, a row brief, a JSONL manifest, context
index entries, and rendered Reference selectors
(`.omp-flow/scripts/common/context.py:128-151`).

Review submission writes verdict JSON, Evidence CSV, topology status, and task phase
(`.omp-flow/scripts/common/evidence.py:35-76`).

Reference digestion writes content and metadata separately and later reconstructs selection
through a custom grammar (`.omp-flow/scripts/common/reference.py:41-108`).

# Design significance

These formats have broad consumers, so their deletion requires a direct consumer cutover. Their
current existence does not justify translating the same projections into Markdown or retaining a
compatibility layer.
