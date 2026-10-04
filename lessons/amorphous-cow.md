---
slug: amorphous-cow
title: Guards over live-system outputs written from documentation park on real, harmless outputs; probe the real output first
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 16 END"
---

Phase 16's adoption script guarded two irreversible steps with rules written from documentation and review. Both parked on real outputs that were harmless.

1. CloudFormation listed the DeletionPolicy/UpdateReplacePolicy edit itself as a Modify of each resource (Target.Attribute DeletionPolicy, DirectModification). The rule allowed only an empty change set or parameter re-evaluations.
2. Terraform reported the budget as "update in-place" whose values were identical. Only the sensitivity marking changed, because the email now came from an encrypted parameter.

Each park was safe and cost a rule edit, a re-probe and a gate rerun. The code critic had suggested this ahead of time: probe the real change set without executing it.

Do differently: before an irreversible run, capture the real outputs the guards will judge with side-effect-free calls (create and describe a change set without executing it, run `terraform plan`), and write or test the guards against them. Keep the guards strict.
