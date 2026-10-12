---
id: "31"
title: "Answering in one go: every free date already ticked, select all, and one Send"
depends_on: ["30"]
informs: ["32"]
---

# Phase 31 — Answering in one go: every free date already ticked, select all, and one Send

**Goal**: a member who opens an availability request finds every date they're free already ticked, adjusts what's wrong, and sends their dates with one tap.

## Deliverables

- When a member opens an availability request they haven't sent dates for, every date still on offer is ticked except those that clash with their Google Calendar at the request's chosen time of day; a member without Google Calendar connected finds every date ticked.
- "Select all" and "Clear all" on the request's dates.
- Nothing the page ticked for them is saved, and nothing reaches organizers, until the member confirms with one button (for example "Send these dates").

## Decisions (operator, 2026-10-11)

From the operator's feedback after Phase 30 ("there should be an option for a member when they get an availability request, to 'select all', and the default behavior should be to select all dates that aren't in conflict with their calendars at the preselected time") and their answers:

- **Ticked, sent on confirm:** the default ticks are a starting point the member sees, not saved answers; organizers never see dates the member didn't look at.
- **No calendar, every date:** with no Google Calendar connected nothing is known to clash, so every date is ticked.
- **Order:** this phase comes before Phase 32 (Google Calendar permission switching writing on).

To settle at phase start: what ticking and unticking does after the member has sent their dates once (save as they go, as today, or another Send); and whether a member's times already given on another request covering these dates change the starting ticks.

## Acceptance

- `./bin/test project/tests` covers the starting ticks (with and without Google clashes, and for a member who has already sent dates), select all and clear all, and that nothing is saved before the member confirms.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open the site as a member of a group with an open availability request you haven't answered yet (signed in with Google, with something in your calendar during the request's time of day on one of its dates):

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open the availability request.
    2. Look at which dates are ticked; untick one and tick a greyed (busy) date.
    3. Press "Clear all", then "Select all".
    4. Send your dates.
    5. As the organizer, open the same request and look under "When people are free".
  - **What to look for.**
    - Every date is ticked on arrival except the ones your calendar is busy for at that time.
    - Select all and Clear all change every date at once.
    - The organizer sees nothing from you until you send, then exactly the dates you sent.
  - **Variations to explore.** A member not signed in with Google (every date ticked); opening the request again after sending; a request with two times of day; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability" (answering starts from every non-clashing date ticked, ruling of 2026-10-11).
