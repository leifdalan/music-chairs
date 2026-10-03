---
id: "12"
title: "Your profile menu, returning by name, and one Google sign-in for everything"
depends_on: ["11"]
informs: ["13"]
---

# Phase 12 — Your profile menu, returning by name, and one Google sign-in for everything

**Goal**: everyone has a small profile of their own and gets back in easily: a picture and menu in the top-right corner, a name-only member returns by typing their name, and a member who signs in with Google from the invite link grants Calendar access in that same step.

## Deliverables

- A profile menu in the top-right corner of every page, showing the member's Gravatar (initials when there is no email or no Gravatar). It lets the member edit their name and a new "instrumentation" field (for example "cello, piano"), links to gravatar.com to change the picture, and holds sign-in and sign-out.
- Instrumentation shown with each member's name in the group's member list.
- When joining through an invite link while signed in with Google, the name field is pre-filled from the Google account.
- A name-only member returns on a new device by typing their name on the invite page: a case-insensitive match with an existing name-only member in that group signs this device in as them. A Google-linked member still signs in with Google.
- "Sign in with Google" on the invite page, for joining as a member. It asks for sign-in and the Calendar access that import and calendar writing need, in one consent, so the "Import" and calendar-writing buttons just do their work afterwards instead of first sending the member to Google.

## Decisions (operator, 2026-10-03)

From the operator's list after Phase 9:

- "Use gravatar for an upper right user self-manage menu. Should be able to edit picture and have a field for instrumentation." Settled: Gravatar only; "edit picture" links to gravatar.com, with initials as the fallback.
- "Your name should be prefilled if auth'd from google."
- "Non-google auth'd users should be able to log in as themselves if they type the name the same, case insensitive." Settled: the name is enough. Anyone with the invite link who types an existing name-only member's name becomes that member on their device; the operator accepted this trust in the invite link.
- "Should have an option to sign into google from the invite link as a member. This should auth you for both the import and the calendar sync, so those buttons should just be to conduct the api call later instead of auth + api call."

To settle at phase start: whether every Google sign-in (not only from the invite link) asks for Calendar access up front, given that the app is unverified, so Google shows its "unverified app" warning at that sign-in; and what a member sees when they decline the Calendar part of the consent.

## Acceptance

- `./bin/test project/tests` covers the profile menu's data (Gravatar address from the email, initials fallback, no other member's email exposed), editing name and instrumentation, the Google name pre-fill, returning by name (case-insensitive match; never a Google-linked member; never across groups), and the single consent's scopes with import and calendar writing working without a second consent (fake Google).
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: on a phone, open an invite link, sign in with Google and see your name filled in; open the profile menu, add your instrumentation, and see your Gravatar; import from Google Calendar without a second Google screen; on another browser, type a name-only member's name in a different case and land as them. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Availability" (Google Calendar import), "Calendar output".
