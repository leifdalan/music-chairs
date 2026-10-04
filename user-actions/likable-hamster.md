---
slug: likable-hamster
title: Finish Google's app verification — justify the sensitive scopes, record the demo video, submit
status: pending
category: access
urgency: medium
blocks:
  - Removing Google's "hasn't verified this app" warning at sign-in
  - Phase 14's manual acceptance (Google accepting the privacy policy and home page)
filed: 2026-10-03
needed_at: now
source: operator
refs:
  - plan/phase-14.md
  - project/app/lib/privacy.ts
---

**Where it stands (2026-10-03):**
- `dalan.dev` is verified in Google Search Console as a Domain property. The `dalan.dev` Route 53 zone holds two TXT values, `google-site-verification=z2fjXWiTXprhwHTJTC_ruSmEdgwP0VTaD_0Q9GwCUQw` and `google-site-verification=w_C67CKXYwEY2fDn3-k9loy6zYqL3JA7Unjw3yDdnz4`. Keep both, because Google re-checks them.
- Google Auth Platform → **Branding** shows "Your branding has been verified". Branding covers the home page, the privacy policy, the name and the logo.
- The "Google hasn't verified this app" warning remains until Google approves the three **sensitive scopes**. That is a separate review.

**1. Check the publishing status.** In Google Auth Platform → **Audience**, the status must be **In production**. In Testing, people's Calendar and contacts access stops after 7 days.

**2. Data Access.** The list should show `calendar.freebusy` as non-sensitive and three sensitive scopes: `calendar.events.owned`, `contacts.readonly` and `contacts.other.readonly`. Nothing else is needed. Paste this into "How will the scopes be used?" (about 870 of 1000 characters):

```
music-chairs helps small music ensembles find rehearsal times. Each scope is optional and requested only when the person uses the feature that needs it.

calendar.events.owned: if a member turns on "add rehearsals to my calendar", we create their group's confirmed rehearsals in a calendar they own, and update or remove only events we created. calendar.events or full calendar access would be broader; we never read or change any other events or calendars.

contacts.readonly and contacts.other.readonly: only when an organizer adds members to their group, we suggest names and email addresses from their contacts as they type. We request only names and emails, hold the list in memory for at most ten minutes, and store only the one person they pick. There is no narrower contacts scope, and other contacts covers people they have emailed but not saved, which is how most bandmates appear.
```

**3. Record the demo video.** Use a laptop browser with the address bar in frame, recording with Cmd+Shift+5. It runs 3–5 minutes and needs no audio. Upload it to YouTube as **Unlisted**.

Before recording:
- Remove music-chairs at myaccount.google.com → Security → Your connections to third-party apps & services, so Google shows the full consent screens.
- Have a test group you organize with at least one **confirmed** rehearsal in the coming weeks.
- Sign out of music-chairs.
- A test Google account with a few dummy contacts keeps real contacts out of the video.

Shots:
1. **App and policy (~20 s).** Open https://rehearse.dalan.dev and scroll to "What music-chairs does". Click **Privacy policy** and scroll through the permissions table.
2. **Sign-in and consent (~45 s).** Click **Sign in with Google**, from the group's invite link or the profile menu. On Google's screen, pause on:
   - the app name "music-chairs";
   - the permissions listed;
   - the address bar scrolled so `client_id=` is readable.

   Click **Allow** and land back in the app.
3. **calendar.events.owned (~60 s).**
   - On the group's **Schedule** page, turn on **Add rehearsals to my Google Calendar**. Show the consent screen if Google asks.
   - In another tab, show the confirmed rehearsal in Google Calendar.
   - Back in music-chairs, turn it off, refresh Google Calendar and show the event gone.
4. **contacts.readonly and contacts.other.readonly (~60 s).**
   - On the group page, click **Add members**, then **Use your Google contacts**. Show that consent screen with the address bar and click **Allow**.
   - Type a name and show the `Name <email>` suggestions. Pick one and click **Add**.
   - Go back to the group page to show the new member.
5. **Optional (~20 s).** Open the picture menu, choose **Disconnect Google** and confirm. Show music-chairs gone from the Google account's connected apps.

Free/busy (greyed-out busy times) is non-sensitive and doesn't need to be shown.

**4. Submit.** In the **Verification Center**, submit for verification with the justification and the YouTube link. Google replies by email within a few days to a few weeks, sometimes with questions.

Done when the Verification Center shows the app as verified and signing in no longer shows the warning. If the app misbehaves while you record, send a screenshot.
