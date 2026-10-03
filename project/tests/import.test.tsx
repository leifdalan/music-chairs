import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CALENDAR_SCOPES, forgetAccessToken } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { addDays, todayInZone } from "../app/lib/availability";
import { action, loader } from "../app/routes/availability.import";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import { deviceCookie, routeArgs, setCookies, signedIn } from "./routes";

let google: GoogleFake;
let people = 0;

beforeEach(() => {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
  google = fakeGoogle();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A UTC group with a Google-linked member who may have granted free/busy reading. */
async function linkedMember(scopes: string[] = [CALENDAR_SCOPES.import]) {
  const store = getStore();
  const { group } = store.createGroup("Quartet", "Viola", "UTC");
  people += 1;
  const { account, cookie } = await signedIn({
    sub: `import-sub-${people}`,
    email: `m${people}@example.test`,
    name: "M",
  });
  forgetAccessToken(account.id);
  const member = store.addMember(group.id, "Cellist", "member", account.id);
  if (scopes.length > 0) store.saveGrant(account.id, "refresh-1", scopes);
  const device = await deviceCookie(group.id, member.deviceToken);
  return { store, group, member, account, cookie: `${device}; ${cookie}`, device };
}

const load = (groupId: string, cookie: string, query = "") =>
  loader(routeArgs(`/g/${groupId}/availability/import${query}`, { groupId }, { cookie }));

describe("importing free time from Google Calendar", () => {
  it("offers to connect Google Calendar before the permission is granted", async () => {
    const { group, cookie } = await linkedMember([]);

    const page = await load(group.id, cookie);

    expect(page.state).toBe("connect");
    expect(page.connectUrl).toContain("/auth/google/calendar?scope=import");
    expect(google.calendarCalls()).toEqual([]);
  });

  it("proposes free stretches from the member's busy times in the chosen window", async () => {
    const { group, cookie } = await linkedMember();
    const tomorrow = addDays(todayInZone("UTC", new Date()), 1);
    google.busy = [{ start: `${tomorrow}T10:00:00Z`, end: `${tomorrow}T11:00:00Z` }];

    const page = await load(group.id, cookie, "?from=09:00&to=12:00");

    expect(page.state).toBe("ready");
    expect(page.proposals.filter((p) => p.date === tomorrow)).toEqual([
      expect.objectContaining({ start: "09:00", end: "10:00" }),
      expect.objectContaining({ start: "11:00", end: "12:00" }),
    ]);
    const query = google.calendarCalls().find((call) => call.url.endsWith("/freeBusy"));
    expect(query?.body).toMatchObject({ items: [{ id: "primary" }] });
  });

  it("shows an error, not a month of free time, when Google reports a calendar error", async () => {
    const { group, cookie } = await linkedMember();
    google.freeBusyAnswer = {
      body: { calendars: { primary: { busy: [], errors: [{ reason: "internalError" }] } } },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const page = await load(group.id, cookie);

    expect(page.state).toBe("error");
    expect(page.proposals).toEqual([]);
    warn.mockRestore();
  });

  it("asks a borrowed device signed in as another member to sign in as this member", async () => {
    // Cellist's device, signed in with Pianist's Google account (Pianist is in the group too).
    const { store, group, device } = await linkedMember();
    const pianist = await signedIn({ sub: "import-pianist", email: "p@example.test", name: "P" });
    store.addMember(group.id, "Pianist", "member", pianist.account.id);
    store.saveGrant(pianist.account.id, "refresh-p", [CALENDAR_SCOPES.import]);

    const page = await load(group.id, `${device}; ${pianist.cookie}`);

    expect(page.state).toBe("sign-in");
    expect(google.calendarCalls()).toEqual([]);
  });

  it("offers to reconnect, and forgets the grant, when the member revoked access", async () => {
    const { store, group, account, cookie } = await linkedMember();
    google.refreshAnswer = { status: 400, body: { error: "invalid_grant" } };

    const page = await load(group.id, cookie);

    expect(page.state).toBe("connect");
    expect(store.findGrant(account.id)).toBeNull();
  });

  it("explains a refused consent when Google returns to the import page", async () => {
    const { group, cookie } = await linkedMember([]);

    const page = await load(group.id, cookie, "?notice=calendar-wrong-account");

    expect(page.notice).toBe(
      "That was a different Google account from the one you're signed in with, so nothing changed.",
    );
  });

  it("saves only the kept proposals, with the member's edits, as one-off times", async () => {
    const { store, group, member, cookie } = await linkedMember();
    const tomorrow = addDays(todayInZone("UTC", new Date()), 1);

    const response = (await action(
      routeArgs(
        `/g/${group.id}/availability/import`,
        { groupId: group.id },
        {
          cookie,
          form: {
            keep: "1",
            "date-0": tomorrow,
            "start-0": "09:00",
            "end-0": "10:00",
            "date-1": tomorrow,
            "start-1": "18:30",
            "end-1": "20:00",
          },
        },
      ),
    )) as Response;

    expect(response.headers.get("Location")).toBe(`/g/${group.id}/availability`);
    expect(Object.keys(setCookies(response))).toEqual(["mc_toast"]);
    expect(store.listSlots(member.id)).toEqual([
      expect.objectContaining({
        kind: "once",
        startDate: tomorrow,
        startMinute: 18 * 60 + 30,
        endMinute: 20 * 60,
      }),
    ]);
  });

  it.each([
    ["that can't be read", { "start-0": "nine-ish" }],
    ["past the four weeks", { "date-0": "2099-01-01" }],
    ["ending before it starts", { "start-0": "11:00", "end-0": "10:00" }],
  ])("refuses a kept time %s", async (_label, change) => {
    const { store, group, member, cookie } = await linkedMember();
    const tomorrow = addDays(todayInZone("UTC", new Date()), 1);
    const form = { keep: "0", "date-0": tomorrow, "start-0": "09:00", "end-0": "10:00", ...change };

    const result = await action(
      routeArgs(`/g/${group.id}/availability/import`, { groupId: group.id }, { cookie, form }),
    );

    expect((result as { init?: ResponseInit }).init?.status).toBe(400);
    expect(store.listSlots(member.id)).toEqual([]);
  });
});
