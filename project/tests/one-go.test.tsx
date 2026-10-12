// Answering in one go (plan/phase-31.md): a first answer is a draft with every
// date the member looks free already ticked, Select all and Clear all, and one
// Send that posts the dates with the preferred number; nothing is saved before
// it. Once answered, Select all and Clear all save at once (Clear all asks first).
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { forgetAccessToken } from "../app/.server/google";
import { CALENDAR_SCOPES } from "../app/lib/google-scopes";
import { getStore } from "../app/.server/store";
import { startingTicks } from "../app/lib/date-toggle";
import RequestPage, { action, loader } from "../app/routes/request";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import {
  addressOf,
  deviceCookie,
  ORIGIN,
  requestHrefOf,
  routeArgs,
  setCookies,
  signedIn,
  slugFor,
  tempDatabase,
} from "./routes";

tempDatabase();

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
const EVENING = { startMinute: 1140, endMinute: 1320 };

let people = 0;

/**
 * Viola (organizer); Cellist, signed in with Google on this device with
 * `scopes` granted (free/busy reading unless told otherwise); Pianist, name-only. A request for Mon 2 to
 * Sun 8 Nov, 7–10 PM.
 */
async function band(scopes: string[] = [CALENDAR_SCOPES.busy]) {
  const store = getStore();
  const { group, organizer } = store.createGroup("One Go Quartet", "Viola", "Europe/London");
  people += 1;
  const { account, cookie: session } = await signedIn({
    sub: `one-go-${people}`,
    email: `one-go${people}@example.test`,
    name: "Cel",
  });
  forgetAccessToken(account.id);
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  if (scopes.length > 0) store.saveGrant(account.id, "refresh-1", scopes);
  const pianist = store.addMember(group.id, "Pianist", "member");
  const request = store.createRequest(group.id, {
    name: "One go concert",
    startDate: "2026-11-02",
    endDate: "2026-11-08",
    windows: [EVENING],
  });
  return {
    store,
    group,
    request,
    organizer,
    cellist,
    pianist,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: `${await deviceCookie(group.id, cellist.deviceToken)}; ${session}`,
    pianistCookie: await deviceCookie(group.id, pianist.deviceToken),
  };
}
type Band = Awaited<ReturnType<typeof band>>;

function load(b: Band, cookie: string) {
  return loader(
    routeArgs(
      requestHrefOf(b.group, b.request.id),
      { groupAddress: addressOf(b.group), requestSlug: slugFor(b.request.id) },
      { cookie },
    ),
  ) as Promise<PageData>;
}

function post(b: Band, cookie: string, fields: [string, string][]) {
  return action({
    request: new Request(new URL(requestHrefOf(b.group, b.request.id), ORIGIN), {
      method: "POST",
      headers: new Headers({ Cookie: cookie }),
      body: new URLSearchParams(fields),
    }),
    params: { groupAddress: addressOf(b.group), requestSlug: slugFor(b.request.id) },
    context: {},
  } as never) as Promise<unknown>;
}

function render(data: PageData, actionData?: unknown): string {
  const Stub = createRoutesStub([
    { id: "request", path: "/g/:groupId/:requestSlug", Component: RequestPage },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/g/x/r"]}
      hydrationData={{
        loaderData: { request: data },
        actionData: actionData ? { request: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

/** The checkbox whose label starts with `label`, as rendered. */
function box(html: string, label: string): string {
  return (
    new RegExp(`<input type="checkbox"[^>]*aria-label="${label}[^"]*"[^>]*/>`).exec(html)?.[0] ?? ""
  );
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

function bodyOf(value: unknown): Record<string, unknown> {
  return ((value as { data?: unknown }).data ?? value) as Record<string, unknown>;
}

async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

function times(memberId: string): string[] {
  return getStore()
    .listSlots(memberId)
    .map((slot) => `${slot.startDate} ${slot.startMinute}-${slot.endMinute}`);
}

const once = (date: string, startMinute: number, endMinute: number) => ({
  kind: "once" as const,
  startDate: date,
  endDate: null,
  startMinute,
  endMinute,
});

const send = (dates: string[], extra: [string, string][] = []): [string, string][] => [
  ["intent", "save-dates"],
  ["draft", "1"],
  ...dates.map((date): [string, string] => ["date", date]),
  ["startTime", "19:00"],
  ["endTime", "22:00"],
  ...extra,
];

describe("the starting ticks", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];

  it("leave out dates busy at the chosen time, keep dates already given, and tick all with nothing known", () => {
    const busy = {
      "2026-11-03": [{ startMinute: 1140, endMinute: 1200 }],
      "2026-11-04": [{ startMinute: 600, endMinute: 660 }],
    };
    expect(startingTicks(dates, busy, EVENING, [])).toEqual(["2026-11-02", "2026-11-04"]);
    expect(
      startingTicks(dates, busy, EVENING, [
        { date: "2026-11-03", startMinute: 1200, endMinute: 1260 },
      ]),
    ).toEqual(dates);
    expect(startingTicks(dates, {}, EVENING, [])).toEqual(dates);
    expect(startingTicks(dates, busy, null, [])).toEqual(dates);
  });
});

describe("a first answer", () => {
  it("arrives with every free date ticked, a given busy date kept, and one Send for dates and number", async () => {
    const b = await band();
    // Busy Tue 3 and Thu 5 Nov at 7–8 PM; times already given on Thu 5 Nov.
    google.busy = [
      { start: "2026-11-03T19:00:00Z", end: "2026-11-03T20:00:00Z" },
      { start: "2026-11-05T19:00:00Z", end: "2026-11-05T20:00:00Z" },
    ];
    b.store.addSlot(b.cellist.id, once("2026-11-05", 1200, 1320));

    const page = await load(b, b.cellistCookie);
    const html = render(page);

    expect(page.draft).toBe(true);
    expect(box(html, "Mon 2 Nov")).toContain('checked=""');
    expect(box(html, "Tue 3 Nov")).not.toContain("checked");
    expect(box(html, "Tue 3 Nov")).toContain("busy in your Google Calendar");
    expect(box(html, "Thu 5 Nov")).toContain('checked=""');
    expect(box(html, "Sun 8 Nov")).toContain('checked=""');
    expect(html).toContain("6 of 7 dates ticked");
    expect(html).toContain("We&#x27;ve ticked every date you look free.");
    // One form: the dates, the number and Send, posting nothing on its own.
    const form = html.slice(
      html.indexOf('name="intent" value="save-dates"'),
      html.indexOf("</form>", html.indexOf('name="intent" value="save-dates"')),
    );
    expect(form).toContain('<input type="hidden" name="draft" value="1"/>');
    expect(form).toMatch(/<input type="checkbox"[^>]*name="date"[^>]*value="2026-11-02"/);
    expect(form.match(/name="limit"[^>]*value="any"/g)).toHaveLength(1);
    expect(form).toContain('name="limitCount"');
    expect(form).toContain(">Send these dates<");
    expect(form).not.toContain("<form");
    expect(html.match(/name="limit"[^>]*value="any"/g)).toHaveLength(1);
    expect(html).not.toContain('value="answer"');
    expect(html).not.toContain('id="cap-heading"');
    // Opening the draft wrote nothing.
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([]);
    expect(times(b.cellist.id)).toEqual(["2026-11-05 1200-1320"]);
  });

  it("is a draft for an organizer's own times too, with one number and nothing saved", async () => {
    const b = await band();

    const page = await load(b, b.organizerCookie);
    const html = render(page);

    expect(page.draft).toBe(true);
    expect(html).toContain('id="overlap-heading"');
    expect(html).toContain('<input type="hidden" name="draft" value="1"/>');
    expect(html.match(/name="limit"[^>]*value="any"/g)).toHaveLength(1);
    expect(html).not.toContain('value="answer"');
    expect(html).not.toContain('id="cap-heading"');
    expect(html).toContain(">Send these dates<");
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([]);
  });

  it("ticks every date when Google can't be read, and says so", async () => {
    const b = await band();
    google.busy = [{ start: "2026-11-03T19:00:00Z", end: "2026-11-03T20:00:00Z" }];
    google.freeBusyAnswer = { status: 500, body: {} };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const html = render(await load(b, b.cellistCookie));

    expect(box(html, "Tue 3 Nov")).toContain('checked=""');
    expect(html).toContain("7 of 7 dates ticked");
    expect(html).toContain("so every date is ticked; check them before sending.");
    warn.mockRestore();
  });

  it("ticks every date before Google Calendar is connected", async () => {
    const b = await band([]);
    google.busy = [{ start: "2026-11-03T19:00:00Z", end: "2026-11-03T20:00:00Z" }];

    const page = await load(b, b.cellistCookie);

    expect(page.clashes.state).toBe("connect");
    expect(render(page)).toContain("7 of 7 dates ticked");
  });

  it("ticks every date for a member without Google Calendar", async () => {
    const b = await band();

    const html = render(await load(b, b.pianistCookie));

    expect(html).toContain("7 of 7 dates ticked");
    expect(box(html, "Tue 3 Nov")).toContain('checked=""');
  });

  it("saves the dates and the number together on Send, and is answered after", async () => {
    const b = await band();
    b.store.addSlot(b.pianist.id, once("2026-11-05", 1200, 1320));

    const sent = await post(
      b,
      b.pianistCookie,
      send(
        ["2026-11-02", "2026-11-05"],
        [
          ["limit", "most"],
          ["limitCount", "2"],
        ],
      ),
    );

    expect(statusOf(sent)).toBe(302);
    expect(await toastOf(sent)).toBe("Dates sent");
    // A date already given keeps its own time; a new one gets the chosen time.
    expect(times(b.pianist.id).sort()).toEqual(["2026-11-02 1140-1320", "2026-11-05 1200-1320"]);
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([
      expect.objectContaining({ memberId: b.pianist.id, limit: 2 }),
    ]);
    const after = await load(b, b.pianistCookie);
    expect(after.draft).toBe(false);
    expect(render(after)).toContain('id="cap-heading"');
  });

  it("can send no dates at all", async () => {
    const b = await band();

    const sent = await post(b, b.pianistCookie, send([], [["limit", "any"]]));

    expect(statusOf(sent)).toBe(302);
    expect(times(b.pianist.id)).toEqual([]);
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([
      expect.objectContaining({ memberId: b.pianist.id, limit: null }),
    ]);
  });

  it("saves nothing when the number is refused, and shows the member's own ticks and number again", async () => {
    const b = await band();

    const refused = await post(
      b,
      b.pianistCookie,
      send(
        ["2026-11-03", "2026-11-04"],
        [
          ["limit", "most"],
          ["limitCount", "0"],
        ],
      ),
    );

    expect(statusOf(refused)).toBe(400);
    expect(times(b.pianist.id)).toEqual([]);
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([]);
    const html = render(await load(b, b.pianistCookie), bodyOf(refused));
    expect(box(html, "Tue 3 Nov")).toContain('checked=""');
    expect(box(html, "Mon 2 Nov")).not.toContain("checked");
    expect(html).toContain("2 of 7 dates ticked");
    expect(html).toMatch(/<input type="radio" name="limit" checked="" value="most"\/>/);
    expect(html).toMatch(/name="limitCount"[^>]*value="0"/);
    expect(html).toContain(
      'id="cap-error" role="alert">Choose a number of rehearsals from 1 to 99.</p>',
    );
  });

  it("saves nothing when the time is refused, keeping the ticks and number", async () => {
    const b = await band();

    const refused = await post(b, b.pianistCookie, [
      ["intent", "save-dates"],
      ["draft", "1"],
      ["date", "2026-11-03"],
      ["startTime", "22:00"],
      ["endTime", "19:00"],
      ["limit", "most"],
      ["limitCount", "3"],
    ]);

    expect(statusOf(refused)).toBe(400);
    expect(times(b.pianist.id)).toEqual([]);
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([]);
    const html = render(await load(b, b.pianistCookie), bodyOf(refused));
    expect(html).toContain("1 of 7 dates ticked");
    expect(html).toMatch(/name="limitCount"[^>]*value="3"/);
  });

  it("leaves the number alone when the member already answered", async () => {
    const b = await band();
    b.store.answerRequest(b.group.id, b.request.id, b.pianist.id, 4);

    const page = await load(b, b.pianistCookie);
    await post(b, b.pianistCookie, send(["2026-11-02"], [["limit", "any"]]));

    expect(page.draft).toBe(false);
    expect(times(b.pianist.id)).toEqual(["2026-11-02 1140-1320"]);
    expect(b.store.listAnswers(b.group.id, b.request.id)).toEqual([
      expect.objectContaining({ memberId: b.pianist.id, limit: 4 }),
    ]);
  });

  it("is not offered on a closed request", async () => {
    const b = await band();
    b.store.setRequestOpen(b.group.id, b.request.id, false);

    const page = await load(b, b.pianistCookie);

    expect(page.draft).toBe(false);
    expect(render(page)).not.toContain("Send these dates");
  });
});

describe("once answered", () => {
  async function answered() {
    const b = await band();
    b.store.answerRequest(b.group.id, b.request.id, b.pianist.id, null);
    b.store.addSlot(b.pianist.id, once("2026-11-04", 1200, 1260));
    return b;
  }

  it("selects every date at once, keeping times already given", async () => {
    const b = await answered();

    const filled = await post(b, b.pianistCookie, [
      ["intent", "fill-dates"],
      ["startTime", "19:00"],
      ["endTime", "22:00"],
    ]);

    expect(filled).toEqual({ dateSaved: true });
    const saved = times(b.pianist.id);
    expect(saved).toHaveLength(7);
    expect(saved).toContain("2026-11-04 1200-1260");
    expect(saved).toContain("2026-11-08 1140-1320");
  });

  it("clears every date only once confirmed", async () => {
    const b = await answered();

    const asked = await post(b, b.pianistCookie, [["intent", "clear-dates"]]);
    expect(bodyOf(asked)).toEqual({
      confirm: expect.objectContaining({ title: "Clear all your dates?" }),
    });
    expect(times(b.pianist.id)).toEqual(["2026-11-04 1200-1260"]);

    const cleared = await post(b, b.pianistCookie, [
      ["intent", "clear-dates"],
      ["confirmed", "1"],
    ]);
    expect(await toastOf(cleared)).toBe("Dates cleared");
    expect(times(b.pianist.id)).toEqual([]);
  });

  it("refuses both on a closed request", async () => {
    const b = await answered();
    b.store.setRequestOpen(b.group.id, b.request.id, false);

    const filled = await post(b, b.pianistCookie, [
      ["intent", "fill-dates"],
      ["startTime", "19:00"],
      ["endTime", "22:00"],
    ]);
    const cleared = await post(b, b.pianistCookie, [
      ["intent", "clear-dates"],
      ["confirmed", "1"],
    ]);

    expect(statusOf(filled)).toBe(400);
    expect(statusOf(cleared)).toBe(400);
    expect(times(b.pianist.id)).toEqual(["2026-11-04 1200-1260"]);
  });
});
