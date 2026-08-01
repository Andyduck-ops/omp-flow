---
type: "Architecture"
title: "Thin Harness adapter boundaries"
---

# Thin Harness adapter boundaries

An omp-flow Harness adapter should remain a small project-local translation layer. Native agent
cards and Hook configuration belong in the Harness's project root; workflow Skills remain in the
shared `.agents/skills` tree; task meaning remains in the Bundle; mechanical selection and
correlation remain in the portable runtime. Exact-owned Hook JSON is installed or updated as one
managed resource and is never merged with foreign or user-modified configuration.

Session selection must use identity supplied by the active Harness instance. An ambient identity
from another Harness is not evidence for the current session, and an agent definition name is not
a unique execution identity. If the caller cannot select the native execution ID before creating
and forwarding an operation assignment, exact operation dispatch is unavailable. Hooks may
validate an ID they receive, but they cannot repair an identity that was never caller-controlled.

Hook protection is bounded by the native events, payloads, tools, and enforcement behavior the
Harness actually exposes. Project-over-global precedence, fail-open paths, missing lifecycle
payloads, and unsupported surfaces must be documented as capability limits. Fixture tests prove
the adapter's translation and confinement logic; released-runtime capture is separate evidence
for lifecycle delivery, environment propagation, resume, concurrency, subagent inheritance, and
write denial. Package presence alone proves none of those runtime behaviors.
