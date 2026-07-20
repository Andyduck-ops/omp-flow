# omp-flow

omp-flow is a disciplined, harness-neutral AI workflow methodology and portable
deterministic control plane. Its canonical source and release home is
[Andyduck-ops/omp-flow](https://github.com/Andyduck-ops/omp-flow). It is built on
engineering foundations derived from the
[Trellis framework](https://github.com/Andyduck-ops/Trellis); see `COPYRIGHT` for
upstream attribution and modifications.

The idea: an AI harness is fast but undisciplined. omp-flow wraps it in a
Python-owned control plane that holds state at every phase boundary, forces two
human quality gates, and keeps the party who implements a task separate from the
party who reviews it — so speed never quietly erases judgement.

## Install / usage

Build the workspace and deploy into a target repository:

    pnpm install
    pnpm build
    node packages/cli/bin/omp-flow.js init --claude

`init` deploys the omp-flow methodology (workflow control plane, agents, hooks,
and skills) into the target repository. `init --codex` deploys the same
methodology for the Codex harness. `omp-flow update` refreshes an already
deployed install (0-drift on an unchanged toolchain).

## How it works

Work flows through five phases. Python owns the state at every boundary; the
model does the labor between boundaries but never advances the state itself.

```
  EXPLORE    brainstorm ─▶ research ─▶ 90-synthesis
  DESIGN     PRD + Design + Tier-3 context ─▶ [ QbD 1: audit ▶ 👤 decide ]   (context frozen)
  DECOMPOSE  exact-topology tasks.csv + briefs ─▶ [ QbD 2: audit ▶ 👤 decide ] (topology frozen)
  EXECUTE    per row:  implement agent ─▶ review ─▶ independent check agent ─▶ PASS
             frozen-topology change ⇒ amendment: propose ▶ set-change ▶ delta-audit ▶ 👤 decide
  FINISH     integration verify ─▶ knowhow harvest ─▶ commit ─▶ archive
```

The load-bearing ideas:

- **Python-owned state at every phase boundary.** The control plane, not the
  model, records what phase you are in, what is frozen, and whether a row has
  passed. A model PASS is evidence, not a state transition.
- **Two Quality-by-Design human gates.** QbD 1 audits the design before context
  is frozen; QbD 2 audits the decomposition before the topology is frozen. Each
  gate is an independent adversarial audit followed by a required human decision
  — a model cannot substitute its own PASS for the human call.
- **Exact-topology row IDs.** Decomposition emits a fixed set of rows with stable
  IDs; execution advances strictly against them.
- **Executor ≠ reviewer independence.** The agent that implements a row is never
  the agent that checks it; independence is enforced structurally, not by
  convention.
- **Append-only frozen topology, with an escape hatch.** Once frozen, the
  topology is append-only. A genuinely necessary change goes through an
  amendment: propose ▶ set-change ▶ delta-audit ▶ human decide — never a silent
  edit.

## Platform adapters / Status

- **Claude Code — push-based adapter.** A quote-aware Bash guard, read-only
  inspection CLI verbs (`status` / `task show` / `topology list` / `workflow
  explain`), and turn-zero methodology teaching injected once at session start.
- **Codex — full 5-agent parity (pull-based).** Codex sub-agents pull their
  role- and row-bound context through an embedded prelude rather than having it
  pushed; the same freeze/status guarantees apply. `init --codex` deploys the
  5-agent set plus skills and the router hook chain with 0-drift on `update`.
- **Parked.** `opencode`, `gemini`, `qoder`, `copilot`, `cursor`, `kiro`,
  `droid`, `codebuddy`, and `trae` are parked for later milestones.

See `docs/MILESTONES.md` for the full delivery ledger (M1 Claude-first rebase,
M2 findings cleanup, M3 Codex adapter, M4 Claude polish, plus tracked debt).

Release navigation, issues, and package metadata are maintained in the
[canonical product repository](https://github.com/Andyduck-ops/omp-flow).

## CLI quick reference

Two surfaces. The installer CLI (this package) deploys and refreshes:

    omp-flow init --claude | --codex   # deploy the methodology into a repo
    omp-flow update                    # refresh a deployed install (0-drift)

Inside a deployed repo, the Python control plane owns workflow state and
inspection (the read-only verbs below all exit 0 as pure inspection):

    python .omp-flow/scripts/omp_flow.py status [--task <id>]        # active task / phase snapshot
    python .omp-flow/scripts/omp_flow.py task show [<id>]            # summary of a task
    python .omp-flow/scripts/omp_flow.py topology list               # rows in the frozen topology
    python .omp-flow/scripts/omp_flow.py workflow explain [section]  # methodology reference

## License

AGPL-3.0-only. See `LICENSE` and `COPYRIGHT`.
