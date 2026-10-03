---
id: "8"
title: "Feedback on every action, and 15-minute times with a friendlier time picker"
depends_on: ["7"]
informs: ["9", "10"]
---

# Phase 8 — Feedback on every action, and 15-minute times with a friendlier time picker

**Goal**: every button press that changes something visibly confirms it (working, then done), and every time the app asks for uses 15-minute steps through a time picker that works well on desktop and rounds what people type instead of refusing it.

## Deliverables

- Pending and completed states on every submitting control, and a visible confirmation after each change (saved availability, answers, proposals, confirmations, settings), app-wide.
- 15-minute steps everywhere a time is entered or stored: availability, rehearsal times, and the presets of [Phase 9](phase-9.md). Existing half-hour data stays valid; the schema's half-hour checks are relaxed by migration.
- One time-entry control used across the app: a visual picker on desktop (phones keep their native picker), rounding a typed time to the nearest 15 minutes (9:02 becomes 9:00) instead of rejecting it.
- Overlap, free/busy import and calendar writing follow the 15-minute grid.

## Decisions (operator, 2026-10-03)

Settled when the operator listed UX changes after Phase 7:

- React Router updates so quickly that a change gives no sign it happened; buttons need loading and completed states, and every change needs positive visual feedback.
- 15-minute increments everywhere (availability, presets and rehearsal times); typed times round to the nearest step rather than being refused.
- A visual time picker wherever a time is entered, including desktop.
- The wider visual cleanup waits until after Phases 8–10 (Phase 11).

## Acceptance

- `./bin/test project/tests` covers the 15-minute grid end to end (storage, overlap, import, calendar writes), rounding of typed times, and that existing half-hour data still loads.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: on a phone and on a laptop, add availability with a typed time like 9:02 (it becomes 9:00), save, answer a rehearsal and confirm one, and see each action acknowledged. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Technology and constraints" (works well on a phone).
