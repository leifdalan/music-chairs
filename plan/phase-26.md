---
id: "26"
title: "Identity: a recorded product and design context, a wordmark, an accent colour and a payoff"
depends_on: ["25"]
informs: ["27"]
---

# Phase 26 — Identity: a recorded product and design context, a wordmark, an accent colour and a payoff

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

## Inherited from Phase 25

Pinned by [Phase 25](phase-25.md): an amber `--warning` token (light `oklch(0.47 0.12 72)`, dark `oklch(0.82 0.14 80)`, in `project/app/app.css` beside `--success`) is used for the schedule's "who isn't free" summaries; red is reserved for destructive actions, and Delete uses the `outline-destructive` variant at the end of the actions row. Any accent colour this phase chooses must stay distinguishable from both. The home page's "What music-chairs does" pitch now shows only to newcomers (no group and no Google account).
