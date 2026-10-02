---
id: "1"
title: "Groups, invite links and name-only joining"
depends_on: []
informs: ["2", "3", "4", "5", "6", "7"]
---

# Phase 1 — Groups, invite links and name-only joining

**Goal**: an organizer can open music-chairs on a phone or laptop, create a group, and get a shareable invite link; a member who opens that link can join the group with just a plain-text name and no account, and everyone in the group sees the same member list afterward. The data survives a server restart. This is the first end-to-end product slice: React Router routes with loaders and actions on React Router's own server, a persistence layer behind them, and a mobile-first page layout that every later phase builds on.

The seeded skeleton already serves one read-only home page (`project/app/routes/home.tsx`) through the full toolchain. This phase turns it into the real entry point of the product.

## Decomposition

Coherent major phase; no children. Group creation, invite links, joining and the member list are one outcome that only becomes usable when all of it lands together, and the persistence choice is made inside this phase by its planner rather than in a separate approved prerequisite. Splitting by surface (routes / storage / layout) would leave no independently acceptable slice.

## Deliverables

- **Persistence layer** for groups and members, behind a small server-only module (for example `project/app/.server/`). The brief leaves the database to planning; the planner chooses one that runs locally with no external service for development and tests, and records how it is expected to map onto the AWS deployment of [Phase 5](phase-5.md). Every dependency the choice needs lands in `project/package.json` and `project/pnpm-lock.yaml`.
- **Create a group**: a route with a form (group name, the organizer's display name) and an action that creates the group, records the creator as its organizer, and redirects to the group page.
- **Invite link**: the group page shows a shareable invite URL that is hard to guess (it never exposes a sequential id) and is easy to copy on a phone.
- **Join by name**: opening the invite URL shows the group's name and a form for a plain-text display name; submitting it adds the member and lands them on the group page. Name-only identity is handled by social contract (brief, "Joining and identity"); no technical impersonation protection.
- **Returning members**: a member who joined on a device is still recognized as that member when they come back on the same device (for example through a cookie), without an account.
- **Group page**: the group name, the member list with each member's role (organizer or member), and the invite link for organizers.
- **Organizer authority**: only an organizer sees organizer-only controls. A group may have more than one organizer (brief, "Users"); this phase must not hard-code a single organizer, even if promoting a second one is left to a later phase.
- **Mobile-first layout**: a minimal shared layout and styling that reads well at phone width (about 375 px) and on a laptop. No CSS framework is named in the brief, so the planner keeps styling plain unless it records a reason to add one.
- **Tests** in `project/tests/`, headless and hermetic: the persistence module, every loader and action (including invalid input and an unknown invite token), and rendering of the group page.
- `project/README.md` documents how to run the app locally with the chosen persistence.

## Acceptance

Executable:

- `./bin/test project/tests` passes, and covers: creating a group stores it with its creator as organizer; an empty or whitespace-only group name or display name is rejected with a readable error and stores nothing; joining through a valid invite adds exactly one member; an unknown or malformed invite token gives a not-found page, not a crash; a returning member on the same device is recognized without rejoining.
- `./bin/check all` passes from outside the repository.
- With the production build served (`cd project && corepack pnpm run build && corepack pnpm run preview`), an HTTP request to `/` returns the server-rendered create-group form, and the created group's invite URL returns that group's join page. The phase records the exact commands it used as acceptance evidence.
- Data written before stopping the server is present after restarting it.

User Demo:

- **Entry point.** `cd project && corepack pnpm run dev`, then open the printed local URL on a laptop browser and, if possible, on a phone on the same network.
- **Suggested inputs.** Create a group called `Thursday Quartet` with your own name as organizer. Copy the invite link and open it in a private window; join as `Cellist`. Then try joining with a blank name, and open the invite link with a few characters changed.
- **What to look for.** The group page lists you as organizer and `Cellist` as member in both windows after a refresh; the blank name is refused with a message you can read; the altered link shows a clear not-found page; on a phone, forms and the invite link are usable without zooming or horizontal scrolling.
- **Variations to explore.** Does copying the invite link feel easy on a phone? Close the private window and reopen the group page in it: are you still `Cellist`? What does a very long group or display name do to the layout?

## Open questions

- Which database, and how it reaches AWS — decided by this phase's planner within the constraints in the brief ("Technology and constraints") and recorded for [Phase 5](phase-5.md).
- Whether members can see each other's individual availability (brief, Open question 1) does not block this phase; it is settled in [Phase 3](phase-3.md).

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Users", "Joining and identity", "Technology and constraints", and the first success criterion ("An organizer can create a group and invite the band").
