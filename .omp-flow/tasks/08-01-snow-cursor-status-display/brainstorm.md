---
type: "Brainstorm"
title: "Brainstorm: Snow and Cursor native status display"
---

# Brainstorm: Snow and Cursor native status display

The follow-up request is to complete the visible status experience for Snow and Cursor. The
preceding adapter work connected both hosts to the existing Flow Status v2 publication/cache and
read-only inspection contract, but it deliberately stopped short of a native persistent display:
README currently says Snow installs no native status bar, while Cursor describes only the exact
session evidence required to read a snapshot.

The observable problem is therefore presentation, not missing workflow state. A user working in
Snow or Cursor should be able to see the selected root Task and current Flow orientation through
the strongest native project-local surface each released Harness actually supports. The
principal contradiction is that the shared snapshot is ready, but inventing a footer protocol or
claiming an unsupported native surface would make the adapter larger and less truthful.

The provisional direction is to reuse the existing validated v2 snapshot and its compact/detail
rendering. Prefer a native status/footer contribution when the Harness exposes one; otherwise use
the closest discoverable project-local command or session presentation surface and label it
accurately rather than simulating persistence. Do not add a second cache, renderer, lifecycle
database, global Hook, IDE extension, transcript parser, or project-global session fallback.

A strong counter-hypothesis is that one or both Harnesses expose no safe project-local persistent
display extension at all. If current source/documentation confirms that, “补齐” means installing
an obvious native on-demand view and documenting the absence of persistence, not manufacturing a
status bar. Released source/docs, payload capture, or a working native API that can render the
snapshot would overturn that degraded boundary.

Research must establish the latest Snow display/configuration seams and current Cursor
status/command/Hook surfaces, including project ownership, session identity, refresh behavior,
and whether output is persistent, notification-like, or on demand. Success is a small exact-owned
adapter whose visible capability matches that evidence and whose absence/failure remains quiet
and truthful.
