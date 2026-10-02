---
id: "3"
title: "Combined availability and confirming rehearsal times"
depends_on: ["2"]
informs: ["4", "7"]
---

# Phase 3 — Combined availability and confirming rehearsal times

**Goal**: an organizer sees the group's combined availability and where it overlaps, picks one or more rehearsal dates and times (one-off or recurring), adds a free-text location, and confirms them. Members marked as required, and role rules such as "at least one of our two keyboardists", produce a warning when a chosen time misses them, and never block confirmation.

## Deliverables

- An overlap view of the group's availability that works at phone width.
- A decision on availability privacy (brief, Open question 1): what members see versus what organizers see.
- Required-member marks and role rules, with warnings shown before and after confirming; rules warn and never block.
- Proposing and confirming rehearsals, one-off and recurring, with a free-text location (no venue management).
- Organizer-only authority over these actions, including more than one organizer per group.
- Tests for overlap computation, rule evaluation and the confirm flow.

## Inherited from Phase 2

Pinned by [Phase 2](phase-2.md) (see its Decisions section):

- **One time zone per group.** `groups.time_zone` holds a canonical IANA name; all availability dates and times are wall-clock values in that zone. Overlap is computed on those wall-clock values; no zone conversion is needed within a group.
- **Availability model.** `project/app/.server/store.ts` stores member slots (`availability`: one-off or weekly from `start_date`, optional inclusive `end_date`, `start_minute`/`end_minute` on a 30-minute grid, end up to 1440 for midnight) and whole-date skips (`availability_skips`). The store reads slots per member (`listSlots(memberId)`); a group-wide read for the overlap view is new work here.
- **Expansion.** `expandOccurrences(slots, from, to)` in `project/app/lib/availability.ts` turns slots into dated occurrences (skips removed, end dates inclusive, host zone irrelevant); overlap and recurring rehearsals should reuse it rather than re-implement recurrence. `todayInZone` and `UPCOMING_WEEKS` (8) define the listing horizon used so far.
- **Privacy so far.** Each member currently sees only their own availability (`/g/:groupId/availability`); Open question 1 remains this phase's decision.
- **Viewer resolution.** `findViewer(request, group)` in `project/app/.server/membership.ts` is the one way to resolve the current member; organizer-only actions should check its `role`.

## Acceptance

- `./bin/test project/tests` covers overlap computation, a rule that warns but still allows confirmation, and organizer-only access.
- `./bin/check all` passes.
- User Demo: an organizer picks a time that misses a required member, sees the warning, and confirms anyway. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Rehearsal details", Open question 1, and the third success criterion.
