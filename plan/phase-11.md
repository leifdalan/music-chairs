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

Settled at phase start (2026-10-03):

- **Deleting a group removes it all at once:** members, availability, requests and answers, rehearsals and RSVPs. Rehearsal events the app wrote to members' Google Calendars are removed and the group's calendar feed links stop working. The nightly backups keep their copy for their usual 90 days.
- **Removing a member removes all of theirs:** availability, request answers and RSVPs; rehearsal events the app wrote to their Google Calendar are removed, and their device and feed links stop working. A group keeps at least one organizer, as today.
- **The "are you sure" step is an in-page dialog** naming what will be lost, with Cancel and a red confirm button; without JavaScript the same button opens a separate confirm page.
- **What counts as destructive** (each gets the confirmation): deleting a time of availability; closing a request; deleting a rehearsal, ending a weekly rehearsal, cancelling one of its dates; turning off adding rehearsals to Google Calendar (it removes the events); making someone an organizer or removing an organizer; removing a member; deleting the group. Reversible marks (can't make it, optional) and saves do not ask.

## Inherited from Phase 8

Every changing form uses `SubmitButton` with a stable `feedbackKey`, every successful action ends with `redirectWithToast` naming what happened, and refusals use `ProblemAlert`. Schema changes ship as forward-only migrations.

## Acceptance

- `./bin/test project/tests` covers each confirmation (nothing changes without it), editing and deleting a group, editing, making optional and removing a member, organizer-only access to each, and the mailto link's contents.
- `./bin/deploy all` and `./bin/deploy smoke` pass.
- `./bin/check all` passes.

User Demo:

- **Entry point.** Open `https://rehearse.dalan.dev` on a laptop as the organizer of a test group (create a new one for this, since the last step deletes it), and on your phone as a second member of it. Add a third member by opening the invite link in a private window and joining as `Spare`.
- **Suggested inputs.** On the group page, rename the group, rename `Spare` to `Spare tuba` and make them optional. Start a request, then press **Close request** and choose **Cancel** in the dialog, then press it again and confirm. Press **Remove** on `Spare tuba`, cancel once, then confirm. On the phone, as the second member, open the group page and check what you can and cannot change. On the laptop, press **Send link by email**. Finally, delete the group from its settings, cancelling once before confirming.
- **What to look for.** Every destructive button opens a dialog that names what will be lost; Cancel changes nothing; confirming does the change and shows a message saying what happened. The renamed group and member and the optional mark show everywhere (group page, schedule, request answers). Your email app opens a new message with the invite link in its body. After deleting the group, its pages answer "not found" on both devices, and a home screen signed in with Google no longer lists it.
- **Variations to explore.** Try removing yourself as the only organizer (refused). Turn off adding rehearsals to Google Calendar on the Schedule page and confirm. Is each dialog clear about what will be lost, on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Technology and constraints" (works well on a phone).
