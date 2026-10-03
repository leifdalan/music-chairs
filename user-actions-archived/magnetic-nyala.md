---
slug: magnetic-nyala
title: Enable the Google Calendar API and add the Calendar scopes to the OAuth app
status: done
closed: 2026-10-03
category: credentials
urgency: high
blocks:
  - Real Calendar import and writing on https://rehearse.dalan.dev and the Phase 7 User Demo (tests fake Google and do not wait for this)
filed: 2026-10-02
needed_at: "Phase 7"
source: kickoff
refs:
  - plan/phase-7.md
---

Phase 7 reads members' free/busy and writes rehearsal events, which needs two console steps in the Google Cloud project `music-chairs` (the same one as sign-in). Only you can do them.

1. **APIs & Services → Library**, search **Google Calendar API**, and click **Enable**.
2. **Google Auth Platform → Data Access → Add or remove scopes**, and add:
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/calendar.events.freebusy`
   - `https://www.googleapis.com/auth/calendar.events.owned`

   Save. Google lists them as sensitive; the app stays unverified by your decision, so members see an "unverified app" warning when granting Calendar access (sign-in is unaffected), and at most 100 Google accounts can grant it. The phase's plan may end up using only one of the two free/busy scopes; adding both now avoids a second trip.

Nothing changes in the repository or AWS for these steps.

## Disposition

The operator enabled the Google Calendar API and added the Calendar scopes; real Calendar import and rehearsal writing work on https://rehearse.dalan.dev. Closed on the operator's word on 2026-10-03. No recurring learning.
