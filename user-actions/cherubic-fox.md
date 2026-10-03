---
slug: cherubic-fox
title: Prepare Google verification for the Calendar scopes
status: deferred
category: credentials
urgency: low
blocks:
  - Calendar import and writing for more than 100 Google accounts without the "unverified app" screen (Phase 7)
filed: 2026-10-02
needed_at: "Phase 7"
source: kickoff
refs:
  - project/deploy/README.md
  - plan/phase-7.md
---

Phase 7 will ask Google for Calendar access, which Google classes as a sensitive scope. Sign-in (Phase 6) uses only basic scopes and needs none of this. Before Phase 7 ships to the band at large, Google's verification needs, in the Google Cloud project `music-chairs`:

1. A public home page and a privacy policy hosted on `dalan.dev` (Phase 7 can add these pages to the app; you approve their wording).
2. `dalan.dev` verified in Google Search Console by the account that owns the Cloud project.
3. A short video showing how a user signs in and grants the Calendar scopes, and a sentence per scope saying why a narrower one isn't enough.
4. Submitting the app for verification under **Google Auth Platform → Verification Center**.

Until verification, up to 100 Google accounts can still grant access after an "unverified app" warning, which may be enough for one band. Decide at Phase 7's start whether to verify at all.
