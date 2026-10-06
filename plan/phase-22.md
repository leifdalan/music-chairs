---
id: "22"
title: "Times you can read and pick: AM/PM everywhere and an hour bar from 9 AM to midnight"
depends_on: ["21"]
informs: ["23"]
---

# Phase 22 — Times you can read and pick: AM/PM everywhere and an hour bar from 9 AM to midnight

**Goal**: every time the app shows reads the way the band says it ("7:30 PM", not "19:30"), and picking a stretch of the day is one gesture on a bar of hours instead of a tall 24-hour grid.

## Deliverables

- Every time the app displays uses the 12-hour clock with AM/PM: lists, calendars, date panels, cards, warnings, toasts, the home page and form summaries. One shared formatter; the planner settles the exact form (for example "7 PM", "7:30 PM", and ranges such as "7–10 PM") and uses it everywhere. Stored minutes, the calendar feed and Google Calendar events are unchanged.
- A new time-of-day picker replaces `project/app/components/time-range.tsx` (and the typed `time-field.tsx` it wraps) wherever a stretch of the day is picked: availability, a new request's times, and proposing a different time. It is a horizontal bar from 9 AM to midnight with a labelled tick each hour and half-hour steps. Tapping one point and then another picks the stretch between them; pressing and dragging picks it in one movement; the picked stretch reads back in words ("7–10 PM").
- The picker stays usable by keyboard and by screen reader, and fits a phone without sideways scrolling.

## Decisions (operator, 2026-10-06)

From the operator's notes after Phase 21: "Site wide use AM/PM instead of military time" and "I don't love the time of day picker UI. Maybe a horizontal bar that has ticks per hour that you can either click twice or click and drag? We could probably exclude the hours of midnight - 9am to be realistic and make the UI easier." Answers to the follow-up questions: half-hour steps with a labelled tick each hour (3A); this phase goes before the availability-request restructure (Phases 23–24) because it is smaller and every later page builds on it (4B).

Readings recorded at phase start (the operator may override before planning ends): times are stored as before, so only display and input change; a stored time outside 9 AM to midnight still displays correctly and stays as it is unless someone edits it.

## Acceptance

- `./bin/test project/tests` covers the 12-hour formatter (noon, midnight, half hours, ranges across noon), that no route renders a 24-hour time, and the picker's markup and its translation between bar positions and stored minutes.
- `./bin/check all` passes and the CI/CD `check` job is green on the phase's pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, signed in as an organizer of a group with at least one other member, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. From the group, start a new request and, on the time bar, tap 7 PM and then 10 PM.
    2. Clear it, and drag from 6:30 PM to 9 PM instead; create the request.
    3. Open My availability, add a one-off time by dragging 7–10 PM on the bar, and save.
    4. Open the request, tick a time in a date's panel, and propose it; open the group's Schedule; open the home page.
  - **What to look for.**
    - The bar runs from 9 AM to midnight with a label at each hour; after two taps or one drag the picked stretch is highlighted and reads back in words ("7–10 PM", "6:30–9 PM").
    - Every time on the request, schedule, My availability and home pages reads with AM/PM; no "19:00" anywhere.
    - The bar fits the phone's width without sideways scrolling.
  - **Variations to explore.** A stretch ending at midnight; tapping the end first and then the start; a time saved before this phase that starts before 9 AM (it still reads correctly); using the bar with a keyboard on a laptop.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 21

Pinned by [Phase 21](phase-21.md): delivery through a pull request whose CI `check` must pass; merging deploys. `timeRange` and `formatMinutes` live in `project/app/lib/availability.ts`.
