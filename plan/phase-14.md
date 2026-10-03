---
id: "14"
title: "Proposing several free times at once, and pending requests on the home screen"
depends_on: ["13"]
informs: ["15"]
---

# Phase 14 — Proposing several free times at once, and pending requests on the home screen

**Goal**: the organizer turns the group's free times into proposals in one go, with a custom proposal as the deliberate exception, and members find any request waiting for their answer as soon as they open the app.

## Deliverables

- "When people are free" becomes a multi-select: the organizer ticks one or more free times and proposes them all with one action.
- The free-form "Propose a rehearsal" form moves to the bottom of the schedule page, hidden behind an "Override with a custom proposal" control.
- The home screen shows each member, across their groups, the requests still waiting for their answer, each one tap away; nothing extra appears when there are none.

## Decisions (operator, 2026-10-03)

From the operator's list after Phase 9:

- "When people are free/propose this time should be a multi-select. The propose a rehearsal should be at the bottom and gated visually by 'override to a custom proposal'."
- "Members from the home screen should be able to see and navigate to pending requests very easily, given they have one or many."

To settle at phase start: whether the multi-select also applies to free times on a request's page (Phase 9), and whether location is entered once for all the selected times.

## Acceptance

- `./bin/test project/tests` covers proposing several selected free times in one action (each becomes a proposed rehearsal), organizer-only access, the custom proposal still working behind its control, and the home screen listing exactly the open, unanswered requests of the viewer's groups and none of anyone else's.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: as organizer, tick three free times and propose them together; open the custom proposal and propose a different time; as a member with two unanswered requests, open the home screen on a phone and go straight to one. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Technology and constraints" (works well on a phone).

## Inherited from Phase 13

Pinned by [Phase 13](phase-13.md): organizers add members on their own page, `/g/:groupId/members/add` (`project/app/routes/members.add.tsx`), by typed name or from their Google contacts (`listContacts`, read only there, cached in memory for ten minutes and never stored). A member added from contacts carries `invitedEmail` (shown only to organizers) until a Google account with that verified email opens the invite link and claims the place (`claimInvitation`); invited members are never matched by name. `googleFetch` in `project/app/.server/google.ts` is the shared Google API request helper (token, one retry after a 401). Contacts consent uses `/auth/google/calendar?scope=contacts` and the `contacts-*` notices. The schema is at version 8; new tables or columns are migration 9 onward.
