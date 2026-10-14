---
slug: strict-lynx
title: A changed HTTP answer is also asserted by the deploy's live smoke in bin/deploy, outside project/
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-11
source: kickoff
occurrences:
  - date: 2026-10-11
    ref: "Phase 30 END (correction)"
  - date: 2026-10-14
    ref: "Phase 39 END"
---

Phase 30 changed what an unknown long /join link answers (404 to 410) and updated project/scripts/smoke.sh, but the post-release smoke in bin/deploy also asserts that answer. The merge deployed a healthy release whose own live smoke then failed, and a correction pull request was needed. The correction's first version added a root pytest guard, which CI refused because new root proofs need test-governance admission.

Do differently: when a phase changes a status code or page text, grep bin/deploy (and every smoke) for the route as well as project/; and prefer no new root tests in a direct fix unless their admission is part of the run.

Phase 39 recurrence: the phase removed the confirmed card's slot summary beneath its payoff; project/scripts/smoke.sh still grepped that markup, so smoke.local failed at the gate (caught before merge this time). The plan listed smoke.sh only for the changed rehearsal link, not for the card's markup.

