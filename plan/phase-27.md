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

From the operator's scope answer "everything, including the minor items" (3c). Rulings at phase start (operator, 2026-10-11), each the recommended option where one was offered:

- **Wide screens:** the request page's heat map shows two months side by side on screens about 1024 px and wider; the page widens only there; phones are unchanged.
- **Avatar:** outside a group the avatar shows the initials of the name the person uses in their groups (or their Google name), with a person icon only when there is no name at all; the same initials on every page, never "?".
- **Minor items included:** a shorter time-zone list (starting a group preselects the device's time zone and lists common zones first, with every zone still available); one-tap Mornings / Afternoons / Evenings presets for a new availability request's times of day; 44 px tap areas for small standalone links (the group breadcrumb, "Back to the group"); grey hint paragraphs capped at a comfortable reading width.
- **Already settled elsewhere:** week starts stay Sunday (Phase 25 ruling "Sunday everywhere"); the Google free/busy lookup on each tick stays (accepted in Phase 19.2).

## Acceptance

- `./bin/test project/tests` covers what is checkable; the second critique and audit are reported.
- `./bin/check all` passes and CI is green on the pull request; merging deploys.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, then on a laptop, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. On the phone, open an availability request in a group you organize and tick and untick dates on its calendar; drag across the hour bar when adding a time.
    2. Open the privacy page on the phone.
    3. On the home page and the Groups page, look at the avatar in the header; then open a group and look again.
    4. On Groups, start creating a group (you can stop before saving) and look at the time-zone choice.
    5. Start a new availability request and try the Mornings / Afternoons / Evenings choices.
    6. On the laptop, open the same availability request as an organizer and look at "When people are free".
  - **What to look for.**
    - Date cells and the hour bar are easy to hit with a thumb; nothing scrolls sideways.
    - The privacy page's permission table reads cleanly on the phone, with no words broken one letter per line.
    - The avatar shows your initials on every page, never "?".
    - Your own time zone is already chosen, with common zones near the top.
    - A preset fills the times of day in one tap.
    - On the laptop, the heat map shows two months side by side.
    - Breadcrumb and "Back to the group" links are easy to tap; grey hints don't run the full width of a wide screen.
  - **Variations to explore.** Light and dark mode; a narrow (320 px) phone; a request whose dates fall within one month.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".

## Inherited from Phase 26

Pinned by [Phase 26](phase-26.md): the "Rehearsal room" identity — indigo `--primary` as the one accent (primary actions, chosen answers, the heat map), a neutral focus ring, the system display serif for the "music·chairs" wordmark and `h1`, and the confirmed-rehearsal payoff (leading confirmed schedule cards; "Coming up" cards on the home page). The product and design context lives in `project/PRODUCT.md` and `project/DESIGN.md`; run Impeccable's polish, critique and audit from `project/` (or with `--target project/...`) so it finds them. The 42rem column is the recorded line-length cap.
