---
id: "37"
title: "The organizer's next step: a group page that leads with what needs you, and a request page that shows each step when it's needed"
depends_on: ["36"]
informs: []
---

# Phase 37 — The organizer's next step: a group page that leads with what needs you, and a request page that shows each step when it's needed

**Goal**: an organizer always knows the one thing to do next, on the group page and on an availability request.

## Deliverables

- The organizer's group page opens with what needs them: a "Needs you" block under the title with the one most useful action in indigo (for example "Confirm a time for Winter concert" or "Add your times to Spring tour"), and the rest as plain links; the invite's Copy link is no longer the page's only primary button once the band has members, and statuses say whose ("Your times: not given", not a bare "Not yet").
- The organizer's availability request page follows the order of the job: who is free first; the location, notes and Propose controls appear only once a time is ticked (Propose can't be pressed with nothing ticked; without JavaScript the form stays reachable); the organizer's own times are raised when they haven't given them; the per-member "Preferred number of rehearsals" line becomes one summary.
- Switching the free times between Calendar and List keeps the ticks not yet proposed (the warning that they're cleared goes).
- Tests cover the new group-page action choice, the request page's step order without JavaScript, and ticks surviving the view switch; the browser gate checks the organizer's path on phone and laptop.

## Decisions (operator, 2026-10-13)

From the Impeccable critique and audit of 2026-10-13 (`.impeccable/critique/2026-10-13T07-24-02Z__app.md`: critique 27/40, audit 15/20) and the operator's answers: the organizer's next step first, then one look for failures, a calmer schedule, and the accessibility fixes with every smaller observation (scope: everything); Delete stays red now that red also means a failed save.

Ruling at phase start (operator, 2026-10-13), the recommended option:

- **Propose only:** ticking a free date on the request page leads to Propose, as today; members still answer on the schedule before the organizer confirms. No "Confirm now" on the request page.

## Acceptance

- Each deliverable's tests pass in `./bin/test project/tests`; the browser gate named in the plan passes on the built app.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** Open the site:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. As an organizer, open your group's page.
    2. Open an availability request with answers, tick a free date, then switch between Calendar and List.
  - **What to look for.**
    - The group page's first thing is what needs you, with one clear button.
    - The request page shows the propose form only after you tick a time, and the ticks survive the switch.
  - **Variations to explore.** Phone and laptop; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
