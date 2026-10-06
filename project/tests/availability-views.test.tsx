import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { CALENDAR_SCOPES, forgetAccessToken } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import Availability, { action, loader } from "../app/routes/availability";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import {
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  addressOf,
  addressFor,
  selectedOption,
} from "./routes";

const count = tempDatabase();

// 2026-10-02 (a Friday) in Europe/London, on BST (UTC+1).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

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

type PageData = Awaited<ReturnType<typeof loader>>;

let people = 0;

/**
 * An organizer, a name-only member (Pianist) and a member signed in with
 * Google on this device (Cellist), who may have granted free/busy reading.
 */
async function band(scopes: string[] = [CALENDAR_SCOPES.busy]) {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");
  people += 1;
  const { account, cookie: session } = await signedIn({
    sub: `views-sub-${people}`,
    email: `views${people}@example.test`,
    name: "Cel",
  });
  forgetAccessToken(account.id);
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  if (scopes.length > 0) store.saveGrant(account.id, "refresh-1", scopes);
  const pianist = store.addMember(group.id, "Pianist", "member");
  return {
    group,
    organizer,
    cellist,
    pianist,
    cellistCookie: `${await deviceCookie(group.id, cellist.deviceToken)}; ${session}`,
    pianistCookie: await deviceCookie(group.id, pianist.deviceToken),
  };
}

function concert(groupId: string, endDate = "2026-11-29") {
  return getStore().createRequest(groupId, {
    name: "November concert",
    startDate: "2026-11-02",
    endDate,
    windows: [
      { startMinute: 600, endMinute: 780 },
      { startMinute: 1140, endMinute: 1320 },
    ],
  });
}

function load(groupId: string, cookie: string, search = "") {
  return loader(
    routeArgs(
      `/g/${addressFor(groupId)}/availability${search}`,
      { groupAddress: addressFor(groupId) },
      { cookie },
    ),
  ) as Promise<PageData>;
}

function post(groupId: string, cookie: string, fields: [string, string][]) {
  const headers = new Headers({ Cookie: cookie });
  const request = new Request(new URL(`/g/${addressFor(groupId)}/availability`, ORIGIN), {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
  return action({
    request,
    params: { groupAddress: addressFor(groupId) },
    context: {},
  } as never) as Promise<unknown>;
}

function render(data: PageData, actionData?: unknown, path = "/g/x/availability"): string {
  const Stub = createRoutesStub([
    { id: "availability", path: "/g/:groupId/availability", Component: Availability },
  ]);
  return renderToString(
    <Stub
      initialEntries={[path]}
      hydrationData={{
        loaderData: { availability: data },
        actionData: actionData ? { availability: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

const freeBusyCalls = () => google.calendarCalls().filter((call) => call.url.endsWith("/freeBusy"));

describe("entering availability in the calendar", () => {
  it("is the default view, offering the next eight weeks as dates to tick", async () => {
    const { group, pianistCookie } = await band();

    const page = await load(group.id, pianistCookie);
    const html = render(page);

    expect(page.view).toBe("calendar");
    expect(page.offered).toEqual({ from: "2026-10-02", to: "2026-11-26" });
    expect(html).toContain('name="date" value="2026-10-02"');
    expect(html).toContain('name="date" value="2026-11-26"');
    expect(html).not.toContain('value="2026-10-01"');
    expect(html).not.toContain('value="2026-11-27"');
    expect(html).toContain('name="intent" value="add-dates"');
    expect(html).not.toContain("Import from Google Calendar");
    // The grid needs JavaScript; the server sends only the typed fields.
    expect(html).not.toContain("time-cell");
    expect(html).toMatch(/name="startTime"/);
  });

  it("offers only a request's remaining dates, with its times of day and the chosen one", async () => {
    const { group, pianistCookie } = await band();
    const request = concert(group.id);

    const page = await load(group.id, pianistCookie, `?request=${request.id}&window=1`);
    const html = render(page);

    expect(page.offered).toEqual({ from: "2026-11-02", to: "2026-11-29" });
    expect(page.fromRequest?.windows).toHaveLength(2);
    expect(html).toContain('name="date" value="2026-11-02"');
    expect(html).not.toContain('value="2026-10-30"');
    expect(html).toContain(`name="request" value="${request.id}"`);
    expect(selectedOption(html, "startTime")).toBe("19:00");
    expect(selectedOption(html, "endTime")).toBe("22:00");
    expect(html).toContain("November concert");
  });

  it("saves one one-off time per ticked date, with a toast", async () => {
    const { group, pianist, pianistCookie } = await band();

    const response = await post(group.id, pianistCookie, [
      ["intent", "add-dates"],
      ["date", "2026-10-08"],
      ["date", "2026-10-06"],
      ["date", "2026-10-08"],
      ["startTime", "7pm"],
      ["endTime", "21:53"],
    ]);

    expect((response as Response).headers.get("Location")).toBe(`${groupPath(group)}/availability`);
    expect(await toastOf(response)).toBe("Added times for 2 dates");
    expect(getStore().listSlots(pianist.id)).toEqual([
      expect.objectContaining({
        kind: "once",
        startDate: "2026-10-06",
        startMinute: 1140,
        endMinute: 1320,
      }),
      expect.objectContaining({
        kind: "once",
        startDate: "2026-10-08",
        startMinute: 1140,
        endMinute: 1320,
      }),
    ]);
  });

  it("returns to the request after saving dates from it", async () => {
    const { group, pianistCookie } = await band();
    const request = concert(group.id);

    const response = await post(group.id, pianistCookie, [
      ["intent", "add-dates"],
      ["request", request.id],
      ["date", "2026-11-03"],
      ["startTime", "19:00"],
      ["endTime", "22:00"],
    ]);

    expect((response as Response).headers.get("Location")).toBe(
      `${groupPath(group)}/requests/${request.id}`,
    );
    expect(await toastOf(response)).toBe("Added times for 1 date");
  });

  it("refuses missing or unoffered dates and bad times, keeping what was ticked and typed", async () => {
    const { group, pianistCookie } = await band();
    const other = await band();
    const foreign = concert(other.group.id);
    const before = count("availability");

    const cases: [string, string][][] = [
      [
        ["date", "2026-10-06"],
        ["startTime", "22:00"],
        ["endTime", "21:00"],
      ],
      [
        ["startTime", "19:00"],
        ["endTime", "22:00"],
      ],
      [
        ["date", "2026-10-01"],
        ["startTime", "19:00"],
        ["endTime", "22:00"],
      ],
      [
        ["date", "not-a-date"],
        ["startTime", "19:00"],
        ["endTime", "22:00"],
      ],
      // Another group's request gives no request range: 30 November is past eight weeks.
      [
        ["request", foreign.id],
        ["date", "2026-11-30"],
        ["startTime", "19:00"],
        ["endTime", "22:00"],
      ],
    ];
    const results = [];
    for (const fields of cases) {
      results.push(await post(group.id, pianistCookie, [["intent", "add-dates"], ...fields]));
    }

    expect(results.map(statusOf)).toEqual([400, 400, 400, 400, 400]);
    expect(count("availability")).toBe(before);
    const first = results[0] as { data: unknown };
    expect(first.data).toEqual({
      dateErrors: { endTime: "End time must be after the start time." },
      dateValues: { dates: ["2026-10-06"], startTime: "22:00", endTime: "21:00" },
    });
    expect((results[1] as { data: { dateErrors: unknown } }).data.dateErrors).toEqual({
      dates: "Pick at least one date.",
    });
    const html = render(await load(group.id, pianistCookie), first.data);
    expect(html).toMatch(/value="2026-10-06" checked=""|checked="" value="2026-10-06"/);
    expect(selectedOption(html, "startTime")).toBe("22:00");
    expect(html).toContain("End time must be after the start time.");
  });
});

describe("clashes with Google Calendar", () => {
  it("reads busy times within a request's times only, and greys nothing until a range is picked", async () => {
    const { group, cellistCookie } = await band();
    const request = concert(group.id);
    google.busy = [
      { start: "2026-11-03T19:00:00Z", end: "2026-11-03T20:00:00Z" }, // Tue 3 Nov 7–8 PM GMT
      { start: "2026-11-04T08:00:00Z", end: "2026-11-04T09:00:00Z" }, // 8–9 AM, outside the windows
      { start: "2026-10-20T18:00:00Z", end: "2026-10-20T19:00:00Z" }, // before the request's dates
    ];

    const page = await load(group.id, cellistCookie, `?request=${request.id}`);
    const html = render(page);

    // No window in the link: none is chosen, and only the request's windows are read.
    expect(page.fromRequest?.window).toBeNull();
    expect(page.clashes).toEqual({
      state: "ready",
      busy: { "2026-11-03": [{ startMinute: 1140, endMinute: 1200 }] },
    });
    expect(JSON.stringify(page)).not.toContain("2026-11-04");
    expect(JSON.stringify(page)).not.toContain("2026-10-20");
    expect(html).toContain('aria-label="Tue 3 Nov"');
    expect(html).not.toContain('busy in your Google Calendar"');
    expect(html).toContain(
      "Once you pick a time range, days busy in your Google Calendar are greyed",
    );
    const evening = {
      dateErrors: {},
      dateValues: { dates: [], startTime: "19:00", endTime: "22:00" },
    };
    expect(render(page, evening)).toContain('aria-label="Tue 3 Nov, busy in your Google Calendar"');
    expect(render(page, evening)).toContain('aria-label="Wed 4 Nov"');
  });

  it("greys by the chosen times, and a greyed date can still be saved", async () => {
    const { group, cellist, cellistCookie } = await band();
    google.busy = [{ start: "2026-10-06T18:00:00Z", end: "2026-10-06T19:00:00Z" }]; // 7–8 PM BST

    const page = await load(group.id, cellistCookie);
    // Nothing chosen and no request: nothing greyed yet.
    expect(render(page)).not.toContain('busy in your Google Calendar"');
    const evening = {
      dateErrors: {},
      dateValues: { dates: [], startTime: "19:30", endTime: "21:00" },
    };
    expect(render(page, evening)).toContain('aria-label="Tue 6 Oct, busy in your Google Calendar"');
    const morning = {
      dateErrors: {},
      dateValues: { dates: [], startTime: "09:00", endTime: "12:00" },
    };
    expect(render(page, morning)).not.toContain("Tue 6 Oct, busy");

    const saved = await post(group.id, cellistCookie, [
      ["intent", "add-dates"],
      ["date", "2026-10-06"],
      ["startTime", "19:00"],
      ["endTime", "22:00"],
    ]);
    expect(statusOf(saved)).toBe(302);
    expect(
      getStore()
        .listSlots(cellist.id)
        .map((slot) => slot.startDate),
    ).toEqual(["2026-10-06"]);
  });

  it("reads a 26-week request in parallel queries of at most 56 days", async () => {
    const { group, cellistCookie } = await band();
    const request = concert(group.id, "2027-05-02");

    await load(group.id, cellistCookie, `?request=${request.id}`);

    const queries = freeBusyCalls().map(
      (call) => call.body as { timeMin: string; timeMax: string },
    );
    expect(queries).toHaveLength(4);
    for (const query of queries) {
      const days = (Date.parse(query.timeMax) - Date.parse(query.timeMin)) / 86_400_000;
      expect(days).toBeLessThanOrEqual(56 + 1 / 24);
    }
  });

  it("greys nothing when any one of several queries fails", async () => {
    const { group, cellistCookie } = await band();
    const request = concert(group.id, "2027-05-02");
    google.busy = [{ start: "2026-11-03T19:00:00Z", end: "2026-11-03T20:00:00Z" }];
    const ok = { body: { calendars: { primary: { busy: google.busy } } } };
    google.freeBusyAnswers = [ok, { status: 500, body: {} }, ok, ok];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const page = await load(group.id, cellistCookie, `?request=${request.id}`);

    expect(freeBusyCalls()).toHaveLength(4);
    expect(page.clashes).toEqual({ state: "error" });
    expect(JSON.stringify(page)).not.toContain('2026-11-03":[');
    warn.mockRestore();
  });

  it("greys nothing and says so when Google can't be read", async () => {
    const { group, cellistCookie } = await band();
    google.freeBusyAnswer = { status: 500, body: {} };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const page = await load(group.id, cellistCookie);

    expect(page.clashes).toEqual({ state: "error" });
    expect(render(page)).toContain("Couldn&#x27;t read your Google Calendar right now");
    warn.mockRestore();
  });

  it("offers to connect Google Calendar without the permission, or after it was revoked", async () => {
    const { group, cellistCookie } = await band([]);

    const page = await load(group.id, cellistCookie, "?times=list");

    expect(page.clashes).toEqual({
      state: "connect",
      connectUrl: `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(`${groupPath(group)}/availability?times=list`)}`,
    });
    expect(render(page)).toContain("See clashes from your Google Calendar");
    expect(google.calendarCalls()).toEqual([]);

    // A grant for writing rehearsals only is not one for reading busy times.
    const writeOnly = await band([CALENDAR_SCOPES.write]);
    expect((await load(writeOnly.group.id, writeOnly.cellistCookie)).clashes.state).toBe("connect");
    expect(google.calendarCalls()).toEqual([]);

    const revoked = await band();
    google.refreshAnswer = { status: 400, body: { error: "invalid_grant" } };
    expect((await load(revoked.group.id, revoked.cellistCookie)).clashes.state).toBe("connect");
  });

  it("sends the connect link back to the page, not to the data request that loaded it", async () => {
    const { group, cellistCookie } = await band([]);

    // In-app navigation loads the page's data from <page>.data with _routes.
    const page = (await loader(
      routeArgs(
        `${groupPath(group)}/availability.data?times=list&notice=calendar-declined&_routes=routes%2Favailability`,
        { groupAddress: addressOf(group) },
        { cookie: cellistCookie },
      ),
    )) as PageData;

    expect(page.clashes).toMatchObject({
      connectUrl: `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(`${groupPath(group)}/availability?times=list`)}`,
    });
  });

  it("reads nothing for a member not signed in with Google, or in the list view", async () => {
    const { group, pianistCookie, cellistCookie } = await band();

    expect((await load(group.id, pianistCookie)).clashes).toEqual({ state: "none" });
    expect((await load(group.id, cellistCookie, "?view=list")).clashes).toEqual({ state: "none" });
    expect(freeBusyCalls()).toEqual([]);
  });

  it("explains how a Calendar consent ended", async () => {
    const { group, cellistCookie } = await band([]);

    const page = await load(group.id, cellistCookie, "?notice=calendar-declined");

    expect(page.clashes).toMatchObject({
      connectUrl: `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(`${groupPath(group)}/availability`)}`,
    });
    const html = render(page, undefined, "/g/x/availability?notice=calendar-declined");
    expect(html).toContain("Google Calendar access wasn&#x27;t granted, so nothing changed.");
    // Switching views leaves the notice behind.
    expect(html).toContain('href="/g/x/availability?times=list"');
    expect(html).not.toMatch(/href="[^"]*notice=/);
  });
});

describe("the list view and My times", () => {
  it("keeps the one-off or weekly form in the list view", async () => {
    const { group, pianistCookie } = await band();

    const page = await load(group.id, pianistCookie, "?view=list");
    const html = render(page, undefined, "/g/x/availability?view=list");

    expect(page.view).toBe("list");
    expect(html).toContain('name="intent" value="create"');
    expect(html).toContain('value="weekly"');
    expect(html).not.toContain('name="date"');
  });

  it("shows the same upcoming times as a calendar or a list", async () => {
    const { group, pianist, pianistCookie } = await band();
    const slot = getStore().addSlot(pianist.id, {
      kind: "weekly",
      startDate: "2026-10-08",
      endDate: null,
      startMinute: 1140,
      endMinute: 1320,
    });
    getStore().setSkip(pianist.id, slot.id, "2026-10-15", true);

    const calendar = render(await load(group.id, pianistCookie));
    const list = render(
      await load(group.id, pianistCookie, "?times=list"),
      undefined,
      "/g/x/availability?times=list",
    );

    expect(calendar).toContain('aria-label="Thu 8 Oct: 7–10 PM"');
    expect(calendar).toContain('aria-label="Thu 15 Oct: no times"');
    expect(calendar).toContain("can&#x27;t make it");
    expect(list).toContain("<span>Thu 8 Oct</span><span>7–10 PM</span>");
    expect(list).not.toContain("<span>Thu 15 Oct</span>");
    expect(list).toContain("Every Thursday from 8 Oct, 7–10 PM");
  });
});
