---
id: "6"
title: "Google sign-in and linking a name-only member"
depends_on: ["5"]
informs: ["7"]
---

# Phase 6 — Google sign-in and linking a name-only member

**Goal**: a member can sign in with Google instead of joining with a name only, and a member who joined with just a name can later link a Google account and keep their history (brief, Open question 3).

## Deliverables

- Google OAuth sign-in on React Router's server, with sessions.
- Joining a group as a signed-in member, alongside the existing name-only path.
- Linking an existing name-only membership to a Google account without losing availability or RSVPs.
- A record of the OAuth scopes requested now, and of what Google app verification the later Calendar scopes will need (brief, Open question 6), with human-only console steps filed in `user-actions/`.
- Tests for session handling and linking, with Google's endpoints faked so tests stay hermetic.

## Inherited from Phase 3

Pinned by [Phase 3](phase-3.md): a member's `members.id` is a stable, non-secret identifier, and device identity is the separate secret `members.device_token` held in the `mc_members` cookie (`findViewer` in `project/app/.server/membership.ts`). Linking a Google account attaches to the member id, so availability, rehearsal and RSVP rows keyed by member id carry over; a signed-in session becomes another way to resolve the viewer alongside the device token.

## Acceptance

- `./bin/test project/tests` covers sign-in callback handling, session expiry, and linking.
- `./bin/check all` passes.
- User Demo: join as a name-only member, then sign in with Google and confirm the same availability is still there. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Google integration", Open questions 3 and 6.
