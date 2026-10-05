---
id: "19.2"
title: "A groups page, a home page led by what needs you, and clearer availability and request screens"
depends_on: ["19.1"]
informs: []
---

# Phase 19.2 — A groups page, a home page led by what needs you, and clearer availability and request screens

**Goal**: the home page puts pending proposals and requests first and only offers "Start a group" to someone with no groups; a new groups page holds group navigation, management and starting a group; and the availability and request screens explain themselves and save times as they are picked.

## Deliverables

- A groups page listing your groups with quick links (Schedule, My availability, the group page) and "Start a group", where you can also rename a group (organizers), leave a group, and delete a group (organizers), each with the existing confirmation; the home page keeps your groups as a list and shows "Start a group" only when you have none.
- First on the home page, one section of everything waiting on you: proposed rehearsals you haven't answered and requests waiting for your answer, each linking straight to where you answer.
- Availability page (calendar view): the time picker first, scrolled to the evening; a note that Google Calendar conflicts show once a time range is picked; dates can be ticked only after a time range is chosen, and each tick saves that date at that time straight away while unticking removes it, with no "Add times" button (a Save button appears only without JavaScript).
- Request page: the "Add <time>–<time>" links read "Check availability for <time>–<time>".

## Decisions (operator, 2026-10-04)

From the operator's UI/UX notes in `plan/phase-19.md` (verbatim there): the groups page, "start a group should only be on the homepage if there are no groups", "pending proposals should be front and center on the homepage", the availability picker first and scrolled to the evening, the note about picking a time range before conflicts show, saving as times are clicked, and the request page's wording. Rulings at phase start (operator, 2026-10-05):
- **Groups page**: your groups with quick links and "Start a group", and management on it too: rename (organizers), leave, and delete (organizers), each confirmed as today; a group's own page keeps its member management.
- **Home page first**: everything waiting on you — unanswered proposed rehearsals and requests waiting for your answer — in one section at the top.
- **Saving availability**: pick the time range first; each ticked date saves at that time at once and unticking removes it; dates cannot be ticked before a time range is chosen; without JavaScript a Save button appears instead.
- **Phase 19.3** (readable group URLs) is drafted now, before this phase's capture.

## Acceptance

- `./bin/test project/tests` covers the home page with and without groups, the groups page, the availability page's order and saving as times are ticked, and the request page's wording.
- `./bin/check all` passes and the CI/CD `check` job is green on the phase's pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Signed in, look at the home page: the waiting section at the top, your groups below it, and no "Start a group" form.
    2. Open the groups page from the header or home page; rename a test group, then leave or delete it (each asks first); start a new group from there.
    3. In a group, open My availability (calendar view): pick a time range, then tick and untick a few dates.
    4. Open a request and tap "Check availability for …".
  - **What to look for.**
    - Unanswered proposals and requests appear first on the home page, each one tap from answering.
    - With no groups (a private window), the home page offers "Start a group".
    - On My availability the time picker comes before the dates and opens near the evening; the dates can't be ticked until a time range is picked; each tick shows as saved at once and the time appears under "My times"; unticking removes it; the note about Google Calendar conflicts is there.
    - The request's link reads "Check availability for …" and opens My availability for that request.
  - **Variations to explore.** Leave a group you're the only organizer of (it refuses); turn off JavaScript and check a Save button appears.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 19.1

Pinned by [Phase 19.1](phase-19.1.md): the shadcn/ui look (neutral tokens in `project/app/app.css`, `Button`/`buttonVariants` and `Badge` in `project/app/components/ui/`, native controls styled once in app.css's base layer, the app's semantic classes defined there with `@apply`), the calendar options with Google first and the ".ics" download, lucide-react 1.51.0 for icons, `SubmitButton`'s `variant`/`size` props and `ConfirmForm`'s `triggerVariant`/`triggerSize` (deletes and removals `destructive`), and every `<summary>` keeping its disclosure marker with a 44px target. Changes reach `main` through a pull request whose CI `check` must pass; merging deploys.
