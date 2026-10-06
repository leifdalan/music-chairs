---
id: "21"
title: "Organizer layout: the request, group, schedule and groups pages put the main job first"
depends_on: ["20"]
informs: ["22", "23", "24", "25"]
---

# Phase 21 — Organizer layout: the request, group, schedule and groups pages put the main job first

**Goal**: an organizer reaches the decision each page exists for without scrolling past other people's chores: the heat map leads the request page, the group page shows members rather than a wall of controls, the schedule page ends, and the Groups page offers one clear way into each group.

## Deliverables

- Request page, for organizers: "When people are free" (calendar or list) comes first after the request's title and dates; a running count of ticked times ("2 times ticked") sits beside "Propose selected", with the rehearsal length and location next to it; the organizer's own times in the span collapse to one line with a disclosure; everyone's answers collapse to "N of M answered" with a disclosure; Edit, Close and Repeat move into one request menu.
- Group page: each member row shows the name, instrumentation and badges (organizer, optional); a member's actions (rename, required/optional, organizer, remove) open from that row, with Remove as a quieter destructive button; the group's settings and Delete group sit in a collapsed "Group settings" disclosure; the invite card comes first while the group has fewer than two members, after the members otherwise.
- Schedule page: the day-by-day "When people are free" list no longer repeats in full under the rehearsals; it collapses behind a disclosure.
- Groups page: each group card offers the group (its name), Schedule and My availability, and "Manage this group"; the separate "Group page" button goes.

## Decisions (operator, 2026-10-05)

From the operator's Impeccable site-wide critique and audit (2026-10-05: critique 27/40, audit 16/20; the report was delivered in the conversation and its snapshot kept locally in `.impeccable/critique/`, which is not committed because it records a machine path; the findings this phase answers are quoted here), and the operator's answers "1b, 2b, 3c": organizer layout first; give the app some identity (Phase 24); address everything including the minor items (Phases 21–25). The critique's P1 issues this phase answers: "The organizer's decision tool is buried on the request page", "The group page is a wall of member controls", and its P2 "The schedule page has no end" and minor "The Groups page offers four routes into one group". Members' wording ("Your answer", adding availability) is Phase 22; the confirm moment and warnings are Phase 23; colour, wordmark and type are Phase 24.

Readings recorded at phase start (the operator may override before planning ends): the request menu and the member actions are disclosures that work without JavaScript, like the profile menu; the schedule's free list collapses rather than disappearing, because it covers dates no request asks about.

## Acceptance

- `./bin/test project/tests` covers the request page's order for organizers and members, the ticked-times count's markup, the collapsed own-times and answers summaries, the request menu, the group page's member rows and per-member actions, the collapsed settings, the invite card's position by group size, the schedule's collapsed free list, and the Groups page's links.
- `./bin/check all` passes and the CI/CD `check` job is green on the phase's pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, as an organizer, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open one of your group's open requests.
    2. Tick two times in the calendar's date panels.
    3. Open the request menu.
    4. Open the group page and open one member's actions.
    5. Open the group's Schedule and scroll to the end.
    6. Open the Groups page.
  - **What to look for.**
    - The calendar of who is free is the first thing under the request's title; the count beside "Propose selected" reads "2 times ticked"; your own times and the answers are one line each until opened; Edit, Close and Repeat are in the menu.
    - Member rows are calm (name, instrument, badges); a member's actions appear only after opening that member; Delete group is inside "Group settings".
    - The schedule ends soon after the rehearsals.
    - Each group on the Groups page has one link to the group, plus Schedule, My availability and "Manage this group".
  - **Variations to explore.** A member who isn't an organizer opening the same request (their own answer and times still come first for them); a group with one member (the invite card leads).

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 20

Pinned by [Phase 20](phase-20.md): the request page's Calendar / List views (`FreeCalendar`, `FreeStretch`, the `free=list` switch and redirects), the schedule card's "Your answer" and "For organizers" areas, `useSwitch`/`Switch` in `project/app/components/view-switch.tsx`, and delivery through a pull request whose CI `check` must pass; merging deploys.
