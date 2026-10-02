---
title: "music-chairs"
date: 2026-10-02
status: draft
scope: Product brief for music-chairs, a web app that helps small music ensembles find times to rehearse together in person: users, behavior, technology constraints, non-goals, success criteria and open questions.
---

# music-chairs

A web app that helps small music ensembles find times to rehearse together in person.

## Problem

The hardest part of playing music with other people is getting everyone into the same room. Scheduling usually happens over long group-text threads: people reply at different times, availability gets lost in the scroll, and nobody is sure what was decided. music-chairs gives a group one place to collect everyone's availability, choose rehearsal times and confirm who is coming.

## Users

- **Groups:** many independent groups use the same deployment. A typical group is a small ensemble of **3–15 people**. Larger groups should work, but they are not the design target.
- **Organizer (admin):** creates the group, invites members, marks which members are required and **makes the final decision** on rehearsal times. A group may have more than one organizer.
- **Member:** enters their availability, can see the times the organizer proposes, and can optionally RSVP.

## What it does

### Joining and identity

- The organizer invites members, for example with a shareable invite link.
- A member can sign in with **Google**, or join with **just a plain-text name and no account**.
- Impersonation and other mischief by name-only members is **handled by social contract**. v1 includes no technical protection against it.

### Availability

- Members enter the times they are available.
- **Optional Google Calendar import:** a signed-in member can fill in their availability from their Google Calendar free/busy information instead of entering it by hand.
- Both **one-off** rehearsals and **recurring** rehearsals (for example, every Thursday evening) are supported.

### Choosing rehearsal times

- The organizer sees the group's combined availability and where it overlaps, then picks one or more rehearsal dates and times.
- **Required and optional members:** the organizer can mark members as critical. A rule can also cover a role, such as "at least one of our two keyboardists".
  - These rules **warn, but never block**. If a chosen time is missing a required member, the organizer sees a warning and can still confirm the time.
- **Optional RSVP:** members can answer **yes / no / maybe** to proposed or confirmed dates.

### Rehearsal details

- **Location** is a simple free-text detail on a rehearsal at first. There is no venue management.

### Calendar output

- Confirmed rehearsals can be **written to members' Google Calendars**.

### Notifications

- Notifications are not required for v1. **Email** (invites, confirmed times, reminders) is the likely first channel if they are added.

## Technology and constraints

- **Frontend:** **React Router v8 in framework mode** (the line that succeeded Remix v2), written in TypeScript. This is a deliberate choice over Remix 3, which is a different framework.
- **Backend:** whatever is simplest. Using React Router's own server for loaders and actions, rather than a separate backend service, is the expected default. The specific database is left to planning.
- **Hosting:** **AWS**. The specific services (for example Lambda versus containers, and which managed database) are left to planning.
- **Google integration:** Google OAuth for sign-in, Calendar free/busy reads for availability import, and Calendar event writes for confirmed rehearsals.
- It must work well on a phone, because members will often enter availability from one.

## Non-goals

- No payments.
- No ads.
- Not a setlist, chart or practice-material manager.
- Not a general-purpose calendar.

## Success criteria

**v1 succeeds when the author's own band can easily schedule its next few rehearsals entirely inside music-chairs, without friction and without coordinating over text or any other channel.**

In practice:

- An organizer can create a group and invite the band.
- Every member can enter availability, whether signed in with Google or using just a name.
- The organizer can see the overlap, pick several upcoming rehearsal times (one-off or recurring) and confirm them, with a warning when a required member is missing.
- Members can see the confirmed times, and can optionally RSVP and have them added to their Google Calendar.

## Open questions

1. **Availability privacy:** can members see each other's individual availability, or only the combined overlap? The organizer presumably needs individual detail.
2. **Recurring rehearsals and exceptions:** with a standing slot such as Thursdays at 7pm, how does a member mark that they can't make one particular date? How long does a recurring pattern stay in effect?
3. **Name-only to Google upgrade:** can a member who joined with only a name later link a Google account and keep their history?
4. **Time zones:** groups are expected to be local, but should the app handle a member who is traveling or a group that spans time zones?
5. **Google Calendar write model:** does the app create events on each member's own calendar, or does one organizer-owned event invite everyone? How are later changes and cancellations synced? Is the event read-only (an ICS feed) as a fallback for name-only members?
6. **Google OAuth scopes and verification:** reading free/busy and writing events need sensitive Calendar scopes, which may require Google app verification before the app can be used beyond test users.
7. **AWS shape and cost:** pick the simplest AWS deployment that suits a hobby-scale app, with a low or near-zero idle cost.
8. **Email provider:** if email notifications are added, which service to use (Amazon SES is the natural AWS choice).
