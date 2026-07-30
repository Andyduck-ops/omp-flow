---
type: Verification Contract
title: Verifiable claim
description: A proportional contract for acceptance criteria, done conditions, and durable assertions.
---

# Make the outcome observable

A useful claim identifies the subject, required behavior, relevant conditions, and evidence that
would distinguish success from an incomplete implementation. Prefer evidence at the boundary a
user or dependent component can observe.

Choose the strongest proportional evidence:

- use an executable assertion when a stable behavior can be checked reliably;
- use a focused review or one-time observation for authored content and transitional state;
- record durable prose when judgement or context cannot be reduced to a reliable assertion.

A command is not evidence by itself. Record its result, and make clear which claim that result
supports.

# Test stable behavior, observe transitions

Permanent tests should protect behavior expected to remain true. A temporary inventory,
migration count, or pre-disposal state should be inspected at the relevant handoff rather than
encoded as a repository invariant.

A regression detector should fail under the exact mutation it claims to guard. If both the broken
and correct implementations produce the same observable, the detector does not establish the
claim.

# Keep the contract proportional

Do not add a parser, graph rule, fixed document schema, or broad snapshot merely to make prose look
mechanical. State what the evidence actually proves, leave content judgement to independent
review, and keep one-time observations distinct from reusable tests.
