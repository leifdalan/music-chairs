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

## Acceptance

- `./bin/test project/tests` covers recurrence expansion with an exception date, editing and deleting availability, and the chosen time-zone rule.
- `./bin/check all` passes.
- User Demo: a protocol in which a member enters a recurring Thursday slot and one exception on a phone-width screen, then edits it. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Technology and constraints" (phone use), Open questions 2 and 4.
