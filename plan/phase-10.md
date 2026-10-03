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

Added by the operator on 2026-10-03, after Phase 9:

- **Imported times stay inside the request.** "The imported dates for availability should only fall within the proposed time": whatever is brought in from Google Calendar for a request (free times offered, or conflicts shown) covers only that request's date span and time windows, never times outside them.

Settled at phase start (2026-10-03):

- **Picked dates are one-off times.** Several dates picked in the calendar with the same times each become their own one-off availability; weekly repeats remain available as "every week" in the list view.
- **Conflicts grey a day when Google shows anything busy during the chosen times** (or, while answering a request, during its time windows); tapping a greyed day still selects it, as an override.
- **A tap grid for times, everywhere.** Times are chosen on a grid of hour rows split into four quarter-hour cells: tap a start cell and an end cell (or drag) to mark a range, with typing kept as a small fallback. It replaces the Phase 8 time field on every page that asks for a time (availability, request windows, the propose form), on phones and desktops alike.
- **Without an open request, the calendar offers any times.** Members pick dates and mark any times on the grid, as they can today; while answering a request, the grid offers that request's time windows.

## Inherited from Phase 8

Pinned by [Phase 8](phase-8.md): every time is on a 15-minute grid (`STEP_MINUTES` in `project/app/lib/availability.ts`), and typed times go through `parseTimeText`, which rounds to the nearest quarter hour; enter times with `TimeField` (and a shared `QuarterHours` list when a page has many). Every changing form uses `SubmitButton` with a stable `feedbackKey`, and every successful action ends with `redirectWithToast` (`project/app/.server/flash.ts`) naming what happened; refusals use `ProblemAlert`. The schema is at version 4; new tables or columns are migration 5 onward.

## Inherited from Phase 9

Pinned by [Phase 9](phase-9.md): a group has named scheduling requests (`requests`, `request_windows`, `request_answers`; schema at version 5, so new tables or columns are migration 6 onward). A request has a date span and one or more time windows (`TimeWindow` in `project/app/lib/requests.ts`, minutes after midnight on the 15-minute grid), looked up only within its group by `findRequest`. Today a request's "Add" link opens `/g/<group>/availability?request=<id>&window=<i>`, pre-filling a weekly time over the rest of the span at that window, and saving returns to the request by its stored id; the calendar view replaces this entry while keeping requests scoped to the group. Members answer explicitly with an optional rehearsal limit; who answered, when, and each limit are shown to organizers only.

## Acceptance

- `./bin/test project/tests` covers multi-date entry (one one-off time per picked date), preset constraints (only the request's dates and windows offered from Google), conflict marking from a faked free/busy answer and overriding it, the time grid's values (quarter-hour ranges, the typed fallback, every form that asks for a time), and both views of "My times".
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.

User Demo:

- **Entry point.** On your phone, open `https://rehearse.dalan.dev` as a member of a group, signed in with the Google account whose calendar you use, with an open request (for example `November concert`, 19:00–22:00 and 10:00–13:00). Beforehand, put one event in that Google Calendar on an evening inside the request's span, for example 20:00–21:00 on the second Tuesday.
- **Suggested inputs.** From the request, open My availability. In the calendar view, tap three evenings, including the day of your event, choose the 19:00–22:00 window on the time grid, and save. Then switch to the list view, add one more date with the date picker and mark 18:30–20:15 on the grid by tapping (or dragging). Finally switch "My times" between calendar and list.
- **What to look for.** The calendar shows the request's dates; your event's day is greyed and still selectable; the time grid offers the request's windows; saving adds a one-off time per picked date; nothing outside the request's dates and times is offered from Google. On a laptop, the propose form and the request form also use the time grid. "My times" shows the same times either way.
- **Variations to explore.** Open My availability with no open request and mark any times. Try the grid with a mouse on a laptop and with your thumb on a phone. Is the grid easy to hit at phone size?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability" (including Google Calendar import), "Technology and constraints" (works well on a phone).
