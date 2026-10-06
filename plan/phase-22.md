---
id: "22"
title: "Members give availability: one meaning for answer, and the next step after joining"
depends_on: ["21"]
informs: ["23"]
---

# Phase 22 — Members give availability: one meaning for answer, and the next step after joining

**Goal**: a member who opens a request, the home page or a fresh invite is led to add the times they are free, and "answer" means only Yes / No / Maybe.

## Deliverables

- On a request a member has no availability for, the main action is "Add when you're free (dates)", into My availability preset to the request's dates and times; the rehearsal cap becomes an optional "Most rehearsals you can do" below it.
- "Answer" means Yes / No / Maybe only, everywhere; home's waiting line for a request reads as adding free times by its end date; "Your requests" shows organizers' requests only, with members seeing what they are part of under clear wording.
- After joining, the next screen is entering availability (preset to an open request when there is one); the group page's primary button for a member with no availability is "My availability".

## Decisions (operator, 2026-10-05)

From the Impeccable critique's P1 "Members can 'answer' a request without giving any availability" and its persona red flags for first-timers. To be tightened at phase start.

## Acceptance

- `./bin/test project/tests` covers the wording, the preset links and the post-join destination.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Success criteria".

## Inherited from Phase 21

Pinned by [Phase 21](phase-21.md): on the request page members still see their own times ("Your times in this span", with the "Check availability for <time>" links) and then "Your answer" (the rehearsal cap), in that order, unchanged by Phase 21 — reworking that order and wording is this phase's. The answer section is one shared fragment (`answerSection` in `project/app/routes/request.tsx`) rendered for both roles, and organizers see it after the calendar. Quieter destructive controls use the `outline-destructive` button variant.
