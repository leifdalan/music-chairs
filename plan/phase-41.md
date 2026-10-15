---
id: "41"
title: "Popups that get out of the way: a compact date popup that closes on answering, and every popup closing on a tap outside"
depends_on: ["40"]
informs: []
---

# Phase 41 — Popups that get out of the way: a compact date popup that closes on answering, and every popup closing on a tap outside

**Goal**: answering a proposed date on a phone is one tap, and no popup stays in the way.

## Deliverables

- A proposed date's popup on the schedule says the date once (its heading), and each rehearsal in it shows only what differs: the time, the place, the notes and the answers.
- The organizer's version of that popup is compact enough for a phone: its facts, the answers and its controls (Confirm for everyone, More) take noticeably less height, with nothing an organizer needs removed.
- Tapping Yes, No or Maybe in a date's popup saves the answer and closes the popup (the date's mark shows the new answer); a date with two proposals closes once both are answered. The Done button goes.
- Every popup, menu and dialog goes away on a tap or click outside it: the schedule's and the request page's date popups (proposed rehearsals and who is free), the profile menu, the request page's Options menu, and the confirm dialogs. Without JavaScript they still close the way they do today.
- Tests cover the single date, closing on answer and closing on click-away; the browser gate measures the organizer's popup height on a phone before and after, and checks closing on answer and on click-away at phone and laptop widths.

## Decisions (operator, 2026-10-15)

From the operator's feedback on the live site: the answer popup says the date twice on mobile; the organizer's popup takes up too much of the phone screen; get rid of "Done" and have it go away as soon as the user clicks; all dialogues should go away on click away.

Rulings (recommended options): the popup closes after answering (and on a tap outside), with no Done button; a date with two proposals closes once both are answered. This is its own small phase now; the paused next focus (the heat map's booked dates and the second audit's accessibility gaps) follows after it.

## Acceptance

- Each deliverable's tests pass in `./bin/test project/tests`; the browser gate named in the plan passes on the built app.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** Open the site:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On your phone, open the schedule of a group with proposed rehearsals and tap a proposed date.
    2. Tap Yes; then open another date and tap outside it.
    3. As an organizer, tap a proposed date; open Options on a request page and the profile menu, and tap outside each.
  - **What to look for.**
    - The date appears once; the organizer's popup fits comfortably on the phone.
    - Answering closes the popup; tapping outside closes any popup, menu or dialog.
  - **Variations to explore.** Phone and laptop; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
