---
id: "23"
title: "Members answer an availability request on its calendar: dates, times and a cap that save as they go"
depends_on: ["22"]
informs: ["24"]
---

# Phase 23 — Members answer an availability request on its calendar: dates, times and a cap that save as they go

**Goal**: a member gives their availability in one place, the availability request it is for, by picking dates on its calendar and a stretch of the day, and nothing on that page needs a send button.

## Deliverables

- A member who opens an availability request always sees the calendar of the dates in its span, with a List view toggle; the list is a multi-select of the same dates. Picking dates and a stretch of the day on Phase 22's hour bar saves availability for those dates, with the same "Saving…/Saved" feedback the app's other auto-saving controls use. Each date shows the time saved for it, and can be cleared.
- "How many rehearsals can you make in this span" saves as it changes, with the same feedback; "Send my answer" goes. The cap stays optional.
- The separate "My times" section of the request page goes; the calendar is the member's view of their own times in the span.
- Availability is given inside availability requests only: the standalone My availability page, its weekly ("every Thursday") patterns, and every link to it (group page, Groups page, home page, after joining) go. A signed-in member's Google Calendar import moves onto the request page. Existing stored availability is carried forward by a forward-only migration (the planner proposes how weekly rows become dates, or are dropped, for the operator to choose).
- "Answer" means Yes / No / Maybe to a proposed rehearsal only. After joining, the next screen is the group's open availability request when there is one. Home's waiting line for a request reads as adding free times by its end date.

## Decisions (operator, 2026-10-06)

From the operator's notes after Phase 21: "'My availability' from the group page doesn't make sense - what am I filling my availability out for? There's no proposal it is attached to; this is a pointless form submission"; "When clicking on a request as a member, it should always show the calendar view, with the list toggle. It shouldn't have a 'send my answer'; instead the how many rehearsals can you make in this span should be auto saving like the other stuff (with saving ui)"; "My times is redundant, but that being said, keep the calendar/list toggle for the pickable dates within the timespan. list should be a multiselect". Answer to the follow-up question on weekly patterns: dates only, no weekly shortcut (2B). This phase absorbs the earlier "Members give availability" sketch (from the Impeccable critique's P1 "Members can 'answer' a request without giving any availability").

Rulings at phase start (operator, 2026-10-06, answering the phase's open questions):

- An organizer gives their own times on the same date calendar, in a folded "Your times" section below the heat map on the request page (not a separate view switch).
- Weekly times already saved become one-off dates: each weekly time turns into its individual dates over the next 8 weeks from the day the migration runs (in the group's zone), keeping its end date and leaving out dates marked "can't make it"; the weekly rows then go.
- Times are shared, not per request: a date given on one request counts for every other request covering that date and for the schedule's "When people are free".

## Acceptance

- `./bin/test project/tests` covers saving and clearing dates, the cap's save, the absence of the send button and "My times", the retired My availability route and links, the migration, the post-join destination and the wording.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, signed in as a member (not an organizer) of a group with an open request, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open the group and then its open request.
    2. On the request's calendar, drag 7–10 PM on the hour bar, then tick two dates.
    3. Switch to List, tick a third date there, and untick one of the first two.
    4. Change "How many rehearsals can you make in this span".
    5. Reload the page.
    6. As the organizer, open the same request and the folded "Your times" below the heat map; tick one of your own dates.
  - **What to look for.**
    - The calendar of the request's dates is the first thing a member sees; each tick and the rehearsal count show "Saving…" then "Saved", and there is no "Send my answer" or "My times".
    - After the reload, the dates and the count are as you left them, each date showing its time.
    - The group page, the Groups page and the home page have no "My availability" link.
    - The organizer's heat map counts the member's dates; the organizer's own tick saves the same way.
  - **Variations to explore.** A member who had a weekly time before this phase now sees it as separate dates; a second request covering the same dates shows the times already given; joining a group through an invite lands on its open request.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Success criteria".

## Inherited from Phase 21

Pinned by [Phase 21](phase-21.md): on the request page members still see their own times ("Your times in this span", with the "Check availability for <time>" links) and then "Your answer" (the rehearsal cap), in that order. The answer section is one shared fragment (`answerSection` in `project/app/routes/request.tsx`) rendered for both roles, and organizers see it after the calendar. Quieter destructive controls use the `outline-destructive` button variant.

## Inherited from Phase 22

Pinned by [Phase 22](phase-22.md): the time picker is `TimeRange` in `project/app/components/time-range.tsx` (an `aria-hidden` hour bar from 9 AM to midnight in half-hour steps, plus From/Until selects that are the form's real inputs), with `onChange(range, chosen)` where `range` is null while the bar waits for a second tap or a drag is under way, so auto-saving controls never save mid-gesture. Displayed times come from `formatMinutes` and `timeRange` in `project/app/lib/availability.ts` ("7–10 PM"); form values and stored minutes stay 24-hour ("19:00"); the server still rounds to 15 minutes.
