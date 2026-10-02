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

## Acceptance

- The deploy command succeeds and the smoke check passes against the deployed URL; evidence recorded.
- `./bin/check all` passes, including the new deploy proof.
- User Demo: open the deployed URL on a phone, create a group and join it from a second device. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (hosting), Open question 7.
