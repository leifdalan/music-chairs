import { existsSync, readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { CONTACTS_SCOPES, forgetAccessToken } from "../app/.server/google";
import { findViewer } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { loader as groupLoader } from "../app/routes/group";
import { action as joinAction, loader as joinLoader } from "../app/routes/join";
import { action, loader } from "../app/routes/members.add";
import { fakeGoogle, type GoogleFake } from "./google-fake";
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

let google: GoogleFake;
beforeEach(() => {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
  google = fakeGoogle();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let people = 0;
function profile(name: string, emailVerified = true) {
  people += 1;
  return { sub: `add-sub-${people}`, email: `${name}${people}@example.test`, name, emailVerified };
}

/**
 * A group whose organizer Viola is signed in with Google and allowed contacts,
 * a name-only member Spare on a device, and Google contacts Amy and Bob.
 */
async function band(scopes: string[] = [CONTACTS_SCOPES.saved, CONTACTS_SCOPES.other]) {
  const store = getStore();
  const { account, cookie: session } = await signedIn(profile("viola"));
  forgetAccessToken(account.id);
  const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London", account.id);
  if (scopes.length > 0) store.saveGrant(account.id, "refresh-1", scopes);
  const spare = store.addMember(group.id, "Spare", "member");
  google.contacts = [{ name: "Amy Adams", emails: ["amy@contacts.test"] }];
  google.otherContacts = [{ emails: ["bob@contacts.test"] }];
  return {
    store,
    group,
    organizer,
    spare,
    organizerCookie: session,
    memberCookie: await deviceCookie(group.id, spare.deviceToken),
  };
}

function load(groupId: string, cookie?: string, query = "") {
  return loader(routeArgs(`/g/${groupId}/members/add${query}`, { groupId }, { cookie }));
}

function add(groupId: string, cookie: string, person: string) {
  return action(
    routeArgs(`/g/${groupId}/members/add`, { groupId }, { cookie, form: { person } }),
  ) as Promise<unknown>;
}

/** Whether the database files, write-ahead log included, hold `text` anywhere. */
function databaseHolds(text: string): boolean {
  const filename = process.env.MUSIC_CHAIRS_DB!;
  return [filename, `${filename}-wal`].some(
    (file) => existsSync(file) && readFileSync(file).includes(text),
  );
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

function errorOf(value: unknown): string | undefined {
  return (value as { data?: { error?: string } }).data?.error;
}

async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

describe("adding members", () => {
  it("adds a typed name as a name-only member", async () => {
    const { store, group, organizerCookie } = await band();

    const response = await add(group.id, organizerCookie, "  Spare oboe ");

    expect(statusOf(response)).toBe(302);
    expect(await toastOf(response)).toBe("Added Spare oboe");
    const added = store.listMembers(group.id).find((member) => member.displayName === "Spare oboe");
    expect(added).toMatchObject({ role: "member", googleEmail: null, invitedEmail: null });
  });

  it("adds a picked contact with their email kept for claiming", async () => {
    const { store, group, organizerCookie } = await band();

    await add(group.id, organizerCookie, "Amy Adams <Amy@Contacts.test>");

    const added = store.listMembers(group.id).find((member) => member.displayName === "Amy Adams");
    expect(added).toMatchObject({ invitedEmail: "amy@contacts.test", googleEmail: null });
  });

  it("refuses a bare email, a name already in the group and an email already in it", async () => {
    const { store, group, organizerCookie } = await band();
    await add(group.id, organizerCookie, "Amy Adams <amy@contacts.test>");
    const before = store.listMembers(group.id).length;

    const bare = await add(group.id, organizerCookie, "bob@contacts.test");
    const nameless = await add(group.id, organizerCookie, "<bob@contacts.test>");
    const sameName = await add(group.id, organizerCookie, "  spare ");
    const sameEmail = await add(group.id, organizerCookie, "Amy A <AMY@contacts.test>");
    const organizerEmail = await add(group.id, organizerCookie, `V <viola${people}@example.test>`);

    expect(statusOf(bare)).toBe(400);
    expect(errorOf(bare)).toBe("Add a name too, like Sam Smith <sam@example.com>.");
    expect(errorOf(nameless)).toBe("Add a name too, like Sam Smith <sam@example.com>.");
    expect(errorOf(sameName)).toBe(
      "Someone called Spare is already in the group. Rename one first.",
    );
    expect(errorOf(sameEmail)).toBe("Someone with that email is already in the group.");
    expect(errorOf(organizerEmail)).toBe("Someone with that email is already in the group.");
    expect(store.listMembers(group.id)).toHaveLength(before);
  });

  it("refuses the losing one of two submissions of the same contact", async () => {
    const { store, group, organizerCookie } = await band();
    await add(group.id, organizerCookie, "Amy Adams <amy@contacts.test>");
    const before = store.listMembers(group.id);
    // The second submission checked before the first was saved.
    vi.spyOn(store, "listMembers").mockReturnValueOnce(
      before.filter((member) => member.invitedEmail === null),
    );

    const second = await add(group.id, organizerCookie, "Amy A <amy@contacts.test>");

    expect(statusOf(second)).toBe(400);
    expect(errorOf(second)).toBe("Someone with that email is already in the group.");
    expect(store.listMembers(group.id)).toHaveLength(before.length);
  });

  it("is for organizers only", async () => {
    const { store, group, memberCookie } = await band();
    const before = store.listMembers(group.id).length;

    expect(statusOf(await thrownBy(load(group.id, memberCookie)))).toBe(403);
    expect(statusOf(await thrownBy(add(group.id, memberCookie, "Intruder")))).toBe(403);
    const visitor = (await thrownBy(load(group.id))) as Response;
    expect(visitor.headers.get("Location")).toBe(`/g/${group.id}`);
    expect(store.listMembers(group.id)).toHaveLength(before);
  });
});

describe("contact suggestions", () => {
  it("offers the organizer's saved and other contacts once allowed", async () => {
    const { group, organizerCookie } = await band();

    const page = await load(group.id, organizerCookie);

    expect(page.suggestions).toEqual({
      state: "ready",
      contacts: [
        { name: "Amy Adams", email: "amy@contacts.test" },
        { name: "", email: "bob@contacts.test" },
      ],
    });
  });

  it("offers to connect before contacts are allowed, and to sign in on a device", async () => {
    const { store, group, organizer, organizerCookie } = await band([]);

    expect((await load(group.id, organizerCookie)).suggestions).toEqual({
      state: "connect",
      connectUrl: `/auth/google/calendar?scope=contacts&returnTo=${encodeURIComponent(`/g/${group.id}/members/add`)}`,
    });
    expect(google.peopleCalls()).toHaveLength(0);
    const token = store.deviceTokenFor(group.id, organizer.id)!;
    const device = await deviceCookie(group.id, token);
    expect((await load(group.id, device)).suggestions).toEqual({ state: "sign-in" });
  });

  it("offers nothing when Google isn't set up", async () => {
    const { group, organizerCookie } = await band();
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "");

    expect((await load(group.id, organizerCookie)).suggestions).toBeNull();
  });

  it("says when reading fails, logging no addresses, and offers to reconnect after a refusal", async () => {
    const { group, organizerCookie } = await band();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    google.peopleAnswer = { status: 500, body: { error: "amy@contacts.test" } };

    expect((await load(group.id, organizerCookie)).suggestions).toEqual({ state: "error" });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("@");

    google.peopleAnswer = { status: 401, body: {} };
    expect((await load(group.id, organizerCookie)).suggestions).toMatchObject({
      state: "connect",
    });
  });

  it("shows the contacts notices", async () => {
    const { group, organizerCookie } = await band();

    for (const [notice, text] of [
      ["contacts-connected", "Google contacts connected"],
      ["contacts-declined", "Google contacts access wasn't granted"],
    ]) {
      const page = await load(group.id, organizerCookie, `?notice=${notice}`);
      expect(page.notice).toContain(text);
    }
  });

  it("never reaches the group page or the database", async () => {
    const { group, organizerCookie, memberCookie } = await band();
    google.contacts = [{ name: "Private Saved", emails: ["saved-only@private.test"] }];
    google.otherContacts = [{ emails: ["other-only@private.test"] }];
    expect((await load(group.id, organizerCookie)).suggestions).toMatchObject({ state: "ready" });

    for (const cookie of [organizerCookie, memberCookie, undefined]) {
      const page = await groupLoader(
        routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie }),
      );
      expect(JSON.stringify(page)).not.toContain("private.test");
    }
    expect(google.peopleCalls()).toHaveLength(2);
    expect(databaseHolds("private.test")).toBe(false);
    // The scan sees what the app writes, write-ahead log included.
    await add(group.id, organizerCookie, "Private Saved <saved-only@private.test>");
    expect(databaseHolds("saved-only@private.test")).toBe(true);
    expect(databaseHolds("other-only@private.test")).toBe(false);
    // The kept email is shown to organizers only.
    const pageFor = async (cookie?: string) =>
      JSON.stringify(
        await groupLoader(routeArgs(`/g/${group.id}`, { groupId: group.id }, { cookie })),
      );
    expect(await pageFor(organizerCookie)).toContain("saved-only@private.test");
    expect(await pageFor(memberCookie)).not.toContain("private.test");
    expect(await pageFor()).not.toContain("private.test");
  });
});

describe("claiming a place added from contacts", () => {
  async function invited(emailVerified = true) {
    const { store, group, organizerCookie } = await band();
    const amy = { ...profile("amy", emailVerified), email: "Amy@Contacts.test" };
    await add(group.id, organizerCookie, "Amy Adams <amy@contacts.test>");
    const member = store.listMembers(group.id).find((each) => each.displayName === "Amy Adams")!;
    return { store, group, member, amy, organizerCookie };
  }

  function openInvite(inviteToken: string, cookie?: string) {
    return joinLoader(routeArgs(`/join/${inviteToken}`, { inviteToken }, { cookie }));
  }

  it("links the place when that verified Google account opens the invite", async () => {
    const { store, group, member, amy } = await invited();
    const { account, cookie } = await signedIn(amy);

    const response = (await thrownBy(openInvite(group.inviteToken, cookie))) as Response;

    expect(response.headers.get("Location")).toBe(`/g/${group.id}`);
    expect(await toastOf(response)).toBe("Welcome, Amy Adams");
    expect(store.findMember(group.id, member.id)).toMatchObject({
      googleEmail: "Amy@Contacts.test",
      invitedEmail: null,
    });
    const membership = Object.values(setCookies(response)).find((pair) =>
      pair.startsWith("mc_members"),
    )!;
    const viewer = await findViewer(
      new Request(ORIGIN, { headers: { Cookie: membership } }),
      group,
    );
    expect(viewer?.id).toBe(member.id);
    expect(store.findMemberByAccount(group.id, account.id)?.id).toBe(member.id);
  });

  it("does not link an unverified email or a different account", async () => {
    const { store, group, member, amy } = await invited(false);
    const { cookie } = await signedIn(amy);
    // Google treats dots in Gmail addresses as the same mailbox; this app does not.
    const other = await signedIn({ ...profile("bob"), email: "a.my@contacts.test" });

    const page = await openInvite(group.inviteToken, cookie);
    await openInvite(group.inviteToken, other.cookie);

    expect(page).toMatchObject({ groupName: "Quartet" });
    expect(store.findMember(group.id, member.id)).toMatchObject({
      googleEmail: null,
      invitedEmail: "amy@contacts.test",
    });
  });

  it("refuses the invited name typed on the invite, saying how to get in", async () => {
    const { store, group, member } = await invited();

    const result = await joinAction(
      routeArgs(
        `/join/${group.inviteToken}`,
        { inviteToken: group.inviteToken },
        { form: { displayName: "amy ADAMS" } },
      ),
    );

    expect(statusOf(result)).toBe(400);
    expect(errorOf(result)).toBe(
      "Amy Adams was added with an email address: sign in with Google using that address, or ask an organizer.",
    );
    expect(store.findMember(group.id, member.id)?.invitedEmail).toBe("amy@contacts.test");
  });

  it("can be undone by removing the place and adding the name alone", async () => {
    const { store, group, member, organizerCookie } = await invited();
    store.removeMember(group.id, member.id);

    await add(group.id, organizerCookie, "Amy Adams");
    const response = await joinAction(
      routeArgs(
        `/join/${group.inviteToken}`,
        { inviteToken: group.inviteToken },
        { form: { displayName: "amy adams" } },
      ),
    );

    expect(await toastOf(response)).toBe("Welcome back, Amy Adams");
  });
});
