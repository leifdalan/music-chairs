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

Settled at phase start (2026-10-03):

- **Feedback: button states plus a short toast.** The pressed button shows "Saving…" with a spinner and is disabled while the change is in flight, then briefly "Saved ✓"; a small message appears at the bottom of the screen naming what happened ("Availability saved", "Answer saved: Yes") and fades after a few seconds. Errors stay until dismissed.
- **Time entry: type or pick from a 15-minute list.** A field that accepts typed times ("9", "9:02", "7pm" all work) and rounds them to the nearest 15 minutes, with a dropdown of times in 15-minute steps; phones keep their native picker. The server also rounds a submitted time to the nearest 15 minutes rather than refusing it, so the same rule holds without JavaScript.

## Acceptance

- `./bin/test project/tests` covers the 15-minute grid end to end (storage, overlap, import, calendar writes), rounding of typed times, and that existing half-hour data still loads.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.

User Demo:

- **Entry point.** Open `https://rehearse.dalan.dev` on a laptop, in a group where you are the organizer, and on your phone as a member of the same group.
- **Suggested inputs.** On the laptop, open **My availability** and add a weekly slot: type `9:02` as the start and `9:52pm` as the end, and save. Open **Schedule**, propose a one-off rehearsal next week from 19:15 to 21:45 picked from the time list, and confirm it. On the phone, answer **Yes** for that date.
- **What to look for.** Typed times round when you leave the field (9:02 becomes 9:00, 9:52pm becomes 9:45pm) and the time list moves in 15-minute steps. Each button shows "Saving…" and then "Saved ✓", and a short message names what happened (availability saved, rehearsal proposed, rehearsal confirmed, answer saved). The schedule's overlap and the confirmed rehearsal show quarter-hour times such as 19:15.
- **Variations to explore.** Pick a time with the phone's native picker. Throttle the laptop's network in the browser's developer tools to see the saving state last longer. Is the feedback noticeable without being in the way?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Technology and constraints" (works well on a phone).
