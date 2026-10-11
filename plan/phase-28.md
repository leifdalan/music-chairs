---
id: "28"
title: "Answering at once: the request's time already chosen, and members' preferred number of rehearsals shown to organizers"
depends_on: ["27"]
informs: ["29"]
---

# Phase 28 — Answering at once: the request's time already chosen, and members' preferred number of rehearsals shown to organizers

**Goal**: a member who opens an availability request can tick dates straight away, and an organizer proposing rehearsals can see how many rehearsals each member would prefer.

## Deliverables

- A member's availability request page arrives with the request's time of day already chosen, so the dates can be ticked at once without first tapping a time.
- "Rehearsals you can make" is renamed "Preferred number of rehearsals in date span" everywhere it appears.
- Each member's preferred number is clear to the organizer where they propose rehearsals.

## Decisions (operator, 2026-10-11)

From the operator's feedback after Phase 27 and their answers: the three phases run Answer (this phase), then Propose (Phase 29), then Links (Phase 30). The item "organizers don't seem to have a way to fill in their own answers" was withdrawn by the operator ("I was incorrect about this"). To be tightened at phase start: which time is chosen when a request has several times of day, and where on the organizer's page the preferred numbers appear.

## Acceptance

- `./bin/test project/tests` covers the preselected time, the new wording and what organizers see.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Choosing rehearsal times".
