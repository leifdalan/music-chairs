import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { findViewer } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { loader as startSignIn } from "../app/routes/auth.google";
import { loader as callback } from "../app/routes/auth.google.callback";
import { action as signOut } from "../app/routes/auth.sign-out";
import { loader as availabilityPage } from "../app/routes/availability";
import { loader as groupPage } from "../app/routes/group";
import { loader as homePage } from "../app/routes/home";
import { deviceCookie, ORIGIN, routeArgs, setCookies, signedIn, tempDatabase } from "./routes";

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
function fakeGoogle(profile: { sub: string; email: string; name: string }, nonce: () => string) {
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
      return Response.json({ id_token: `${part({})}.${part(claims)}.sig` });
    }),
  );
}

/** Runs the whole sign-in from `returnTo` on a device carrying `cookie`; returns the final response. */
async function signInThroughGoogle(
  profile: { sub: string; email: string; name: string },
  options: { returnTo?: string; cookie?: string } = {},
): Promise<Response> {
  const query = options.returnTo ? `?returnTo=${encodeURIComponent(options.returnTo)}` : "";
  const started = (await startSignIn(
    routeArgs(`/auth/google${query}`, {}, { cookie: options.cookie }),
  )) as Response;
  const google = new URL(started.headers.get("Location")!);
  fakeGoogle(profile, () => google.searchParams.get("nonce")!);
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
      returnTo: `/g/${group.id}`,
      cookie: device,
    });

    expect(response.headers.get("Location")).toBe(`/g/${group.id}?notice=linked`);
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
      id: group.id,
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
      returnTo: `/g/${group.id}`,
      cookie: await deviceCookie(group.id, pianist.deviceToken),
    });

    expect(response.headers.get("Location")).toBe(`/g/${group.id}?notice=account-taken`);
    expect(getStore().findMember(group.id, pianist.id)?.googleEmail).toBeNull();
    const cookie = [
      await deviceCookie(group.id, pianist.deviceToken),
      setCookies(response).mc_session,
    ].join("; ");
    const page = await groupPage(
      routeArgs(`/g/${group.id}?notice=account-taken`, { groupId: group.id }, { cookie }),
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

describe("sessions", () => {
  it("signing out forgets the session, so the group no longer recognizes that device", async () => {
    const { group, cellist } = band();
    const { account, cookie } = await signedIn(cellistProfile);
    getStore().linkMember(group.id, cellist.id, account.id);
    const asSignedIn = await groupPage(
      routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie }),
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
    const after = await groupPage(routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie }));
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
        routeArgs(`/g/${group.id}/availability`, { groupId: group.id }, { cookie: both }),
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
      routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie: asPianistDevice }),
    );
    const nameOnly = await groupPage(
      routeArgs(
        `/g/${group.id}`,
        { groupId: group.id },
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
    const load = () => groupPage(routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie }));
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
