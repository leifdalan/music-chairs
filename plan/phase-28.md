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

From the operator's feedback after Phase 27 and their answers: the three phases run Answer (this phase), then Propose (Phase 29), then Links (Phase 30). The item "organizers don't seem to have a way to fill in their own answers" was withdrawn by the operator ("I was incorrect about this"). Rulings at phase start (operator, 2026-10-11), each the recommended option:

- **Which time is chosen:** the request's first time of day, switchable; a request with one time of day simply has it chosen.
- **Where organizers see preferred numbers:** a summary under "When people are free", above the heat map, one entry per member (for example "Cellist: 2 · Pianist: as many as possible · Oboe: not answered"), always visible while ticking dates.
- **Wording:** the choices read as a preference: "As many as possible", or a number of rehearsals (1, 2, 3…); organizers see "Cellist: 2" or "Pianist: as many as possible".

## Acceptance

- `./bin/test project/tests` covers the preselected time, the new wording and what organizers see.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open the site and go to a group where you're an organizer, with an open availability request that at least one other member has answered:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. As a member (another phone or a private window joined through the invite link), open the availability request.
    2. Tick two dates straight away, without tapping a time first.
    3. Under "Preferred number of rehearsals in date span", choose 2.
    4. As the organizer, open the same request and look under "When people are free".
  - **What to look for.**
    - The member's page opens with the request's time of day already selected, and the dates can be ticked at once.
    - The member sees "Preferred number of rehearsals in date span" with "As many as possible" or a number, never "Rehearsals you can make".
    - The organizer sees each member's preferred number above the heat map, including who hasn't answered.
  - **Variations to explore.** A request with two times of day (the first is selected; switching works); a member who chooses "As many as possible"; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Availability", "Choosing rehearsal times".
