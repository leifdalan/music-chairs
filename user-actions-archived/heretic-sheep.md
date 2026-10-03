---
slug: heretic-sheep
title: Create an admin IAM user for music-chairs and stop deploying as root
status: done
closed: 2026-10-02
category: credentials
urgency: medium
blocks:
  - Deploys after the first one (they should not use the root sign-in)
filed: 2026-10-02
needed_at: now
source: kickoff
refs:
  - bin/deploy
  - project/deploy/README.md
---

The `music-chairs` CLI profile is signed in as the root user of AWS account 777460179484, so Phase 5's deploys run as root. AWS advises keeping root for account-level tasks only, so later deploys should sign in as an IAM user. Only you can do this, in the AWS console:

1. Sign in to the console as root, open **IAM → Users → Create user**, name it (for example `leif`), and enable **AWS Management Console access** with a password you set.
2. Attach the AWS managed policies **AdministratorAccess** (deploys create and update stacks, Lightsail, Route 53, S3, IAM, budgets) and **SignInLocalDevelopmentAccess** (needed for `aws login`).
3. Turn on **MFA** for the new user, and if not already done, for the root user too.
4. On your Mac, switch the CLI profile to the new user:
   ```sh
   aws logout --profile music-chairs
   ```
   ```sh
   aws login --profile music-chairs
   ```
   and sign in as the new IAM user in the browser.
5. Check it: `aws sts get-caller-identity --profile music-chairs` should show account `777460179484` and an `arn:aws:iam::777460179484:user/…` ARN rather than `…:root`.

`bin/deploy` checks the account, not the user, so nothing in the repository changes.

## Disposition

On 2026-10-02 the agent, signed in as root at the operator's request, created IAM user `leif` with AdministratorAccess and SignInLocalDevelopmentAccess and a console password that had to be reset at first sign-in. The operator signed in to the console as `leif` and reported turning on MFA (not observable by the agent). The agent then switched the `music-chairs` CLI profile to `leif` through `aws login` and verified `aws sts get-caller-identity` returns `arn:aws:iam::777460179484:user/leif`; `./bin/deploy smoke --dry-run` confirms the account. Recurring learning: none beyond this note; signing in as an IAM user needs the account-ID form, not the email-first page, which offers only root and AWS Builder ID.
