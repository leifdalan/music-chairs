---
id: "23"
title: "The confirm moment: one calm warning, a quieter delete, and local date formats"
depends_on: ["22"]
informs: ["24"]
---

# Phase 23 — The confirm moment: one calm warning, a quieter delete, and local date formats

**Goal**: confirming a rehearsal reads as a decision, not an error, and dates read the way the group writes them.

## Deliverables

- Missing-member warnings on a proposed rehearsal collapse into one summary per set of missing people, in one status region (no longer one live region per date); amber, not red; red reserved for destructive actions.
- Delete on a rehearsal is a quieter destructive control set apart from "Confirm for everyone". The same goes for My availability's per-time Delete (still a solid red button after Phase 21); both use the `outline-destructive` variant Phase 21 introduced.
- Date inputs and month calendars follow the group's locale conventions (day-month order; weeks starting Monday where the group's zone implies it), consistent with "Tue 6 Oct".
- The signed-in home page drops the product pitch (kept for visitors).

## Decisions (operator, 2026-10-05)

From the Impeccable critique's P2 "Confirming happens under a red wall" and the audit's P1 live-region finding and P3 date-format finding. The operator asked earlier for fewer confirmation steps, so the confirm stays one tap with an inline summary. To be tightened at phase start.

## Acceptance

- `./bin/test project/tests` covers the summary, the single status region, the delete control and date formatting.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".
