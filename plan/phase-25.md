---
id: "25"
title: "The confirm moment: one calm warning, a quieter delete, and local date formats"
depends_on: ["24"]
informs: ["26"]
---

# Phase 25 — The confirm moment: one calm warning, a quieter delete, and local date formats

**Goal**: confirming a rehearsal reads as a decision, not an error, and dates read the way the group writes them.

## Deliverables

- Missing-member warnings on a proposed rehearsal collapse into one summary per set of missing people, in one status region (no longer one live region per date); amber, not red; red reserved for destructive actions.
- Delete on a proposed rehearsal is a quieter destructive control set apart from "Confirm for everyone", using the `outline-destructive` variant Phase 21 introduced.
- (Dropped at phase start by the operator: dates and calendars stay as they are.)
- The signed-in home page drops the product pitch (kept for visitors).

## Decisions (operator, 2026-10-05)

From the Impeccable critique's P2 "Confirming happens under a red wall" and the audit's P1 live-region finding and P3 date-format finding. The operator asked earlier for fewer confirmation steps, so the confirm stays one tap with an inline summary.

Ruling at phase start (operator, 2026-10-06): dates and month calendars stay as they are (Sunday-first weeks, "Tue 6 Oct", the phone's own date pickers); the date-format deliverable is dropped from this phase. "Signed-in home page" is read as a visitor who already has a group or a Google account; the pitch stays for newcomers.

## Acceptance

- `./bin/test project/tests` covers the summary, the single status region, the delete control and the home page with and without the pitch.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, signed in as an organizer of a group with a proposed rehearsal that some required member isn't free for on one or more dates, open the group's schedule from:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Find the proposed rehearsal on the schedule and read its "For organizers" area.
    2. Tap "Confirm for everyone".
    3. Open the home page; then open it in a private window.
  - **What to look for.**
    - The missing members read as one calm (amber, not red) summary per set of people, such as "Oboe and Harpist aren't free on 8 dates, Tue 6 Oct to Tue 24 Nov", not one red line per date.
    - Delete is an outlined red button set apart from "Confirm for everyone"; confirming is still one tap.
    - The home page you use has no "What music-chairs does" pitch; the private window (a newcomer) still shows it.
  - **Variations to explore.** Different people missing on different dates (one summary for each set); a screen reader reading the warnings once, not once per date.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".

## Inherited from Phase 24

Pinned by [Phase 24](phase-24.md): user-facing names are "availability request(s)" and "proposed rehearsal(s)" (never "proposal"); new copy follows them. Each proposed card on the schedule (`RehearsalCard` in `project/app/routes/schedule.tsx`) now starts with its summary, place, "From {request}" and "{n} of {m} answered", carries `id="rehearsal-{id}"` (linked from the request page, group page and home), and keeps "Your answer" and the organizers' warnings, Confirm and Delete below — the area this phase reworks. The group page leads with "Upcoming rehearsals" (confirmed dates from today), and the schedule ends with "Rehearsals in your calendar".
