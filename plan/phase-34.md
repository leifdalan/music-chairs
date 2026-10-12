---
id: "34"
title: "Every failure says what happened: an error state for each request, Google sign-in and permissions, and the network"
depends_on: ["33"]
informs: ["35"]
---

# Phase 34 — Every failure says what happened: an error state for each request, Google sign-in and permissions, and the network

**Goal**: whatever goes wrong — the server refusing or failing, Google refusing, granting only part of what was asked, or the connection dropping — the person sees what happened and what they can do, and every such state is proved by the test suite.

## Deliverables

- An inventory of every HTTP call the app makes or serves (page loads, form posts, in-page saves, the Google sign-in and consent round trips, and the app's own calls to Google), each with its failure outcomes, kept in the repository.
- A clear, specific error state in the UI for each failure outcome: validation refusals, a missing or removed group, request or rehearsal, a closed request, not being allowed, the server failing, and a save the server never answered.
- Google sign-in and permission outcomes each have their own state: cancelled, refused, a different Google account, an unverified email, no refresh token, only some permissions granted (Calendar busy times without writing, writing without busy times, contacts withheld), access later revoked, and Google itself failing or slow, both at sign-in and when the app reads or writes the calendar.
- Failures in the browser itself — saving while offline, a request that times out, the server unreachable mid-save — say so and offer a retry, without losing what the person entered.
- Every error state is covered by a test that drives it and checks what the person sees.

## Decisions (operator, 2026-10-12)

From the operator's feedback after Phase 32 ("I'd like for all the error scenarios to be covered. We need error states in the UI for each HTTP call, and we need to consider partial authorization states from the google auth, or error states from google auth … UI Error states should also be in the test suite") and their answers: failures in the browser itself (offline, timeouts, an unreachable server) are included, not only errors the server reports. Order: after Phase 33, before the screenshot catalogue (Phase 35).

Ruling at phase start (operator, 2026-10-12), the recommended option:

- **Retry button, nothing lost:** a save that fails because the connection dropped or the server didn't answer shows "Not saved" with a short reason and a Retry button; what the person entered stays on screen until they retry or leave. Nothing is resent on its own, so the person always knows what reached the group.

## Acceptance

- The inventory lists every call and failure outcome, and each outcome names the test that proves its UI state; a check fails when a route or Google call has no inventory entry.
- `./bin/test project/tests` covers every listed error state.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open the site signed out:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Start Google sign-in and cancel it on Google's screen.
    2. Sign in again and untick the Calendar permissions on Google's screen.
    3. On an availability request, turn on airplane mode and tick a date; then turn it off and retry.
    4. Open a link to a request that was deleted.
  - **What to look for.**
    - Each case says plainly what happened and what you can do next; nothing shows a raw error or a blank page.
    - What you entered is still there after a failed save.
  - **Variations to explore.** Revoking music-chairs' access in your Google account settings, then opening a request; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Calendar output", "Technology constraints".
