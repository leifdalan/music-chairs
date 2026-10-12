---
id: "33"
title: "A steady page: answering and confirming without the page jumping, and buttons that keep their size"
depends_on: ["32"]
informs: ["34"]
---

# Phase 33 — A steady page: answering and confirming without the page jumping, and buttons that keep their size

**Goal**: pressing a button changes what it should and nothing else moves: the page stays where it was, and the button stays the same size while it says it is saving.

## Deliverables

- Answering Yes / No / Maybe, confirming a proposed rehearsal, and every other in-page action leave the page where it was, with the changed item in view and focus kept sensibly, instead of jumping to the top.
- Every button that shows its progress ("Saving…", "Saved ✓") keeps the same width and height through every state.
- Nothing else on the page shifts while a change is saving or after it saves, beyond the change itself.

## Decisions (operator, 2026-10-12)

From the operator's feedback after Phase 32 ("the page 'jumps' when a user confirms/denies a proposed time, it is really jarring"; "when a button's text changes due to state change 'Saving/Saved' the button size should not change"). Cause found at planning: these actions post a whole form and the server redirects back, so the browser treats the result as a new page and scrolls to the top; the pressed button's text is swapped for its progress text, which has a different width. Order: this phase first, then error states (Phase 34), then the screenshot catalogue (Phase 35).

Ruling at phase start (operator, 2026-10-12), the recommended option:

- **Stay put:** after an action that moves its item (confirming moves a rehearsal from "Proposed" to "Confirmed"; deleting removes it), the page keeps its scroll position; the item appears in its new place and the usual short message confirms the change. Nothing scrolls on its own.

## Acceptance

- `./bin/test project/tests` covers that in-page actions keep the scroll position and that progress buttons render all their labels in one fixed footprint.
- A headless-browser check on the built app measures the scroll position and the pressed button's box before, during and after answering and confirming.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open the schedule of a group with at least two proposed rehearsals further down the page:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Scroll to a proposed rehearsal near the bottom and tap Yes, then No, then Maybe.
    2. As an organizer, confirm a proposed rehearsal.
    3. On an availability request, change your preferred number of rehearsals and save notes on a rehearsal.
  - **What to look for.**
    - The page stays where you were after each tap; nothing jumps to the top.
    - Buttons don't grow or shrink while they say "Saving…" or "Saved ✓".
  - **Variations to explore.** A slow connection; landscape; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Optional RSVP".
