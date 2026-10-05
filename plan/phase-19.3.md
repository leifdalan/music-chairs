---
id: "19.3"
title: "Readable group addresses"
depends_on: ["19.2"]
informs: []
---

# Phase 19.3 — Readable group addresses

**Goal**: a group's pages live at an address made of its name and a short id, for example `/g/thursday-quartet-k3x9m2pq`, and a link whose name part is out of date after a rename still reaches the group.

## Deliverables

- Group addresses as `<name-slug>-<short id>`, used by every link the app makes, including Google Calendar events written from now on.
- An address whose name part is out of date (after a rename) redirects permanently to the current one; an unknown short id is not found.
- A database change (forward-only migration) giving every group, existing ones included, a unique short id; the live data migrates with row counts unchanged.

## Decisions (operator, 2026-10-04)

From the operator's UI/UX notes in `plan/phase-19.md`: "group URIs should be slugified for readability". At Phase 19's start the operator chose the name plus a short id, so two groups with the same name never collide and renames keep old links working. Rulings at phase start (operator, 2026-10-04):
- **No backward compatibility for old addresses**: "We're still testing, don't worry about past things." The 22-character addresses stop working (not found); bookmarks, the calendar feed's earlier links and Google Calendar events already written are not redirected or rewritten.
- **Short id: 8 characters** from lowercase letters and digits without lookalikes (`23456789abcdefghijkmnpqrstuvwxyz`, about 10^12 combinations), because anyone with a group's address sees its name and member list, so the id must not be guessable.
- **Invite links unchanged** (`/join/<token>` stays a long random secret).
- **Names**: accents are stripped ("Café Trío" → `cafe-trio`); a name with no Latin letters or digits uses `group`.

## Acceptance

- `./bin/test project/tests` covers the address format and slugging, the redirect from a renamed group's old name, not-found for unknown short ids and old 22-character ids, the migration giving existing groups unique short ids, and every link the app renders using the new form.
- `./bin/check all` passes, CI is green on the pull request, and the merge's deploy migrates the live database with row counts unchanged.
- User Demo (per `policies/user-demo-protocols.md`):
  - **Entry point.** On your phone, open:

https://rehearse.dalan.dev

  - **Suggested inputs.**
    1. Open the Groups page and tap one of your groups; look at the address bar.
    2. Tap Schedule, My availability and a request; look at each address.
    3. On the Groups page, rename a test group, then open the group's address you had before the rename.
    4. Start a group named "Café Trío" from the Groups page.
  - **What to look for.**
    - Every group address reads `/g/<group-name>-<8 characters>`, and the group's other pages extend it.
    - The address from before the rename lands on the group under its new name.
    - "Café Trío" gets `/g/cafe-trio-…`.
  - **Variations to explore.** Change one character of the 8-character id (not found); open an invite link in a private window (it still works and joins the group).

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Technology and constraints".

## Inherited from Phase 19.2

Pinned by [Phase 19.2](phase-19.2.md): new places build group links from the group's id, and every one must use the readable address: the `/groups` page's cards (group page, Schedule, My availability) and its rename, leave and delete forms (which post to the group page with `returnTo=/groups`), the home page's "Waiting on you" links (a proposal links to the group's schedule, a request to its page) and its groups list, and the request page's "Check availability for <time>" links. `returnTo` accepts exactly `/groups` and nothing else, on the server and in the confirm page's Cancel. Group creation now lives in `project/app/.server/create-group.ts`, shared by the home and groups pages, and redirects to the new group's page.
