---
id: "4"
title: "Confirmed rehearsals for members, with RSVP"
depends_on: ["3"]
informs: ["5", "7"]
---

# Phase 4 — Confirmed rehearsals for members, with RSVP

**Goal**: members see the times the organizer has proposed and confirmed, and can optionally answer yes, no or maybe to each, so the organizer knows who is coming. With this phase the whole scheduling loop works for name-only members.

## Deliverables

- A member-facing list of proposed and confirmed rehearsals with time, location and RSVP state.
- Yes / no / maybe RSVP on proposed and confirmed dates, changeable later, with a summary for organizers.
- A decision on whether a read-only calendar feed (ICS) is offered to name-only members now or in [Phase 7](phase-7.md) (brief, Open question 5): deferred to Phase 7 (Decisions).
- Tests for RSVP state changes and the member views.

## Decisions (operator, 2026-10-02)

Settled at phase start:

- **RSVP visibility follows the names setting.** Organizers always see everyone's answers. Members see totals ("3 yes, 1 maybe") and, when the group shows names, who answered what.
- **Weekly rehearsals are answered per date**, with a quick way to give the same answer to all upcoming dates at once.
- **Both proposed and confirmed times take RSVPs**, and answers on a proposed time carry over when it is confirmed.
- **The calendar feed (ICS) is deferred to Phase 7** (brief, Open question 5), to be decided together with Google Calendar writing.

## Inherited from Phase 3

Pinned by [Phase 3](phase-3.md) (see its Decisions section):

- **Rehearsals exist.** `rehearsals` rows (group-scoped, `status` `proposed` or `confirmed`, free-text `location`) reuse the availability slot shape: one-off or weekly from a first date until ended, with cancelled dates in `rehearsal_cancellations`. `expandOccurrences` gives a weekly rehearsal's dates, so an RSVP on a recurring rehearsal belongs to one occurrence date.
- **Members already see the list.** `/g/:groupId/schedule` shows members the proposed and confirmed rehearsals with time, location and upcoming dates (no ids, no warnings); this phase adds RSVP state and the organizer summary rather than a second list.
- **Identity.** A member's `id` is an ordinary identifier; the bearer secret is the separate `device_token` in the `mc_members` cookie. RSVP rows can reference `members.id` directly; loaders must still never return device tokens.
- **Privacy.** The group's `show_names` setting governs whether members see names in the overlap; whether members see each other's RSVPs should follow the same setting or be decided here explicitly.

## Acceptance

Executable:

- `./bin/test project/tests` covers RSVP changes (set, change, clear, answer all upcoming dates), answers carried from proposed to confirmed, and what each role sees (totals for members, names only when the group shows names, everyone's answers for organizers).
- `./bin/check all` passes.

User Demo:

- **Entry point.** `cd project && corepack pnpm run dev --host` (the development server backs up an older database automatically), then open the network URL on a phone or a browser narrowed to about 375 px.
- **Suggested inputs.** Create a group and join it in two private windows as `Cellist` and `Pianist`. As organizer, open Schedule, propose a weekly rehearsal on Thursdays 19:30–21:30 at `Studio B` starting next week, and confirm it. As `Cellist`, answer Yes for the first date and No for the second; as `Pianist`, answer Maybe for all upcoming dates at once.
- **What to look for.** The organizer sees, per date, who said yes, no and maybe and who hasn't answered; members see totals only, and see names after the organizer switches the group to show names. Changing an answer updates the totals; answers given while the rehearsal was proposed are still there after confirming.
- **Variations to explore.** Clear an answer. Cancel one date as organizer and check it disappears from the members' lists. Is answering comfortable on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Choosing rehearsal times" (optional RSVP), the fourth success criterion, Open question 5.
