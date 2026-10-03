import { redirect } from "react-router";

import {
  CALENDAR_SCOPES,
  callbackUrl,
  exchangeCode,
  forgetAccessToken,
  googleConfig,
  GoogleSignInError,
  type GoogleTokens,
} from "~/.server/google";
import {
  clearOAuthState,
  findDeviceMember,
  readAccount,
  readOAuthState,
  startSession,
  type OAuthState,
} from "~/.server/membership";
import { getStore, type GoogleProfile } from "~/.server/store";

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
      return redirect(withNotice(saved.returnTo, "calendar-declined"), { headers });
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
  const returnTo = await linkReturnGroup(request, saved.returnTo, account.id);
  return redirect(returnTo, { headers });
}

/** Links this device's member of the group sign-in started from; adds the outcome as a notice. */
async function linkReturnGroup(request: Request, returnTo: string, accountId: string) {
  const groupId = /^\/g\/([^/?]+)/.exec(returnTo)?.[1];
  const store = getStore();
  const group = groupId ? store.findGroup(groupId) : null;
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
  if (!session || session.id !== saved.accountId || consenting?.id !== saved.accountId) {
    return withNotice(saved.returnTo, "calendar-wrong-account");
  }
  if (!tokens.scopes.includes(saved.scope)) {
    return withNotice(saved.returnTo, "calendar-declined");
  }
  if (!store.saveGrant(session.id, tokens.refreshToken, tokens.scopes)) {
    console.warn("music-chairs: Calendar consent returned no refresh token and none is stored");
    return withNotice(saved.returnTo, "calendar-failed");
  }
  forgetAccessToken(session.id);
  return withNotice(saved.returnTo, "calendar-connected");
}
