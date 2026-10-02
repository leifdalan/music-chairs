---
slug: upbeat-oyster
title: Role attempt numbers restart at 1 in every evidence run; the phase pass budget is tracked separately
status: codified
scope: methodology
proposed_surface: skill
filed: 2026-10-02
source: kickoff
closed: 2026-10-02
graduated_to: bin/kickoff-evidence
occurrences:
  - date: 2026-10-02
    ref: "Phase 1 PARK (second corrective run)"
  - date: 2026-10-02
    ref: "Phase 1 PARK (third run: carry-advice refused the parked run as a source)"
---

After a fail-closed park, the Phase 1 corrective run registered its code critique as `--attempt 2` because it was the phase's second critique pass. `register-role-attempt` accepted it, the watcher dispatched it, and the pass succeeded — but acceptance validation then refused the run ("role attempts are not contiguous for role.code-review"), because attempt numbers are per evidence run and must start at 1. The phase-wide two-pass advisory budget is tracked independently (`.kickoff/advice-budgets`, with `--cause` on the second pass), so the attempt number should not encode it. The registration and its spans are immutable, so the run could only park.

Remedy candidates: the dispatch resource states that every fresh run numbers attempts from 1 even when the phase budget is on its second pass; or `register-role-attempt` refuses a non-contiguous attempt at registration time instead of letting acceptance validation discover it after the provider call.

Consequence observed on the next run: `carry-advice` re-validates the source run's role spans, so the parked run's successful, ingested critique could not be carried forward either. With the phase's two-pass advisory budget spent, no autonomous route to an accepted close remained and the phase returned to the operator.

Codified 2026-10-02 at the operator's request ("fix the tooling first, document it appropriately"): `register-role-attempt` now refuses a non-contiguous attempt number before any role launches, and the rule is stated in `policies/orchestration-evidence.md` and the kickoff dispatch resource.
