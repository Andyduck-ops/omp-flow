---
type: Working Philosophy
title: Evidence-led exploration
description: Investigate before designing, preserve connected context, and apply rigor in proportion to the decision.
---

# Investigation precedes design

Start by learning what the repository actually does. Read the relevant code, tests, documentation,
configuration, history, and observed behavior before fixing requirements or selecting an
architecture. Treat early explanations as hypotheses until project evidence supports them.

# Accumulate evidence before synthesis

Collect findings while their sources and relationships are still visible, then synthesize them
into a decision. Do not make the first plausible observation the design. Distinguish confirmed
facts, interpretations, unknowns, and user preferences so later work can tell what is established
and what remains a choice.

# Preserve connected context

Keep related evidence together when it informs the same decision. Artificially splitting one
investigation into repeated isolated passes can sever causal context and spend tokens rebuilding
what was already known. Use progressive disclosure to load the smallest coherent body of context,
not the smallest possible fragment.

# Keep rigor proportional

Verification should match the consequence and uncertainty of the claim. Stable executable
behavior deserves executable checks; authored reasoning and one-time transitions often need
focused review. Add structure only when it improves a real decision or protects a recurring
failure, not to simulate certainty.
