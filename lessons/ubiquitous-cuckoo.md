---
slug: ubiquitous-cuckoo
title: After the draft-PR push, @{upstream} is HEAD, so the changed-path gate selects almost nothing
status: candidate
scope: methodology
proposed_surface: skill
filed: 2026-10-11
source: kickoff
occurrences:
  - date: 2026-10-11
    ref: "Phase 30 END"
  - date: 2026-10-15
    ref: "Phase 41 END"
---

In Phase 30 the in-progress commit was pushed with `git push -u origin phase-30` to open the draft pull request the ci.check gate needs. That made `@{upstream}` origin/phase-30, the same commit as HEAD, so the final gate `./bin/test --changed-from '@{upstream}'` saw no changed product paths and ran only the locally admitted governance family (pytest 54/54), not Vitest. The gate passed truthfully, and the whole suite on those bytes was proven by the CI check and the local run, but the final gate no longer selects what the phase changed.

Do differently (for the human to rule on): either push the phase branch without setting its upstream (so `@{upstream}` stays the base branch), or name the base explicitly in the final gate for pull-request delivery, so the changed-path selection covers the phase's changes.
