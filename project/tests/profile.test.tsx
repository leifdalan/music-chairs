import { renderToString } from "react-dom/server";
import { createRoutesStub, Outlet } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { gravatarUrl } from "../app/.server/gravatar";
import { rememberMembership } from "../app/.server/membership";
import { headerProfile } from "../app/.server/profile";
import { getStore } from "../app/.server/store";
import { ProfileMenu } from "../app/components/profile-menu";
import { initials, INSTRUMENT_MAX, sameName, validateInstrument } from "../app/lib/profile";
import { shouldRevalidate } from "../app/root";
import { action as saveProfile } from "../app/routes/profile";
import {
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  thrownBy,
} from "./routes";

tempDatabase();
beforeAll(() => {
  getStore();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("profile rules", () => {
  it("makes initials from one or more words, and ? from nothing", () => {
    expect(initials("Viola")).toBe("V");
    expect(initials("  leif   van dalan ")).toBe("LD");
    expect(initials("élodie roux")).toBe("ÉR");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });

  it("compares names after NFC, trimming, collapsing spaces and lowercasing", () => {
    expect(sameName(" Spare  Tuba ", "spare tuba")).toBe(true);
    expect(sameName("Zoé", "ZOÉ")).toBe(true);
    expect(sameName("Spare", "Spar")).toBe(false);
    expect(sameName("Spare tuba", "Sparetuba")).toBe(false);
  });

  it("allows empty instrumentation and caps its length", () => {
    expect(validateInstrument("  cello, piano ")).toEqual({ ok: true, value: "cello, piano" });
    expect(validateInstrument(undefined)).toEqual({ ok: true, value: "" });
    expect(validateInstrument("x".repeat(INSTRUMENT_MAX)).ok).toBe(true);
    expect(validateInstrument("x".repeat(INSTRUMENT_MAX + 1)).ok).toBe(false);
  });

  it("builds the Gravatar address from the trimmed, lowercased email, blank when none exists", () => {
    const expected =
      "https://gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?s=96&d=blank";
    expect(gravatarUrl("test@example.com")).toBe(expected);
    expect(gravatarUrl("  Test@Example.COM ")).toBe(expected);
    expect(gravatarUrl("")).toBeNull();
    expect(gravatarUrl(null)).toBeNull();
  });
});

let people = 0;

async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
  people += 1;
  const { account, cookie: session } = await signedIn({
    sub: `profile-sub-${people}`,
    email: `Profile${people}@Example.test`,
    name: "Cel Lo",
  });
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  store.setProfile(group.id, cellist.id, { displayName: "Cellist", instrument: "cello" });
  const pianist = store.addMember(group.id, "Pianist", "member");
  store.setProfile(group.id, pianist.id, { displayName: "Pianist", instrument: "piano" });
  return {
    store,
    group,
    organizer,
    cellist,
    pianist,
    account,
    session,
    cellistCookie: `${await deviceCookie(group.id, cellist.deviceToken)}; ${session}`,
    pianistCookie: await deviceCookie(group.id, pianist.deviceToken),
  };
}

const at = (path: string, cookie?: string) =>
  new Request(new URL(path, ORIGIN), { headers: cookie ? { Cookie: cookie } : {} });

describe("the header's profile data", () => {
  it("is initials only for a visitor who is not signed in", async () => {
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client");
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");

    expect(await headerProfile(at("/"))).toEqual({
      initials: "?",
      gravatar: null,
      signedIn: null,
      canSignIn: true,
      member: null,
    });
  });

  it("is the account's picture and initials away from groups", async () => {
    const { session, account } = await band();

    const profile = await headerProfile(at("/", session));

    expect(profile).toMatchObject({
      initials: "CL",
      gravatar: gravatarUrl(account.email),
      signedIn: { email: account.email },
      member: null,
    });
  });

  it("is the viewer's own name and instrumentation on that group's pages, page or data request", async () => {
    const { group, cellistCookie, pianistCookie } = await band();

    for (const path of [
      `/g/${group.id}`,
      `/g/${group.id}/schedule`,
      `/g/${group.id}/schedule.data`,
      // The group page's own data request.
      `/g/${group.id}.data`,
    ]) {
      const profile = await headerProfile(at(path, pianistCookie));
      expect(profile.member).toEqual({
        groupId: group.id,
        displayName: "Pianist",
        instrument: "piano",
      });
      expect(profile.initials).toBe("P");
      expect(profile.gravatar).toBeNull();
      expect(JSON.stringify(profile)).not.toContain("Cellist");
      expect(JSON.stringify(profile)).not.toContain("cello");
    }
    const cellist = await headerProfile(at(`/g/${group.id}`, cellistCookie));
    expect(cellist.member?.instrument).toBe("cello");
    expect(cellist.gravatar).not.toBeNull();
  });

  it("knows nobody on a group page this device has not joined", async () => {
    const { pianistCookie } = await band();
    const other = getStore().createGroup("Other", "Oboe", "Europe/London").group;

    expect((await headerProfile(at(`/g/${other.id}`, pianistCookie))).member).toBeNull();
  });

  it("follows the group in the address from one group to the next", async () => {
    const a = await band();
    const store = getStore();
    const other = store.createGroup("Other", "Oboe", "Europe/London").group;
    const elsewhere = store.addMember(other.id, "Bassoon", "member");
    store.setProfile(other.id, elsewhere.id, { displayName: "Bassoon", instrument: "bassoon" });
    // One membership cookie that knows this device in both groups.
    const cookie = (
      await rememberMembership(
        new Request(ORIGIN, { headers: { Cookie: a.pianistCookie } }),
        other.id,
        elsewhere.deviceToken,
      )
    ).split(";")[0];

    const first = await headerProfile(at(`/g/${a.group.id}/schedule`, cookie));
    const second = await headerProfile(at(`/g/${other.id}/schedule`, cookie));

    expect(first.member?.displayName).toBe("Pianist");
    expect(second.member?.displayName).toBe("Bassoon");
    expect(shouldRevalidate()).toBe(true);
  });
});

describe("saving your profile", () => {
  function save(groupId: string, cookie: string | undefined, form: Record<string, string>) {
    return saveProfile(
      routeArgs(`/g/${groupId}/profile`, { groupId }, { cookie, form }),
    ) as Promise<Response>;
  }

  async function toastOf(response: Response): Promise<string | undefined> {
    const cookie = setCookies(response).mc_toast;
    if (!cookie) return undefined;
    return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
  }

  it("saves the viewer's own name and instrumentation and goes back", async () => {
    const { store, group, pianist, pianistCookie } = await band();

    const response = await save(group.id, pianistCookie, {
      displayName: " Piano Man ",
      instrument: " keys ",
      returnTo: `/g/${group.id}/schedule`,
    });

    expect(response.headers.get("Location")).toBe(`/g/${group.id}/schedule`);
    expect(await toastOf(response)).toBe("Profile saved");
    expect(store.findMember(group.id, pianist.id)).toMatchObject({
      displayName: "Piano Man",
      instrument: "keys",
    });
  });

  it("goes back with the problem and changes nothing when a field is wrong", async () => {
    const { store, group, pianist, pianistCookie } = await band();

    const empty = await save(group.id, pianistCookie, {
      displayName: " ",
      instrument: "x",
      returnTo: "/",
    });
    const long = await save(group.id, pianistCookie, {
      displayName: "Pianist",
      instrument: "x".repeat(INSTRUMENT_MAX + 1),
      returnTo: "/",
    });

    expect(await toastOf(empty)).toBe("Your name is required.");
    expect(await toastOf(long)).toBe(
      `Instrumentation must be at most ${INSTRUMENT_MAX} characters.`,
    );
    expect(store.findMember(group.id, pianist.id)).toMatchObject({
      displayName: "Pianist",
      instrument: "piano",
    });
  });

  it("sends a visitor to the group page and never leaves the site", async () => {
    const { group, pianistCookie } = await band();

    const visitor = (await thrownBy(
      save(group.id, undefined, { displayName: "X", instrument: "", returnTo: "/" }),
    )) as Response;
    const outside = await save(group.id, pianistCookie, {
      displayName: "Pianist",
      instrument: "",
      returnTo: "https://evil.example/",
    });

    expect(visitor.headers.get("Location")).toBe(`/g/${group.id}`);
    expect(outside.headers.get("Location")).toBe("/");
  });
});

describe("the profile menu", () => {
  function render(profile: unknown): string {
    const Stub = createRoutesStub([
      {
        id: "root",
        path: "/",
        Component: () => (
          <>
            <ProfileMenu />
            <Outlet />
          </>
        ),
        children: [{ path: "g/:groupId", Component: () => null }],
      },
    ]);
    return renderToString(
      <Stub initialEntries={["/g/abc"]} hydrationData={{ loaderData: { root: profile } }} />,
    ).replaceAll("<!-- -->", "");
  }

  it("shows the picture over the initials, the viewer's fields, Gravatar and sign out", () => {
    const html = render({
      profile: {
        initials: "CL",
        gravatar: "https://gravatar.com/avatar/x?s=96&d=blank",
        signedIn: { email: "c@example.test" },
        canSignIn: false,
        member: { groupId: "abc", displayName: "Cellist", instrument: "cello" },
      },
    });

    expect(html).toContain('<span class="avatar-initials">CL</span>');
    expect(html).toContain('src="https://gravatar.com/avatar/x?s=96&amp;d=blank"');
    expect(html).toContain('action="/g/abc/profile"');
    expect(html).toMatch(/name="instrument"[^>]*value="cello"|value="cello"[^>]*name="instrument"/);
    expect(html).toContain('name="returnTo" value="/g/abc"');
    expect(html).toContain("gravatar.com/profile");
    expect(html).toContain('action="/auth/sign-out"');
    expect(html).toContain('action="/auth/google/disconnect?returnTo=%2Fg%2Fabc"');
    expect(html).toContain("Disconnect Google");
  });

  it("offers sign-in to a visitor, and shows nothing without root data", () => {
    const visitor = render({
      profile: { initials: "?", gravatar: null, signedIn: null, canSignIn: true, member: null },
    });
    expect(visitor).toContain('href="/auth/google?returnTo=%2Fg%2Fabc"');
    expect(visitor).not.toContain("<img");
    expect(visitor).not.toContain("Disconnect Google");
    expect(render(undefined)).not.toContain("profile-menu");
  });
});
