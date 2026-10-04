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

Settled at phase start (operator, 2026-10-03):

- Terraform itself, not OpenTofu.
- State locking uses S3's own lock file next to the state, with no DynamoDB table.
- Terraform manages `rehearse.dalan.dev` and the two Google Search Console verification TXT values on `dalan.dev`, which the app's Google verification depends on. Every other `dalan.dev` record stays untouched.
- `./bin/deploy bootstrap` creates the private, versioned, encrypted state bucket once, and does nothing if it already exists.

## Acceptance

- After adoption, `terraform plan` against the live account reports no changes.
- `./bin/deploy all` and `./bin/deploy smoke` pass through Terraform. The live database's schema version and row counts equal the pre-release copy. The instance's static IP, DNS answer and backup bucket are the same ones as before the phase.
- No CloudFormation stack for music-chairs remains, and no resource it created was deleted.
- `./bin/check all` passes, including Terraform formatting and validation.

User Demo:

- **Entry point.** On the laptop, in the repository, with a fresh `aws login --profile music-chairs`.
- **Suggested inputs.**
  1. Run `./bin/deploy infra --dry-run --profile music-chairs`.
  2. Run `./bin/deploy infra --profile music-chairs`.
  3. In the AWS console, open **CloudFormation** in us-west-2 and us-east-1, **Lightsail** → Instances and Networking, and **S3**.
  4. On your phone, open https://rehearse.dalan.dev and one of your groups.
- **What to look for.**
  - Both runs say Terraform's plan has no changes.
  - CloudFormation lists no music-chairs stacks in either region.
  - Lightsail shows the same instance and static IP as before.
  - S3 shows the backup bucket, plus a new state bucket holding the state file.
  - The site and your group's data are exactly as before.
  - `dig TXT dalan.dev` still shows both Google verification values.
- **Variations to explore.** Change the monthly budget amount in the Terraform configuration and run the dry run: the plan shows exactly that one change. Revert it before applying anything.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".
