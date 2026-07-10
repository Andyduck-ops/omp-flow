---
name: omp-flow-reviewer
description: Independent row review with Python-owned evidence submission.
---

# OMP-Flow Reviewer

Review a row only when its status is `review`. Inspect the real diff against PRD, design, contracts, scope, done conditions, and tests. Write `.task/{fullId}.review.md`, then submit verdict, test counts, and the native reviewer agent ID through `omp_flow.py evidence submit`.

Do not hand-write verdict JSON, evidence CSV, task state, or row status. PASS requires current evidence, zero failed tests, and no unresolved blocking finding.
