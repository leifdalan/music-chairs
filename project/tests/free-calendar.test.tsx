// The organizer's visual view (plan/phase-20.md): the request page's calendar
// of who is free, proposing from it or the list, and the schedule page's
// "Your answer" and "For organizers" areas.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { dayHeat, heatLevel } from "../app/lib/heat";
import { buildCells } from "../app/lib/overlap";
import RequestPage, {
  action as requestAction,
  loader as requestLoader,
} from "../app/routes/request";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import {
  addressOf,
  addSlots,
  deviceCookie,
  ORIGIN,
  requestHrefOf,
  routeArgs,
  slugFor,
  tempDatabase,
} from "./routes";

tempDatabase();

// 2026-10-02 (a Friday) in Europe/London.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

describe("how dark a date is", () => {
  it.each([
    [0, 4, 0],
    [1, 4, 1],
    [2, 4, 2],
    [3, 4, 3],
    [4, 4, 4],
    [1, 1, 4],
    [2, 3, 3],
    [1, 0, 0],
  ])("%i of %i free is level %i", (free, total, level) => {
    expect(heatLevel(free, total)).toBe(level);
  });

  /** Cells for members free at the given times on 2026-10-05. */
  function cellsOf(free: Record<string, [number, number][]>) {
    return buildCells(
      Object.entries(free).map(([id, times]) => ({
        id,
        displayName: id,
        optional: false,
        slots: times.map(([startMinute, endMinute], index) => ({
          id: `${id}-${index}`,
          kind: "once" as const,
          startDate: "2026-10-05",
          endDate: null,
          startMinute,
          endMinute,
          skips: [],
        })),
      })),
      "2026-10-05",
      "2026-10-05",
    );
  }
  const evening = [{ startMinute: 1140, endMinute: 1320 }];

  it("counts people free together for a whole hour, even when someone else's short slot splits the time", () => {
    // Viola and Cellist 7–8 PM; Pianist only 7:30–7:45 PM.
    const cells = cellsOf({
      viola: [[1140, 1200]],
      cellist: [[1140, 1200]],
      pianist: [[1170, 1185]],
    });

    expect(dayHeat(cells, "2026-10-05", evening)).toBe(2);
  });

  it("ignores a larger group that is together for less than an hour", () => {
    const cells = cellsOf({
      viola: [[1140, 1260]],
      cellist: [[1140, 1260]],
      pianist: [[1140, 1170]],
    });

    expect(dayHeat(cells, "2026-10-05", evening)).toBe(2);
    expect(dayHeat(cellsOf({ viola: [[1140, 1185]] }), "2026-10-05", evening)).toBe(0);
  });

  it("counts only within the request's times of day", () => {
    const cells = cellsOf({ viola: [[1020, 1170]], cellist: [[1020, 1170]] });

    expect(dayHeat(cells, "2026-10-05", evening)).toBe(0);
    expect(dayHeat(cells, "2026-10-05", [{ startMinute: 1020, endMinute: 1140 }])).toBe(2);
    // Free 9:30–11 PM: only half an hour of it is inside 7–10 PM.
    const late = cellsOf({ viola: [[1290, 1380]], cellist: [[1290, 1380]] });
    expect(dayHeat(late, "2026-10-05", evening)).toBe(0);
  });
});

const once = (date: string, startMinute: number, endMinute: number) => ({
  kind: "once" as const,
  startDate: date,
  endDate: null,
  startMinute,
  endMinute,
});

/**
 * Three members and a request for 5–12 Oct, 7–10 PM. Mon 5 Oct: Viola and
 * Cellist free all evening, Pianist only 7–7:30 PM. Tue 6 Oct: Viola only.
 * Nobody on the other dates.
 */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Heat Trio", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  addSlots(store, organizer.id, [once("2026-10-05", 1080, 1380), once("2026-10-06", 1140, 1320)]);
  addSlots(store, cellist.id, [once("2026-10-05", 1080, 1380)]);
  addSlots(store, pianist.id, [once("2026-10-05", 1140, 1170)]);
  const request = store.createRequest(group.id, {
    name: "Heat concert",
    startDate: "2026-10-05",
    endDate: "2026-10-12",
    windows: [{ startMinute: 1140, endMinute: 1320 }],
  });
  return {
    store,
    group,
    requestId: request.id,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

type Band = Awaited<ReturnType<typeof band>>;

async function requestPage(b: Band, cookie: string, search = "") {
  const path = `${requestHrefOf(b.group, b.requestId)}${search}`;
  const data = await requestLoader(
    routeArgs(
      path,
      { groupAddress: addressOf(b.group), requestSlug: slugFor(b.requestId) },
      { cookie },
    ),
  );
  const Stub = createRoutesStub([
    { id: "request", path: "/g/:groupAddress/:requestSlug", Component: RequestPage },
  ]);
  return renderToString(
    <Stub initialEntries={[path]} hydrationData={{ loaderData: { request: data } }} />,
  ).replaceAll("<!-- -->", "");
}

/** The value of the tick box whose label starts with `label`. */
function tickOf(found: Map<string, string[]>, label: string): string {
  const [match] = [...found].filter(([key]) => key === label || key.startsWith(`${label}:`));
  if (!match) throw new Error(`No tick box for ${label}`);
  return match[1][0];
}

/** Each tick box's value by its label. */
function ticks(html: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const input of html.match(/<input type="checkbox"[^>]*>/g) ?? []) {
    if (!input.includes('name="time"')) continue;
    const label = /aria-label="([^"]+)"/.exec(input)?.[1] ?? "";
    const value = /value="([^"]+)"/.exec(input)?.[1] ?? "";
    found.set(label, [...(found.get(label) ?? []), value]);
  }
  return found;
}

describe("the request page's calendar of who is free", () => {
  it("is the organizer's default view, shading each date by the most free together", async () => {
    const b = await band();
    const html = await requestPage(b, b.organizerCookie);

    expect(html).toContain('class="free-calendar"');
    expect(html).not.toContain('class="days"');
    // Mon: 2 of 3 together all evening (the 3-person sliver is only 30 minutes).
    expect(html).toMatch(
      /<details class="day free-day heat-3" name="date-popup"><summary aria-label="Mon 5 Oct: up to 2 of 3 free">/,
    );
    // Tue has one free time: the date is its own tick box, with no panel (plan/phase-29.md).
    const tuesday = html.slice(html.indexOf('<label class="day free-day one-time heat-2">'));
    const box = /^<label[^>]*><input([^>]*)>/.exec(tuesday)?.[1] ?? "";
    expect(box).toContain('name="time"');
    expect(box).toContain('value="2026-10-06 1140 1320"');
    expect(box).toContain('aria-label="Propose Tue 6 Oct, 7–10 PM: up to 1 of 3 free"');
    expect(tuesday.slice(0, tuesday.indexOf("</label>"))).toContain(
      '<span class="day-time" aria-hidden="true">7–10 PM</span>',
    );
    expect(html).toContain('aria-label="Wed 7 Oct: nobody free"');
    expect(html.match(/name="date-popup"/g)).toHaveLength(1);
  });

  it("lists each date's free times with who is free, as the same tick boxes as the list", async () => {
    const b = await band();
    const calendar = await requestPage(b, b.organizerCookie);
    const list = await requestPage(b, b.organizerCookie, "?free=list");

    const monday = calendar.slice(
      calendar.indexOf('aria-label="Mon 5 Oct'),
      calendar.indexOf("</details>", calendar.indexOf('aria-label="Mon 5 Oct')),
    );
    // Who is free at each time, in whatever order the overlap lists them.
    const lines = [...monday.matchAll(/Free: ([^<]+)</g)].map((match) =>
      match[1].split(", ").sort(),
    );
    expect(lines).toEqual([
      ["Cellist", "Pianist", "Viola"],
      ["Cellist", "Viola"],
    ]);
    // The same tick boxes (values) in both views; a one-time date's label adds who is free.
    const values = (found: Map<string, string[]>) => [...found.values()].flat().sort();
    expect(values(ticks(calendar))).toEqual(values(ticks(list)));
    for (const tickValues of ticks(calendar).values()) expect(tickValues).toHaveLength(1);
    expect(list).toContain('class="days"');
    expect(list).not.toContain('class="free-calendar"');
    // The picker form posts from the List view's own address, which every
    // action returns to (plan/phase-33.md).
    const picker = list.slice(list.indexOf('class="propose-times"'));
    expect(picker.slice(0, picker.indexOf(">"))).toMatch(/action="[^"]*\?free=list"/);
    const calendarPicker = calendar.slice(calendar.indexOf('class="propose-times"'));
    expect(calendarPicker.slice(0, calendarPicker.indexOf(">"))).not.toContain("free=list");
  });

  it("is for organizers only", async () => {
    const b = await band();
    const html = await requestPage(b, b.cellistCookie);

    expect(html).not.toContain("free-calendar");
    expect(html).not.toContain("How to show when people are free");
    expect(html).not.toContain("Free: ");
  });
});

describe("proposing from the calendar or the list", () => {
  function post(b: Band, fields: [string, string][], search = "") {
    const path = `${requestHrefOf(b.group, b.requestId)}${search}`;
    const request = new Request(new URL(path, ORIGIN), {
      method: "POST",
      headers: { Cookie: b.organizerCookie },
      body: new URLSearchParams(fields),
    });
    return requestAction({
      request,
      params: { groupAddress: addressOf(b.group), requestSlug: slugFor(b.requestId) },
      context: {},
    } as never) as Promise<Response>;
  }

  it("proposes times ticked on two dates together, back to the calendar", async () => {
    const b = await band();
    const found = ticks(await requestPage(b, b.organizerCookie));

    const response = await post(b, [
      ["intent", "propose-times"],
      ["time", tickOf(found, "Propose Mon 5 Oct, 7:30–10 PM")],
      ["time", tickOf(found, "Propose Tue 6 Oct, 7–10 PM")],
      ["location", ""],
    ]);

    expect(response.headers.get("Location")).toBe(requestHrefOf(b.group, b.requestId));
    expect(
      b.store
        .listRehearsals(b.group.id)
        .map((r) => `${r.date} ${r.startMinute}`)
        .sort(),
    ).toEqual(["2026-10-05 1170", "2026-10-06 1140"]);
  });

  it("returns to the list when the proposal came from it", async () => {
    const b = await band();
    const found = ticks(await requestPage(b, b.organizerCookie, "?free=list"));

    const response = await post(
      b,
      [
        ["intent", "propose-times"],
        ["time", tickOf(found, "Propose Tue 6 Oct, 7–10 PM")],
        ["location", ""],
      ],
      "?free=list",
    );

    expect(response.headers.get("Location")).toBe(
      `${requestHrefOf(b.group, b.requestId)}?free=list`,
    );
  });
});

describe("a rehearsal on the schedule page", () => {
  async function schedulePage(b: Band, cookie: string) {
    const path = `${groupPath(b.group)}/schedule`;
    const data = await scheduleLoader(
      routeArgs(path, { groupAddress: addressOf(b.group) }, { cookie }),
    );
    const Stub = createRoutesStub([
      { id: "schedule", path: "/g/:groupAddress/schedule", Component: Schedule },
    ]);
    return renderToString(
      <Stub initialEntries={[path]} hydrationData={{ loaderData: { schedule: data } }} />,
    ).replaceAll("<!-- -->", "");
  }

  it("puts the viewer's own answer first and the organizer's controls apart, renamed", async () => {
    const b = await band();
    b.store.addRehearsal(
      b.group.id,
      b.requestId,
      { date: "2026-10-05", startMinute: 1140, endMinute: 1260 },
      "Hall",
    );

    const organizer = await schedulePage(b, b.organizerCookie);
    const member = await schedulePage(b, b.cellistCookie);
    const card = organizer.slice(organizer.indexOf('class="rehearsal proposed"'));
    const at = (text: string) => card.indexOf(text);

    expect(at(">Your answer<")).toBeGreaterThan(-1);
    expect(at(">Your answer<")).toBeLessThan(at('aria-label="Yes for'));
    expect(card).not.toContain("Answer every date");
    expect(at('aria-label="Yes for')).toBeLessThan(at(">For organizers<"));
    expect(at(">For organizers<")).toBeLessThan(at(">Confirm for everyone<"));
    // Confirm first in the organizer's row; notes, sharing and Delete apart under More (plan/phase-39.md).
    expect(at(">Confirm for everyone<")).toBeLessThan(at('class="more-menu"'));
    expect(at('class="more-menu"')).toBeLessThan(at("Add notes"));
    expect(at("Add notes")).toBeLessThan(at('data-variant="outline-destructive"'));
    expect(card).not.toContain("Cancel a date");
    expect(card).not.toContain(">Confirm<");
    expect(member).toContain(">Your answer<");
    expect(member).not.toContain("For organizers");
    expect(member).not.toContain("Confirm for everyone");
  });
});
