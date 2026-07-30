---
type: Diagnostic Knowhow
title: Detector pathologies
description: Symptoms, causes, and bounded repairs for misleading verification checks.
---

# The detector matches its own evidence

**Symptom:** documenting a forbidden marker makes the detector fail on the documentation itself.

**Repair:** assert the actual production scope, or describe the marker without reproducing the
exact contiguous token. Do not weaken the real detector merely to admit its evidence file.

# The guarded mutation is not observable

**Symptom:** a golden test passes after the line it is meant to protect is removed.

**Repair:** choose an output that only the correct path can produce, then confirm the intended
mutation changes that output. A fixture that forces the required state can mask the regression.

# A heuristic is presented as a parser

**Symptom:** a regular expression accepts a few authored examples and is then treated as general
YAML, Markdown, or protocol validation.

**Repair:** keep the check explicitly bounded to the seed shape, or use a real parser when general
conformance becomes a requirement. Do not expand a local extractor's claim through naming.

# Temporary state becomes a permanent invariant

**Symptom:** the test suite requires a migration inventory to stay at its pre-migration count, so
the successful migration breaks future tests.

**Repair:** record the before/after inventory once at the operational handoff. Keep permanent tests
for the reusable migration or disposal mechanism, not the consumed input.

# Navigation policy becomes graph closure

**Symptom:** optional indexes or soft links are forced into unique reachability, reverse-orphan,
or no-broken-link release gates.

**Repair:** test navigation only when the product contract requires it. For OKF, treat indexes and
links as progressive-disclosure hints and tolerate incomplete relationships.
