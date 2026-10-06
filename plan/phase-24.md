---
id: "24"
title: "Identity: a recorded product and design context, a wordmark, an accent colour and a payoff"
depends_on: ["23"]
informs: ["25"]
---

# Phase 24 — Identity: a recorded product and design context, a wordmark, an accent colour and a payoff

**Goal**: music-chairs looks like itself, not a stock theme: its product and design context is recorded for later reviews, and confirming a rehearsal feels like the moment it is.

## Deliverables

- `PRODUCT.md` and `DESIGN.md` recorded (Impeccable `init` and `document`), consistent with `briefs/BRIEF.md` rather than duplicating it.
- A real wordmark in the header; one considered accent colour on the neutral base, used for the primary action and the heat map; type tuned (line length capped, hierarchy).
- A confirmed rehearsal shown as the payoff (who is coming, when, where), on the schedule and the home page.

## Decisions (operator, 2026-10-05)

From the operator's answer to the critique's tone question: "give it some identity: a real wordmark, a touch of colour, and a confirmation that feels like the payoff" (2b). To be tightened at phase start (the operator chooses among concrete directions).

## Acceptance

- `./bin/test project/tests` covers what is checkable; the look is the operator's.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".
