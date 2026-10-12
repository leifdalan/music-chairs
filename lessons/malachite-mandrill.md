---
slug: malachite-mandrill
title: A mutant that stops the code compiling is a false kill; mutate behaviour, not declarations
status: candidate
scope: local
proposed_surface: skill
filed: 2026-10-12
source: kickoff
occurrences:
  - date: 2026-10-12
    ref: "Phase 32 END"
---

In Phase 32 a mutation check meant to prove the sign-in toast test removed the line declaring `before` in the Google callback. The test file failed to compile, so the mutant was reported KILLED although no assertion had seen the defect. Moving the same line to after linking (a real behavioural change) was the honest mutant, and it was killed by the assertion.

Do differently: mutate what the code does (move, invert or weaken a statement) and keep it type-correct; a mutant that removes a declaration or import proves only that the compiler runs.
