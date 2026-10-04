---
slug: camouflaged-mosquito
title: AWS managed policies and the IAM simulator are not what their names suggest; read the policy document and simulate the role's own policies
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 18 END"
---

Phase 18's deploy role relied on AWS's ReadOnlyAccess for Terraform's reads and for `lightsail:GetInstanceAccessDetails`, which `bin/deploy` uses to pin the server's host key. The plan, its independent review and the implementation all assumed ReadOnlyAccess grants `lightsail:Get*`; its document lists Lightsail's reads one by one and omits that call, so the first CI deploy would have failed. The `iam.simulate` gate caught it before any CI run. The same gate first reported a wall of explicit denies that were not real: this account is its organization's management account, which service control policies do not bind, but `simulate-principal-policy` evaluated them anyway (it showed the same denies for the operator's own user, whose real calls succeed).

Do differently: when a role depends on an AWS managed policy, read the policy's default-version document for the exact actions it needs instead of trusting its name; and in a management account simulate with `simulate-custom-policy` over the role's own policy documents, keeping a control (a principal whose real calls are known to succeed) to tell simulator artifacts from real denies.
