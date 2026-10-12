import { redirect } from "react-router";

import {
  callbackUrl,
  CONTACTS_SCOPES,
  exchangeCode,
  forgetAccessToken,
  googleConfig,
  GoogleSignInError,
  type GoogleTokens,
} from "~/.server/google";
import { CALENDAR_SCOPES } from "~/lib/google-scopes";
import {
  clearOAuthState,
  findDeviceMember,
  readAccount,
  readOAuthState,
  startSession,
  type OAuthState,
} from "~/.server/membership";
import { syncAccount } from "~/.server/calendar-sync";
import { redirectWithToast } from "~/.server/flash";
import { findGroupByAddress } from "~/.server/group-address";
import { getStore, type Group, type GoogleProfile } from "~/.server/store";
import { inviteCodeOf } from "~/lib/group-address";

/** What a sign-in that switched calendar writing on says (plan/phase-32.md). */
export const WRITING_ON_TOAST = "Your confirmed rehearsals will be added to your Google Calendar";

import type { Route } from "./+types/auth.google.callback";

/**
 * Google's redirect back. On success: the account is created or refreshed, a
 * session starts, and if sign-in began on a group page where this device is a
 * name-only member, that member is linked to the account. Only that one: a
 * borrowed device never hands over its other memberships.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const saved = await readOAuthState(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", await clearOAuthState());
  const config = googleConfig();
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) {
    if (saved?.purpose === "calendar") {
      return redirect(withNotice(saved.returnTo, `${consentKind(saved)}-declined`), { headers });
    }
    return redirect("/?notice=signin-cancelled", { headers });
  }
  if (!config || !saved || !code || url.searchParams.get("state") !== saved.state) {
    console.warn("music-chairs: Google sign-in refused: missing or mismatched state");
    return redirect("/?notice=signin-failed", { headers });
  }
  let identity: GoogleProfile;
  let tokens: GoogleTokens;
  try {
    ({ profile: identity, tokens } = await exchangeCode(config, {
      code,
      verifier: saved.verifier,
      redirectUri: callbackUrl(request),
      nonce: saved.nonce,
    }));
  } catch (error) {
    if (!(error instanceof GoogleSignInError)) throw error;
    console.warn(`music-chairs: Google sign-in refused: ${error.message}`);
    return redirect("/?notice=signin-failed", { headers });
  }
  if (saved.purpose === "calendar") {
    return redirect(await saveCalendarGrant(request, saved, identity, tokens), { headers });
  }
  const store = getStore();
  const account = store.upsertAccount(identity);
  headers.append("Set-Cookie", await startSession(account.id));
  // Calendar access granted with sign-in is kept (merged with earlier grants).
  // Google sends a refresh token only on a first authorization; without one
  // and none stored nothing is saved, and the "connect" links remain.
  if (
    tokens.scopes.includes(CALENDAR_SCOPES.busy) ||
    tokens.scopes.includes(CALENDAR_SCOPES.write)
  ) {
    if (store.saveGrant(account.id, tokens.refreshToken, tokens.scopes))
      forgetAccessToken(account.id);
  }
  const before = writingMembers(account.id);
  const returnTo = await linkReturnGroup(request, saved.returnTo, account.id);
  // Every place an organizer added for this verified email is now this
  // account's, so those groups show on home and Groups (plan/phase-30.md).
  store.claimInvitations(account.id);
  // Granting the Calendar write permission switches writing on in every group
  // not held off, releasing an added place in the group sign-in started from
  // (plan/phase-32.md). Linking this device's member can switch it on too.
  if (tokens.scopes.includes(CALENDAR_SCOPES.write)) {
    store.switchOnWriting(account.id, { groupId: groupOfPath(saved.returnTo)?.id });
  }
  const switched = [...writingMembers(account.id)].some((id) => !before.has(id));
  if (!switched) return redirect(returnTo, { headers });
  // The calendar fills at once rather than at the next sweep.
  syncAccount(account.id);
  return redirectWithToast(returnTo, WRITING_ON_TOAST, { headers });
}

/** The account's memberships that write to its Google Calendar. */
function writingMembers(accountId: string): Set<string> {
  return new Set(
    getStore()
      .listAccountMemberships(accountId)
      .filter(({ member }) => member.calendarSync)
      .map(({ member }) => member.id),
  );
}

/** Links this device's member of the group sign-in started from; adds the outcome as a notice. */
async function linkReturnGroup(request: Request, returnTo: string, accountId: string) {
  const address = /^\/g\/([^/?]+)/.exec(returnTo)?.[1];
  const store = getStore();
  const group = address ? findGroupByAddress(address) : null;
  if (!group) return returnTo;
  const member = await findDeviceMember(request, group);
  if (!member || member.googleEmail !== null) return returnTo;
  const result = store.linkMember(group.id, member.id, accountId);
  const notice =
    result === "linked" ? "linked" : result === "account-taken" ? "account-taken" : null;
  if (!notice) return returnTo;
  const target = new URL(returnTo, "http://site.invalid");
  target.searchParams.set("notice", notice);
  return target.pathname + target.search;
}

/** The group a page belongs to: a group address, or a group's invite link. */
function groupOfPath(path: string): Group | null {
  const address = /^\/g\/([^/?#]+)/.exec(path)?.[1];
  if (address) return findGroupByAddress(address);
  const invite = /^\/join\/([^/?#]+)/.exec(path)?.[1];
  const code = invite ? inviteCodeOf(invite) : null;
  return code ? getStore().findGroupByInviteCode(code) : null;
}

function withNotice(path: string, notice: string): string {
  const target = new URL(path, "http://site.invalid");
  target.searchParams.set("notice", notice);
  return target.pathname + target.search;
}

/**
 * The Calendar consent branch: it never creates accounts, starts sessions or
 * links members. The grant is saved only for the account that started the
 * consent, which must still be signed in here and must be the Google account
 * that just consented, and only when the requested scope was actually granted
 * (Google's consent screen lets people untick it).
 */
async function saveCalendarGrant(
  request: Request,
  saved: OAuthState,
  identity: GoogleProfile,
  tokens: GoogleTokens,
): Promise<string> {
  const store = getStore();
  const session = await readAccount(request);
  const consenting = store.findAccountBySub(identity.sub);
  const kind = consentKind(saved);
  if (!session || session.id !== saved.accountId || consenting?.id !== saved.accountId) {
    return withNotice(saved.returnTo, `${kind}-wrong-account`);
  }
  if (!tokens.scopes.includes(saved.scope)) {
    return withNotice(saved.returnTo, `${kind}-declined`);
  }
  if (!store.saveGrant(session.id, tokens.refreshToken, tokens.scopes)) {
    console.warn("music-chairs: Google consent returned no refresh token and none is stored");
    return withNotice(saved.returnTo, `${kind}-failed`);
  }
  forgetAccessToken(session.id);
  if (saved.scope !== CALENDAR_SCOPES.write) return withNotice(saved.returnTo, `${kind}-connected`);
  // Asking for writing from a group's page is asking for it there: any hold
  // there is released, and every group not held off writes (plan/phase-32.md).
  store.switchOnWriting(session.id, { groupId: groupOfPath(saved.returnTo)?.id, explicit: true });
  syncAccount(session.id);
  const writing = store
    .listAccountMemberships(session.id)
    .some(({ member }) => member.calendarSync);
  return withNotice(saved.returnTo, writing ? "calendar-writing" : "calendar-connected");
}

/** Whether a consent was for contacts or Calendar, which their notices name. */
function consentKind(saved: OAuthState): "contacts" | "calendar" {
  return saved.scope === CONTACTS_SCOPES.saved ? "contacts" : "calendar";
}
