---
slug: traditional-quetzal
title: Enable the Google People API and add the contacts scopes to the OAuth app
status: done
closed: 2026-10-03
category: credentials
urgency: medium
blocks:
  - Real Google contact autocomplete on https://rehearse.dalan.dev and the Phase 13 User Demo (tests fake Google and do not wait for this)
filed: 2026-10-03
needed_at: "Phase 13"
source: plan
refs:
  - plan/phase-13.md
---

Phase 13 lets an organizer add members by picking them from their Google contacts. That needs two console steps in the Google Cloud project `music-chairs` (the same one as sign-in and Calendar). Only you can do them; both work from a phone browser, though a laptop is easier.

1. **APIs & Services → Library**, search **People API**, and click **Enable**.
2. **Google Auth Platform → Data Access → Add or remove scopes**, and add:
   - `https://www.googleapis.com/auth/contacts.readonly` (your saved contacts)
   - `https://www.googleapis.com/auth/contacts.other.readonly` (people you have emailed, which Google keeps as "other contacts")

   Save. Google lists both as sensitive; the app stays unverified by your earlier decision, so the organizer sees the "unverified app" warning when first granting contacts access. Phase 13's start decides whether "other contacts" are used; adding both now avoids a second trip.

Nothing changes in the repository or AWS for these steps.

## Disposition

The operator enabled the People API and added the contacts scopes on 2026-10-03, the day it was filed, ahead of Phase 13. Closed on the operator's word; the real contact autocomplete is first exercised by the Phase 13 User Demo. No recurring learning.
