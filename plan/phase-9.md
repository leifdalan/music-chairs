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

## Acceptance

- `./bin/test project/tests` covers creating, editing and repeating requests, presets, the limit and what the organizer sees, with a migration test for the new tables.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: as organizer, ask for availability in the next month on weeknight evenings and Saturday mornings; as a member, answer with a limit of 2 rehearsals; as organizer, see the response and limit and confirm times; then repeat the request for the following month. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Choosing rehearsal times".
