---
id: "16"
title: "Infrastructure defined in Terraform"
depends_on: ["15"]
informs: ["17"]
---

# Phase 16 — Infrastructure defined in Terraform

**Goal**: every AWS resource music-chairs runs on is defined in Terraform and changed only through it, replacing the two CloudFormation stacks, while the live server, its database and its address stay exactly as they are.

## Deliverables

- A Terraform configuration under `project/deploy/` defining what the CloudFormation stacks define today:
  - from `project/deploy/stack.yaml`: the Lightsail instance, its static IP, the `rehearse.dalan.dev` DNS record, the private versioned and encrypted backup bucket with its lifecycle rules, and the backup and app IAM users with their policies;
  - from `project/deploy/alerts.yaml`: the alert topic and its email subscription, the Route 53 health check, the outage alarm in us-east-1, and the monthly budget with its actual and forecast thresholds.
- The live resources are adopted into Terraform state without being replaced: no new instance, IP address, bucket or DNS change. The CloudFormation stacks are then retired without deleting anything they created, and `stack.yaml`, `alerts.yaml` and the CloudFormation code in `bin/deploy` are removed (greenfield: no dual path).
- Terraform's state lives in an encrypted, versioned S3 bucket in the same account, with locking, so a run from another machine sees the same state.
- Terraform is pinned to an exact version and installed by `./bin/setup` like the rest of the toolchain, with its checksum verified. `./bin/deploy infra` shows the plan and applies it, and its dry run shows the plan without applying. `./bin/deploy all` keeps working end to end.
- `./bin/check` runs `terraform fmt -check` and `terraform validate`. The deploy tests cover the new `bin/deploy` path without touching AWS. `project/deploy/README.md` describes the new flow.

## Decisions (operator, 2026-10-03)

- "I know this is a small project but I'd like for the infrastructure to be defined with either terraform or the AWS CDK, probably terraform is better." Terraform, then.
- Standing constraints from Phase 5 still hold: account 777460179484 through the `music-chairs` profile only, us-west-2 (alerts in us-east-1), under $10 a month, the Google client secret only in Parameter Store.

To settle at phase start:
- Terraform (HashiCorp's licence) or OpenTofu, its open-source fork.
- State locking: S3's own lock file, or a DynamoDB table.
- Whether Terraform also manages the `dalan.dev` hosted zone's other records, such as the two Google Search Console verification TXT values added by hand on 2026-10-03, or only the records music-chairs owns.
- Whether the state bucket is created by a one-time bootstrap step, or by hand as a user action.

## Acceptance

- After adoption, `terraform plan` against the live account reports no changes.
- `./bin/deploy all` and `./bin/deploy smoke` pass through Terraform. The live database's schema version and row counts equal the pre-release copy. The instance's static IP, DNS answer and backup bucket are the same ones as before the phase.
- No CloudFormation stack for music-chairs remains, and no resource it created was deleted.
- `./bin/check all` passes, including Terraform formatting and validation.
- User Demo, to be tightened at phase start: on the laptop, run the infra dry run and read the plan saying nothing will change. Then open https://rehearse.dalan.dev on a phone, and check the AWS console shows no CloudFormation stacks and the same Lightsail instance, IP and backup bucket as before.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".
