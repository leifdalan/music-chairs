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

## Decisions (operator, 2026-10-02)

Settled at phase start:

- **One phase.** Import, calendar writing and the feed link ship together.
- **Write model: each member's own calendar.** A signed-in member turns on "Add rehearsals to my Google Calendar"; the app adds, updates and removes events in that member's **primary** calendar as the organizer confirms, changes or cancels dates. No email invitations; the app's RSVP stays the source of truth. Granular, member-chosen calendars are a later feature (see the deferred-work note in `plan/INDEX.md`).
- **Dates written:** every upcoming confirmed date, except dates the member answered No; cancelled and removed dates are taken off. Proposed times stay off calendars.
- **Fallback for everyone: a private calendar feed link.** Each member (name-only or signed in) gets a secret ICS subscription link that Apple, Google or Outlook calendars poll; it carries the same dates as above and follows changes and cancellations. Read-only; no Google permission.
- **Free/busy import: next 4 weeks, reviewed before saving.** The app reads busy times from the member's **primary** calendar for the next 28 days and proposes one-off free slots on the 30-minute grid, counting a half-hour free only when it is entirely free; the member edits or unticks proposals before saving. Weekly patterns stay hand-made. Choosing which calendars count as busy is a later feature (deferred-work note in `plan/INDEX.md`).
- **Scopes:** the narrowest that do the job, requested only when a member uses import or turns on calendar writing (not at sign-in): free/busy reading (`https://www.googleapis.com/auth/calendar.freebusy` or `https://www.googleapis.com/auth/calendar.events.freebusy`) and writing events on calendars the member owns (`https://www.googleapis.com/auth/calendar.events.owned`), each confirmed against the API method it serves during planning.
- **Verification: stay unverified for now.** Up to 100 Google accounts can grant Calendar access after Google's "unverified app" warning. `user-actions/cherubic-fox.md` stays deferred. Enabling the Calendar API and adding the scopes in the Google Cloud console is the operator's (`user-actions/magnetic-nyala.md`); tests fake Google and do not wait for it.

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

Executable:

- `./bin/test project/tests` covers the free/busy mapping (time-zone conversion, the half-hour rule, the 4-week window, daylight-saving edges), the review-then-save import, calendar consent and its refusal, event creation, update and removal as dates are confirmed, cancelled, ended, deleted or answered No, turning calendar writing off, and the feed's content and secret-link access.
- `./bin/deploy all` and `./bin/deploy smoke` pass against https://rehearse.dalan.dev.
- `./bin/check all` passes.

User Demo (after `user-actions/magnetic-nyala.md` is done and the release is deployed):

- **Entry point.** Open `https://rehearse.dalan.dev`, signed in with Google, in a group where you are linked and the organizer.
- **Suggested inputs.** Open **My availability** and choose **Import from Google Calendar**; grant access (Google shows an "unverified app" warning: choose **Advanced**, then continue). Review the proposed free slots for the next four weeks, untick one, and save. On **Schedule**, propose a weekly rehearsal on a day you are free, starting next week, and confirm it. Turn on **Add rehearsals to my Google Calendar**. Copy your **calendar feed link** and subscribe to it in another calendar app (for example Apple Calendar → File → New Calendar Subscription).
- **What to look for.** The saved slots match the free time in your Google Calendar, without the one you unticked. Your primary Google Calendar shows each upcoming date of the confirmed rehearsal with its location. Answering **No** for one date removes that date from your Google Calendar; cancelling another date as organizer removes it too. The subscribed feed shows the same dates (calendar apps refresh feeds on their own schedule, from minutes to hours).
- **Variations to explore.** Delete the rehearsal and check its events disappear. Turn calendar writing off and check the events the app added are removed. Does the import review screen work comfortably on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability" (Google Calendar import), "Calendar output", "Google integration", Open questions 5 and 6.
