---
slug: evasive-skua
title: A new root pytest needs a proof-estate admission; a check about the deliverable belongs in the deliverable's Vitest suite
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-03
source: kickoff
occurrences:
  - date: 2026-10-03
    ref: "Phase 14 END"
---

Phase 14's plan added a test to `tests/test_deploy.py` asserting that `project/deploy/provision.sh` keeps server logs 30 days. `./bin/check policy` then failed `policy-test-governance`: "replayed proof estate does not match inventory (unadmitted=[...])". Root pytest proofs are governed by `tests/proof-estate.yaml` and need a recorded `proof_admission` (contract, oracle, red witness, non-subsumption, family size) under `policies/test-suite-governance.md`; the plan had not accounted for that. The check guarded the deliverable's own policy text and deploy file, both under `project/`, so it moved to `project/tests/privacy.test.tsx`, where no admission is needed.

Do differently: when a phase plan adds a test, decide its suite at planning time. Product behaviour and files under `project/` go to Vitest in `project/tests`; a new root pytest is planned together with its proof-estate admission.
