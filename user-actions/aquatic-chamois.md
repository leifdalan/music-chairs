---
slug: aquatic-chamois
title: Confirm the music-chairs alert subscription email
status: pending
category: access
urgency: high
blocks:
  - Outage alert emails (none are delivered until confirmed)
filed: 2026-10-02
needed_at: within 48 hours of the infra run that creates the subscription
source: kickoff
refs:
  - project/deploy/terraform/alerts.tf
  - project/deploy/README.md
---

The outage alerts for https://rehearse.dalan.dev go to an email subscription on the alert topic (AWS SNS, region us-east-1). AWS sends one email titled **"AWS Notification - Subscription Confirmation"**. Until you click its **Confirm subscription** link, outage alerts are not delivered.

The first subscription, created in Phase 5, was never confirmed, and AWS removes an unconfirmed subscription after 48 hours. Since Phase 16 the alerts are managed by Terraform, and the next `./bin/deploy infra` (or `all`) creates a fresh subscription. That sends a new confirmation email. Click it within 48 hours. Otherwise AWS removes it again, and every later infrastructure plan shows "1 to add" for `aws_sns_topic_subscription.alerts` until one is confirmed.

The cost budget (alert above $10 actual, warning above $9.50 forecast) emails you directly and needs no confirmation.

Check your inbox (and spam) for the confirmation email and click the link. To verify afterwards: in the AWS console, **SNS → Subscriptions** (region us-east-1) should list your address as **Confirmed**, and `./bin/deploy infra --dry-run --profile music-chairs` should report "plan: no changes".
