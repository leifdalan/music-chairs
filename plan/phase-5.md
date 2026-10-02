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

## Inherited from Phase 1

Pinned by [Phase 1](phase-1.md) and binding on this phase's deployment choice:

- **Persistence is one SQLite file** opened through Node's built-in `node:sqlite` by `project/app/.server/store.ts`, located by the `MUSIC_CHAIRS_DB` environment variable (default `data/music-chairs.sqlite` relative to the server's working directory), with WAL journaling. It needs exactly one writer process on a host with a durable local filesystem. WAL relies on single-host shared memory, so a network filesystem (EFS/NFS) or several concurrent writers (for example unreserved Lambda concurrency) is not a safe home for it as written. A managed database instead means replacing `store.ts` directly (greenfield), not adding a second backend.
- **Backups**: the deployment backs the database file up to S3; whether by periodic snapshot copy or streaming replication is this phase's decision.
- **Idle cost trade-off** (brief, Open question 7): a single small always-on instance or container with a local volume costs a few dollars a month at idle; a serverless shape that reaches a shared filesystem needs a VPC, and Phases 6–7 call Google APIs, which from inside a VPC needs a NAT path that typically costs more at idle than the instance.
- **Cookie `Secure` flag**: the device-identity cookie `mc_members` (`project/app/.server/membership.ts`) is set without `Secure` because local development and phone testing run over plain HTTP. Once served over TLS, set `Secure`.
- **Invite-link origin**: `project/app/routes/group.tsx` builds the invite URL from the request URL's origin. Behind a TLS-terminating proxy, load balancer or CDN, derive it from a configured public URL or trusted forwarded headers so organizers never copy an internal or `http:` link.
- **Deploy smoke starting point**: `project/scripts/smoke.sh` already exercises create → invite → join, not-found pages and restart persistence against a locally served production build.

## Acceptance

- The deploy command succeeds and the smoke check passes against the deployed URL; evidence recorded.
- `./bin/check all` passes, including the new deploy proof.
- User Demo: open the deployed URL on a phone, create a group and join it from a second device. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (hosting), Open question 7.
