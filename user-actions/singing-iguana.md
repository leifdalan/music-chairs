---
slug: singing-iguana
title: Delete the unused dalan.dev hosted zone in the other AWS account
status: pending
category: infra
urgency: low
blocks:
  - Nothing; saves $0.50/month
filed: 2026-10-02
needed_at: now
source: kickoff
---

Before Phase 5, `dalan.dev` was briefly delegated to a Route 53 hosted zone you created in a different AWS account (probably 447567360017), with nameservers `ns-973.awsdns-57.net`, `ns-306.awsdns-38.com`, `ns-1399.awsdns-46.org` and `ns-1615.awsdns-09.co.uk`. The registrar now points `dalan.dev` at the zone in account 777460179484 (`ns-1549`, `ns-145`, `ns-1003`, `ns-1464`), so the old zone serves nothing and costs $0.50/month.

In that other account's console, open **Route 53 → Hosted zones → dalan.dev**, delete every record except the NS and SOA records, then delete the hosted zone. Do not touch the `dalan.dev` zone in account 777460179484.
