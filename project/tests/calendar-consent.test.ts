import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessTokenFor, CALENDAR_SCOPES } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { loader as startConsent } from "../app/routes/auth.google.calendar";
import { loader as callback } from "../app/routes/auth.google.callback";
import { fakeGoogle, idToken, type GoogleFake } from "./google-fake";
import { routeArgs, setCookies, signedIn, thrownBy } from "./routes";

const CLIENT_ID = "client-id";
let google: GoogleFake;
let people = 0;

beforeEach(() => {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
  google = fakeGoogle();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function person() {
  people += 1;
  return { sub: `consent-sub-${people}`, email: `p${people}@example.test`, name: `P${people}` };
}

/** Starts consent for `scope` as the session in `cookie`; returns what the browser carries back. */
async function begin(cookie: string, scope: "busy" | "write", returnTo = "/g/abc/schedule") {
  const response = (await startConsent(
    routeArgs(
      `/auth/google/calendar?scope=${scope}&returnTo=${encodeURIComponent(returnTo)}`,
      {},
      { cookie },
    ),
  )) as Response;
  const google = new URL(response.headers.get("Location")!);
  return {
    response,
    google,
    oauth: Object.values(setCookies(response))[0],
    state: google.searchParams.get("state")!,
    nonce: google.searchParams.get("nonce")!,
  };
}

/** Google's answer to the code exchange: an ID token for `sub` and the granted scopes. */
/** `refreshToken` null leaves it out, as Google does when one was already issued. */
function googleAnswers(
  sub: string,
  nonce: string,
  scope: string,
  refreshToken: string | null = "refresh-1",
) {
  google.codeAnswer = {
    body: {
      id_token: idToken({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Date.now() / 1000 + 600,
        nonce,
        sub,
        email: "x@example.test",
      }),
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      scope,
    },
  };
}

async function finish(cookie: string, state: string) {
  return (await callback(
    routeArgs(`/auth/google/callback?code=c&state=${state}`, {}, { cookie }),
  )) as Response;
}

describe("asking for Calendar access", () => {
  it("sends a visitor who isn't signed in to sign in first", async () => {
    const thrown = await thrownBy(
      startConsent(routeArgs("/auth/google/calendar?scope=busy&returnTo=%2Fg%2Fabc", {})),
    );

    expect((thrown as Response).headers.get("Location")).toBe("/auth/google?returnTo=%2Fg%2Fabc");
  });

  it("refuses an unknown permission", async () => {
    const { cookie } = await signedIn(person());

    for (const scope of ["everything", "import"]) {
      const response = (await startConsent(
        routeArgs(`/auth/google/calendar?scope=${scope}`, {}, { cookie }),
      )) as Response;
      expect(response.status).toBe(400);
    }
  });

  it("asks only for the one Calendar scope, offline, keeping earlier grants", async () => {
    const profile = person();
    const { cookie } = await signedIn(profile);

    const { google } = await begin(cookie, "busy");

    expect(Object.fromEntries(google.searchParams)).toMatchObject({
      scope: `openid ${CALENDAR_SCOPES.busy}`,
      include_granted_scopes: "true",
      access_type: "offline",
      prompt: "consent",
      login_hint: profile.email,
    });
  });
});

describe("Google's answer to Calendar consent", () => {
  it("saves the grant for the signed-in account and starts no session or link", async () => {
    const profile = person();
    const { account, cookie } = await signedIn(profile);
    const { oauth, state, nonce } = await begin(cookie, "busy");
    googleAnswers(profile.sub, nonce, `openid ${CALENDAR_SCOPES.busy}`);
    const accounts = getStore().listAccountMemberships(account.id).length;

    const response = await finish(`${oauth}; ${cookie}`, state);

    expect(response.headers.get("Location")).toBe("/g/abc/schedule?notice=calendar-connected");
    expect(getStore().findGrant(account.id)).toEqual({
      accountId: account.id,
      refreshToken: "refresh-1",
      scopes: [CALENDAR_SCOPES.busy, "openid"],
    });
    expect(Object.keys(setCookies(response))).toEqual(["mc_oauth"]);
    expect(getStore().listAccountMemberships(account.id)).toHaveLength(accounts);
  });

  it("refuses a different Google account from the one signed in", async () => {
    const profile = person();
    const other = person();
    getStore().upsertAccount(other);
    const { account, cookie } = await signedIn(profile);
    const { oauth, state, nonce } = await begin(cookie, "write");
    googleAnswers(other.sub, nonce, `openid ${CALENDAR_SCOPES.write}`);

    const response = await finish(`${oauth}; ${cookie}`, state);

    expect(response.headers.get("Location")).toBe("/g/abc/schedule?notice=calendar-wrong-account");
    expect(getStore().findGrant(account.id)).toBeNull();
  });

  it("refuses when the session changed to someone else during consent", async () => {
    const first = person();
    const second = person();
    const { account, cookie } = await signedIn(first);
    const { oauth, state, nonce } = await begin(cookie, "write");
    const later = await signedIn(second);
    googleAnswers(first.sub, nonce, `openid ${CALENDAR_SCOPES.write}`);

    const response = await finish(`${oauth}; ${later.cookie}`, state);

    expect(response.headers.get("Location")).toContain("notice=calendar-wrong-account");
    expect(getStore().findGrant(account.id)).toBeNull();
    expect(getStore().findGrant(later.account.id)).toBeNull();
  });

  it("saves nothing when the member unticked the Calendar permission", async () => {
    const profile = person();
    const { account, cookie } = await signedIn(profile);
    const { oauth, state, nonce } = await begin(cookie, "write");
    googleAnswers(profile.sub, nonce, "openid email");

    const response = await finish(`${oauth}; ${cookie}`, state);

    expect(response.headers.get("Location")).toContain("notice=calendar-declined");
    expect(getStore().findGrant(account.id)).toBeNull();
  });

  it("adds a later permission to the earlier one and keeps the refresh token", async () => {
    const profile = person();
    const { account, cookie } = await signedIn(profile);
    let flow = await begin(cookie, "busy");
    googleAnswers(profile.sub, flow.nonce, `openid ${CALENDAR_SCOPES.busy}`);
    await finish(`${flow.oauth}; ${cookie}`, flow.state);

    flow = await begin(cookie, "write");
    google.codeAnswer = null;
    googleAnswers(profile.sub, flow.nonce, `openid ${CALENDAR_SCOPES.write}`, null);
    await finish(`${flow.oauth}; ${cookie}`, flow.state);

    expect(getStore().findGrant(account.id)?.scopes).toEqual(
      [CALENDAR_SCOPES.busy, CALENDAR_SCOPES.write, "openid"].sort(),
    );
    expect(getStore().findGrant(account.id)?.refreshToken).toBe("refresh-1");
  });

  it("drops the cached access token when a new permission is saved", async () => {
    const profile = person();
    const { account, cookie } = await signedIn(profile);
    let flow = await begin(cookie, "busy");
    googleAnswers(profile.sub, flow.nonce, `openid ${CALENDAR_SCOPES.busy}`);
    await finish(`${flow.oauth}; ${cookie}`, flow.state);
    await accessTokenFor(account.id);
    await accessTokenFor(account.id);
    const refreshes = () =>
      google.calls.filter(
        (call) => (call.body as { grant_type?: string }).grant_type === "refresh_token",
      ).length;
    expect(refreshes()).toBe(1);

    flow = await begin(cookie, "write");
    googleAnswers(profile.sub, flow.nonce, `openid ${CALENDAR_SCOPES.write}`, null);
    await finish(`${flow.oauth}; ${cookie}`, flow.state);
    await accessTokenFor(account.id);

    expect(refreshes()).toBe(2);
  });

  it("treats Google's error answer as a declined permission", async () => {
    const { cookie } = await signedIn(person());
    const { oauth, state } = await begin(cookie, "busy");

    const response = (await callback(
      routeArgs(
        `/auth/google/callback?error=access_denied&state=${state}`,
        {},
        {
          cookie: `${oauth}; ${cookie}`,
        },
      ),
    )) as Response;

    expect(response.headers.get("Location")).toBe("/g/abc/schedule?notice=calendar-declined");
  });
});
