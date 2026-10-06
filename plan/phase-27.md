---
id: "27"
title: "Fit and finish, then measure: the remaining audit fixes, polish, and a second critique and audit"
depends_on: ["26"]
informs: []
---

# Phase 27 — Fit and finish, then measure: the remaining audit fixes, polish, and a second critique and audit

**Goal**: the remaining findings from the 2026-10-05 critique and audit are fixed, and a second Impeccable critique and audit measure the change.

## Deliverables

- Date cells and the hour bar's targets at least 44 px at every width; the privacy page's permission table readable on phones; a consistent avatar; the heat map using wide screens; the remaining minor observations.
- An Impeccable polish pass, then a second site-wide critique and audit, with scores compared to 27/40 and 16/20.

## Decisions (operator, 2026-10-05)

From the operator's scope answer "everything, including the minor items" (3c). To be tightened at phase start.

## Acceptance

- `./bin/test project/tests` covers what is checkable; the second critique and audit are reported.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".
