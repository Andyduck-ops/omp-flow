---
type: "Brainstorm"
title: "Brainstorm: Restore README methodology for the OKF architecture"
---

# Brainstorm: Restore README methodology for the OKF architecture

The README became a short runtime summary during the OKF cutover and lost too much of omp-flow's
methodology. The methodology itself was not retired: investigation still precedes design,
brainstorm and research still form an Explore spiral, QbD still requires human calibration,
implementation still requires independent review, and useful knowledge is still harvested after
integration.

The change is architectural rather than philosophical. Task knowledge now lives in one linked OKF
Bundle instead of synchronized lifecycle, topology, Evidence, Context, and Reference projections.
Python now owns only session, path, actor, lock, receipt, and directory mechanics. The README
should explain the same development method through the current Bundle, Wiki, Skill, Agent, runtime,
and Harness boundaries.

This is a bounded documentation correction. Current workflow guidance, canonical Skills, runtime
code, and the project Wiki already provide sufficient evidence; no external research, QbD, or
multi-row decomposition is needed.

Success means:

- the README again works as a complete methodology entry point;
- old implementation mechanisms are described only as rejected projections, not restored;
- the current project tree, Skills, native assignments, and runtime boundary are accurate;
- claims about external effects, archive links, OMP behavior, and Claude validation are properly
  qualified;
- command and verification examples match the current CLI.

The Skill deployment model has four consumers, not three. `.agents/skills/` is the universal
Agent Skills entry and must be managed alongside the OMP, Codex, and Claude native roots. All four
are projections of `templates/common/skills/`; they do not own independent Skill content.
