---
id: "40"
title: "Accessible and finished: the audit's fixes, the smaller observations, and a second critique and audit"
depends_on: ["39"]
informs: []
---

# Phase 40 — Accessible and finished: the audit's fixes, the smaller observations, and a second critique and audit

**Goal**: the site meets its accessibility promises at every text size and with a screen reader, the smaller rough edges are gone, and a second critique and audit measure the result.

## Deliverables

- Accessibility: error pages have a page title; the header wraps at large text sizes; text fields and outline buttons have borders of at least 3:1; error toasts are announced once (no alert inside a status region); a skip link; information-bearing text in calendars and the hour bar is at least 12 px; organizer calendar dates are at least 44 px wide at 320 px; the error page's links are 44 px tall; the dark-mode heat-map legend describes what it shows.
- The smaller observations: the brand is written one way and never breaks across lines; no all-caps labels; the group page's Schedule link reads as the main destination; placeholders don't read as filled-in values in dark mode; the signed-out home page doesn't repeat the wordmark as its title; text links stand alone at a comfortable size; tailwind-merge only where needed; the product's "loads nothing from other sites" statement matches what the app does with Gravatar.
- A second Impeccable critique and audit of the whole site, recorded in `.impeccable/critique/`, compared with 27/40 and 15/20 (2026-10-13).

## Decisions (operator, 2026-10-13)

From the Impeccable critique and audit of 2026-10-13 (`.impeccable/critique/2026-10-13T07-24-02Z__app.md`: critique 27/40, audit 15/20) and the operator's answers: the organizer's next step first, then one look for failures, a calmer schedule, and the accessibility fixes with every smaller observation (scope: everything); Delete stays red now that red also means a failed save.

Ruling at phase start (operator, 2026-10-14), the recommended option:

- **Fetch Gravatar through music-chairs:** the server fetches the picture from Gravatar and serves it from the site itself (cached a while), so the browser never contacts another site and "loads nothing from other sites" stays true; Gravatar sees the server's request, not the person's address. The privacy page says so.

## Acceptance

- Each deliverable's tests pass in `./bin/test project/tests`; the browser gate named in the plan passes on the built app.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** Open the site:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On your phone, set the system text size to the largest and open the group page.
    2. With a screen reader, cause an error (for example clear your name in your profile and Save).
  - **What to look for.**
    - Nothing runs off the screen at large text; every field's edge is visible.
    - The error is read out once, with a page title on error pages.
  - **Variations to explore.** Phone and laptop; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
