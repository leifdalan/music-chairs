import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONTACTS_SCOPES,
  forgetAccessToken,
  listContacts,
  SIGN_IN_WITH_CALENDAR_SCOPES,
} from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { isEmail, parsePerson } from "../app/lib/contacts";
import { loader as startSignIn } from "../app/routes/auth.google";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import { routeArgs, tempDatabase } from "./routes";

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
});

let people = 0;
function organizer(scopes: string[] = [CONTACTS_SCOPES.saved, CONTACTS_SCOPES.other]) {
  people += 1;
  const account = getStore().upsertAccount({
    sub: `contacts-sub-${people}`,
    email: `org${people}@example.test`,
    name: "Org",
  });
  forgetAccessToken(account.id);
  getStore().saveGrant(account.id, "refresh-1", scopes);
  return account;
}

describe("what an organizer types", () => {
  it("reads a picked contact or a bare name, and refuses a bare email", () => {
    expect(parsePerson("  Sam Smith <Sam@Example.com> ")).toEqual({
      ok: true,
      name: "Sam Smith",
      email: "sam@example.com",
    });
    expect(parsePerson("Spare oboe")).toEqual({ ok: true, name: "Spare oboe", email: null });
    expect(parsePerson("sam@example.com")).toMatchObject({ ok: false });
    expect(parsePerson("Sam <not an email>")).toMatchObject({ ok: false });
    // A nameless contact's email would otherwise become a name the whole group sees.
    expect(parsePerson("<sam@example.com>")).toMatchObject({ ok: false });
    expect(parsePerson("sam@example.com <sam@example.com>")).toMatchObject({ ok: false });
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
});

describe("reading contacts", () => {
  it("reads saved and other contacts, names and emails only, deduplicated and sorted", async () => {
    const account = organizer();
    google.contacts = [
      { name: "Zed", emails: ["zed@example.test"] },
      { name: "Amy", emails: ["amy@example.test", "amy.work@example.test"] },
      { name: "No email", emails: [] },
    ];
    google.otherContacts = [{ emails: ["AMY@example.test"] }, { emails: ["bob@example.test"] }];

    const contacts = await listContacts(account.id);

    expect(contacts).toEqual([
      { name: "Amy", email: "amy@example.test" },
      { name: "Amy", email: "amy.work@example.test" },
      { name: "", email: "bob@example.test" },
      { name: "Zed", email: "zed@example.test" },
    ]);
    const urls = google.peopleCalls().map((call) => new URL(call.url));
    expect(urls.map((url) => url.pathname)).toEqual([
      "/v1/people/me/connections",
      "/v1/otherContacts",
    ]);
    expect(urls[0].searchParams.get("personFields")).toBe("names,emailAddresses");
    expect(urls[1].searchParams.get("readMask")).toBe("names,emailAddresses");
  });

  it("pages through each source, up to a thousand people each", async () => {
    const account = organizer();
    google.contactsPageSize = 400;
    google.contacts = Array.from({ length: 1200 }, (_, index) => ({
      name: `Saved ${index}`,
      emails: [`saved${index}@example.test`],
    }));
    google.otherContacts = Array.from({ length: 10 }, (_, index) => ({
      emails: [`other${index}@example.test`],
    }));

    const contacts = await listContacts(account.id);

    expect(contacts.filter((contact) => contact.email.startsWith("saved"))).toHaveLength(1000);
    expect(contacts.filter((contact) => contact.email.startsWith("other"))).toHaveLength(10);
  });

  it("skips other contacts without that permission, and reads nothing without any", async () => {
    const savedOnly = organizer([CONTACTS_SCOPES.saved]);
    google.contacts = [{ name: "Amy", emails: ["amy@example.test"] }];
    google.otherContacts = [{ emails: ["bob@example.test"] }];

    expect(await listContacts(savedOnly.id)).toEqual([{ name: "Amy", email: "amy@example.test" }]);
    expect(google.peopleCalls()).toHaveLength(1);

    const none = organizer([]);
    expect(await listContacts(none.id)).toEqual([]);
    expect(google.peopleCalls()).toHaveLength(1);
  });

  it("keeps contacts for ten minutes, and forgets them with the access token", async () => {
    const account = organizer();
    google.contacts = [{ name: "Amy", emails: ["amy@example.test"] }];
    const now = new Date();

    await listContacts(account.id, now);
    await listContacts(account.id, new Date(now.getTime() + 9 * 60_000));
    expect(google.peopleCalls()).toHaveLength(2);
    await listContacts(account.id, new Date(now.getTime() + 11 * 60_000));
    expect(google.peopleCalls()).toHaveLength(4);
    forgetAccessToken(account.id);
    await listContacts(account.id, new Date(now.getTime() + 12 * 60_000));
    expect(google.peopleCalls()).toHaveLength(6);
  });

  it("drops anyone's expired contacts from memory on the next read", async () => {
    const first = organizer();
    const second = organizer();
    google.contacts = [{ name: "Amy", emails: ["amy@example.test"] }];
    const now = new Date();
    await listContacts(first.id, now);

    // Another organizer's read after expiry clears the first list; reading it again asks Google.
    google.contacts = [{ name: "Zed", emails: ["zed@example.test"] }];
    await listContacts(second.id, new Date(now.getTime() + 11 * 60_000));
    const calls = google.peopleCalls().length;
    expect(await listContacts(first.id, new Date(now.getTime() + 11 * 60_000))).toEqual([
      { name: "Zed", email: "zed@example.test" },
    ]);
    expect(google.peopleCalls().length).toBe(calls + 2);
  });

  it("is never asked for at sign-in", async () => {
    const response = (await startSignIn(routeArgs("/auth/google", {}))) as Response;
    const scope = new URL(response.headers.get("Location")!).searchParams.get("scope")!;

    expect(scope.split(" ")).toEqual(SIGN_IN_WITH_CALENDAR_SCOPES);
    expect(scope).not.toContain("contacts");
  });
});
