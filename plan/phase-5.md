---
id: "5"
title: "Deploy to AWS"
depends_on: ["4"]
informs: ["6", "7"]
---

# Phase 5 — Deploy to AWS

**Goal**: music-chairs runs on AWS at a stable public URL, on the simplest deployment that suits a hobby-scale app with a low or near-zero idle cost, so the band can start using the name-only scheduling loop for real.

## Deliverables

- A recorded choice of AWS services (for example Lambda versus containers, and which managed database) consistent with the persistence layer chosen in [Phase 1](phase-1.md) (brief, Open question 7).
- Infrastructure as code and a repeatable deploy command owned by the repository toolchain; secrets kept out of the repository.
- A deploy smoke check against the deployed URL.
- Direct proof for the `deploy` critical risk in `tests/proof-estate.yaml`, which this phase turns from not-applicable to applicable.
- Any human-only steps (AWS account, billing, domain) filed in `user-actions/`.

## Decisions (operator, 2026-10-02)

Settled at phase start:

- **Account and address.** AWS account 777460179484 through the local AWS CLI profile `music-chairs`, region us-west-2; the app serves `https://rehearse.dalan.dev`. The `dalan.dev` Route 53 hosted zone (`Z05992221270I1PQFMDW3`) is in that account and the registrar's nameservers already point to it. Cost ceiling: under $10/month.
- **Hosting: one Lightsail instance, `micro_3_0`** (1 GB memory, 40 GB disk, 2 TB transfer, $7/month), with a static IPv4 address and HTTPS from a free certificate on the instance.
- **Backups: nightly copy of the SQLite database to a private S3 bucket**, keeping 30 days.
- **Deploy identity: an admin IAM user**, created by the operator (filed in `user-actions/`); later deploys sign in as that user with `aws login`. This phase's first deploy may use the account's root sign-in.
- **Alerts:** an AWS Budgets alert at $10/month (and a forecast warning at $8), plus an outage alert, emailed to the operator. The address is supplied at deploy time and never stored in the repository.
- **Live data is kept (greenfield amended).** From this phase on, schema changes ship with forward-only migrations (`policies/greenfield-until-released.md` § Amendments in force). This phase introduces the versioned migration mechanism with the current schema as its baseline, so the band's data survives later phases.

## Inherited from Phase 1

Pinned by [Phase 1](phase-1.md) and binding on this phase's deployment choice:

- **Persistence is one SQLite file** opened through Node's built-in `node:sqlite` by `project/app/.server/store.ts`, located by the `MUSIC_CHAIRS_DB` environment variable (default `data/music-chairs.sqlite` relative to the server's working directory), with WAL journaling. It needs exactly one writer process on a host with a durable local filesystem. WAL relies on single-host shared memory, so a network filesystem (EFS/NFS) or several concurrent writers (for example unreserved Lambda concurrency) is not a safe home for it as written. A managed database instead means replacing `store.ts` directly (greenfield), not adding a second backend.
- **Backups**: the deployment backs the database file up to S3; whether by periodic snapshot copy or streaming replication is this phase's decision.
- **Idle cost trade-off** (brief, Open question 7): a single small always-on instance or container with a local volume costs a few dollars a month at idle; a serverless shape that reaches a shared filesystem needs a VPC, and Phases 6–7 call Google APIs, which from inside a VPC needs a NAT path that typically costs more at idle than the instance.
- **Cookie `Secure` flag**: the device-identity cookie `mc_members` (`project/app/.server/membership.ts`) is set without `Secure` because local development and phone testing run over plain HTTP. Once served over TLS, set `Secure`.
- **Invite-link origin**: `project/app/routes/group.tsx` builds the invite URL from the request URL's origin. Behind a TLS-terminating proxy, load balancer or CDN, derive it from a configured public URL or trusted forwarded headers so organizers never copy an internal or `http:` link.
- **Deploy smoke starting point**: `project/scripts/smoke.sh` already exercises create → invite → join, not-found pages and restart persistence against a locally served production build.

## Acceptance

Executable:

- The deploy command succeeds and the smoke check passes against the deployed URL; evidence recorded.
- `./bin/check all` passes, including the new deploy proof.

User Demo:

- **Entry point.** Open `https://rehearse.dalan.dev` on your phone (mobile data or Wi-Fi, no local server).
- **Suggested inputs.** Create a group with your name and time zone; open the invite link on a second device (or a laptop) and join as `Cellist`; add a weekly availability slot on each device; propose and confirm a rehearsal and answer it from both devices.
- **What to look for.** The browser shows a valid padlock for `rehearse.dalan.dev`; the invite link starts with `https://rehearse.dalan.dev/join/`; both devices see the same group, rehearsal and answers; pages load promptly on a phone.
- **Variations to explore.** Confirm the budget and outage alert emails arrived (and click AWS's confirmation links). After the next nightly backup, check the S3 bucket holds a dated copy. Ask a bandmate to try the invite link on their own phone.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (hosting), Open question 7.
