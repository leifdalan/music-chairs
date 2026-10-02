---
id: "4"
title: "Confirmed rehearsals for members, with RSVP"
depends_on: ["3"]
informs: ["5", "7"]
---

# Phase 4 — Confirmed rehearsals for members, with RSVP

**Goal**: members see the times the organizer has proposed and confirmed, and can optionally answer yes, no or maybe to each, so the organizer knows who is coming. With this phase the whole scheduling loop works for name-only members.

## Deliverables

- A member-facing list of proposed and confirmed rehearsals with time, location and RSVP state.
- Yes / no / maybe RSVP on proposed and confirmed dates, changeable later, with a summary for organizers.
- A decision on whether a read-only calendar feed (ICS) is offered to name-only members now or in [Phase 7](phase-7.md) (brief, Open question 5).
- Tests for RSVP state changes and the member views.

## Acceptance

- `./bin/test project/tests` covers RSVP changes and what each role sees.
- `./bin/check all` passes.
- User Demo: two members RSVP differently to a confirmed rehearsal and the organizer sees both answers. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times" (optional RSVP), the fourth success criterion, Open question 5.
