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
- "Sign in with Google" on the invite page, for joining as a member. It asks for sign-in and the Calendar access that clashes and calendar writing need, in one consent, so My availability greys Google Calendar clashes and the calendar-writing switch just work afterwards instead of first sending the member to Google.

## Decisions (operator, 2026-10-03)

From the operator's list after Phase 9:

- "Use gravatar for an upper right user self-manage menu. Should be able to edit picture and have a field for instrumentation." Settled: Gravatar only; "edit picture" links to gravatar.com, with initials as the fallback.
- "Your name should be prefilled if auth'd from google."
- "Non-google auth'd users should be able to log in as themselves if they type the name the same, case insensitive." Settled: the name is enough. Anyone with the invite link who types an existing name-only member's name becomes that member on their device; the operator accepted this trust in the invite link.
- "Should have an option to sign into google from the invite link as a member. This should auth you for both the import and the calendar sync, so those buttons should just be to conduct the api call later instead of auth + api call."

Settled at phase start (2026-10-03):

- **Every Google sign-in asks for Calendar access in the same step** (the clashes and the rehearsal-writing permissions), not only sign-in from the invite link, so nobody is sent back to Google later. Google shows its "unverified app" warning on that screen; the operator accepted that.
- **Declining the Calendar part still signs the person in** (and joins them from an invite); clashes and calendar writing stay off, each with a link to allow it later.
- **Two name-only members with the same name:** typing that name on the invite page shows the matching members (with their instrumentation) to pick from.
- **Name and instrumentation are per group:** someone can be "cello" in one band and "piano" in another; name-only members have them too.

## Inherited from Phase 10

Pinned by [Phase 10](phase-10.md): the Phase 7 import page is gone. Calendar access is two permissions in `CALENDAR_SCOPES` (`project/app/.server/google.ts`): `busy` (free/busy, asked through `/auth/google/calendar?scope=busy`, which greys clashes on My availability's calendar view each time it opens) and `write` (rehearsal events). The single consent covers those two. Every time is entered with `TimeRange` (`project/app/components/time-range.tsx`), a tap grid over typed fields.

## Inherited from Phase 11

Pinned by [Phase 11](phase-11.md): organizers can already rename members (`renameMember` in `project/app/.server/store.ts`, `validateName` with `DISPLAY_NAME_MAX`), and display names are not unique within a group. Destructive actions confirm through `ConfirmForm` (`project/app/components/confirm-form.tsx`) and `confirmationNeeded` (`project/app/.server/confirm.ts`). The schema is at version 6; new tables or columns are migration 7 onward.

## Acceptance

- `./bin/test project/tests` covers the profile menu's data (Gravatar address from the email, initials fallback, no other member's email exposed), editing name and instrumentation, the Google name pre-fill, returning by name (case-insensitive match; never a Google-linked member; never across groups), and the single consent's scopes with clashes and calendar writing working without a second consent (fake Google).
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.

User Demo:

- **Entry point.** On your phone, open a private browser tab (so you are signed out) and open the invite link of a test group, copied from that group's page on your laptop. The test group should have a name-only member called `Spare`.
- **Suggested inputs.** Tap **Sign in with Google** on the invite page, choose your Google account, and on Google's screen allow the Calendar access it asks for (after its "unverified app" warning). Back on the invite page, join with the name filled in. Tap your picture or initials in the top-right corner, add the instrumentation `cello`, and save. Then open **My availability** and **Schedule**. On the laptop, in a private window, open the same invite link and type `spare` to get back in as `Spare`. Finally, as organizer, rename another member to `Spare` and type `SPARE` on the invite link again.
- **What to look for.** The name field is already filled from your Google account. The top-right menu shows your Gravatar (or your initials if your email has none), your name, a link to change the picture on gravatar.com, and sign out. `cello` appears beside your name in the group's member list. My availability greys your Google Calendar clashes and the Schedule's "Add rehearsals to my Google Calendar" turns on without another Google screen. Typing `spare` lands you as `Spare`; with two members called Spare, you get a short list to choose from.
- **Variations to explore.** Sign in again and untick the Calendar part on Google's screen: you are still signed in, and the clashes and calendar-writing places offer a link to allow it. Is the menu easy to reach on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Availability" (Google Calendar import), "Calendar output".
