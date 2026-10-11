---
id: "29"
title: "Proposing simply: every rehearsal one date, no rehearsal length, one-tap dates and notes"
depends_on: ["28"]
informs: ["30"]
---

# Phase 29 — Proposing simply: every rehearsal one date, no rehearsal length, one-tap dates and notes

**Goal**: proposing a rehearsal is choosing a date and its time, with an optional note that travels to the app and members' calendars.

## Deliverables

- No one-time or weekly choice: every rehearsal is one date and time. Weekly rehearsals and everything attached to them are deleted by a forward-only migration, and every place that offered or showed weekly rehearsals (forms, the schedule, cancelling a date, answering every date, calendar exports and feeds) changes to match.
- No "Rehearsal length": proposing a free time proposes that time.
- On "When people are free", tapping a date with only one free time ticks that time directly, with no panel.
- An optional notes field on a proposed rehearsal, shown in the app and in the Google Calendar event and calendar feeds, shaped so materials to prepare (attachments) can join it later.
- `project/PRODUCT.md` no longer lists recurring rehearsals.

## Decisions (operator, 2026-10-11)

Weekly rehearsals already saved are deleted rather than split into dates ("Delete them"). The brief records the ruling that there are no recurring rehearsals. Rulings at phase start (operator, 2026-10-11), each the recommended option:

- **What a ticked free time proposes:** the whole free time (for example 7–9:30 PM when that is when everyone ticked is free within the request's 7–10 PM). "Propose a different time" still takes any start and end.
- **Notes:** organizers write them when proposing (one note for everything ticked, like the location) and can edit them later on the schedule; members read them in the app and in their calendars.
- **Cancelling:** with every rehearsal a single date, "Cancel a date" goes away; cancelling a rehearsal is Delete, which removes it and the events music-chairs added to members' calendars. There is no separate cancelled state.

## Acceptance

- `./bin/test project/tests` covers the migration, proposing without a length, the one-tap date and notes in the app and in calendar output.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, as an organizer of a group with an open availability request that some members have answered, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open the availability request and look under "When people are free".
    2. Tap a date that has one free time; then tap a date with several and tick one.
    3. Type a location and a note (for example "Bring the Brahms parts"), then "Propose selected".
    4. Open the schedule, edit the note on one proposed rehearsal, and confirm it.
    5. With Google Calendar writing on (or the calendar feed added), open the confirmed rehearsal's event.
    6. Open "Propose a different time".
  - **What to look for.**
    - There is no "Rehearsal length" and no one-time/weekly choice anywhere.
    - Tapping a date with one free time ticks it without opening a panel; a date with several opens the panel as before.
    - Each proposed rehearsal covers the whole free time, on one date.
    - The note shows on the schedule and the request page, and in the calendar event's description; the edit replaces it.
    - Earlier weekly rehearsals are gone, and so are their events in members' Google Calendars.
  - **Variations to explore.** A member's view of the note; deleting a confirmed rehearsal; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Choosing rehearsal times", "Rehearsal details", "Calendar output".

## Inherited from Phase 28

Pinned by [Phase 28](phase-28.md): a member's request page opens with the request's first (earliest) time of day chosen (`initialRange` in `project/app/components/request-dates.tsx`); a member's number is a preferred number of rehearsals ("As many as possible" or a number), worded through `project/app/lib/preference.ts`; organizers see each member's preferred number in a list under "When people are free", above the Calendar/List switch, in the same section where "Rehearsal length" sits today.
