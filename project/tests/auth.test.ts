import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { findViewer } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { loader as startSignIn } from "../app/routes/auth.google";
import { loader as callback } from "../app/routes/auth.google.callback";
import { action as signOut } from "../app/routes/auth.sign-out";
import { loader as availabilityPage } from "../app/routes/availability";
import { loader as schedulePage } from "../app/routes/schedule";
import { loader as groupPage } from "../app/routes/group";
import { loader as homePage } from "../app/routes/home";
import { fakeGoogle as calendarFake } from "./google-fake";
import {
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  addressOf,
} from "./routes";

const count = tempDatabase();
const CLIENT_ID = "client-id.apps.googleusercontent.com";

beforeAll(() => {
  getStore();
});

beforeEach(() => {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const cellistProfile = { sub: "google-sub-cellist", email: "cellist@example.test", name: "Cel" };

function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  return { group, organizer, cellist };
}

/** Google's token endpoint, answering for `profile` with whatever nonce the flow sent. */
function fakeGoogle(
  profile: { sub: string; email: string; name: string },
  nonce: () => string,
  tokens: { scope?: string; refresh_token?: string } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const claims = {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Date.now() / 1000 + 3600,
        nonce: nonce(),
        ...profile,
      };
      return Response.json({ id_token: `${part({})}.${part(claims)}.sig`, ...tokens });
    }),
  );
}

/** Runs the whole sign-in from `returnTo` on a device carrying `cookie`; returns the final response. */
async function signInThroughGoogle(
  profile: { sub: string; email: string; name: string },
  options: {
    returnTo?: string;
    cookie?: string;
    tokens?: { scope?: string; refresh_token?: string };
  } = {},
): Promise<Response> {
  const query = options.returnTo ? `?returnTo=${encodeURIComponent(options.returnTo)}` : "";
  const started = (await startSignIn(
    routeArgs(`/auth/google${query}`, {}, { cookie: options.cookie }),
  )) as Response;
  const google = new URL(started.headers.get("Location")!);
  fakeGoogle(profile, () => google.searchParams.get("nonce")!, options.tokens);
  const oauth = Object.values(setCookies(started))[0];
  const cookie = [oauth, options.cookie].filter(Boolean).join("; ");
  const state = google.searchParams.get("state")!;
  return (await callback(
    routeArgs(`/auth/google/callback?code=abc&state=${state}`, {}, { cookie }),
  )) as Response;
}

describe("starting Google sign-in", () => {
  it("is unavailable without the client secret", async () => {
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "");

    const response = (await startSignIn(routeArgs("/auth/google", {}))) as Response;

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("isn't available");
  });

  it("goes to Google with a callback on this site and remembers the flow in a cookie", async () => {
    const response = (await startSignIn(
      routeArgs(`/auth/google?returnTo=${encodeURIComponent("/g/abc?x=1")}`, {}),
    )) as Response;

    expect(response.status).toBe(302);
    const google = new URL(response.headers.get("Location")!);
    expect(google.host).toBe("accounts.google.com");
    expect(google.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/google/callback`);
    const cookies = setCookies(response);
    expect(Object.keys(cookies)).toEqual(["mc_oauth"]);
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
  });

  it.each([
    ["an absolute URL", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example/"],
    ["an encoded double slash", "/%2F%2Fevil.example"],
    ["a tab before the slashes", "/\t/evil.example"],
    ["a newline before the slashes", "/\n/evil.example"],
    ["a backslash", "/\\evil.example"],
  ])("never returns to %s after sign-in", async (_label, returnTo) => {
    const response = await signInThroughGoogle(cellistProfile, { returnTo });

    const location = response.headers.get("Location")!;
    expect(new URL(location, ORIGIN).origin).toBe(ORIGIN);
    expect(location.startsWith("/")).toBe(true);
    expect(location.startsWith("//")).toBe(false);
  });
});

describe("Google's callback", () => {
  it("links the name-only member of the group sign-in started from, keeping their availability", async () => {
    const { group, cellist } = band();
    getStore().addSlot(cellist.id, {
      kind: "weekly",
      startDate: "2026-10-01",
      endDate: null,
      startMinute: 1140,
      endMinute: 1260,
    });
    const device = await deviceCookie(group.id, cellist.deviceToken);

    const response = await signInThroughGoogle(cellistProfile, {
      returnTo: groupPath(group),
      cookie: device,
    });

    expect(response.headers.get("Location")).toBe(`${groupPath(group)}?notice=linked`);
    const cookies = setCookies(response);
    expect(cookies.mc_oauth).toBe("mc_oauth=");
    expect(cookies.mc_session).toMatch(/^mc_session=.+/);
    const linked = getStore().findMember(group.id, cellist.id);
    expect(linked?.googleEmail).toBe("cellist@example.test");
    expect(getStore().listSlots(cellist.id)).toHaveLength(1);

    // A fresh device signed in with the same account is Cellist there, and finds the group.
    const elsewhere = await signedIn(cellistProfile);
    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: elsewhere.cookie } }),
      group,
    );
    expect(viewer?.id).toBe(cellist.id);
    const home = await homePage(routeArgs("/", {}, { cookie: elsewhere.cookie }));
    expect(home.groups).toContainEqual({
      path: groupPath(group),
      name: "Thursday Quartet",
      displayName: "Cellist",
    });
  });

  it("refuses a second member of the same group for one Google account, and says so", async () => {
    const { group, cellist } = band();
    const pianist = getStore().addMember(group.id, "Pianist", "member");
    const account = getStore().upsertAccount(cellistProfile);
    getStore().linkMember(group.id, cellist.id, account.id);

    const response = await signInThroughGoogle(cellistProfile, {
      returnTo: groupPath(group),
      cookie: await deviceCookie(group.id, pianist.deviceToken),
    });

    expect(response.headers.get("Location")).toBe(`${groupPath(group)}?notice=account-taken`);
    expect(getStore().findMember(group.id, pianist.id)?.googleEmail).toBeNull();
    const cookie = [
      await deviceCookie(group.id, pianist.deviceToken),
      setCookies(response).mc_session,
    ].join("; ");
    const page = await groupPage(
      routeArgs(
        `${groupPath(group)}?notice=account-taken`,
        { groupAddress: addressOf(group) },
        { cookie },
      ),
    );
    expect(page.notice).toBe(
      "This Google account is already Cellist in this group, so Pianist stays name-only.",
    );
  });

  it("links nothing when sign-in starts from the start page", async () => {
    const { group, cellist } = band();

    const response = await signInThroughGoogle(cellistProfile, {
      cookie: await deviceCookie(group.id, cellist.deviceToken),
    });

    expect(response.headers.get("Location")).toBe("/");
    expect(getStore().findMember(group.id, cellist.id)?.googleEmail).toBeNull();
  });

  it("creates no session when Google's state does not match this browser's", async () => {
    const sessions = count("sessions");
    const started = (await startSignIn(routeArgs("/auth/google", {}))) as Response;
    const oauth = Object.values(setCookies(started))[0];
    // Google itself would answer correctly; only the state ties the callback to this browser.
    const nonce = new URL(started.headers.get("Location")!).searchParams.get("nonce")!;
    fakeGoogle(cellistProfile, () => nonce);

    const response = (await callback(
      routeArgs("/auth/google/callback?code=abc&state=forged", {}, { cookie: oauth }),
    )) as Response;

    expect(response.headers.get("Location")).toBe("/?notice=signin-failed");
    expect(setCookies(response).mc_session).toBeUndefined();
    expect(count("sessions")).toBe(sessions);
  });

  it("reports a cancelled sign-in without contacting Google", async () => {
    const fake = vi.fn();
    vi.stubGlobal("fetch", fake);

    const response = (await callback(
      routeArgs("/auth/google/callback?error=access_denied&state=x", {}),
    )) as Response;

    expect(response.headers.get("Location")).toBe("/?notice=signin-cancelled");
    expect(fake).not.toHaveBeenCalled();
  });
});

describe("Calendar access with every sign-in", () => {
  const BUSY = "https://www.googleapis.com/auth/calendar.freebusy";
  const WRITE = "https://www.googleapis.com/auth/calendar.events.owned";
  let people = 0;
  const person = () => {
    people += 1;
    return { sub: `cal-sub-${people}`, email: `cal${people}@example.test`, name: "Cal" };
  };

  it("asks Google for both Calendar permissions, offline, keeping earlier grants", async () => {
    const response = (await startSignIn(routeArgs("/auth/google", {}))) as Response;

    const google = new URL(response.headers.get("Location")!);
    expect(google.searchParams.get("scope")?.split(" ")).toEqual([
      "openid",
      "email",
      "profile",
      BUSY,
      WRITE,
    ]);
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(google.searchParams.get("include_granted_scopes")).toBe("true");
    expect(google.searchParams.get("prompt")).toBe("select_account");
  });

  it("keeps the Calendar access granted with sign-in", async () => {
    const profile = person();

    await signInThroughGoogle(profile, {
      tokens: { scope: `openid email profile ${BUSY} ${WRITE}`, refresh_token: "refresh-new" },
    });

    const account = getStore().findAccountBySub(profile.sub)!;
    expect(getStore().findGrant(account.id)).toMatchObject({
      refreshToken: "refresh-new",
      scopes: expect.arrayContaining([BUSY, WRITE]),
    });
  });

  it("signs in without a grant when the Calendar part is unticked", async () => {
    const profile = person();

    const response = await signInThroughGoogle(profile, {
      tokens: { scope: "openid email profile", refresh_token: "refresh-x" },
    });

    expect(setCookies(response).mc_session).toBeTruthy();
    const account = getStore().findAccountBySub(profile.sub)!;
    expect(getStore().findGrant(account.id)).toBeNull();
  });

  it("saves nothing when Google sends no refresh token and none is stored", async () => {
    const profile = person();

    const response = await signInThroughGoogle(profile, {
      tokens: { scope: `openid email profile ${BUSY} ${WRITE}` },
    });

    expect(setCookies(response).mc_session).toBeTruthy();
    const account = getStore().findAccountBySub(profile.sub)!;
    expect(getStore().findGrant(account.id)).toBeNull();
  });

  it("makes clashes and calendar writing work with no second Google screen", async () => {
    const profile = person();
    const signIn = await signInThroughGoogle(profile, {
      tokens: { scope: `openid email profile ${BUSY} ${WRITE}`, refresh_token: "refresh-both" },
    });
    const session = setCookies(signIn).mc_session;
    const account = getStore().findAccountBySub(profile.sub)!;
    const { group } = getStore().createGroup("Quartet", "Viola", "Europe/London");
    const member = getStore().addMember(group.id, "Cal", "member", account.id);
    const cookie = `${await deviceCookie(group.id, member.deviceToken)}; ${session}`;
    calendarFake();

    const availability = (await availabilityPage(
      routeArgs(`${groupPath(group)}/availability`, { groupAddress: addressOf(group) }, { cookie }),
    )) as { clashes: { state: string } };
    const schedule = (await schedulePage(
      routeArgs(`${groupPath(group)}/schedule`, { groupAddress: addressOf(group) }, { cookie }),
    )) as { calendar: { google: { state: string } | null } };

    expect(availability.clashes.state).toBe("ready");
    expect(schedule.calendar.google?.state).toBe("off");
  });

  it("offers to connect Calendar after a sign-in that brought no refresh token", async () => {
    const profile = person();
    const signIn = await signInThroughGoogle(profile, {
      tokens: { scope: `openid email profile ${BUSY} ${WRITE}` },
    });
    const session = setCookies(signIn).mc_session;
    const account = getStore().findAccountBySub(profile.sub)!;
    const { group } = getStore().createGroup("Quartet", "Viola", "Europe/London");
    const member = getStore().addMember(group.id, "Cal", "member", account.id);
    const cookie = `${await deviceCookie(group.id, member.deviceToken)}; ${session}`;

    const availability = (await availabilityPage(
      routeArgs(`${groupPath(group)}/availability`, { groupAddress: addressOf(group) }, { cookie }),
    )) as { clashes: { state: string } };

    expect(availability.clashes.state).toBe("connect");
  });

  it("merges new Calendar scopes into a stored grant, keeping its refresh token", async () => {
    const profile = person();
    const account = getStore().upsertAccount(profile);
    getStore().saveGrant(account.id, "refresh-old", [BUSY]);

    await signInThroughGoogle(profile, { tokens: { scope: `openid ${BUSY} ${WRITE}` } });

    expect(getStore().findGrant(account.id)).toMatchObject({
      refreshToken: "refresh-old",
      scopes: expect.arrayContaining([BUSY, WRITE]),
    });
  });
});

describe("sessions", () => {
  it("signing out forgets the session, so the group no longer recognizes that device", async () => {
    const { group, cellist } = band();
    const { account, cookie } = await signedIn(cellistProfile);
    getStore().linkMember(group.id, cellist.id, account.id);
    const asSignedIn = await groupPage(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie }),
    );
    expect(asSignedIn.viewer?.displayName).toBe("Cellist");

    const response = (await signOut(
      routeArgs("/auth/sign-out", {}, { cookie, form: {} }),
    )) as Response;

    expect(response.headers.get("Location")).toBe("/");
    expect(setCookies(response).mc_session).toBe("mc_session=");
    const toast = await readToast(
      new Request(ORIGIN, { headers: { Cookie: setCookies(response).mc_toast } }),
    );
    expect(toast.toast?.message).toBe("Signed out");
    const after = await groupPage(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie }),
    );
    expect(after.viewer).toBeNull();
  });

  it("everyday use of a group on the device the member joined from keeps the session alive", async () => {
    const { group, cellist } = band();
    const { account, cookie } = await signedIn(cellistProfile);
    getStore().linkMember(group.id, cellist.id, account.id);
    const device = await deviceCookie(group.id, cellist.deviceToken);
    const both = `${device}; ${cookie}`;
    const DAY = 24 * 60 * 60 * 1000;
    const start = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(start + 89 * DAY);
      await availabilityPage(
        routeArgs(
          `${groupPath(group)}/availability`,
          { groupAddress: addressOf(group) },
          { cookie: both },
        ),
      );
      vi.setSystemTime(start + 150 * DAY);
      const home = await homePage(routeArgs("/", {}, { cookie }));
      expect(home.account?.email).toBe("cellist@example.test");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not offer sign-in again when this browser's account is already someone else here", async () => {
    const { group, cellist } = band();
    const pianist = getStore().addMember(group.id, "Pianist", "member");
    const { account, cookie } = await signedIn(cellistProfile);
    getStore().linkMember(group.id, cellist.id, account.id);
    const asPianistDevice = `${await deviceCookie(group.id, pianist.deviceToken)}; ${cookie}`;

    const page = await groupPage(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie: asPianistDevice }),
    );
    const nameOnly = await groupPage(
      routeArgs(
        groupPath(group),
        { groupAddress: addressOf(group) },
        { cookie: await deviceCookie(group.id, pianist.deviceToken) },
      ),
    );

    expect(page.viewer?.displayName).toBe("Pianist");
    expect(page.signInAvailable).toBe(false);
    expect(nameOnly.signInAvailable).toBe(true);
  });

  it("stops recognizing a session after 90 days without use", async () => {
    const { group, cellist } = band();
    const { account, cookie } = await signedIn(cellistProfile);
    getStore().linkMember(group.id, cellist.id, account.id);
    const load = () =>
      groupPage(routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie }));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 89 * 24 * 60 * 60 * 1000);
      expect((await load()).viewer?.displayName).toBe("Cellist");
      vi.setSystemTime(Date.now() + 91 * 24 * 60 * 60 * 1000);
      expect((await load()).viewer).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
