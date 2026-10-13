---
id: "39"
title: "A calmer schedule: proposed rehearsals that ask one thing, and confirming kept apart from deleting"
depends_on: ["38"]
informs: []
---

# Phase 39 — A calmer schedule: proposed rehearsals that ask one thing, and confirming kept apart from deleting

**Goal**: the schedule is quick to read and answer on a phone, and confirming can't be confused with deleting.

## Deliverables

- A proposed rehearsal on the schedule shows a member what they need to answer: the date, the place, the notes and Yes / No / Maybe, without repeating its request or its counts.
- An organizer's controls on a proposed rehearsal are one row with "Confirm for everyone" and the rest (Edit notes, Share a link, Delete) together and away from it.
- The confirmed rehearsal's card states its date once; "No one has answered yet" and "0 yes · 0 no · 0 maybe" are not both shown.
- Tests cover what members and organizers see on a proposed and a confirmed rehearsal; the browser gate checks the schedule's length on a phone and that the page still doesn't jump (Phase 33).

## Decisions (operator, 2026-10-13)

From the Impeccable critique and audit of 2026-10-13 (`.impeccable/critique/2026-10-13T07-24-02Z__app.md`: critique 27/40, audit 15/20) and the operator's answers: the organizer's next step first, then one look for failures, a calmer schedule, and the accessibility fixes with every smaller observation (scope: everything); Delete stays red now that red also means a failed save.

## Acceptance

- Each deliverable's tests pass in `./bin/test project/tests`; the browser gate named in the plan passes on the built app.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** Open the site:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On your phone, open the schedule of a group with several proposed rehearsals.
    2. As an organizer, confirm one and open another's menu.
  - **What to look for.**
    - Each proposed rehearsal is quick to read and answer.
    - Confirm and Delete are clearly apart.
  - **Variations to explore.** Phone and laptop; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
