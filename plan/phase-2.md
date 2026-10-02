---
id: "2"
title: "Availability entry: one-off and recurring"
depends_on: ["1"]
informs: ["3", "7"]
---

# Phase 2 — Availability entry: one-off and recurring

**Goal**: every member of a group, whether name-only or (later) signed in, can enter the times they are available, comfortably on a phone, covering both one-off dates and recurring patterns such as "every Thursday evening", and can change that availability later.

## Deliverables

- An availability model that represents one-off times and recurring patterns, including how a member marks that they cannot make one particular date of a recurring pattern and how long a pattern stays in effect (brief, Open question 2).
- A decision on time zones (brief, Open question 4), recorded in the brief or this phase, and applied consistently to storage and display.
- A mobile-first availability entry screen for the current member, with editing and removal.
- Tests for the model (recurrence expansion, exceptions, boundaries) and for the loaders and actions.

## Decisions (operator, 2026-10-02)

Settled at phase start, answering the brief's Open questions 2 and 4 for v1:

- **Time zones — one zone per group.** Each group has a single IANA time zone, defaulted from the organizer's browser when the group is created. Every member enters and sees availability as wall-clock times in the group's zone, so a weekly "Thursdays 7pm" stays 7pm across daylight-saving changes; a travelling member still sees group-local times.
- **Recurring patterns run until ended.** A weekly pattern applies from its start date until the member ends or deletes it, or until an optional end date they set.
- **Exceptions skip a whole date.** A member marks one date of a weekly pattern as "can't make it", which removes that occurrence; partial availability that day is entered as a separate one-off time.
- **30-minute steps.** Availability is a start and end time on a 30-minute grid, entered with the phone's native time picker.

## Acceptance

Executable:

- `./bin/test project/tests` covers recurrence expansion with an exception date, editing and deleting availability, and the chosen time-zone rule.
- `./bin/check all` passes.

User Demo:

- **Entry point.** `cd project && corepack pnpm run dev --host`, then open the network URL on a phone (or a laptop browser narrowed to about 375 px) and join or open a group from Phase 1.
- **Suggested inputs.** Add a weekly slot: Thursdays 19:00–22:00 starting this week, with no end date. Mark next Thursday as "can't make it". Add a one-off slot: Saturday 14:00–17:00 two weeks from now. Then change the weekly slot to 19:30–22:00 and delete the one-off.
- **What to look for.** The upcoming list shows every Thursday at the new times except the skipped one, and the Saturday slot disappears once deleted; times are labelled with the group's time zone; every control is usable without zooming or sideways scrolling.
- **Variations to explore.** Try an end time before the start time, or a time off the 30-minute grid. Give the weekly slot an end date and confirm later Thursdays disappear. Open the page in a second member's private window: do they see only their own availability?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Technology and constraints" (phone use), Open questions 2 and 4.
