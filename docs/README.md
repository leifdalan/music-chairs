# `docs/` — Third-Party Documentation

This directory holds externally authored reference material the project depends on — vendor documentation, specifications, RFCs, API references, standards text, license texts — pinned locally so that briefs and policies can cite exact wording and every role can read the cited authority without leaving the repository.

Nothing here is written by the project about the project. A file under `docs/` is verbatim third-party text (or a verbatim excerpt) and never links to anything else in this repository; commentary on a pinned document is a brief, and a rule derived from one is a policy. The full contract — what belongs here, naming, licensing, the citation direction, and what `bin/check-catalogs` enforces — is [`policies/docs.md`](../policies/docs.md).

## Catalog

Every top-level entry in this directory has one row here. `As of` is the date or version the source itself carries; `Retrieved` is when the project fetched it. `Basis` names the license or terms under which the material is redistributed here. `Pinned for` names the brief, policy, or plan concern that depends on it and says whether the pin is an excerpt.

| Document | Source | As of | Retrieved | Basis | Pinned for |
|---|---|---|---|---|---|
| [hashicorp-terraform-provider-aws-lightsail-instance-public-ports-6.67.0.md](hashicorp-terraform-provider-aws-lightsail-instance-public-ports-6.67.0.md) | https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/v6.67.0/website/docs/r/lightsail_instance_public_ports.html.markdown | AWS provider v6.67.0 | 2026-10-04 | MPL-2.0 (terraform-provider-aws repository licence) | Phase 16: the ports resource closes every port it does not list and cannot be imported; whole page. |
| [hashicorp-terraform-provider-aws-sns-topic-subscription-6.67.0.md](hashicorp-terraform-provider-aws-sns-topic-subscription-6.67.0.md) | https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/v6.67.0/website/docs/r/sns_topic_subscription.html.markdown | AWS provider v6.67.0 | 2026-10-04 | MPL-2.0 (terraform-provider-aws repository licence) | Phase 16: email subscriptions need confirming, unconfirmed ones cannot be deleted by Terraform, and import is by subscription ARN; whole page. |
