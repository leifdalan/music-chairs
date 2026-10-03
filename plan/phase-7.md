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

## Inherited from Phase 2

Pinned by [Phase 2](phase-2.md): availability is stored as wall-clock dates and minutes in the group's single IANA time zone (`groups.time_zone`), on a 30-minute grid, with weekly patterns and whole-date skips (`project/app/lib/availability.ts`, `project/app/.server/store.ts`). Importing free/busy therefore converts Google's instants into the group's zone and onto the 30-minute grid (deciding how partial half-hours round), and writing confirmed rehearsals converts wall-clock times back to instants in the group's zone, including the daylight-saving edge cases Phase 2 deliberately left unresolved (a time inside a skipped or repeated hour).

## Inherited from Phase 3

Pinned by [Phase 3](phase-3.md): confirmed rehearsals live in `rehearsals` (`status = 'confirmed'`, location free text, weekly patterns with an optional `end_date` and cancelled dates in `rehearsal_cancellations`). Writing them to calendars must follow later changes made there: an organizer can cancel single dates, set a last date, or delete a rehearsal; editing times is done by deleting and proposing again.

## Inherited from Phase 4

Pinned by [Phase 4](phase-4.md): no calendar feed shipped; the operator deferred the ICS fallback for name-only members to this phase (Open question 5). Members' answers live per rehearsal date in `rsvps` (`yes`, `no`, `maybe`), which this phase can use when deciding whose calendars get an event for which dates.

## Inherited from Phase 5

Pinned by [Phase 5](phase-5.md): the app runs on one Lightsail instance with a public address, so it reaches Google's APIs directly, with no VPC or NAT cost. Schema changes append a step to `MIGRATIONS` in `project/app/.server/store.ts` (forward-only), and the live data at `https://rehearse.dalan.dev` is kept across releases.

## Inherited from Phase 6

Pinned by [Phase 6](phase-6.md): Google accounts live in `accounts`, keyed by Google's `sub`, and a member is linked to an account through `members.account_id` (at most one member per group per account). `readAccount` in `project/app/.server/membership.ts` returns the signed-in account; sessions last 90 days after last use. Only `openid`, `email` and `profile` are granted today, so Calendar access needs a further consent from each member, and no Google access or refresh tokens are stored yet: where and how to keep them is this phase's decision. The OAuth client secret comes from Parameter Store at service start (`project/deploy/fetch-secret.sh`). Google's verification of the sensitive Calendar scopes is prepared in `user-actions/cherubic-fox.md`.

## Acceptance

- `./bin/test project/tests` covers import mapping, event creation, update and cancellation.
- `./bin/check all` passes.
- User Demo: import free/busy for one week, confirm a rehearsal, and see it appear in Google Calendar, then cancel it and see it removed. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability" (Google Calendar import), "Calendar output", "Google integration", Open questions 5 and 6.
