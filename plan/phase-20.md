---
id: "20"
title: "A visual organizer view: availability at a glance, picking dates on a calendar, and clearer confirming"
depends_on: ["19"]
informs: []
---

# Phase 20 — A visual organizer view: availability at a glance, picking dates on a calendar, and clearer confirming

**Goal**: an organizer sees at a glance which dates in a request suit the most people, taps a date to see who is free, and picks the dates to propose on a calendar or a list; and on the schedule, organizers can tell their own answer apart from confirming a rehearsal for everyone.

## Deliverables

- On a request's page, organizers get a calendar of the request's dates shaded by how many people are free (a heat map), alongside today's list; a Calendar / List switch chooses between them.
- Tapping a date on that calendar opens a popup listing that day's free times and who is free at each.
- Proposing works from either view: dates and times ticked in the calendar's popups or in the list are proposed together, as "Propose selected" does today.
- On the schedule page, a proposed rehearsal's organizer controls (confirm, delete) sit apart from the viewer's own Yes / No / Maybe, and the confirm button says it confirms the rehearsal for everyone; a tapped answer shows that it was saved.

## Decisions (operator, 2026-10-05)

The operator's request, verbatim: "I'd like for the organizer view to be more visual. There should be a heat map or maybe a color per person that shows combined availability before the proposal is picked. Clicking on a date should show a popup of who is available. Choosing proposed dates should also be a multi-select calendar or list view." And: "when confirming a proposed date, it should just automatically save, no need to confirm"; clarified: "I'm talking about the screen where a member views proposed times for a rehearsal, and can click yes/no/maybe which also has a "confirm" below it. seemed unnecessary".

Readings recorded at phase start (the operator may override before planning ends):
- **Heat map** by how many people are free each date (within the request's times of day), rather than a colour per person; the popup names who is free at each time.
- **Both views**: the calendar is new; the existing list of free times stays as the List view; ticks in either are proposed together.
- **Confirming**: answers already save on tap; the "Confirm" seen under them is the organizer's confirm-for-everyone, shown because the operator is an organizer. It is kept (the proposed → confirmed step remains) but separated from the answer buttons and renamed so it no longer reads as a save step.

## Acceptance

- `./bin/test project/tests` covers the heat-map data (per-date free counts within the request's windows, organizers only), the popup's contents, proposing from the calendar's ticks, and the schedule page's separated and renamed organizer controls.
- `./bin/check all` passes and the CI/CD `check` job is green on the phase's pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, as an organizer, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open a group with at least two members who have entered availability, and open one of its open requests.
    2. Look at the calendar under "When people are free"; tap a darker date, then a lighter one.
    3. In the popups, tick two times on different dates, then press "Propose selected".
    4. Switch to List and back.
    5. Open the group's Schedule; on a proposed rehearsal tap Yes, then look at the organizer controls.
  - **What to look for.**
    - Darker dates are the ones more people can make; the popup lists each free time with who is free.
    - Both ticked times appear as proposed rehearsals.
    - On the schedule, your Yes shows as saved straight away, and the organizer's confirm is clearly separate and says it confirms the rehearsal for everyone.
  - **Variations to explore.** A date nobody can make (unshaded, nothing to tick); a member who isn't an organizer sees no calendar of who is free and no confirm button.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 19

Pinned by [Phase 19](phase-19.md) and its children: the shadcn/ui neutral look (`project/app/app.css` tokens, `Button`/`buttonVariants`, `Badge`), one primary action per form, 44px targets, the Calendar / List switch pattern from My availability (`project/app/routes/availability.tsx`), the month grid in `project/app/lib/calendar-grid.ts`, readable group addresses (`groupPath`), and delivery through a pull request whose CI `check` must pass; merging deploys.
