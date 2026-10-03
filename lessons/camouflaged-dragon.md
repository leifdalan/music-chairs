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
  - date: 2026-10-03
    ref: "Phase 7 END"
  - date: 2026-10-03
    ref: "Phase 9 END"
  - date: 2026-10-03
    ref: "Phase 10 PARK"
---

Two Phase 3 checks looked like evidence but were not. A route test asserted that loading a schedule with a 2062 rehearsal took under one second, meant to prove cells are built only for the dates read; mutating the code to build every day up to 2062 still ran in well under a second, so the assertion could never fail. It was replaced by a unit test that asserts exactly which dates `buildCells` produces. Separately, the production smoke proposed a rehearsal on the fixed date 2027-01-07, which the app refuses once that date is past, so every gate would have started failing three months later for no product reason; the smoke now computes a Thursday about ten weeks ahead.

Do differently: when a property is structural (what was built, which rows were touched), assert the structure, not elapsed time; and never hard-code a calendar date that the code under test compares with today.

Phase 6 recurrence: mutation-checking each new test found two that passed for the wrong reason. A state-mismatch callback test also fed a wrong nonce, so the nonce check refused the sign-in and removing the state check changed nothing; a session-renewal test went through the group page, whose loader renews the session on its own, so breaking renewal in `findViewer` changed nothing. Both now isolate the property and fail under mutation. Run the mutation, not just the test, for every guard a test claims to prove.

Phase 7 recurrence: a borrowed-device import test passed with its guard removed because the stranger was not a member of the group, so a different check refused them; single mutations caught it and the stranger became another member. The code critique also showed that only one of the eight sync triggers had a test that could fail; a route walkthrough now asserts the calendar after every trigger, each mutation-checked.

Phase 9 recurrence: a migration-5 test's list of inserts that must be refused included an answer for an unknown member with a limit of 0, meant to prove the 1–99 limit check; it would have failed on the foreign key or primary key even with the check removed, and was split so each insert breaks one rule. The code critique then noted that the test's raw database connection never turned foreign keys on, so no foreign key or cascade in the new tables was exercised; the test now enables them and asserts unknown parents are refused and windows and answers go with their request.

Phase 10 recurrence: a test that the calendar offers to connect Google Calendar when free/busy access is missing passed with the grant's scope check removed, because its member had no grant at all, so a different check refused first. A member with a write-only grant now kills that mutation. All other new guards in the phase were mutation-checked and failed their tests.
