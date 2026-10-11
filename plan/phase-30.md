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

Links are "name + short secret": readable as the group but not guessable; request and rehearsal links follow the group's readable address. To be tightened at phase start: what happens to invite links already shared in the old form, and the exact link shapes.

## Acceptance

- `./bin/test project/tests` covers the link shapes, landing on each action, and claiming places on sign-in.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity".
