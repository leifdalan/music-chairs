---
id: "19.2"
title: "A groups page, a home page led by what needs you, and clearer availability and request screens"
depends_on: ["19.1"]
informs: []
---

# Phase 19.2 — A groups page, a home page led by what needs you, and clearer availability and request screens

**Goal**: the home page puts pending proposals and requests first and only offers "Start a group" to someone with no groups; a new groups page holds group navigation, management and starting a group; and the availability and request screens explain themselves and save times as they are picked.

## Deliverables

- A groups page listing your groups, with starting a group and group navigation and management there; the home page keeps your groups as a list and shows "Start a group" only when you have none.
- Pending proposals and requests first on the home page.
- Availability page: the time picker first, scrolled to the evening by default; a note that Google Calendar conflicts show once a time range is picked; times saved as they are ticked or unticked, without an "add times" step.
- Request page: the "Add <time>–<time>" control reworded, for example "check availability for proposed time slot".

## Decisions (operator, 2026-10-04)

From the operator's UI/UX notes in `plan/phase-19.md` (verbatim there): the groups page, "start a group should only be on the homepage if there are no groups", "pending proposals should be front and center on the homepage", the availability picker first and scrolled to the evening, the note about picking a time range before conflicts show, saving as times are clicked, and the request page's wording. To settle at phase start: what the groups page holds beyond the list and "Start a group"; what "pending proposals" on the home page includes; what the evening scroll position is; and how auto-saving behaves without JavaScript.

## Acceptance

- `./bin/test project/tests` covers the home page with and without groups, the groups page, the availability page's order and saving as times are ticked, and the request page's wording.
- `./bin/check all` passes and the CI/CD `check` job is green on the phase's pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 19.1

Pinned by [Phase 19.1](phase-19.1.md): the shadcn/ui look (neutral tokens in `project/app/app.css`, `Button`/`buttonVariants` and `Badge` in `project/app/components/ui/`, native controls styled once in app.css's base layer, the app's semantic classes defined there with `@apply`), and the calendar options with Google first and the ".ics" download.
