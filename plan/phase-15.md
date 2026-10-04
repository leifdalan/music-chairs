---
id: "15"
title: "Proposing several free times at once, and pending requests on the home screen"
depends_on: ["14"]
informs: ["16"]
---

# Phase 15 — Proposing several free times at once, and pending requests on the home screen

**Goal**: the organizer turns the group's free times into proposals in one go, with a custom proposal as the deliberate exception, and members find any request waiting for their answer as soon as they open the app.

## Deliverables

- "When people are free" becomes a multi-select: the organizer ticks one or more free times and proposes them all with one action.
- The free-form "Propose a rehearsal" form moves to the bottom of the schedule page, hidden behind an "Override with a custom proposal" control.
- The home screen shows each member, across their groups, the requests still waiting for their answer, each one tap away; nothing extra appears when there are none.

## Decisions (operator, 2026-10-03)

From the operator's list after Phase 9:

- "When people are free/propose this time should be a multi-select. The propose a rehearsal should be at the bottom and gated visually by 'override to a custom proposal'."
- "Members from the home screen should be able to see and navigate to pending requests very easily, given they have one or many."

Settled at phase start (operator, 2026-10-03):

- The tick-several-and-propose control appears on both the schedule page and each scheduling request's page; the request page proposes straight from there.
- Location is entered once, optionally, for all the ticked times.
- A "Rehearsal length" is chosen once (default 2 hours); each proposal starts at its free time's start and is cut short to the free time when that is shorter.
- The home screen's pending requests cover the groups joined on this device and the groups linked to the signed-in Google account.

## Acceptance

- `./bin/test project/tests` covers proposing several selected free times in one action (each becomes a proposed rehearsal), organizer-only access, the custom proposal still working behind its control, and the home screen listing exactly the open, unanswered requests of the viewer's groups and none of anyone else's.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.

User Demo:

- **Entry point.** On a laptop, open the schedule page of a test group you organize, where at least two members have entered availability that overlaps on several days in the coming weeks. On a phone, have a name-only member of the same group (joined on that phone, not signed in with Google).
- **Suggested inputs.** Under **When people are free**, tick three free times, keep the length at 2 hours, type `Studio B` as the location and tap **Propose selected**. Scroll to the bottom, open **Override with a custom proposal**, and propose a weekly time that isn't in the list. Then create two scheduling requests from the group page. On one request's page, tick one free time and propose it. Finally, on the phone, open `https://rehearse.dalan.dev`, tap one of the listed requests and answer it, then go back to the home screen.
- **What to look for.** Three proposed rehearsals appear, each 2 hours long from the start of its free time (shorter where the free time was shorter), all at Studio B, with one message saying how many were proposed. The custom proposal appears too, and its form stays out of the way until opened. The proposal from the request page appears on the schedule. On the phone, the home screen lists both requests under the group's name, each one tap away; after answering, that request is gone from the list.
- **Variations to explore.** Tap **Propose selected** with nothing ticked: you're told to tick a time and nothing is proposed. As the member, the schedule page shows free times without tick boxes. Is ticking easy on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Technology and constraints" (works well on a phone).

## Inherited from Phase 13

Pinned by [Phase 13](phase-13.md): organizers add members on their own page, `/g/:groupId/members/add` (`project/app/routes/members.add.tsx`), by typed name or from their Google contacts (`listContacts`, read only there, cached in memory for ten minutes and never stored). A member added from contacts carries `invitedEmail` (shown only to organizers) until a Google account with that verified email opens the invite link and claims the place (`claimInvitation`); invited members are never matched by name. `googleFetch` in `project/app/.server/google.ts` is the shared Google API request helper (token, one retry after a 401). Contacts consent uses `/auth/google/calendar?scope=contacts` and the `contacts-*` notices. The schema is at version 8; new tables or columns are migration 9 onward.

## Inherited from Phase 14

Pinned by [Phase 14](phase-14.md): `/privacy` (`project/app/routes/privacy.tsx`, facts in `project/app/lib/privacy.ts`) is the published account of everything the app collects and every Google scope it requests. A feature that stores new data, shows data to new people, or requests a new Google scope updates the policy in the same phase; a test fails when the scopes the sign-in and consent routes send differ from the policy's list. Disconnect Google (`stopWritingFor`, `revokeGrant`, `disconnectGoogle`) must also undo anything new tied to the Google grant. The footer with the policy link is in the root layout.
