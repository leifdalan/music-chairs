---
id: "13"
title: "Adding members from Google contacts or by name"
depends_on: ["12"]
informs: ["14"]
---

# Phase 13 — Adding members from Google contacts or by name

**Goal**: an organizer builds the band's member list directly, typing names or picking people from their Google contacts, instead of waiting for everyone to join through the invite link.

## Deliverables

- An "Add members" section on the group page for organizers: a field that autocompletes from the organizer's Google contacts once they are signed in with Google, and also accepts any typed name.
- Members added this way appear in the member list straight away; a person added by name claims their place by typing that name on the invite page ([Phase 12](phase-12.md)), and one added from contacts can also claim it by signing in with the matching Google account.
- Google contacts access is asked for only when an organizer first uses contact autocomplete, and only contact names and email addresses are read.

## Decisions (operator, 2026-10-03)

From the operator's list after Phase 9:

- "Organizer should after auth'd with google should be able to add members from their contact/address book. Should have a member add section to the group which autocompletes from the contact data. Can also free text add group members."

To settle at phase start: whether contacts include Google's "other contacts" (people the organizer has emailed), whether an added member's email is kept (for the Phase 12 sign-in match and the Gravatar), and what happens when an added name matches an existing member.

## Prerequisites

- The People API enabled and the contacts scopes added to the Google OAuth app (user action `traditional-quetzal`, done by the operator on 2026-10-03). Tests fake Google and do not wait for it; the real autocomplete and the User Demo do.

## Inherited from Phase 11

Pinned by [Phase 11](phase-11.md): organizers can rename and remove members; removing a member deletes their data and app-written Google events, and the removed person can rejoin with the unchanged invite link. Destructive actions confirm through `ConfirmForm` and `confirmationNeeded`.

## Inherited from Phase 12

Pinned by [Phase 12](phase-12.md): name-only members with role member can get back in by typing their name on the invite page (`nameOnlyMatches` and `sameName`; several matches are offered as a list); organizers and Google-linked members are never matched, and typing a name never links a Google account. Someone signed in with Google whose name matches a name-only member chooses between "That's me" and joining as new. Every Google sign-in asks for the Calendar permissions too. Members have per-group instrumentation (`setProfile`). The schema is at version 7; new tables or columns are migration 8 onward.

## Acceptance

- `./bin/test project/tests` covers adding by typed name, contact autocomplete from a faked People API answer, the contacts consent requested only on first use, organizer-only access, claiming an added place by name and by Google account, and that no contact data is stored beyond the members actually added.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: as organizer signed in with Google, start typing a bandmate's name in "Add members", pick them from your contacts, add someone else by typing a name, then open the invite link as that person and claim the place. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity".
