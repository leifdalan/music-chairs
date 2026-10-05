---
id: "19.3"
title: "Readable group addresses"
depends_on: ["19.2"]
informs: []
---

# Phase 19.3 — Readable group addresses

**Goal**: a group's pages live at an address made of its name and a short id, for example `/g/thursday-quartet-k3x9`, and every existing link (shared invite pages, bookmarks, the calendar feed's links, Google Calendar events) keeps working.

## Deliverables

- Group addresses as `<name-slug>-<short id>`, used by every link the app makes.
- Old addresses (the 22-character id) and addresses whose name part is out of date (after a rename) redirect permanently to the current one.
- A database change (forward-only migration) if the short id or slug is stored; the live data migrates with row counts unchanged.

## Decisions (operator, 2026-10-04)

From the operator's UI/UX notes in `plan/phase-19.md`: "group URIs should be slugified for readability". At Phase 19's start the operator chose the name plus a short id, so two groups with the same name never collide and renames keep old links working. To settle at phase start: the short id's length and alphabet; whether invite links (`/join/<token>`) change (they are secrets, not addresses); and how names without Latin letters slug.

## Acceptance

- `./bin/test project/tests` covers the address format, redirects from old and renamed addresses, and every link the app renders using the new form.
- `./bin/check all` passes, CI is green on the pull request, and the merge's deploy migrates the live database with row counts unchanged.
- User Demo: to be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".

## Inherited from Phase 19.2

Pinned by [Phase 19.2](phase-19.2.md): new places build group links from the group's id, and every one must use the readable address: the `/groups` page's cards (group page, Schedule, My availability) and its rename, leave and delete forms (which post to the group page with `returnTo=/groups`), the home page's "Waiting on you" links (a proposal links to the group's schedule, a request to its page) and its groups list, and the request page's "Check availability for <time>" links. `returnTo` accepts exactly `/groups` and nothing else, on the server and in the confirm page's Cancel. Group creation now lives in `project/app/.server/create-group.ts`, shared by the home and groups pages, and redirects to the new group's page.
