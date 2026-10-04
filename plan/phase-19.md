---
id: "19"
title: "Visual cleanup"
depends_on: ["18"]
informs: []
---

# Phase 19 — Visual cleanup

**Goal**: the interface looks clean and calm, with one consistent visual style and a clear primary action on every screen, once the flows of Phases 8–18 have settled.

## Deliverables

- A small visual system (type scale, spacing, colours, button hierarchy) recorded in the repository and applied to every page.
- Each page's purpose and primary action made obvious; secondary controls quieter.

## Decisions (operator, 2026-10-03)

- Deferred by the operator until after Phases 8–10: "I'm going to wait on visual feedback until after I've seen these pretty major changes." The operator's list of visual changes is collected at phase start.
- Renumbered from Phase 11 on 2026-10-03 so that it stays last, after the operator's further feature phases 11–14 (see `plan/INDEX.md`).

Added 2026-10-03: the operator will do a big UI/UX pass first to populate this phase's details, and will shop for a visual framework or theme compatible with React Router 8 (user action `satisfied-turkey`). This phase is planned from that pass and that choice; until both arrive it stays a sketch.

## Acceptance

- `./bin/test project/tests` and `./bin/check all` pass.
- User Demo: walk the main journeys on a phone and a laptop and judge the look. To be tightened at phase start, from the operator's list.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints" (works well on a phone).

## Inherited from Phase 15

Pinned by [Phase 15](phase-15.md), as moved by Phase 17: the tick-row picker on a request's page (`ProposeTimes` and `FreeTime` in `project/app/components/propose-times.tsx`, whole-row labels at least 44px tall with a checked outline, refusals shown next to **Propose selected**) and, below it, the **Propose a different time** disclosure. The schedule page lists free times without tick boxes.

## Inherited from Phase 17

Pinned by [Phase 17](phase-17.md): new screens the visual system must cover: on the schedule page, proposed rehearsals under their request's name (`request-group`), confirmed cards' "From <request>" line, the **Earlier rehearsals** section and the **Requests** section (`request-progress`, figures in `ProgressFigures`); on the home screen, the **Your requests** list (`homeRequests`) with each request's proposals (`proposed-list`) and figures; and the **Add to calendar** pair (`CalendarActions` in `project/app/components/calendar-actions.tsx`: a download link, the Google button or its hints) on both.

## Inherited from Phase 16

Pinned by [Phase 16](phase-16.md): every AWS resource is defined in Terraform (`project/deploy/terraform`, settings in `project/deploy/config.json`) and changed only through `./bin/deploy`; the visual cleanup changes no infrastructure. Anything a chosen theme or framework loads from a CDN or a new domain (fonts, scripts) is a privacy-policy question for this phase (see Phase 14), not an infrastructure one.
