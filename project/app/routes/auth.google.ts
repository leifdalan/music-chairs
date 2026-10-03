import { randomBytes } from "node:crypto";

import { redirect } from "react-router";

import { authorizationUrl, callbackUrl, googleConfig, pkcePair } from "~/.server/google";
import { safeReturnTo, writeOAuthState } from "~/.server/membership";

import type { Route } from "./+types/auth.google";

/** Starts Google sign-in: remembers state, nonce and PKCE verifier, then goes to Google. */
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
  });
  return redirect(url, {
    headers: {
      "Set-Cookie": await writeOAuthState({ state, nonce, verifier, returnTo }),
      "Cache-Control": "no-store",
    },
  });
}
