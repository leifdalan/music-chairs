---
id: "38"
title: "One look for failures: the colour rules match the product, and every failure shows the same way"
depends_on: ["37"]
informs: []
---

# Phase 38 — One look for failures: the colour rules match the product, and every failure shows the same way

**Goal**: whatever goes wrong looks and reads the same everywhere, and the design rules say what the colours mean today.

## Deliverables

- PRODUCT.md and DESIGN.md say what colour means now (operator rulings, Phases 34–36 and 2026-10-13): red for deleting and for saves that failed or were refused; yellow for done but not fully; amber for who isn't free; green for saved; indigo for the next action, settled things and the page progress bar. Delete stays red (ruling 2026-10-13).
- Every failure the person meets uses that scale: Google sign-in and consent notices that report a failure, and the out-of-date link notice, show as problems, not neutral information; a failed save shows in one consistent place on every page.
- The hand-written colours become tokens: the dark-mode red surface and its text (used in three places) and the dialog backdrop.
- The error-state catalogue's pictures whose look changes are regenerated; tests and the catalogue's coverage check pass.

## Decisions (operator, 2026-10-13)

From the Impeccable critique and audit of 2026-10-13 (`.impeccable/critique/2026-10-13T07-24-02Z__app.md`: critique 27/40, audit 15/20) and the operator's answers: the organizer's next step first, then one look for failures, a calmer schedule, and the accessibility fixes with every smaller observation (scope: everything); Delete stays red now that red also means a failed save.

To settle at phase start: where a failed save shows on every page (beside what failed, or floating at the bottom of the screen with the toasts).

## Acceptance

- Each deliverable's tests pass in `./bin/test project/tests`; the browser gate named in the plan passes on the built app.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** Open the site:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open the error-state catalogue on GitHub and compare a failed save, a Google sign-in failure and an out-of-date link.
    2. On your phone, open a link to a deleted proposed time.
  - **What to look for.**
    - Every failure looks like a failure, in the same colours and place.
    - Nothing reads as neutral information when something went wrong.
  - **Variations to explore.** Phone and laptop; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology constraints".
