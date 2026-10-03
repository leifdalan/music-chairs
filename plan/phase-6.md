---
id: "6"
title: "Google sign-in and linking a name-only member"
depends_on: ["5"]
informs: ["7"]
---

# Phase 6 — Google sign-in and linking a name-only member

**Goal**: a member can sign in with Google instead of joining with a name only, and a member who joined with just a name can later link a Google account and keep their history (brief, Open question 3).

## Deliverables

- Google OAuth sign-in on React Router's server, with sessions.
- Joining a group as a signed-in member, alongside the existing name-only path.
- Linking an existing name-only membership to a Google account without losing availability or RSVPs.
- A record of the OAuth scopes requested now, and of what Google app verification the later Calendar scopes will need (brief, Open question 6), with human-only console steps filed in `user-actions/`.
- Tests for session handling and linking, with Google's endpoints faked so tests stay hermetic.

## Decisions (operator, 2026-10-02)

Settled at phase start:

- **Client secret in AWS Parameter Store.** The Google OAuth client secret is stored encrypted as the SSM Parameter Store SecureString `/music-chairs/google-client-secret` in account 777460179484, region us-west-2 (free standard tier), put there by the operator; the server reads it with a narrowly scoped key that `bin/deploy` installs, as it does the backup key. Never in the repository. The client ID is not secret and lives in `project/deploy/config.json`: `719218972879-dcaitqp687p9id29nielonukiqrgfgm9.apps.googleusercontent.com` (OAuth client created by the operator 2026-10-02, with redirect URIs `https://rehearse.dalan.dev/auth/google/callback` and `http://localhost:5173/auth/google/callback`; the secret was stored in Parameter Store the same day). Creating the Google Cloud project and OAuth client is the operator's (`user-actions/valiant-rottweiler.md`); tests fake Google and do not wait for it.
- **Sessions last 90 days, renewed on use.** A signed-in device stays signed in while used; after 90 idle days the member signs in again. Sign out is always available.
- **One Google sign-in restores all linked groups.** A Google account links to the member's row in each group (at most one member per group per Google account); signing in on a new device brings back every group it is linked to.
- **Organizers see linked members' emails.** Other members see the display name and a "signed in with Google" mark; the member and their group's organizers also see the Google email. It is used for nothing else in v1.
- **Scopes now:** `openid`, `email`, `profile` only. Calendar scopes and their verification belong to Phase 7.

## Inherited from Phase 3

Pinned by [Phase 3](phase-3.md): a member's `members.id` is a stable, non-secret identifier, and device identity is the separate secret `members.device_token` held in the `mc_members` cookie (`findViewer` in `project/app/.server/membership.ts`). Linking a Google account attaches to the member id, so availability, rehearsal and RSVP rows keyed by member id carry over; a signed-in session becomes another way to resolve the viewer alongside the device token.

## Inherited from Phase 5

Pinned by [Phase 5](phase-5.md): the app is live at `https://rehearse.dalan.dev` and keeps the band's data across releases. The public origin comes from `MUSIC_CHAIRS_PUBLIC_URL` through `publicOrigin()` in `project/app/.server/membership.ts`, so OAuth redirect URIs are built from it, never from the request URL; cookies are `Secure` when that origin is HTTPS. Schema changes append a step to `MIGRATIONS` in `project/app/.server/store.ts` (forward-only; the baseline is never edited). The server's environment comes from the systemd drop-in that `project/deploy/provision.sh` writes, so a Google client secret needs a home there that stays out of the repository (as the backup key does, piped over SSH by `bin/deploy`); releases go out with `./bin/deploy release`.

## Acceptance

Executable:

- `./bin/test project/tests` covers sign-in callback handling (including a refused or tampered callback), session expiry and renewal, sign-out, linking a name-only member, restoring every linked group on a new device, refusing a second member in the same group for one Google account, and who sees the email.
- `./bin/deploy all` and `./bin/deploy smoke` pass against https://rehearse.dalan.dev after this phase, whether or not the client secret has been stored yet (sign-in is simply unavailable until it is).
- `./bin/check all` passes.

User Demo (after `user-actions/valiant-rottweiler.md` is done and the secret is stored and deployed):

- **Entry point.** Open `https://rehearse.dalan.dev` on your phone.
- **Suggested inputs.** Create a group as organizer. In a private window on a laptop, open the invite link and join as `Cellist` with just the name, and add a weekly availability slot. Still in that window, choose **Sign in with Google** and pick your Google account. Then open a second private window, go to `https://rehearse.dalan.dev` and sign in with the same Google account, without using the invite link.
- **What to look for.** After signing in, `Cellist` keeps the same availability and shows as signed in with Google. The second window lists the group and opens it as `Cellist` with that availability. On your phone, as organizer, you see Cellist's Google email; Cellist's own page shows it too.
- **Variations to explore.** Sign out in the second window and check it no longer opens the group as Cellist. In a third private window, join the same group as `Pianist` from the invite link and sign in with the same Google account: linking is refused with a clear message, because that account is already `Cellist` in this group. Does the sign-in flow feel quick on a phone?

## Brief refs

- [`../briefs/BRIEF.md`](../briefs/BRIEF.md) — "Joining and identity", "Google integration", Open questions 3 and 6.
