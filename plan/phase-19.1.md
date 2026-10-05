---
id: "19.1"
title: "The shadcn/ui look, and the calendar buttons"
depends_on: ["18"]
informs: []
---

# Phase 19.1 — The shadcn/ui look, and the calendar buttons

**Goal**: every page uses one calm, consistent visual style built on shadcn/ui with its neutral palette, with a clear primary action on each screen, and a complete request's calendar options read "Add to Google Calendar" first, then a download icon labelled ".ics".

## Deliverables

- shadcn/ui on Tailwind CSS in the deliverable, every dependency pinned exactly, with the neutral palette's design tokens (colours, radius, type scale, spacing) recorded in the repository as the visual system.
- Every page restyled with it: home, group, availability, request, new request, schedule, add members, profile menu, privacy, join, and the error page; forms, buttons, dialogs, toasts and lists use the shadcn components, primary actions are visually primary and secondary ones quieter, and it works on a phone.
- The hand-written stylesheet replaced, not kept beside the new one.
- On a complete request (schedule page and home screen), "Add to Google Calendar" comes first, and the download is a download icon with the label ".ics" (its accessible name still says what it downloads).

## Decisions (operator, 2026-10-04)

From the operator's UI/UX notes recorded in `plan/phase-19.md`: "let's use shadcn for styles"; "\"download for you calendar\" should just be the download icon and \".ics\""; "add to google calendar should be first of the options". At phase start the operator split Phase 19 into three children (this one; then the groups page, home page and availability/request changes; then readable group URLs) and chose shadcn's **neutral** base palette.

No fonts or scripts load from a CDN or another domain (the privacy policy names none); fonts come from the system or are bundled.

## Acceptance

- `./bin/test project/tests` passes, with render tests for the calendar options' order and the ".ics" link's accessible name; existing behaviour tests unchanged in meaning.
- `./bin/check all` passes, and the CI/CD `check` job is green on the phase's pull request; merging deploys.
- No page requests anything from another origin (checked on the built pages).
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, then on a laptop, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. The home screen, signed in, then a group's page and its member list.
    2. Your availability page (calendar and list views), a request's page, and the schedule page.
    3. The profile menu, the privacy page, and an invite link in a private window.
    4. A request whose rehearsals are all settled (confirm one proposal and delete the rest if none is complete yet), on the schedule page and the home screen.
  - **What to look for.**
    - One consistent look on every page: the same type, spacing, colours, buttons and cards; each page's main action stands out and secondary ones are quieter.
    - Forms, confirmation dialogs and toasts look and behave as before.
    - Next to a complete request, "Add to Google Calendar" (or its connect/hint state) comes first, then a download icon with ".ics".
    - Nothing is cramped or overflowing on the phone.
  - **Variations to explore.** Turn your phone to landscape; try a long group or member name.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 19

Parent [Phase 19](phase-19.md) holds the operator's full list of notes; the groups page, home-page layout, availability and request changes, and readable group URLs belong to the later children, not this one. Pinned by Phases 15–18 (see the parent's "Inherited" sections): the tick-row picker and its 44px rows, the "Propose a different time" disclosure, "Your requests" on the home screen, the `CalendarActions` component, and delivery through pull requests with the CI `check` job required.
