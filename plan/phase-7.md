---
id: "7"
title: "Google Calendar: free/busy import and writing confirmed rehearsals"
depends_on: ["6", "3"]
informs: []
---

# Phase 7 — Google Calendar: free/busy import and writing confirmed rehearsals

**Goal**: a signed-in member can fill in availability from their Google Calendar free/busy information instead of entering it by hand, and confirmed rehearsals can be written to members' Google Calendars, with later changes and cancellations kept in step.

## Deliverables

- Free/busy import into the availability model of [Phase 2](phase-2.md), reviewable before it is saved.
- A decided calendar write model (brief, Open question 5): events on each member's own calendar or one organizer-owned event inviting everyone, and how changes and cancellations sync; plus the fallback for name-only members if [Phase 4](phase-4.md) did not already ship one.
- The sensitive Calendar scopes and the Google verification status they require, with human-only steps filed in `user-actions/`.
- Tests with Google's Calendar API faked.

## Acceptance

- `./bin/test project/tests` covers import mapping, event creation, update and cancellation.
- `./bin/check all` passes.
- User Demo: import free/busy for one week, confirm a rehearsal, and see it appear in Google Calendar, then cancel it and see it removed. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability" (Google Calendar import), "Calendar output", "Google integration", Open questions 5 and 6.
