---
id: "36"
title: "Waiting you can see, and toasts in colour: a progress bar for slow page changes, and green, yellow and red messages"
depends_on: ["35"]
informs: []
---

# Phase 36 — Waiting you can see, and toasts in colour: a progress bar for slow page changes, and green, yellow and red messages

**Goal**: a page change that takes a moment shows that something is happening, and every message after a change says at a glance whether it went well, partly, or not at all.

## Deliverables

- A thin progress bar across the top of the page, like YouTube's, while moving to another page; it appears only when the move takes longer than 300 ms, so quick moves show nothing, and it finishes and fades when the page arrives (or the move fails).
- Toasts coloured by what happened: green when a change worked, yellow when it was done but not fully, red when it was refused or failed; the colours hold their contrast in light and dark mode, and the colour is never the only signal (wording and the alert role for problems stay).
- Messages that today report "done, but not fully" as an error (for example "Disconnected from Google here, but Google didn't answer…") become yellow warnings; refusals, where nothing changed, stay red.
- The error-state catalogue (`project/error-catalogue/`) shows the new colours: the states whose pictures change are regenerated.
- Tests prove the bar's 300 ms threshold and each toast kind's colour and role.

## Decisions (operator, 2026-10-12)

From the operator's feedback after Phase 35 ("Sometimes page loads are kind of slow, I'm guessing when there's a lot of google api calls. I'd like a progress bar for page transitions, kind of like youtube - a small horizontal progress bar at the top that only shows if the page transition is more than 300ms. The toasts should be appropriately colored. Green for positive, yellow for warning, and red for errors") and their answers:

- **The bar is for page moves only:** saves keep their own "Saving…" on the pressed button and don't show the bar.
- **Yellow means done, but not fully:** a change that happened with a catch (the partial Disconnect, and any other message of that kind the inventory finds) is a warning; red stays for refusals and failures where nothing changed; green is for success. The notices shown after Google sign-in or consent are not toasts and keep their look.
- **One phase** for both.

## Acceptance

- Vitest proves the bar stays hidden for a move under 300 ms and shows for a longer one, and that each toast kind renders its colour class and role (`status` for success and warning, `alert` for errors).
- The browser gate measures, on the built app, that a page move held past 300 ms shows the bar and a quick one never does, and that the three toast colours meet contrast in light and dark mode.
- The catalogue's coverage check passes after the affected states are regenerated.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open the site and go to an availability request:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Move between the group page, the schedule and an availability request, including one where your Google Calendar is read for clashes.
    2. Answer a rehearsal Yes (a green toast).
    3. Open your profile, clear your name and Save (a red toast).
    4. Open the error-state catalogue on GitHub and find "Disconnected from Google here, but…" (a yellow toast).
  - **What to look for.**
    - A slow page change shows a thin bar at the top; a quick one shows nothing.
    - Green, yellow and red read clearly in light and dark mode.
  - **Variations to explore.** A slow connection; dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
