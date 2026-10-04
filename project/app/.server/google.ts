import { createHash, randomBytes } from "node:crypto";

import { publicOrigin } from "./membership";
import { getStore, type GoogleProfile } from "./store";

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const PEOPLE_API = "https://people.googleapis.com/v1";
// A stalled call to Google fails after this long instead of holding a page or a sync.
const GOOGLE_TIMEOUT_MS = 10_000;
// Sign-in asks for the basic profile only.
const SIGN_IN_SCOPES = ["openid", "email", "profile"];

/**
 * The Calendar permissions, each requested only from the feature that needs it
 * (plan/phase-7.md, Decisions): busy periods for import, and writing events on
 * calendars the member owns.
 */
export const CALENDAR_SCOPES = {
  busy: "https://www.googleapis.com/auth/calendar.freebusy",
  write: "https://www.googleapis.com/auth/calendar.events.owned",
} as const;

/**
 * Reading an organizer's contacts (plan/phase-13.md): saved contacts, and the
 * "other contacts" Google keeps for people they have emailed. Asked for only
 * when an organizer first uses contact suggestions, never at sign-in.
 */
export const CONTACTS_SCOPES = {
  saved: "https://www.googleapis.com/auth/contacts.readonly",
  other: "https://www.googleapis.com/auth/contacts.other.readonly",
} as const;

/**
 * What every sign-in asks for (plan/phase-12.md, Decisions): the identity and
 * both Calendar permissions in one consent. People can untick the Calendar
 * part and are still signed in.
 */
export const SIGN_IN_WITH_CALENDAR_SCOPES = [
  ...SIGN_IN_SCOPES,
  CALENDAR_SCOPES.busy,
  CALENDAR_SCOPES.write,
];

/** What a token exchange grants besides the identity. */
export type GoogleTokens = { refreshToken: string | null; scopes: string[] };

/** The member withdrew the app's Calendar access (or never granted it); ask again. */
export class GoogleAccessRevoked extends Error {}

/** Google's Calendar API failed or answered something unusable. */
export class GoogleApiError extends Error {}

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

/**
 * Google's consent URL. Sign-in uses the basic scopes; Calendar consent passes
 * its scopes and extra parameters (offline access, keeping earlier grants).
 */
export function authorizationUrl(
  config: GoogleConfig,
  params: {
    state: string;
    nonce: string;
    challenge: string;
    redirectUri: string;
    scopes?: string[];
    extra?: Record<string, string>;
  },
): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: (params.scopes ?? SIGN_IN_SCOPES).join(" "),
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    ...params.extra,
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
): Promise<{ profile: GoogleProfile; tokens: GoogleTokens }> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
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
  const body = (await response.json().catch(() => null)) as {
    id_token?: unknown;
    refresh_token?: unknown;
    scope?: unknown;
  } | null;
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
  // Google sends a boolean; some libraries document the string "true".
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  return {
    profile: { sub: claims.sub, email, name, emailVerified },
    tokens: {
      refreshToken:
        typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
      scopes: typeof body.scope === "string" ? body.scope.split(" ").filter(Boolean) : [],
    },
  };
}

// Access tokens live only in memory, per account, until shortly before they expire.
const accessTokens = new Map<string, { token: string; expiresAt: number }>();

/**
 * Forgets the cached access token and contacts, for example after the member
 * grants more scopes or Google refuses the grant.
 */
export function forgetAccessToken(accountId: string): void {
  accessTokens.delete(accountId);
  contactsCache.delete(accountId);
}

/**
 * Asks Google to withdraw everything the app was granted with this refresh
 * token. True when Google confirms it, or says the token is already invalid;
 * false when Google could not be reached or refused for another reason.
 */
export async function revokeGrant(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_ENDPOINT, {
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    if (response.ok) return true;
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    return response.status === 400 && body?.error === "invalid_token";
  } catch {
    return false;
  }
}

/**
 * A current access token for the account's Calendar grant, refreshing it when
 * needed. A refresh Google refuses as `invalid_grant` means the member revoked
 * access: the grant is deleted and `GoogleAccessRevoked` thrown.
 */
export async function accessTokenFor(accountId: string, now: Date = new Date()): Promise<string> {
  const cached = accessTokens.get(accountId);
  if (cached && cached.expiresAt > now.getTime()) return cached.token;
  const config = googleConfig();
  const grant = getStore().findGrant(accountId);
  if (!grant) throw new GoogleAccessRevoked("no Calendar grant");
  if (!config) throw new GoogleApiError("Google is not configured");
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: grant.refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch (error) {
    throw new GoogleApiError(`token refresh failed: ${(error as Error).message}`);
  }
  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
  } | null;
  if (body?.error === "invalid_grant") {
    // Only this token: a reconnect saved meanwhile must survive a late refusal.
    getStore().deleteGrant(accountId, grant.refreshToken);
    forgetAccessToken(accountId);
    throw new GoogleAccessRevoked("Google refused the refresh token");
  }
  if (!response.ok || typeof body?.access_token !== "string") {
    throw new GoogleApiError(`token refresh answered ${response.status}`);
  }
  const lifetime = typeof body.expires_in === "number" ? body.expires_in : 3600;
  accessTokens.set(accountId, {
    token: body.access_token,
    expiresAt: now.getTime() + (lifetime - 60) * 1000,
  });
  return body.access_token;
}

/** A Google API request with the account's access token, retried once after a 401. */
async function googleFetch(
  accountId: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessTokenFor(accountId);
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new GoogleApiError(`Google request failed: ${(error as Error).message}`);
    }
    if (response.status !== 401) return response;
    forgetAccessToken(accountId);
  }
  throw new GoogleAccessRevoked("Google refused the access token");
}

/** A Calendar API call with the account's token; a 401 retries once with a fresh token. */
function calendarFetch(
  accountId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return googleFetch(accountId, method, CALENDAR_API + path, body);
}

/** A contact suggestion: a name (empty when Google has none) and an email. */
export type Contact = { name: string; email: string };

/** The most contacts read from each source (saved, other). */
const CONTACTS_PER_SOURCE = 1000;
const CONTACTS_TTL_MS = 10 * 60_000;
const contactsCache = new Map<string, { contacts: Contact[]; expiresAt: number }>();

type PeoplePage = {
  connections?: PeoplePerson[];
  otherContacts?: PeoplePerson[];
  nextPageToken?: string;
};
type PeoplePerson = {
  names?: { displayName?: string }[];
  emailAddresses?: { value?: string }[];
};

/** Up to CONTACTS_PER_SOURCE people from one People API list, page by page. */
async function readPeople(accountId: string, url: string): Promise<PeoplePerson[]> {
  const people: PeoplePerson[] = [];
  let pageToken: string | undefined;
  do {
    const page = new URL(url);
    if (pageToken) page.searchParams.set("pageToken", pageToken);
    const response = await googleFetch(accountId, "GET", page.href);
    if (!response.ok) throw new GoogleApiError(`contacts answered ${response.status}`);
    const body = (await response.json().catch(() => null)) as PeoplePage | null;
    if (!body) throw new GoogleApiError("contacts returned no usable answer");
    people.push(...(body.connections ?? body.otherContacts ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken && people.length < CONTACTS_PER_SOURCE);
  return people.slice(0, CONTACTS_PER_SOURCE);
}

/**
 * The organizer's contacts that have an email (names and emails only), saved
 * contacts and, when granted, other contacts: deduplicated by email, sorted by
 * name, cached for ten minutes. Nothing is stored or logged.
 */
export async function listContacts(accountId: string, now: Date = new Date()): Promise<Contact[]> {
  // Expired lists leave memory on the next read, whoever's they are.
  for (const [id, entry] of contactsCache) {
    if (entry.expiresAt <= now.getTime()) contactsCache.delete(id);
  }
  const cached = contactsCache.get(accountId);
  if (cached) return cached.contacts;
  const grant = getStore().findGrant(accountId);
  if (!grant?.scopes.includes(CONTACTS_SCOPES.saved)) return [];
  const saved = await readPeople(
    accountId,
    `${PEOPLE_API}/people/me/connections?personFields=names,emailAddresses&pageSize=1000`,
  );
  const other = grant.scopes.includes(CONTACTS_SCOPES.other)
    ? await readPeople(
        accountId,
        `${PEOPLE_API}/otherContacts?readMask=names,emailAddresses&pageSize=1000`,
      )
    : [];
  const byEmail = new Map<string, Contact>();
  for (const person of [...saved, ...other]) {
    const name = person.names?.find((entry) => entry.displayName)?.displayName?.trim();
    for (const address of person.emailAddresses ?? []) {
      const email = address.value?.trim();
      if (!email || byEmail.has(email.toLowerCase())) continue;
      byEmail.set(email.toLowerCase(), { name: name ?? "", email });
    }
  }
  const contacts = [...byEmail.values()].sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email, "en"),
  );
  const entry = { contacts, expiresAt: now.getTime() + CONTACTS_TTL_MS };
  contactsCache.set(accountId, entry);
  // The list leaves memory when it expires, even if nobody reads contacts again.
  setTimeout(() => {
    if (contactsCache.get(accountId) === entry) contactsCache.delete(accountId);
  }, CONTACTS_TTL_MS).unref();
  return contacts;
}

/**
 * Busy periods in the member's primary calendar. A per-calendar error in an
 * otherwise successful answer is a failure, never "no busy periods".
 */
export async function queryBusy(
  accountId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<{ start: Date; end: Date }[]> {
  const response = await calendarFetch(accountId, "POST", "/freeBusy", {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    items: [{ id: "primary" }],
  });
  if (!response.ok) throw new GoogleApiError(`freeBusy answered ${response.status}`);
  const body = (await response.json().catch(() => null)) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
  } | null;
  const primary = body?.calendars?.primary;
  if (!primary || (primary.errors?.length ?? 0) > 0 || !Array.isArray(primary.busy)) {
    throw new GoogleApiError("freeBusy returned no usable answer for the primary calendar");
  }
  return primary.busy.map((period) => ({
    start: new Date(period.start),
    end: new Date(period.end),
  }));
}

/** An event the app writes to a member's primary calendar. */
export type CalendarEventBody = {
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  timeZone: string;
};

/**
 * Creates the event with the given id, or (when the id already exists, for
 * example as a deleted event) replaces it and makes sure it is not cancelled.
 */
export async function putEvent(
  accountId: string,
  eventId: string,
  event: CalendarEventBody,
): Promise<void> {
  const body = {
    id: eventId,
    status: "confirmed",
    summary: event.summary,
    location: event.location,
    description: event.description,
    start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
    end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
    extendedProperties: { private: { musicChairs: "1" } },
  };
  const inserted = await calendarFetch(accountId, "POST", "/calendars/primary/events", body);
  if (inserted.ok) return;
  if (inserted.status !== 409) throw new GoogleApiError(`event insert answered ${inserted.status}`);
  const updated = await calendarFetch(
    accountId,
    "PUT",
    `/calendars/primary/events/${eventId}`,
    body,
  );
  if (!updated.ok) throw new GoogleApiError(`event update answered ${updated.status}`);
}

/** Deletes the event; one already gone counts as deleted. */
export async function removeEvent(accountId: string, eventId: string): Promise<void> {
  const response = await calendarFetch(accountId, "DELETE", `/calendars/primary/events/${eventId}`);
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new GoogleApiError(`event delete answered ${response.status}`);
  }
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
