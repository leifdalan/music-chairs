---
name: music-chairs
description: One place for your ensemble to collect availability, choose rehearsal times and confirm who is coming.
colors:
  rehearsal-indigo: "oklch(0.5 0.17 275)"
  rehearsal-indigo-night: "oklch(0.72 0.14 275)"
  not-free-amber: "oklch(0.47 0.12 72)"
  not-free-amber-night: "oklch(0.82 0.14 80)"
  delete-red: "oklch(0.577 0.245 27.325)"
  saved-green: "oklch(0.52 0.13 150)"
  paper: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
typography:
  display:
    fontFamily: 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif'
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
rounded:
  md: "0.625rem"
---

# Design System: music-chairs

Recorded in plan Phase 26 (Impeccable `document`) from the shipped tokens in `app/app.css`. The qualitative language (north star, voice, colour names) comes from the operator's 2026-10-06 ruling choosing "Rehearsal room" and the `PRODUCT.md` approval round. Run Impeccable from this `project/` directory so it finds this file.

## Overview

**Creative North Star: "Rehearsal room"** — the calm of an evening rehearsal space. A neutral, quiet base; one deep indigo accent for the thing to do next and for what is settled; a serif wordmark and page titles that feel made for musicians rather than a stock theme. Built on Tailwind 4 with shadcn neutral tokens, light and dark.

## Colors

### Primary

**Rehearsal indigo** `oklch(0.5 0.17 275)` (dark theme `oklch(0.72 0.14 275)`): primary buttons, the chosen answer, ticked dates, the time bar's fill, selected chips, links styled as buttons, the heat map's shades and the confirmed-rehearsal payoff. About 6.3:1 with white text (AA).

### Neutral

shadcn neutral greys for background, cards, borders and muted text; focus rings stay neutral so they show on indigo.

### Named Rules

- **One accent.** Indigo is the only accent; nothing else competes with it.
- **Fixed meanings.** Amber (`--warning`) only for who isn't free; red (`--destructive`) only for destructive actions (Delete uses the outline variant); green (`--success`) only for saved and answered states.

## Typography

Display: the system serif stack (wordmark and `h1`), bold, tight leading. Body and headings below `h1`: the system sans stack. No web fonts: the site loads nothing from other sites.

### Hierarchy

`h1` serif 1.75rem bold; `h2` sans 1.125rem semibold; `h3` sans 1rem semibold; body 1rem. Hints in muted grey, small.

## Layout

One centred column, `max-w-2xl` (42rem) with 1rem gutters: this column is the line-length cap (about 70–75 characters of body text). Spacing on Tailwind's 4px scale.

## Elevation & Depth

Mostly flat: borders separate rows and cards. Buttons keep shadcn's faint `shadow-xs`; panels (notices, the invite, calendar options, the account box) use `shadow-sm`; overlays (dialogs, menus, toasts) use `shadow-lg`.

## Shapes

Radius 0.625rem (cards and buttons), smaller for chips and cells.

## Components

### Buttons

shadcn variants: primary (indigo), outline (neutral), outline-destructive (red text and border, for Delete), destructive (solid red, kept for confirm dialogs). Minimum height 44 px.

### Cards / Containers

Rehearsal cards are separated by rules; a **confirmed** rehearsal's card is outlined in 2px indigo and starts with its payoff. No cards inside cards.

### Inputs / Fields

Native inputs and selects, 16px text (no zoom on iOS); time is picked on the hour bar with From/Until selects beneath.

### Navigation

A header with the wordmark (home) and Groups; a footer link to the privacy policy.

### The payoff (signature component)

A confirmed rehearsal's next date: a check icon (lucide `Check`) and "You're on" in the display serif and indigo, or what the viewer answered; the date, time and place; who is coming (names when allowed, else a count). On the schedule it leads the confirmed card; on the home page "Coming up" shows one per group as a card with a 2px indigo border.

## Do's and Don'ts

### Do:

- Use indigo for the one next action and for settled things; keep everything else neutral.
- Keep warnings amber and inside one status region; keep red for deleting.
- Use the system serif only for the wordmark, `h1` and the payoff headline (operator ruling: no outside fonts).

### Don't:

- Don't add a second accent colour or gradients.
- Don't nest a bordered card inside another card; the payoff on the schedule is the card's own top.
- Don't give the payoff a side stripe: its emphasis is a full 2px indigo border (operator ruling: "indigo-edged"). The one deliberate stripe is a free-time row's indigo left border when everyone needed is free, or when it is ticked to propose.
