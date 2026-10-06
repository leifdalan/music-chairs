---
id: "24"
title: "Availability requests and their proposed rehearsals: names, nesting, a simpler group page and schedule"
depends_on: ["23"]
informs: ["25"]
---

# Phase 24 — Availability requests and their proposed rehearsals: names, nesting, a simpler group page and schedule

**Goal**: it is obvious that a proposed rehearsal came out of a particular availability request, and the group page shows what is coming up rather than chores.

## Deliverables

- Names, everywhere: "Requests" become "Availability requests" and "proposals" / "proposed times" become "Proposed rehearsals", in headings, buttons, toasts, the home page and the calendar feed's descriptions.
- Proposed rehearsals sit visibly and functionally under the availability request they came from: on the request page, on the group page and on the schedule (each card names its request).
- Group page: upcoming confirmed rehearsals as a list (future dates only); the group's availability requests with their proposed rehearsals nested; a Schedule link that does not look already selected; no My availability button.
- Schedule page: "When people are free" becomes a Calendar / List toggle, Calendar by default, showing the heat map; a summary of how many members have given availability and how many have answered each proposed rehearsal; "Rehearsals in your calendar" (the subscription link and the Google Calendar switch) moves to the bottom. Otherwise the page stays as it is.

## Decisions (operator, 2026-10-06)

From the operator's notes after Phase 21: "I think we should only surface confirmed proposed times as a list as long as they are in the future from the group page"; "'Requests' and 'Proposals' are basically analogous. I think we should call 'requests' 'Availability requests' and 'proposals' should be 'Proposed Rehearsals'. Availability requests should visually and functionally be a parent of a proposal, so that it is clear that the proposal came out of a particular availability request." Answer to the follow-up question on the schedule: "Schedule can stay, but let's not make the button look like its already selected for one. Then inside can stay the same, but the 'when people are free' should be cal/list toggle with cal by default where it is the heatmap. Maybe a summary of how many members have filled availability and how many have responded to a request. The rehearsal in your calendar should be at the bottom." (1)

Ruling at phase start (operator, 2026-10-06): on an availability request's own page, its proposed rehearsals appear as a compact list (date, time, place, how many have answered or "Confirmed"), each with "Answer on the schedule" linking to that rehearsal's card; Yes/No/Maybe and Confirm stay on the schedule only.

## Acceptance

- `./bin/test project/tests` covers the new names (no route still renders "proposal" or a bare "Request" heading), the nesting, the group page's upcoming list and its exclusion of past and unconfirmed rehearsals, the schedule's toggle default, summary and section order.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, signed in as an organizer of a group with an availability request that has at least one proposed rehearsal (propose one from the request's calendar first if needed), open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open the group page.
    2. Open the availability request from it, then follow a proposed rehearsal's "Answer on the schedule".
    3. On the schedule, confirm one proposed rehearsal, then go back to the group page.
    4. On the schedule, switch "When people are free" between Calendar and List, and scroll to the bottom.
  - **What to look for.**
    - The group page lists "Upcoming rehearsals" (confirmed, future dates only) and "Availability requests", each with its proposed rehearsals under it; the Schedule button doesn't look already selected; there is no My availability.
    - Pages say "Availability request(s)" and "Proposed rehearsal(s)", never "proposal" or a bare "Requests".
    - The request page lists its proposed rehearsals, and the link lands on that rehearsal on the schedule; after confirming, the rehearsal appears under "Upcoming rehearsals" on the group page.
    - The schedule's "When people are free" opens as the heat map calendar with a List option, shows how many members have given times and how many have answered each proposed rehearsal, and "Rehearsals in your calendar" is the last section.
  - **Variations to explore.** A member (not an organizer) viewing the group page and schedule; a group whose only confirmed rehearsal is in the past (it isn't listed as upcoming).

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Success criteria".

## Inherited from Phase 23

Pinned by [Phase 23](phase-23.md): members (organizers too, in a folded "Your times" section below the heat map) give their times on the request page through `RequestDates` (`project/app/components/request-dates.tsx`) and the request route's `set-date`, `save-dates` and `answer` intents (`project/app/routes/request.tsx`); a date's ticks and clears touch only times within that request's windows, and times are shared across requests. A request's per-member record is a "response" ("Responded", "N of M responded"); "answer" means Yes/No/Maybe only. There is no My availability page. Left for this phase's tidy-up (code critique F005 of Phase 23): store methods only tests use (`addSlots`, `findSlot`) and weekly availability fixtures in older tests.
