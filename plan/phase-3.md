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
- Optional-member tags (everyone else counts as required), with warnings shown before and after confirming; warnings never block. Role rules are deferred (Decisions).
- Proposing and confirming rehearsals, one-off and recurring, with a free-text location (no venue management).
- Organizer-only authority over these actions, including more than one organizer per group.
- Tests for overlap computation, rule evaluation and the confirm flow.

## Decisions (operator, 2026-10-02)

Settled at phase start:

- **Availability privacy is a group setting** (brief, Open question 1). The organizer chooses whether members see the combined overlap as counts only ("4 of 6 free") or with names. Counts is the default for a new group. Organizers always see who is free and who is missing.
- **Everyone is required unless tagged optional.** Instead of marking members as required, an organizer can tag a member as optional. A chosen time warns when any member who is not optional is unavailable; the warning never blocks confirming.
- **Role rules are deferred.** Rules such as "at least one of our two keyboardists" are not part of this phase (see the deferred-work note in `plan/INDEX.md`).
- **Proposed, then confirmed.** Organizers add rehearsal times as proposed (visible to members, so Phase 4 can collect RSVPs) and confirm them later. Warnings show when proposing and when confirming.
- **Recurring rehearsals work like availability.** Weekly from a first date, until ended or an optional last date, with single dates cancellable.

## Inherited from Phase 2

Pinned by [Phase 2](phase-2.md) (see its Decisions section):

- **One time zone per group.** `groups.time_zone` holds a canonical IANA name; all availability dates and times are wall-clock values in that zone. Overlap is computed on those wall-clock values; no zone conversion is needed within a group.
- **Availability model.** `project/app/.server/store.ts` stores member slots (`availability`: one-off or weekly from `start_date`, optional inclusive `end_date`, `start_minute`/`end_minute` on a 30-minute grid, end up to 1440 for midnight) and whole-date skips (`availability_skips`). The store reads slots per member (`listSlots(memberId)`); a group-wide read for the overlap view is new work here.
- **Expansion.** `expandOccurrences(slots, from, to)` in `project/app/lib/availability.ts` turns slots into dated occurrences (skips removed, end dates inclusive, host zone irrelevant); overlap and recurring rehearsals should reuse it rather than re-implement recurrence. `todayInZone` and `UPCOMING_WEEKS` (8) define the listing horizon used so far.
- **Privacy so far.** Each member currently sees only their own availability (`/g/:groupId/availability`); Open question 1 remains this phase's decision.
- **Viewer resolution.** `findViewer(request, group)` in `project/app/.server/membership.ts` is the one way to resolve the current member; organizer-only actions should check its `role`.

## Acceptance

Executable:

- `./bin/test project/tests` covers overlap computation, a missing non-optional member that warns but still allows confirmation, the privacy setting (counts versus names for members; names for organizers), and organizer-only access.
- `./bin/check all` passes.

User Demo:

- **Entry point.** Start from a fresh database: stop any running server, move or delete `project/data/`, then `cd project && corepack pnpm run dev --host` and open the network URL on a phone (or a browser narrowed to about 375 px).
- **Suggested inputs.** Create a group as organizer and join it in two private windows as `Cellist` and `Pianist`. Give the organizer and `Cellist` weekly availability on Thursdays 19:00–22:00; give `Pianist` none on Thursdays. Tag `Pianist` as optional, then untag them again. As organizer, propose next Thursday 19:30–21:30 with location `Studio B`, then confirm it.
- **What to look for.** The overlap view shows Thursday evening as 2 of 3 free; with `Pianist` not optional, proposing and confirming show a warning that `Pianist` is unavailable, and confirming still works; with `Pianist` optional, no warning. Members see counts only until the organizer switches the group to show names. Only organizers see the propose, confirm and settings controls.
- **Variations to explore.** Propose a weekly rehearsal and cancel one date. Switch the privacy setting and look again from a member window. Is the overlap view readable at phone width?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Rehearsal details", Open question 1, and the third success criterion.
