---
id: "14"
title: "A privacy policy and a home page that pass Google's app verification"
depends_on: ["13"]
informs: ["15"]
---

# Phase 14 — A privacy policy and a home page that pass Google's app verification

**Goal**: Google can verify music-chairs, so people signing in no longer see "Google hasn't verified this app": the site has a privacy policy that truthfully and completely describes what it does with Google data, and a home page that explains the app and links to it.

## Deliverables

- A public privacy policy page at `https://rehearse.dalan.dev/privacy`, readable without signing in, that states in plain language:
  - who runs the app and how to contact them;
  - every piece of data the app collects: names typed in, availability, rehearsals and answers, device cookies, and from Google the account's name, email and verified-email flag, Calendar free/busy (read, not stored beyond what the app already keeps), the rehearsal events the app writes, and contact names and emails (read only when an organizer adds members, never stored except the person added);
  - why each is used, where it is stored (the app's server in AWS us-west-2), how long it is kept, and that nothing is sold, shared with third parties or used for advertising;
  - how to remove data (an organizer removing a member or deleting a group; signing out) and how to revoke Google access at myaccount.google.com;
  - the statement that the app's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements;
  - the date it last changed.
- The home page, for a visitor who isn't signed in, says in a sentence or two what music-chairs does and why it asks for Google Calendar and contacts access, and links to the privacy policy.
- A link to the privacy policy on every page (a small footer).
- A **Disconnect Google** control in the profile menu for a signed-in Google account, behind a confirmation, as settled below.
- The policy is checked against the code: each Google scope the app requests (`SIGN_IN_WITH_CALENDAR_SCOPES`, `CALENDAR_SCOPES`, `CONTACTS_SCOPES`) is named in it, so a scope added later without updating the policy fails a test.

## Decisions (operator, 2026-10-03)

- Google's verification review (2026-10-03) refused the submission: "Your privacy policy page at https://rehearse.dalan.dev does not have sufficient content" and "The website of your home page URL is not registered to you." The operator asked for this phase, next.
- Domain ownership is the operator's: verifying `dalan.dev` in Google Search Console with a DNS TXT record (user action `likable-hamster`), not code.

Settled at phase start (operator, 2026-10-03):

- The policy's contact address for questions and deletion requests is `leifdalan+rtc@gmail.com`.
- The policy names the operator: "music-chairs is run by Leif Dalan as a personal, non-commercial project."
- The app gets a self-service **Disconnect Google** control in the profile menu, behind a confirmation: it revokes the app's grant at Google and deletes the stored refresh token and the Google permissions the app recorded, and turns off calendar writing for that account's memberships. The person stays in their groups; signing in with Google later asks for the permissions again. The policy describes this control alongside revoking at myaccount.google.com.

## Acceptance

- `./bin/test project/tests` covers the privacy page rendering for a visitor without any cookie, naming each requested Google scope and the Limited Use statement; the home page's description and policy link for a signed-out visitor; the footer link on other pages; and Disconnect Google revoking at a faked Google, deleting the stored token and permissions, turning off calendar writing, keeping memberships, and requiring the signed-in account.
- `./bin/deploy all` and `./bin/deploy smoke` pass, and the smoke reaches `/privacy`.
- `./bin/check all` passes.
- Manual (the operator): Google's verification accepts the privacy policy and home page (resubmitted after the domain is verified); this can only happen after delivery.

User Demo:

- **Entry point.** On your phone, open a private browser tab (signed out) and go to `https://rehearse.dalan.dev`.
- **Suggested inputs.** Read the home page, then tap **Privacy policy** and read it to the end. Go back, open one of your groups' invite links and tap **Sign in with Google**, allowing what Google asks. On the group page, scroll to the bottom and tap **Privacy policy** again. Then open the menu behind your picture in the top-right corner, tap **Disconnect Google** and confirm. Finally, on your laptop, open `myaccount.google.com` → **Security** → **Your connections to third-party apps & services**.
- **What to look for.** Signed out, the home page says in a sentence or two what music-chairs does and why it asks for Google Calendar and contacts access, and links to the policy. The policy names you and `leifdalan+rtc@gmail.com`, lists each kind of data including each Google permission, says how long it is kept and that nothing is sold or shared, explains Disconnect Google and revoking at Google, carries the Limited Use statement and a last-updated date. Every page has the policy link at the bottom. After disconnecting you are still in your group, and Google's list of connected apps no longer shows music-chairs.
- **Variations to explore.** Sign in with Google again after disconnecting: Google asks for the Calendar permissions again. Is the policy readable on a phone without zooming?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints", "Users".

## Inherited from Phase 13

Pinned by [Phase 13](phase-13.md): the app reads Google contacts (saved, and other contacts when allowed) only on the organizer-only Add members page, keeps them in memory for ten minutes and stores only the email of a member added from them (`invitedEmail`, cleared when claimed). Accounts store Google's name, email and verified-email flag. Requested scopes live in `project/app/.server/google.ts`.
