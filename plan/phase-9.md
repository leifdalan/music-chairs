---
id: "9"
title: "Scheduling requests: date span, preset times of day and rehearsal limits"
depends_on: ["8"]
informs: ["10"]
---

# Phase 9 — Scheduling requests: date span, preset times of day and rehearsal limits

**Goal**: an organizer asks the band for availability over a date span at one or more preset times of day, members answer with that request shaping their availability (including how many rehearsals they can manage), and a request or a time that worked can be repeated for later dates.

## Deliverables

- A scheduling request on a group: a date span and one or more preset times of day (for example weeknights 19:00–22:00 and Saturdays 10:00–13:00), created and edited by an organizer.
- Members see the open request; it pre-fills and shapes their availability entry, which stays open-ended and freely editable.
- A per-member, per-request limit: "any and all" by default, or "no more than N rehearsals" in the span, shown to the organizer with the responses.
- The organizer sees who has responded and each member's limit alongside the overlap, when choosing times.
- Repeating: a past request, or a rehearsal time that worked, can be started again for future dates with its settings, from persistent UI that shows those past choices.

## Decisions (operator, 2026-10-03)

Settled when the operator listed UX changes after Phase 7:

- **Requests pre-fill open-ended availability.** Availability stays per member and open-ended; a request does not replace it. Members can change their availability freely.
- **The band is reused for every request.** No separate contact list: the group's members are the people asked each time.
- **Presets:** an organizer can preset any number of intended times of day; they constrain the member's availability entry ([Phase 10](phase-10.md)).
- **Rehearsal limit:** optional, default "any and all"; the expanded option is a frequency limit such as "no more than 2 rehearsals" in the request's span, conveyed to the organizer.
- **Past choices:** persistent UI reflects past choices (a rehearsal time that worked), and the organizer can repeat a request for future dates only.

Settled at phase start (2026-10-03):

- **Several requests can be open at once** in a group (for example a concert run and regular rehearsals); members choose which one they are answering, so each request has a name.
- **A preset is a time window only** (for example 19:00–22:00), applying to every day in the request's span; a request has one or more.
- **Members answer explicitly.** A member opens a request, adjusts their availability (pre-filled from its span and time windows), sets their rehearsal limit, and presses "Send my answer"; the organizer sees who has answered and when, and members can update their answer.
- **Repeat both ways.** "Repeat request" starts a new request with the same name, time windows and span length, beginning the day after the old one ends, editable before sending; and each past confirmed rehearsal offers "Propose again", pre-filling the propose form with its weekday, time and place for a future date.

## Inherited from Phase 8

Pinned by [Phase 8](phase-8.md): every time is on a 15-minute grid (`STEP_MINUTES` in `project/app/lib/availability.ts`), and typed times go through `parseTimeText`, which rounds to the nearest quarter hour; enter times with `TimeField` (and a shared `QuarterHours` list when a page has many). Every changing form uses `SubmitButton` with a stable `feedbackKey`, and every successful action ends with `redirectWithToast` (`project/app/.server/flash.ts`) naming what happened; refusals use `ProblemAlert`. The schema is at version 4; new tables or columns are migration 5 onward.

## Acceptance

- `./bin/test project/tests` covers creating, editing and repeating requests, presets, the limit and what the organizer sees, with a migration test for the new tables.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.

User Demo:

- **Entry point.** Open `https://rehearse.dalan.dev` on a laptop as the organizer of a group, and on your phone as a member of the same group.
- **Suggested inputs.** As organizer, start a request named `November concert` covering the next four weeks with two time windows, 19:00–22:00 and 10:00–13:00, and a second request named `Weekly rehearsals` covering the next eight weeks with 18:00–21:00. On the phone, open `November concert`, add an evening of availability from the pre-filled times, choose "no more than 2 rehearsals", and press **Send my answer**.
- **What to look for.** Both requests are listed for the member, who picks one to answer. The availability form opens with the request's dates and times filled in. The organizer sees, for `November concert`, that you answered (with the time) and your limit of 2, beside the overlap within its span; the other request shows no answer from you yet. On the organizer's laptop, **Repeat request** on `November concert` opens a new request starting the day after it ends, with the same windows and length, to adjust and send.
- **Variations to explore.** Change your answer and limit on the phone and see the organizer's view update. Once a confirmed rehearsal is in the past, use **Propose again** on it and check the propose form is filled with its weekday, time and place for a future date. Is it clear on a phone which request you are answering?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Choosing rehearsal times".
