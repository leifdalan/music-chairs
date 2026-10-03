---
id: "10"
title: "Availability in calendar and list views, with live Google Calendar conflicts"
depends_on: ["9"]
informs: ["11"]
---

# Phase 10 — Availability in calendar and list views, with live Google Calendar conflicts

**Goal**: entering availability is quick on a phone: a calendar where several dates can be picked at once and given the same times (shaped by the organizer's preset times of day), with clashes from the member's Google Calendar greyed out but still selectable, plus a list view with visual date and time pickers; "My times" can be seen either way.

## Deliverables

- A calendar view, the default: multi-select dates, apply one set of times to all of them, offered within the open request's preset times of day ([Phase 9](phase-9.md)).
- Live Google Calendar conflicts: for a member with free/busy access, clashing days or times are greyed out each time the view opens, but can still be chosen as an override. This replaces the separate import page of [Phase 7](phase-7.md).
- A list view for entering days, with a visual date picker and the time picker of [Phase 8](phase-8.md).
- "My times" shown as a calendar or a list.

## Decisions (operator, 2026-10-03)

Settled when the operator listed UX changes after Phase 7:

- Calendar view is the default; list view is the alternative; both for entering availability and for "My times".
- Multi-select dates sharing the same times; the times offered follow the organizer's preset times of day.
- Google Calendar conflicts are checked live each time the view opens; conflicting days are greyed out but selectable as an override.
- Visual date and time pickers everywhere, including desktop.

## Inherited from Phase 8

Pinned by [Phase 8](phase-8.md): every time is on a 15-minute grid (`STEP_MINUTES` in `project/app/lib/availability.ts`), and typed times go through `parseTimeText`, which rounds to the nearest quarter hour; enter times with `TimeField` (and a shared `QuarterHours` list when a page has many). Every changing form uses `SubmitButton` with a stable `feedbackKey`, and every successful action ends with `redirectWithToast` (`project/app/.server/flash.ts`) naming what happened; refusals use `ProblemAlert`. The schema is at version 4; new tables or columns are migration 5 onward.

## Inherited from Phase 9

Pinned by [Phase 9](phase-9.md): a group has named scheduling requests (`requests`, `request_windows`, `request_answers`; schema at version 5, so new tables or columns are migration 6 onward). A request has a date span and one or more time windows (`TimeWindow` in `project/app/lib/requests.ts`, minutes after midnight on the 15-minute grid), looked up only within its group by `findRequest`. Today a request's "Add" link opens `/g/<group>/availability?request=<id>&window=<i>`, pre-filling a weekly time over the rest of the span at that window, and saving returns to the request by its stored id; the calendar view replaces this entry while keeping requests scoped to the group. Members answer explicitly with an optional rehearsal limit; who answered, when, and each limit are shown to organizers only.

## Acceptance

- `./bin/test project/tests` covers multi-date entry, preset constraints, conflict marking from a faked free/busy answer and overriding it, and both views of "My times".
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: on a phone, open My availability during an open request, pick several evenings in the calendar view, give them the same times, see a day that clashes with your Google Calendar greyed out and override it, then switch "My times" between calendar and list. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability" (including Google Calendar import), "Technology and constraints" (works well on a phone).
