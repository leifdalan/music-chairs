---
slug: aquatic-chamois
title: Confirm the music-chairs alert subscription email
status: pending
category: access
urgency: high
blocks:
  - Outage alert emails (none are delivered until confirmed)
filed: 2026-10-02
needed_at: now
source: kickoff
refs:
  - project/deploy/alerts.yaml
---

The first `bin/deploy infra` creates the outage alert topic in AWS (us-east-1) with your email address as a subscriber. AWS sends one email titled **"AWS Notification - Subscription Confirmation"**; until you click its **Confirm subscription** link, outage alerts for https://rehearse.dalan.dev are not delivered.

The cost budget (alert above $10 actual, warning above $9.50 forecast) emails you directly and needs no confirmation.

Check your inbox (and spam) for the confirmation email and click the link. To verify afterwards: in the AWS console, **SNS → Subscriptions** (region us-east-1) should list your address as **Confirmed**.
