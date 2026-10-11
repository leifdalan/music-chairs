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

Weekly rehearsals already saved are deleted rather than split into dates ("Delete them"). The brief records the ruling that there are no recurring rehearsals. To be tightened at phase start: exactly what a proposed time covers once rehearsal length is gone (the whole free time or the request's time of day), and where notes show and who can edit them.

## Acceptance

- `./bin/test project/tests` covers the migration, proposing without a length, the one-tap date and notes in the app and in calendar output.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Choosing rehearsal times", "Rehearsal details", "Calendar output".
