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

Open at phase start: how an organizer gives their own times on a request whose page leads with the heat map; whether the schedule page's free-times view keeps counting availability given for other requests (Phase 24 reshapes that view).

## Acceptance

- `./bin/test project/tests` covers saving and clearing dates, the cap's save, the absence of the send button and "My times", the retired My availability route and links, the migration, the post-join destination and the wording.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Success criteria".

## Inherited from Phase 21

Pinned by [Phase 21](phase-21.md): on the request page members still see their own times ("Your times in this span", with the "Check availability for <time>" links) and then "Your answer" (the rehearsal cap), in that order. The answer section is one shared fragment (`answerSection` in `project/app/routes/request.tsx`) rendered for both roles, and organizers see it after the calendar. Quieter destructive controls use the `outline-destructive` button variant.

## Inherited from Phase 22

Pinned by [Phase 22](phase-22.md): the time picker is `TimeRange` in `project/app/components/time-range.tsx` (an `aria-hidden` hour bar from 9 AM to midnight in half-hour steps, plus From/Until selects that are the form's real inputs), with `onChange(range, chosen)` where `range` is null while the bar waits for a second tap or a drag is under way, so auto-saving controls never save mid-gesture. Displayed times come from `formatMinutes` and `timeRange` in `project/app/lib/availability.ts` ("7–10 PM"); form values and stored minutes stay 24-hour ("19:00"); the server still rounds to 15 minutes.
