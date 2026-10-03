---
slug: camouflaged-dragon
title: Timing thresholds and fixed dates in tests are proxies; mutation-check thresholds and compute dates at run time
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-02
source: kickoff
occurrences:
  - date: 2026-10-02
    ref: "Phase 3 END"
  - date: 2026-10-02
    ref: "Phase 6 END"
---

Two Phase 3 checks looked like evidence but were not. A route test asserted that loading a schedule with a 2062 rehearsal took under one second, meant to prove cells are built only for the dates read; mutating the code to build every day up to 2062 still ran in well under a second, so the assertion could never fail. It was replaced by a unit test that asserts exactly which dates `buildCells` produces. Separately, the production smoke proposed a rehearsal on the fixed date 2027-01-07, which the app refuses once that date is past, so every gate would have started failing three months later for no product reason; the smoke now computes a Thursday about ten weeks ahead.

Do differently: when a property is structural (what was built, which rows were touched), assert the structure, not elapsed time; and never hard-code a calendar date that the code under test compares with today.

Phase 6 recurrence: mutation-checking each new test found two that passed for the wrong reason. A state-mismatch callback test also fed a wrong nonce, so the nonce check refused the sign-in and removing the state check changed nothing; a session-renewal test went through the group page, whose loader renews the session on its own, so breaking renewal in `findViewer` changed nothing. Both now isolate the property and fail under mutation. Run the mutation, not just the test, for every guard a test claims to prove.
