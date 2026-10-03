import { redirect } from "react-router";

import { callbackUrl, exchangeCode, googleConfig, GoogleSignInError } from "~/.server/google";
import {
  clearOAuthState,
  findDeviceMember,
  readOAuthState,
  startSession,
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
    return redirect("/?notice=signin-cancelled", { headers });
  }
  if (!config || !saved || !code || url.searchParams.get("state") !== saved.state) {
    console.warn("music-chairs: Google sign-in refused: missing or mismatched state");
    return redirect("/?notice=signin-failed", { headers });
  }
  let identity: GoogleProfile;
  try {
    identity = await exchangeCode(config, {
      code,
      verifier: saved.verifier,
      redirectUri: callbackUrl(request),
      nonce: saved.nonce,
    });
  } catch (error) {
    if (!(error instanceof GoogleSignInError)) throw error;
    console.warn(`music-chairs: Google sign-in refused: ${error.message}`);
    return redirect("/?notice=signin-failed", { headers });
  }
  const store = getStore();
  const account = store.upsertAccount(identity);
  headers.append("Set-Cookie", await startSession(account.id));
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
