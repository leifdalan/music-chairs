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

Added 2026-10-03: the operator will do a big UI/UX pass first to populate this phase's details, and will shop for a visual framework or theme compatible with React Router 8 (user action `satisfied-turkey`). Both arrived on 2026-10-04 (below).

## Operator's UI/UX notes (2026-10-04)

The operator's pass (user action `satisfied-turkey`, closed), verbatim apart from one unfinished line the operator asked to ignore:

- "let's use shadcn for styles"
- "\"download for you calendar\" should just be the download icon and \".ics\""
- "add to google calendar should be first of the options"
- "on my availabilityu, the time picker should be first, and it should default to be scrolled to the evening"
- "somewhere we should say that you need to pick a time range first to see what conflicts there are in google calendar"
- "start a group should only be on the homepage if there are no groups"
- "we need a groups page, so that starting a group isn't always on the homepage. group management and navigation should live there, but your groups can still be on the homepage"
- "pending proposals should be front and center on the homepage"
- "from a request, the \"add time - time\" is confusing - maybe \"check availability for proposed time slot\""
- "shouldn't have to \"add times\", just add them as they are clicked/unclicked"
- "group URIs should be slugified for readability"

The visual framework is shadcn/ui. These notes go beyond styling (a groups page, home-page layout, availability saving as times are ticked, readable group URLs, which changes persisted data and must keep existing links working); whether to split the phase along those lines is settled at phase start.

## Decomposition (operator, 2026-10-04)

At phase start the operator split this phase into three children, each shipped and deployed on its own: **19.1** the shadcn/ui look (neutral palette) and the calendar-button changes; **19.2** the groups page, the home page (pending proposals first, "Start a group" only with no groups) and the availability and request changes (time picker first and scrolled to the evening, the note about picking a time range before Google Calendar conflicts show, "check availability for proposed time slot", times saved as they are ticked); **19.3** readable group URLs as the group's name plus a short id (for example `/g/thursday-quartet-k3x9`), with existing links still working. Only 19.1 is drafted now; each next child is drafted when its predecessor closes.

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

## Inherited from Phase 18

Pinned by [Phase 18](phase-18.md): changes reach `main` only through pull requests; the CI/CD workflow's `check` job (`./bin/setup`, `./bin/check all`, `project/scripts/smoke.sh` on GitHub's ubuntu-24.04 runner) must pass before merging, and merging deploys. A visual framework or theme must therefore install and build through `./bin/setup` and pass those checks on Linux; a package that needs a network fetch at build time, or fonts from a CDN, also affects the smoke and the privacy policy.
