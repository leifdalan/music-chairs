---
slug: tested-skunk
title: Moving where a control returns to must move that page's return feedback with it
status: candidate
scope: local
proposed_surface: test
filed: 2026-10-04
source: kickoff
occurrences:
  - date: 2026-10-04
    ref: "Phase 17 END"
---

Phase 17 put the "Add to Google Calendar" controls on the home screen and, at the plan review's request, made them return to the page they came from. The Google consent flow returns with `?notice=calendar-connected|declined|wrong-account|failed`, which the schedule page turns into a sentence through `calendarNotice`; the home loader only knew its own sign-in notices, so a person coming back home saw nothing, not even a refusal. The tests checked the link's `returnTo` but never loaded the page it returns to with the notice the callback adds. The code critique caught it.

Do differently: when a control's return address changes or a control is copied to a new page, list everything the old return page did with the round trip (notices, toasts, query parameters) and test the new page with each of them.
