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

Settled at phase start (2026-10-03):

- **Autocomplete suggests saved contacts and Google's "other contacts"** (people the organizer has emailed).
- **A member added from contacts keeps that email.** Organizers see it, as for other Google members; it is used for claiming the place and for that person's Gravatar.
- **A member added from contacts claims their place only by signing in with the matching Google account**; typing their name does not work for them. A member added by typed name claims by name, as in Phase 12.
- **An added name that matches an existing member is refused** ("Someone called X is already in the group"); rename one first.

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

User Demo:

- **Entry point.** On a laptop, open `https://rehearse.dalan.dev` as the organizer of a test group, signed in with Google. You need a second Google account you can sign in with (another account of yours, or a bandmate willing to help) saved in, or emailed from, your main account's Gmail.
- **Suggested inputs.** In the group page's **Add members** section, choose to use your Google contacts and allow it on Google's screen. Start typing the second account's name, pick it from the suggestions, and add it. Then type a name that is in nobody's contacts, `Spare oboe`, and add it. Try adding `spare OBOE` again. Finally, on your phone in a private tab, open the group's invite link, tap **Sign in with Google** with the second account, and allow what Google asks.
- **What to look for.** The suggestions show names with their email addresses, and only after you allowed contacts. Both new members appear in the member list at once; the contact shows its email to you as organizer. Adding `spare OBOE` is refused because someone of that name exists. On the phone, signing in with the second account lands you in the group as that member (not as a new one); typing that member's name on the invite page instead does not.
- **Variations to explore.** On the laptop in a fresh private window, open the invite link and type `spare oboe`: you land as `Spare oboe`. Is the Add members field quick to use on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity".
