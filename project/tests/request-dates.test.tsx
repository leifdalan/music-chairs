// Giving times on a request's own page (plan/phase-23.md): a calendar or list
// of the request's dates with the hour bar, one time per date within the
// request's windows, an auto-saving cap, and Google clashes.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { CALENDAR_SCOPES, forgetAccessToken } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { dateTicked, timesOn } from "../app/lib/date-toggle";
import { groupPath } from "../app/lib/group-address";
import RequestPage, { action, loader } from "../app/routes/request";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import {
  addressOf,
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
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
type Group = ReturnType<ReturnType<typeof getStore>["createGroup"]>["group"];

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
    sub: `dates-sub-${people}`,
    email: `dates${people}@example.test`,
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
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: `${await deviceCookie(group.id, cellist.deviceToken)}; ${session}`,
    pianistCookie: await deviceCookie(group.id, pianist.deviceToken),
  };
}

const MORNING = { startMinute: 600, endMinute: 780 };
const EVENING = { startMinute: 1140, endMinute: 1320 };

function concert(groupId: string, windows = [MORNING, EVENING], endDate = "2026-11-29") {
  return getStore().createRequest(groupId, {
    name: "November concert",
    startDate: "2026-11-02",
    endDate,
    windows,
  });
}

function pathOf(group: Group, requestId: string) {
  return `${groupPath(group)}/requests/${requestId}`;
}

function load(group: Group, requestId: string, cookie: string, search = "") {
  return loader(
    routeArgs(
      `${pathOf(group, requestId)}${search}`,
      { groupAddress: addressOf(group), requestId },
      { cookie },
    ),
  ) as Promise<PageData>;
}

function post(group: Group, requestId: string, cookie: string, fields: [string, string][]) {
  const request = new Request(new URL(pathOf(group, requestId), ORIGIN), {
    method: "POST",
    headers: new Headers({ Cookie: cookie }),
    body: new URLSearchParams(fields),
  });
  return action({
    request,
    params: { groupAddress: addressOf(group), requestId },
    context: {},
  } as never) as Promise<unknown>;
}

function setDate(
  group: Group,
  requestId: string,
  cookie: string,
  date: string,
  stretch: [string, string] | null,
) {
  return post(group, requestId, cookie, [
    ["intent", "set-date"],
    ["date", date],
    ["on", stretch ? "1" : "0"],
    ...(stretch
      ? ([
          ["startTime", stretch[0]],
          ["endTime", stretch[1]],
        ] as [string, string][])
      : []),
  ]);
}

function render(data: PageData, actionData?: unknown, path = "/g/x/requests/r"): string {
  const Stub = createRoutesStub([
    { id: "request", path: "/g/:groupId/requests/:requestId", Component: RequestPage },
  ]);
  return renderToString(
    <Stub
      initialEntries={[path]}
      hydrationData={{
        loaderData: { request: data },
        actionData: actionData ? { request: actionData } : undefined,
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

function bodyOf(value: unknown): Record<string, unknown> {
  return ((value as { data?: unknown }).data ?? value) as Record<string, unknown>;
}

/** A member's times as "date start-end", in order. */
function times(memberId: string): string[] {
  return getStore()
    .listSlots(memberId)
    .map((slot) => `${slot.startDate} ${slot.startMinute}-${slot.endMinute}`);
}

/** The checkbox for the date whose label starts with `label`, as rendered. */
function box(html: string, label: string): string {
  return (
    new RegExp(`<input type="checkbox"[^>]*aria-label="${label}[^"]*"[^>]*/>`).exec(html)?.[0] ?? ""
  );
}

const freeBusyCalls = () => google.calendarCalls().filter((call) => call.url.endsWith("/freeBusy"));

describe("a member's page", () => {
  it("leads with the request's dates and the hour bar, then the cap, with nothing to send", async () => {
    const { group, pianistCookie } = await band();
    const request = concert(group.id);

    const html = render(await load(group, request.id, pianistCookie));

    expect(html.indexOf('id="your-times-heading"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="your-times-heading"')).toBeLessThan(html.indexOf('id="cap-heading"'));
    expect(html).toContain('<select id="startTime" name="startTime"');
    expect(html).toContain('aria-label="Mon 2 Nov"');
    expect(html).toContain('aria-label="Sun 29 Nov"');
    expect(html).not.toContain('aria-label="Sun 1 Nov"');
    expect(html).not.toContain('aria-label="Mon 30 Nov"');
    // Without JavaScript the ticks post with one Save button.
    expect(html).toContain('name="intent" value="save-dates"');
    expect(html).not.toMatch(/Send my answer|Update my answer|Your times in this span/);
    expect(html).not.toContain("/availability");
  });

  it("lists the same dates with their times in the List view", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);

    const html = render(await load(group, request.id, pianistCookie, "?times=list"));

    expect(times(pianist.id)).toEqual(["2026-11-03 1140-1320"]);
    expect(html).toContain('<ul class="date-list">');
    expect(box(html, "Tue 3 Nov, 7–10 PM")).toMatch(/checked=""/);
    expect(html).toContain('<span>Tue 3 Nov</span><span class="day-time">7–10 PM</span>');
    expect(html).toContain('aria-label="Wed 4 Nov"');
  });

  it("shows a closed request's whole span read-only, with nothing to change", async () => {
    const { group, organizerCookie, pianistCookie } = await band();
    const request = concert(group.id);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);
    await post(group, request.id, organizerCookie, [
      ["intent", "close"],
      ["confirmed", "1"],
    ]);

    const page = await load(group, request.id, pianistCookie);
    const html = render(page);

    expect(page.dates).toEqual({ from: "2026-11-02", to: "2026-11-29" });
    expect(html).toContain("This request is no longer taking times.");
    expect(box(html, "Tue 3 Nov, 7–10 PM")).toMatch(/disabled=""/);
    expect(box(html, "Tue 3 Nov, 7–10 PM")).toMatch(/checked=""/);
    expect(html).not.toContain('name="startTime"');
    expect(html).not.toContain('name="limit"');
    expect(html).not.toContain("save-status");
  });
});

describe("saving one date", () => {
  it("sets the date to the stretch, replacing its time within the windows, and marks a response", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await post(group, request.id, pianistCookie, [
      ["intent", "answer"],
      ["limit", "most"],
      ["limitCount", "3"],
    ]);

    const first = await setDate(group, request.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["18:30", "21:00"]);

    expect(first).toEqual({ dateSaved: true });
    expect(times(pianist.id)).toEqual(["2026-11-03 1110-1260"]);
    expect(getStore().listAnswers(group.id, request.id)).toEqual([
      expect.objectContaining({ memberId: pianist.id, limit: 3 }),
    ]);
  });

  it("clears a date, and marks a response with no limit when there was none", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);
    await setDate(group, request.id, pianistCookie, "2026-11-04", ["10:00", "12:00"]);

    const cleared = await setDate(group, request.id, pianistCookie, "2026-11-03", null);

    expect(cleared).toEqual({ dateSaved: true });
    expect(times(pianist.id)).toEqual(["2026-11-04 600-720"]);
    expect(getStore().listAnswers(group.id, request.id)).toEqual([
      expect.objectContaining({ memberId: pianist.id, limit: null }),
    ]);
  });

  it("leaves a time given for another request's windows alone (plan/phase-23.md)", async () => {
    const { group, pianist, pianistCookie } = await band();
    const morning = concert(group.id, [MORNING]);
    const evening = concert(group.id, [EVENING]);
    await setDate(group, morning.id, pianistCookie, "2026-11-03", ["10:00", "12:00"]);

    // On the evening request the morning time isn't an answer, so the date isn't ticked.
    const onEvening = await load(group, evening.id, pianistCookie);
    expect(onEvening.oneOffs).toEqual([]);
    expect(render(onEvening)).toContain('aria-label="Tue 3 Nov"');

    await setDate(group, evening.id, pianistCookie, "2026-11-03", null);
    expect(times(pianist.id)).toEqual(["2026-11-03 600-720"]);
    await setDate(group, evening.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);
    expect(times(pianist.id)).toEqual(["2026-11-03 600-720", "2026-11-03 1140-1320"]);
    await setDate(group, evening.id, pianistCookie, "2026-11-03", null);
    expect(times(pianist.id)).toEqual(["2026-11-03 600-720"]);
  });

  it("shows a date given on one request on another covering it", async () => {
    const { group, pianistCookie } = await band();
    const first = concert(group.id);
    const second = concert(group.id, [EVENING], "2026-11-15");
    await setDate(group, first.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);

    const page = await load(group, second.id, pianistCookie);

    expect(page.oneOffs).toEqual([{ date: "2026-11-03", startMinute: 1140, endMinute: 1320 }]);
    expect(render(page)).toContain('aria-label="Tue 3 Nov, 7–10 PM"');
  });

  it.each([
    ["a date before the span", "2026-11-01", ["19:00", "22:00"]],
    ["a date after the span", "2026-11-30", ["19:00", "22:00"]],
    ["no date", "", ["19:00", "22:00"]],
    ["no stretch", "2026-11-03", ["", ""]],
    ["a stretch ending before it starts", "2026-11-03", ["22:00", "19:00"]],
  ] as [string, string, [string, string]][])(
    "refuses %s and saves nothing",
    async (_, date, stretch) => {
      const { group, pianist, pianistCookie } = await band();
      const request = concert(group.id);
      const answers = count("request_answers");

      const refused = await setDate(group, request.id, pianistCookie, date, stretch);

      expect(statusOf(refused)).toBe(400);
      expect(bodyOf(refused).dateProblem).toEqual(expect.any(String));
      expect(times(pianist.id)).toEqual([]);
      expect(count("request_answers")).toBe(answers);
    },
  );

  it("refuses a stretch outside the request's times of day, keeping the date's time", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id, [EVENING]);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["19:00", "22:00"]);

    const refused = await setDate(group, request.id, pianistCookie, "2026-11-03", [
      "10:00",
      "12:00",
    ]);
    const noJs = await post(group, request.id, pianistCookie, [
      ["intent", "save-dates"],
      ["date", "2026-11-03"],
      ["date", "2026-11-04"],
      ["startTime", "10:00"],
      ["endTime", "12:00"],
    ]);

    expect(statusOf(refused)).toBe(400);
    expect(bodyOf(refused).dateProblem).toBe("Pick a time within this request's times of day.");
    expect(statusOf(noJs)).toBe(400);
    expect(times(pianist.id)).toEqual(["2026-11-03 1140-1320"]);
  });

  it("offers and takes only today onward once the request has started", async () => {
    const { group, pianist, pianistCookie } = await band();
    const started = getStore().createRequest(group.id, {
      name: "Running",
      startDate: "2026-09-28",
      endDate: "2026-10-20",
      windows: [EVENING],
    });

    const page = await load(group, started.id, pianistCookie);
    const past = await setDate(group, started.id, pianistCookie, "2026-10-01", ["19:00", "22:00"]);
    const pastNoJs = await post(group, started.id, pianistCookie, [
      ["intent", "save-dates"],
      ["date", "2026-10-01"],
      ["startTime", "19:00"],
      ["endTime", "22:00"],
    ]);
    const today = await setDate(group, started.id, pianistCookie, "2026-10-02", ["19:00", "22:00"]);

    expect(page.dates).toEqual({ from: "2026-10-02", to: "2026-10-20" });
    expect(statusOf(past)).toBe(400);
    expect(statusOf(pastNoJs)).toBe(400);
    expect(today).toEqual({ dateSaved: true });
    expect(times(pianist.id)).toEqual(["2026-10-02 1140-1320"]);
  });

  it("saves an organizer's own dates the same way", async () => {
    const { group, organizer, organizerCookie } = await band();
    const request = concert(group.id);

    const saved = await setDate(group, request.id, organizerCookie, "2026-11-05", [
      "19:00",
      "22:00",
    ]);

    expect(saved).toEqual({ dateSaved: true });
    expect(times(organizer.id)).toEqual(["2026-11-05 1140-1320"]);
    expect(getStore().listAnswers(group.id, request.id)).toEqual([
      expect.objectContaining({ memberId: organizer.id, limit: null }),
    ]);
  });

  it("refuses a closed request", async () => {
    const { group, organizerCookie, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await post(group, request.id, organizerCookie, [
      ["intent", "close"],
      ["confirmed", "1"],
    ]);

    const refused = await setDate(group, request.id, pianistCookie, "2026-11-03", [
      "19:00",
      "22:00",
    ]);

    expect(statusOf(refused)).toBe(400);
    expect(bodyOf(refused).dateProblem).toBe("This request is no longer taking times.");
    expect(times(pianist.id)).toEqual([]);
  });
});

describe("saving without JavaScript", () => {
  it("adds newly ticked dates, clears unticked ones and keeps the rest", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["10:00", "12:00"]);
    await setDate(group, request.id, pianistCookie, "2026-11-04", ["19:00", "22:00"]);

    const saved = await post(group, request.id, pianistCookie, [
      ["intent", "save-dates"],
      ["date", "2026-11-03"],
      ["date", "2026-11-05"],
      ["startTime", "18:30"],
      ["endTime", "21:00"],
    ]);

    expect(statusOf(saved)).toBe(302);
    expect(await toastOf(saved)).toBe("Times saved");
    expect(times(pianist.id)).toEqual(["2026-11-03 600-720", "2026-11-05 1110-1260"]);
  });

  it("clears dates without a stretch, but needs one for a new date", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await setDate(group, request.id, pianistCookie, "2026-11-03", ["10:00", "12:00"]);

    const refused = await post(group, request.id, pianistCookie, [
      ["intent", "save-dates"],
      ["date", "2026-11-06"],
    ]);
    expect(statusOf(refused)).toBe(400);
    expect(times(pianist.id)).toEqual(["2026-11-03 600-720"]);
    const html = render(await load(group, request.id, pianistCookie), bodyOf(refused));
    expect(html).toContain("Start time is required.");
    expect(box(html, "Fri 6 Nov")).toMatch(/checked=""/);

    const cleared = await post(group, request.id, pianistCookie, [["intent", "save-dates"]]);
    expect(statusOf(cleared)).toBe(302);
    expect(times(pianist.id)).toEqual([]);
  });
});

describe("the organizer's own times", () => {
  it("fold below the heat map, opening for the List view", async () => {
    const { group, organizerCookie } = await band();
    const request = concert(group.id);

    const html = render(await load(group, request.id, organizerCookie));
    const listed = render(
      await load(group, request.id, organizerCookie, "?times=list"),
      undefined,
      "/g/x/requests/r?times=list",
    );

    expect(html.indexOf('id="overlap-heading"')).toBeLessThan(
      html.indexOf('id="your-times-heading"'),
    );
    expect(html).toContain('<details class="your-times"><summary>None yet</summary>');
    expect(listed).toContain('<details class="your-times" open=""><summary>None yet</summary>');
    const page = await load(group, request.id, organizerCookie);
    const dateError = {
      dateErrors: { dates: "Pick at least one date." },
      dateValues: { dates: [], startTime: "", endTime: "" },
    };
    expect(render(page, dateError)).toContain('<details class="your-times" open="">');
    expect(render(page, { capProblem: "Choose a number of rehearsals from 1 to 99." })).toContain(
      '<details class="your-times" open="">',
    );
    const noticed = await load(group, request.id, organizerCookie, "?notice=calendar-declined");
    expect(render(noticed, undefined, "/g/x/requests/r?notice=calendar-declined")).toContain(
      '<details class="your-times" open="">',
    );
  });
});

describe("the rehearsal cap", () => {
  it("saves through a fetcher without navigating, or with a toast from the Save button", async () => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);

    const quiet = await post(group, request.id, pianistCookie, [
      ["intent", "answer"],
      ["via", "fetcher"],
      ["limit", "most"],
      ["limitCount", "2"],
    ]);
    const loud = await post(group, request.id, pianistCookie, [
      ["intent", "answer"],
      ["limit", "any"],
    ]);

    expect(quiet).toEqual({ capSaved: true });
    expect(statusOf(loud)).toBe(302);
    expect(await toastOf(loud)).toBe("Saved");
    expect(getStore().listAnswers(group.id, request.id)).toEqual([
      expect.objectContaining({ memberId: pianist.id, limit: null }),
    ]);
    const html = render(await load(group, request.id, pianistCookie));
    expect(html).toMatch(/<legend>How many rehearsals can you make in this span\?<\/legend>/);
    expect(html).toMatch(/name="intent" value="answer"[\s\S]*>Save</);
  });

  it("shows a refused Save beside the cap without JavaScript", async () => {
    const { group, pianistCookie } = await band();
    const request = concert(group.id);

    const refused = await post(group, request.id, pianistCookie, [
      ["intent", "answer"],
      ["limit", "most"],
      ["limitCount", "0"],
    ]);
    const html = render(await load(group, request.id, pianistCookie), bodyOf(refused));

    expect(statusOf(refused)).toBe(400);
    const cap = html.slice(html.indexOf('id="cap-heading"'));
    expect(cap).toContain(
      'id="cap-error" role="alert">Choose a number of rehearsals from 1 to 99.</p>',
    );
    expect(html.slice(0, html.indexOf('id="cap-heading"'))).not.toContain("Choose a number");
  });

  it.each([
    ["an empty number", ""],
    ["zero", "0"],
    ["too many", "100"],
    ["a fraction", "2.5"],
  ])("refuses %s through the fetcher and keeps the stored limit", async (_, limitCount) => {
    const { group, pianist, pianistCookie } = await band();
    const request = concert(group.id);
    await post(group, request.id, pianistCookie, [
      ["intent", "answer"],
      ["via", "fetcher"],
      ["limit", "most"],
      ["limitCount", "4"],
    ]);

    const refused = await post(group, request.id, pianistCookie, [
      ["intent", "answer"],
      ["via", "fetcher"],
      ["limit", "most"],
      ["limitCount", limitCount],
    ]);

    expect(statusOf(refused)).toBe(400);
    expect(bodyOf(refused).capProblem).toBe("Choose a number of rehearsals from 1 to 99.");
    expect(getStore().listAnswers(group.id, request.id)).toEqual([
      expect.objectContaining({ memberId: pianist.id, limit: 4 }),
    ]);
  });
});

describe("clashes with Google Calendar", () => {
  it("reads busy times within the request's windows only, and greys by the chosen stretch", async () => {
    const { group, cellistCookie } = await band();
    const request = concert(group.id);
    google.busy = [
      { start: "2026-11-03T19:00:00Z", end: "2026-11-03T20:00:00Z" }, // Tue 3 Nov 7–8 PM GMT
      { start: "2026-11-04T08:00:00Z", end: "2026-11-04T09:00:00Z" }, // 8–9 AM, outside the windows
    ];

    const page = await load(group, request.id, cellistCookie);

    expect(page.clashes).toEqual({
      state: "ready",
      busy: { "2026-11-03": [{ startMinute: 1140, endMinute: 1200 }] },
    });
    expect(JSON.stringify(page)).not.toContain("2026-11-04");
    const html = render(page);
    expect(html).toContain('aria-label="Tue 3 Nov"');
    expect(html).toContain("Once you pick a stretch, days busy in your Google Calendar are greyed");
    const evening = {
      dateErrors: {},
      dateValues: { dates: [], startTime: "19:00", endTime: "22:00" },
    };
    expect(render(page, evening)).toContain('aria-label="Tue 3 Nov, busy in your Google Calendar"');
    const morning = {
      dateErrors: {},
      dateValues: { dates: [], startTime: "10:00", endTime: "12:00" },
    };
    expect(render(page, morning)).not.toContain("Tue 3 Nov, busy");
  });

  it("greys nothing and says so when Google can't be read", async () => {
    const { group, cellistCookie } = await band();
    const request = concert(group.id);
    google.freeBusyAnswer = { status: 500, body: {} };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const page = await load(group, request.id, cellistCookie);

    expect(page.clashes).toEqual({ state: "error" });
    expect(render(page)).toContain("Couldn&#x27;t read your Google Calendar right now");
    warn.mockRestore();
  });

  it("offers to connect, returning to the request page rather than its data request", async () => {
    const { group, cellistCookie } = await band([]);
    const request = concert(group.id);

    const page = (await loader(
      routeArgs(
        `${pathOf(group, request.id)}.data?times=list&notice=calendar-declined&_routes=routes%2Frequest`,
        { groupAddress: addressOf(group), requestId: request.id },
        { cookie: cellistCookie },
      ),
    )) as PageData;

    expect(page.clashes).toEqual({
      state: "connect",
      connectUrl: `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(`${pathOf(group, request.id)}?times=list`)}`,
    });
    expect(render(page)).toContain("See clashes from your Google Calendar");
    expect(google.calendarCalls()).toEqual([]);
  });

  it("explains how a consent ended, and leaves the notice out of the view switch", async () => {
    const { group, cellistCookie } = await band([]);
    const request = concert(group.id);

    const page = await load(group, request.id, cellistCookie, "?notice=calendar-declined");
    const html = render(page, undefined, "/g/x/requests/r?notice=calendar-declined");

    expect(html).toContain("Google Calendar access wasn&#x27;t granted, so nothing changed.");
    expect(html).toContain('href="/g/x/requests/r?times=list"');
    expect(html).not.toMatch(/href="[^"]*notice=/);
  });

  it("reads nothing for a member not signed in with Google, or on a closed request", async () => {
    const { group, organizerCookie, pianistCookie, cellistCookie } = await band();
    const request = concert(group.id);

    expect((await load(group, request.id, pianistCookie)).clashes).toEqual({ state: "none" });
    await post(group, request.id, organizerCookie, [
      ["intent", "close"],
      ["confirmed", "1"],
    ]);
    expect((await load(group, request.id, cellistCookie)).clashes).toEqual({ state: "none" });
    expect(freeBusyCalls()).toEqual([]);
  });
});

describe("whether a date shows as ticked", () => {
  const saved = [
    { date: "2026-11-03", startMinute: 1140, endMinute: 1320 },
    { date: "2026-11-03", startMinute: 600, endMinute: 720 },
  ];

  it("follows the saved times on the date, whatever the chosen stretch", () => {
    expect(dateTicked("2026-11-03", saved, null)).toBe(true);
    expect(dateTicked("2026-11-04", saved, null)).toBe(false);
    expect(timesOn("2026-11-03", saved)).toBe("7–10 PM, 10 AM–12 PM");
    expect(timesOn("2026-11-04", saved)).toBeNull();
  });

  it("shows a save in flight at once", () => {
    expect(dateTicked("2026-11-03", saved, { on: false })).toBe(false);
    expect(dateTicked("2026-11-04", saved, { on: true })).toBe(true);
  });
});
