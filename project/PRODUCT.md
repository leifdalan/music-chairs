# Product

<!-- impeccable:product-schema 1 -->

Recorded for design reviews (Impeccable `init`, plan Phase 26) from the product brief and the operator's rulings, and approved by the operator on 2026-10-06. Run Impeccable from this `project/` directory (or with `--target project/...`) so it finds this file and `DESIGN.md`. The product brief stays the authority for behaviour; this file states only what design work needs.

## Platform

web

## Users

Small music ensembles of about 2 to 12 people. An **organizer** asks the band when it can rehearse, reads who is free, proposes rehearsals and confirms them. **Members** give the times they are free and answer Yes, No or Maybe to proposed rehearsals. Most people use it on a phone, often in a spare minute; organizers also use a laptop.

## Product Purpose

Get everyone into the same room. music-chairs replaces scheduling by group text, where availability gets lost in the scroll and nobody is sure what was decided. The loop: an organizer sends an **availability request** over a span of dates and times of day; members tick the dates they are free; the organizer reads a heat map of who is free and proposes **rehearsals**; members answer; the organizer confirms. Success is a confirmed rehearsal everyone knows about, with as few taps as possible.

## Positioning

Built around rehearsals rather than generic meeting polls: availability requests that own their proposed rehearsals, a who-is-free heat map, required and optional players with warnings when a required player can't come, recurring rehearsals, and confirmed dates written to members' calendars.

## Operating Context

A band's group chat is the usual starting point: the organizer shares an invite link, members join with just their name (Google sign-in is optional and adds calendar clashes, calendar writing and contacts). Times are in the group's time zone and shown with AM/PM.

## Capabilities and Constraints

- Name-only joining; Google is optional.
- Privacy by default: members see counts of who is free unless the organizer shows names.
- Works without JavaScript (every action is a form); it is enhanced, not required.
- No outside fonts, scripts or trackers: the site loads nothing from other sites.
- Terminology: "availability request", "proposed rehearsal", "answer" means Yes / No / Maybe only, a request's per-member record is a "response".

## Brand Commitments

- Voice: plain, calm and friendly to musicians; short sentences; no jargon.
- Identity "Rehearsal room" (operator ruling, 2026-10-06): an indigo accent on a neutral base, a serif wordmark "music·chairs", and a confirmed rehearsal shown as a "You're on" payoff.
- Colour meanings are fixed: indigo is the accent, amber is for who isn't free, red is only for destructive actions, green is for saved and answered states.

## Evidence on Hand

No testimonials, press or customer content exist; none may be invented.

## Product Principles

1. The next step is always obvious: each page leads with the job it exists for.
2. Fewer taps: changes save as they are made; confirming is one tap.
3. Calm, not alarming: warnings inform; red is kept for deleting.
4. Private by default, inclusive by design: name-only joining, counts before names.

## Accessibility & Inclusion

WCAG AA contrast in light and dark themes; 44 px touch targets; everything reachable by keyboard and screen reader; status announced once, not per row.
