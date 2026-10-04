---
id: "17"
title: "Rehearsals grouped by request, with completion status, on the schedule and home screen"
depends_on: ["16"]
informs: ["18"]
---

# Phase 17 — Rehearsals grouped by request, with completion status, on the schedule and home screen

**Goal**: members and organizers see how each scheduling request is going (which rehearsals it produced, how far along it is) on the schedule page and on the home screen, and once a request is complete they can add its rehearsals to their calendar in one tap.

## Deliverables

- Every new rehearsal belongs to the request it was proposed from (a new link on rehearsals, migration 9). Proposing happens only on a request's page: the schedule page's free-times picker, its "Propose a rehearsal" form and the "Propose again" links are removed.
- The schedule page shows each proposed rehearsal under its request's name.
- A section on the schedule page, visible to members and organizers, showing the schedule's completion status organized by request.
- The home screen shows each request's proposed rehearsals beside the request, with the same completion figures.
- When a request is complete, an "Add to calendar" pair next to it: a download of that request's confirmed rehearsals and an "Add to Google Calendar" button.

## Decisions (operator, 2026-10-04)

The operator's words: "on schedule, under proposed, we should list the request's name/id. Members and organizers should also be able to see the completion status of the schedule, organized by requests. Also on the main screen you should see proposals like you see requests, like next to the corresponding request, with completion data. When a request is complete, there should be a quick link to 'add to calendar'."

Rulings at phase start (operator, 2026-10-04):

- **Every proposal belongs to a request.** The operator's words: "honestly all proposals should belong to a request". New rehearsals can be made only from a request's page. The schedule page keeps "When people are free" and "Times that worked" as information, without proposing.
- **Existing rehearsals without a request** (made on the schedule page before this phase) are kept unchanged. They appear under one heading, "Earlier rehearsals", on the schedule page and stay in calendars and the feed. Migration 9 adds the link as a nullable column, so those rows keep a null link and nothing is deleted.
- **Complete** means: at least one of the request's rehearsals is confirmed, and none of its rehearsals is still proposed.
- **Figures** show both: how many of the request's rehearsals are confirmed out of all it produced ("2 of 3 confirmed"), and, for its rehearsals still proposed, how many members have answered them ("4 of 5 answered").
- **Add to calendar** offers two things for a complete request: a download (an .ics file holding only that request's confirmed rehearsals, without dates the viewer said No to or that were cancelled), and an "Add to Google Calendar" button. The button turns on the member's existing Google Calendar writing for the group, which adds this request's rehearsals and every other confirmed rehearsal in the group and keeps them up to date (operator's choice over per-request writing). It follows the same states as the schedule page's calendar panel: connect first if Google Calendar isn't connected, and say so when writing is already on.

## Acceptance

- `./bin/test project/tests` covers: migration 9 from version 8 with existing rehearsals kept and unlinked; proposals made on a request's page remembering that request; the schedule page refusing a direct proposal and no longer offering one; each proposed rehearsal shown under its request's name, and unlinked ones under "Earlier rehearsals"; the completion status per request for members and organizers, with no other member's private data; the home screen's grouping and figures; the "Add to calendar" pair appearing only for complete requests; the download holding only that request's confirmed dates for the viewer; and the Google button's states.
- `./bin/deploy all` and `./bin/deploy smoke` pass, and the live database migrates to version 9 with row counts unchanged.
- `./bin/check all` passes.

User Demo (per `policies/user-demo-protocols.md`):

- **Entry point.** On your phone, https://rehearse.dalan.dev, signed in as the organizer of a group with at least one other member who can open it on another device or browser.
- **Suggested inputs.**
  1. From the group page, create a request (any name, the next two weeks, one evening window) and have the other member answer it with some free times.
  2. On the request's page, tick two free times and propose them.
  3. Open the schedule page as the organizer, then as the other member.
  4. As the organizer, confirm one of the two proposals and delete the other.
  5. Open the home screen, then tap the download and "Add to Google Calendar" next to the request.
- **What to look for.**
  - After step 2, the schedule page lists both proposals under the request's name, and has no way to propose a time itself. Any rehearsals made before this update appear under "Earlier rehearsals".
  - Both viewers see the request's figures, e.g. "0 of 2 confirmed" and how many members have answered the proposals.
  - The home screen shows the request with its proposals and the same figures.
  - After step 4, the request shows as complete, with the download and the Google button; before that, neither appears.
  - The download opens in your calendar app holding only that request's confirmed date. The Google button turns on calendar writing (or asks you to connect Google Calendar first), and the rehearsal appears in Google Calendar.
- **Variations to explore.** Answer No to the confirmed date and download again: that date is left out. Make a second request and check its rehearsals stay separate from the first's.

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times", "Technology and constraints" (works well on a phone).

## Inherited from Phase 15

Pinned by [Phase 15](phase-15.md): proposals are made in bulk from ticked free times on the schedule page and on a request's page (this phase removes the schedule page's) (`addRehearsals`, `parseProposedTimes`); the home screen lists requests waiting for the viewer's answer (`pendingRequests`, `answerable`). The schema is at version 8; new columns are migration 9 onward.
