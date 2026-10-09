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

From the operator's answer to the critique's tone question: "give it some identity: a real wordmark, a touch of colour, and a confirmation that feels like the payoff" (2b). Ruling at phase start (operator, 2026-10-06), choosing among three concrete directions ("Rehearsal room", "Concert hall", "Score paper"): **Rehearsal room**. A deep indigo accent on the neutral base (light about `oklch(0.50 0.17 275)`, dark about `oklch(0.72 0.14 275)`) for the primary action, the heat map's tints and the confirmed-rehearsal payoff; a serif wordmark "music·chairs" (bold, with a middle dot) from system serif fonts (no outside fonts: the site loads nothing from other sites); the payoff is an indigo-edged card with a check, "You're on", the date, time and place, and who is coming. Amber stays for warnings and red for destructive actions.

## Acceptance

- `./bin/test project/tests` covers what is checkable; the look is the operator's.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, signed in to a group that has a confirmed rehearsal coming up (confirm one on the schedule first if needed), open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Look at the home page.
    2. Open the group page, then the schedule.
    3. Open an availability request as an organizer and look at "When people are free".
    4. Switch your phone between light and dark mode and repeat steps 1–2.
  - **What to look for.**
    - The header shows the serif "music·chairs" wordmark.
    - The home page and the schedule show the confirmed rehearsal as an indigo-edged "You're on" card with the date, time, place and who is coming.
    - Primary buttons (like "Confirm for everyone" and "Propose selected") are indigo; the heat map shades in indigo; amber warnings and red Delete still stand apart from it.
    - Long text lines don't run wider than comfortable reading on a laptop; headings read clearly above body text.
  - **Variations to explore.** A member who said No to the confirmed date; a rehearsal nobody has answered yet; a laptop-width window.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".

## Inherited from Phase 25

Pinned by [Phase 25](phase-25.md): an amber `--warning` token (light `oklch(0.47 0.12 72)`, dark `oklch(0.82 0.14 80)`, in `project/app/app.css` beside `--success`) is used for the schedule's "who isn't free" summaries; red is reserved for destructive actions, and Delete uses the `outline-destructive` variant at the end of the actions row. Any accent colour this phase chooses must stay distinguishable from both. The home page's "What music-chairs does" pitch now shows only to newcomers (no group and no Google account).
