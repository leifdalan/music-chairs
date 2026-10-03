import { createHash, randomBytes } from "node:crypto";

import { publicOrigin } from "./membership";
import type { GoogleProfile } from "./store";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
// Basic profile only; Calendar scopes are Phase 7's and need Google's verification.
const SCOPES = "openid email profile";

export type GoogleConfig = { clientId: string; clientSecret: string };

/** A sign-in that must not proceed; the message is for the server log, never the page. */
export class GoogleSignInError extends Error {}

/**
 * The OAuth client from `MUSIC_CHAIRS_GOOGLE_CLIENT_ID` and
 * `MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET`, or null when either is unset: sign-in is
 * then unavailable and the rest of the site works as before.
 */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.MUSIC_CHAIRS_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** A PKCE verifier and its S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

/** Where Google sends the browser back: the public origin when set, else the request's. */
export function callbackUrl(request: Request): string {
  return new URL("/auth/google/callback", publicOrigin() ?? request.url).href;
}

export function authorizationUrl(
  config: GoogleConfig,
  params: { state: string; nonce: string; challenge: string; redirectUri: string },
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: SCOPES,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.href;
}

/**
 * Exchanges an authorization code for the user's identity. The ID token comes
 * straight from Google's token endpoint over HTTPS, authenticated with the
 * client secret, so (as Google documents) its signature need not be verified
 * here; its issuer, audience, expiry and nonce are. It never leaves the server.
 */
export async function exchangeCode(
  config: GoogleConfig,
  params: { code: string; verifier: string; redirectUri: string; nonce: string },
  now: Date = new Date(),
): Promise<GoogleProfile> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: params.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: "authorization_code",
        code_verifier: params.verifier,
      }),
    });
  } catch (error) {
    throw new GoogleSignInError(`token request failed: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new GoogleSignInError(`token endpoint answered ${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (typeof body?.id_token !== "string") throw new GoogleSignInError("no ID token");
  const claims = decodePayload(body.id_token);
  if (!ISSUERS.includes(String(claims.iss))) throw new GoogleSignInError("wrong issuer");
  if (claims.aud !== config.clientId) throw new GoogleSignInError("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now.getTime()) {
    throw new GoogleSignInError("expired ID token");
  }
  if (claims.nonce !== params.nonce) throw new GoogleSignInError("nonce mismatch");
  if (typeof claims.sub !== "string" || !claims.sub) throw new GoogleSignInError("no subject");
  const email = typeof claims.email === "string" ? claims.email : "";
  const name = typeof claims.name === "string" && claims.name ? claims.name : email;
  return { sub: claims.sub, email, name };
}

function decodePayload(idToken: string): Record<string, unknown> {
  const payload = idToken.split(".")[1];
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload ?? "", "base64url").toString());
    if (claims && typeof claims === "object") return claims as Record<string, unknown>;
  } catch {
    // Fall through to the refusal below.
  }
  throw new GoogleSignInError("malformed ID token");
}
