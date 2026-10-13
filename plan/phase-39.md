---
id: "39"
title: "A calmer schedule: proposed rehearsals that ask one thing, and confirming kept apart from deleting"
depends_on: ["38"]
informs: []
---

# Phase 39 — A calmer schedule: proposed rehearsals that ask one thing, and confirming kept apart from deleting

**Goal**: the schedule is quick to read and answer on a phone, proposed rehearsals can be answered from a calendar, and confirming can't be confused with deleting.

## Deliverables

- The schedule shows proposed rehearsals as a Calendar (the default) or a List, for members and organizers alike. In the calendar, each date with a proposed rehearsal opens a popup with the rehearsal's time, place and notes and Yes / No / Maybe / Clear for the viewer's own answer; an organizer's popup also carries the organizer's controls (below). The List is the proposed rehearsals as cards. Both views work without JavaScript.
- A "Yes to all" button at the top of the proposed rehearsals answers Yes to every proposed rehearsal the viewer hasn't answered yet; answers already given are left as they are. It isn't offered when nothing is left unanswered.
- A proposed rehearsal (in the List and in a date's popup) shows a member what they need to answer: the date, the place, the notes and Yes / No / Maybe, without repeating its request or its counts.
- An organizer's controls on a proposed rehearsal are one row with "Confirm for everyone" and the rest (Edit notes, Share a link, Delete) together and away from it.
- The confirmed rehearsal's card states its date once; "No one has answered yet" and "0 yes · 0 no · 0 maybe" are not both shown.
- Tests cover what members and organizers see on a proposed and a confirmed rehearsal, the Calendar/List choice without JavaScript, answering from a date's popup, and "Yes to all" leaving given answers alone; the browser gate checks the schedule's length on a phone, answering from the calendar popup and "Yes to all" on phone and laptop, and that the page still doesn't jump (Phase 33).

## Decisions (operator, 2026-10-13)

From the Impeccable critique and audit of 2026-10-13 (`.impeccable/critique/2026-10-13T07-24-02Z__app.md`: critique 27/40, audit 15/20) and the operator's answers: the organizer's next step first, then one look for failures, a calmer schedule, and the accessibility fixes with every smaller observation (scope: everything); Delete stays red now that red also means a failed save.

Added by the operator (2026-10-13), with the recommended options:

- Proposed rehearsals on the schedule as a Calendar (default) or a List, each calendar date opening a popup with Yes / No / Maybe / Clear, and a button at the top to answer them all.
- **"Yes to all unanswered":** the button answers Yes to every proposed rehearsal the viewer hasn't answered; given answers stay. (Members don't confirm rehearsals; organizers' "Confirm for everyone" stays per rehearsal.)
- **Folded into this phase**, since it reshapes the same cards; the order stays 38 → 39 → 40.
- **Everyone** gets the Calendar/List view; organizers' Confirm and the rest sit in a date's popup and in the List.

## Acceptance

- Each deliverable's tests pass in `./bin/test project/tests`; the browser gate named in the plan passes on the built app.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** Open the site:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On your phone, open the schedule of a group with several proposed rehearsals: it shows them on a calendar.
    2. Tap a proposed date and answer it in the popup; then press "Yes to all"; switch to List.
    3. As an organizer, confirm one and open another's menu.
  - **What to look for.**
    - Each proposed rehearsal is quick to read and answer, from the calendar or the list.
    - "Yes to all" answers only what you hadn't answered.
    - Confirm and Delete are clearly apart.
  - **Variations to explore.** Phone and laptop; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
