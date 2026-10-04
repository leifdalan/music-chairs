---
slug: likable-hamster
title: Verify dalan.dev in Search Console, publish the Google app, and resubmit it for verification
status: pending
category: access
urgency: medium
blocks:
  - Removing Google's "hasn't verified this app" warning at sign-in
  - Phase 14's manual acceptance (Google accepting the privacy policy and home page)
filed: 2026-10-03
needed_at: after Phase 14 is delivered (the Search Console step can be done now)
source: operator
refs:
  - plan/phase-14.md
---

Google refused the first verification request: the privacy policy URL had no policy, and the home page's domain wasn't registered to you.

1. **Now:** in Google Search Console (https://search.google.com/search-console, signed in as the Google account that owns the Cloud project), finish adding the **Domain** property `dalan.dev` by clicking **Verify**. The TXT record `google-site-verification=z2fjXWiTXprhwHTJTC_ruSmEdgwP0VTaD_0Q9GwCUQw` was added to the `dalan.dev` Route 53 zone on 2026-10-03 and is publicly visible. Keep the record afterwards: Google re-checks it.
2. **Now:** in Google Cloud Console → **Google Auth Platform → Audience**, make sure the publishing status is **In production**. In Testing, Google drops Calendar and contacts permissions after 7 days.
3. **After Phase 14 is live:** in **Google Auth Platform → Branding**, set the privacy policy link to `https://rehearse.dalan.dev/privacy` (home page stays `https://rehearse.dalan.dev`), wait at least 24 hours after step 1, then resubmit in the **Verification Center**. Google may ask for a short demo video of signing in, the consent screen and each permission in use, and may email follow-up questions.

Done when the Verification Center shows the app as verified and signing in no longer shows the warning.
