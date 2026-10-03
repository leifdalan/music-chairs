import { randomBytes } from "node:crypto";

import { redirect } from "react-router";

import {
  authorizationUrl,
  callbackUrl,
  googleConfig,
  pkcePair,
  SIGN_IN_WITH_CALENDAR_SCOPES,
} from "~/.server/google";
import { safeReturnTo, writeOAuthState } from "~/.server/membership";

import type { Route } from "./+types/auth.google";

/**
 * Starts Google sign-in, asking for Calendar access in the same consent:
 * remembers state, nonce and PKCE verifier, then goes to Google.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const config = googleConfig();
  if (!config) {
    return new Response("Google sign-in isn't available right now.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"), request);
  const url = authorizationUrl(config, {
    state,
    nonce,
    challenge,
    redirectUri: callbackUrl(request),
    // Offline access gives a refresh token, so clashes and calendar writing
    // keep working; earlier grants are kept.
    scopes: SIGN_IN_WITH_CALENDAR_SCOPES,
    extra: { access_type: "offline", include_granted_scopes: "true" },
  });
  return redirect(url, {
    headers: {
      "Set-Cookie": await writeOAuthState({
        state,
        nonce,
        verifier,
        returnTo,
        purpose: "signin",
        scope: "",
        accountId: "",
      }),
      "Cache-Control": "no-store",
    },
  });
}
