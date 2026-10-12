---
id: "30"
title: "Links that read like the group and land on the action, and Google sign-in that finds the groups you were added to"
depends_on: ["29"]
informs: []
---

# Phase 30 — Links that read like the group and land on the action, and Google sign-in that finds the groups you were added to

**Goal**: every link an organizer shares says what it is and takes the member straight to what they need to do, and a member an organizer added finds their groups by signing in with Google.

## Deliverables

- The invite link reads as the group, with a short secret so it can't be guessed (for example `/join/thursday-quartet-k7m2x9`).
- A readable link to each availability request, and a link to each proposed rehearsal for the organizer to share, each landing the member directly on its call to action (ticking dates; answering Yes / No / Maybe), through joining first when needed.
- A member an organizer added is already in the group, and when they sign in with Google with the email the organizer used, they see the groups they were added to, wherever they signed in.

## Decisions (operator, 2026-10-11)

Links are "name + short secret": readable as the group but not guessable; request and rehearsal links follow the group's readable address. Rulings at phase start (operator, 2026-10-11), each the recommended option:

- **Old invite links stop working.** Only the new readable invite link joins the group; an old `/join/<long code>` link shows a clear page saying the invite link has changed and to ask the organizer for the new one.
- **Links are named after the request:** an availability request at `/g/<group address>/<request name>` (for example `/g/thursday-quartet-9p43f3ia/winter-concert`), and a proposed rehearsal at `/g/<group address>/<request name>/<date>` (for example `.../winter-concert/tue-14-oct`), landing on its Yes / No / Maybe.
- **Non-members join, then land there:** the request and rehearsal links an organizer copies carry the group's invite secret, so someone not yet in the group joins with their name and lands straight on ticking dates or answering. Anyone holding such a link can join, as with the invite link.

## Acceptance

- `./bin/test project/tests` covers the link shapes, landing on each action, and claiming places on sign-in.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, as an organizer of a group with an open availability request and a proposed rehearsal, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On the group page, copy the invite link and look at it.
    2. On the availability request's page, copy its link; on the schedule, copy a proposed rehearsal's link.
    3. In a private window (not signed in, never joined), open the request link, join with a new name, and see where you land; then open the rehearsal link.
    4. Open an old-style invite link you shared before this change.
    5. If you can: have an organizer add someone by their Google email (Add members), then sign in with that Google account on the home page.
  - **What to look for.**
    - The invite link reads as the group with a short code (for example `/join/thursday-quartet-k7m2x9`).
    - The request and rehearsal links read as the group, the request's name and the date.
    - A newcomer joins once and lands on ticking dates (request link) or on Yes / No / Maybe (rehearsal link); a member lands there directly.
    - The old invite link says it has changed and to ask for the new one.
    - The added member's groups appear on the home page after Google sign-in, wherever they signed in.
  - **Variations to explore.** Two requests with the same name; a request renamed after its link was shared; light and dark mode.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity".

## Inherited from Phase 29

Pinned by [Phase 29](phase-29.md): every rehearsal is one date and time; a member answers it on its schedule card (`#rehearsal-<id>` on the group's schedule), which is where a proposed-rehearsal link should land; rehearsals carry an organizer's notes. Weekly rehearsals and per-date cancelling no longer exist.
