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

## Acceptance

- `./bin/test project/tests` covers overlap computation, a rule that warns but still allows confirmation, and organizer-only access.
- `./bin/check all` passes.
- User Demo: an organizer picks a time that misses a required member, sees the warning, and confirms anyway. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Rehearsal details", Open question 1, and the third success criterion.
