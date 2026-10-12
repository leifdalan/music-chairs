---
id: "32"
title: "Google Calendar permission means your calendar: granting it adds rehearsals, and the app says so"
depends_on: ["31"]
informs: []
---

# Phase 32 — Google Calendar permission means your calendar: granting it adds rehearsals, and the app says so

**Goal**: a member who grants music-chairs permission to their Google Calendar gets their confirmed rehearsals in it without a second step, and knows it.

## Deliverables

- Granting the Google Calendar permission, whether while signing in with Google or through "Connect Google Calendar", switches calendar writing on for that member, so their confirmed rehearsals appear in their Google Calendar with no further button.
- Before going to Google, the app says plainly what granting the permission does ("Confirmed rehearsals will be added to your Google Calendar and kept up to date"); on return, it confirms that rehearsals are now being added.
- Wherever calendar writing shows (the schedule's calendar panel, a complete request's "Add to calendar"), it reads as on, with the way to stop it, rather than as a step still to take.

## Decisions (operator, 2026-10-11)

From the operator's feedback after Phase 30 ("it should be made more clear that when you accept the google permissions that things are sync'd automatically") and their answers:

- **Granting turns syncing on:** accepting the Google Calendar permission is the member's choice to have rehearsals written; it switches writing on rather than waiting for "Add rehearsals to my Google Calendar".
- **Order:** this phase comes after Phase 31.

To settle at phase start: which of the member's groups switch on when they grant the permission (the group they started from, or every group they're in with that Google account); and what happens to members who already granted the permission but left writing off.

## Acceptance

- `./bin/test project/tests` covers writing switching on after each way of granting the permission, the wording before and after, and turning it off.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open the site as a member of a group with a confirmed rehearsal still to come, signed out of Google on the site (or using a Google account that hasn't granted Calendar permission):

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On the group page, sign in with Google and grant the Calendar permission when Google asks.
    2. Open the schedule and look at the calendar panel.
    3. Open Google Calendar on the date of the confirmed rehearsal.
    4. Back on the schedule, stop adding rehearsals to your Google Calendar.
  - **What to look for.**
    - Before going to Google, the app says what granting the permission will do.
    - After granting it, the app says rehearsals are being added, with no further button to press.
    - The rehearsal appears in your Google Calendar; after stopping, it is removed.
  - **Variations to explore.** "Connect Google Calendar" from a complete request on the home page; unticking the Calendar permission on Google's screen; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Calendar output" (granting the permission switches writing on, ruling of 2026-10-11).
