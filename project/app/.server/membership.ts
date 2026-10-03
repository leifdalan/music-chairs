import { createCookie } from "react-router";

import { getStore, type Account, type Group, type Member } from "./store";

type Memberships = Record<string, string>;

/**
 * The site's public origin from `MUSIC_CHAIRS_PUBLIC_URL` (for example
 * `https://rehearse.dalan.dev`), or null when unset, as in local development.
 * Behind the HTTPS proxy the request URL is the internal `http://127.0.0.1`
 * address, so links shown to people are built from this instead.
 */
export function publicOrigin(): string | null {
  const configured = process.env.MUSIC_CHAIRS_PUBLIC_URL;
  return configured ? new URL(configured).origin : null;
}

const secure = publicOrigin()?.startsWith("https:") ?? false;
const LONG_COOKIE_SECONDS = 60 * 60 * 24 * 400;

// Which member this device is in each group: group id → device token. Unsigned
// on purpose: device tokens are unguessable, never sent to the browser in page
// data, and the brief leaves name-only impersonation to social contract.
// `Secure` whenever the site is served over HTTPS.
const membershipCookie = createCookie("mc_members", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: LONG_COOKIE_SECONDS,
  secure,
});

// The Google session's bearer token. Its real lifetime is enforced by the
// store (90 days after last use); the cookie just outlives that. Over HTTPS the
// `__Host-` prefix stops any other dalan.dev subdomain from planting one.
const sessionCookie = createCookie(secure ? "__Host-mc_session" : "mc_session", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: LONG_COOKIE_SECONDS,
  secure,
});

/**
 * What the browser must bring back from Google for a consent to complete:
 * `signin`, or `calendar` consent for `scope`, started by `accountId` (empty
 * for sign-in).
 */
export type OAuthState = {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  purpose: "signin" | "calendar";
  scope: string;
  accountId: string;
};

// Unsigned on purpose: a browser can only alter its own copy, a changed verifier
// fails the token exchange, and the callback requires Google's `state` to match.
const oauthCookie = createCookie(secure ? "__Host-mc_oauth" : "mc_oauth", {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 10,
  secure,
});

/** The group → device token map this device carries; empty when absent or unreadable. */
export async function readMemberships(request: Request): Promise<Memberships> {
  const value: unknown = await membershipCookie.parse(request.headers.get("Cookie"));
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** A `Set-Cookie` value that adds this membership and keeps the device's others. */
export async function rememberMembership(
  request: Request,
  groupId: string,
  deviceToken: string,
): Promise<string> {
  const memberships = await readMemberships(request);
  return membershipCookie.serialize({ ...memberships, [groupId]: deviceToken });
}

/**
 * The member this visitor is in `group`: the member this device joined as, or
 * else the signed-in Google account's member there; null for anyone else.
 */
export async function findViewer(request: Request, group: Group): Promise<Member | null> {
  // Read the session even when the device membership decides, so everyday use renews it.
  const account = await readAccount(request);
  const onDevice = await findDeviceMember(request, group);
  if (onDevice) return onDevice;
  return account ? getStore().findMemberByAccount(group.id, account.id) : null;
}

/** The member this device joined `group` as, ignoring any Google sign-in. */
export async function findDeviceMember(request: Request, group: Group): Promise<Member | null> {
  const deviceToken = (await readMemberships(request))[group.id];
  return deviceToken ? getStore().findMemberByDevice(group.id, deviceToken) : null;
}

async function readSessionToken(request: Request): Promise<string | null> {
  const value: unknown = await sessionCookie.parse(request.headers.get("Cookie"));
  return typeof value === "string" ? value : null;
}

/** The signed-in Google account, or null (also for an expired session). Using it renews it. */
export async function readAccount(request: Request): Promise<Account | null> {
  const token = await readSessionToken(request);
  return token ? getStore().findSession(token) : null;
}

/** Starts a session for the account; returns its `Set-Cookie` value. */
export async function startSession(accountId: string): Promise<string> {
  return sessionCookie.serialize(getStore().createSession(accountId));
}

/** Ends this device's session; returns the `Set-Cookie` value that removes it. */
export async function endSession(request: Request): Promise<string> {
  const token = await readSessionToken(request);
  if (token) getStore().deleteSession(token);
  return sessionCookie.serialize("", { maxAge: 0 });
}

export async function writeOAuthState(value: OAuthState): Promise<string> {
  return oauthCookie.serialize(value);
}

export async function readOAuthState(request: Request): Promise<OAuthState | null> {
  const value: unknown = await oauthCookie.parse(request.headers.get("Cookie"));
  if (!value || typeof value !== "object") return null;
  const { state, nonce, verifier, returnTo, purpose, scope, accountId } = value as Record<
    string,
    unknown
  >;
  return typeof state === "string" &&
    typeof nonce === "string" &&
    typeof verifier === "string" &&
    typeof returnTo === "string" &&
    (purpose === "signin" || purpose === "calendar") &&
    typeof scope === "string" &&
    typeof accountId === "string"
    ? { state, nonce, verifier, returnTo, purpose, scope, accountId }
    : null;
}

export async function clearOAuthState(): Promise<string> {
  return oauthCookie.serialize("", { maxAge: 0 });
}

/**
 * `value` as a path on this site to return to after signing in, or `/`. It is
 * resolved the way a browser would (which drops tabs and newlines), so nothing
 * that would leave the site survives.
 */
export function safeReturnTo(value: unknown, request: Request): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  const origin = new URL(request.url).origin;
  try {
    const target = new URL(value, origin);
    return target.origin === origin ? target.pathname + target.search : "/";
  } catch {
    return "/";
  }
}
