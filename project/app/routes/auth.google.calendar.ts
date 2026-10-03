import { randomBytes } from "node:crypto";

import { redirect } from "react-router";

import {
  authorizationUrl,
  CALENDAR_SCOPES,
  callbackUrl,
  googleConfig,
  pkcePair,
} from "~/.server/google";
import { readAccount, safeReturnTo, writeOAuthState } from "~/.server/membership";

import type { Route } from "./+types/auth.google.calendar";

/**
 * Asks Google for one Calendar permission (`?scope=import` or `?scope=write`)
 * for the signed-in account, keeping earlier grants and requesting offline
 * access so the app can act later. Google returns to the shared callback.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const config = googleConfig();
  if (!config) {
    return new Response("Google Calendar isn't available right now.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"), request);
  const account = await readAccount(request);
  if (!account) {
    throw redirect(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const wanted = url.searchParams.get("scope");
  if (wanted !== "import" && wanted !== "write") {
    return new Response("Unknown Calendar permission.", { status: 400 });
  }
  const scope = CALENDAR_SCOPES[wanted];
  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const target = authorizationUrl(config, {
    state,
    nonce,
    challenge,
    redirectUri: callbackUrl(request),
    scopes: ["openid", scope],
    extra: {
      include_granted_scopes: "true",
      access_type: "offline",
      prompt: "consent",
      login_hint: account.email,
    },
  });
  return redirect(target, {
    headers: {
      "Set-Cookie": await writeOAuthState({
        state,
        nonce,
        verifier,
        returnTo,
        purpose: "calendar",
        scope,
        accountId: account.id,
      }),
      "Cache-Control": "no-store",
    },
  });
}
