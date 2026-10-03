---
id: "11"
title: "Managing groups and members, with a confirmation before anything destructive"
depends_on: ["10"]
informs: ["12"]
---

# Phase 11 — Managing groups and members, with a confirmation before anything destructive

**Goal**: organizers can change or remove what they have set up — the group itself and its members — and nothing that loses data or takes away someone's role happens without an "are you sure" step.

## Deliverables

- A confirmation step before every destructive or hard-to-undo action: closing a request, deleting availability or a rehearsal, cancelling or ending rehearsal dates, removing or demoting an organizer, removing a member, and deleting a group.
- Editing a group after creation (name, time zone and the existing privacy setting) and deleting a group.
- Editing members after the group is created: an organizer can rename a member, change whether they are optional, and remove them.
- The invite panel gains a "Send link by email" button: a `mailto:` link with a subject and a short body containing the invite link.

## Decisions (operator, 2026-10-03)

From the operator's list after Phase 9:

- "Close request, and all other destructive acts, should have an 'are you sure', including changing organizers."
- "Should be able to edit and remove groups."
- "Group members should be editable after creating the group, and optionality should also be editable."
- "Invite link panel should have a button that says 'send link via email', and just be a mailto: link with an appropriate body."

To settle at phase start: what deleting a group does to its data (removed outright, or kept for a period), whether a removed member's availability and answers go with them, and whether the confirmation works without JavaScript (a confirm page) or as an in-page dialog.

## Inherited from Phase 8

Every changing form uses `SubmitButton` with a stable `feedbackKey`, every successful action ends with `redirectWithToast` naming what happened, and refusals use `ProblemAlert`. Schema changes ship as forward-only migrations.

## Acceptance

- `./bin/test project/tests` covers each confirmation (nothing changes without it), editing and deleting a group, editing, making optional and removing a member, organizer-only access to each, and the mailto link's contents.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.
- User Demo: as organizer, rename the group, rename a member and make them optional, try to close a request and remove a member and cancel at the confirmation, then confirm; send the invite link by email from a phone. To be tightened at phase start.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Technology and constraints" (works well on a phone).
