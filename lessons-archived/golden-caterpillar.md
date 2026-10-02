---
slug: golden-caterpillar
title: Hand reviewers only repository-relative artifacts, or advisory ingest refuses the whole report
status: codified
scope: methodology
proposed_surface: skill
filed: 2026-10-02
source: kickoff
closed: 2026-10-02
graduated_to: lib/agentic_starter/finding_schema.py
occurrences:
  - date: 2026-10-02
    ref: "Phase 1 PARK"
---

In the Phase 1 run, the orchestrator's code-critic prompt pointed the critic at a smoke script kept in the evidence run directory (an absolute temporary path outside the repository). The critic, reasonably, filed a finding whose `affected_paths` named that absolute path. `kickoff-evidence ingest-findings` then refused the entire advisory report ("advisory paths must be repository-relative"). The pass was a successful, accepted dispatch, so acceptance validation will not pass while it lacks convergence metrics. `attach-derived-metrics` covers only three refusal classes (`finding-id-format`, `immutable-field-restated`, `resolved-in-not-current-candidate`), not this one. The only truthful route left was a fail-closed park and a corrective run that spent the second and last critique pass.

Remedy candidates: (a) the implementation resource tells the orchestrator that every file a role may cite must live in the repository tree (or be named only as context the role must not cite as an affected path); (b) the generated advisory schema or the critic persona constrains `affected_paths` to repository-relative paths at generation time; or (c) `attach-derived-metrics` gains a `non-repository-path` refusal class. Acceptance commands that are scripts belong in the tree, not in the run directory, if a reviewer is expected to inspect them.

Codified 2026-10-02 at the operator's request ("fix the tooling first, document it appropriately"): the generated review schemas now describe `affected_paths` as repository-relative paths only (the rule ingest enforces), and the kickoff dispatch resource requires every file a review role may cite to live in the repository.
