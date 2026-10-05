// My availability's calendar saving each date as it is ticked
// (plan/phase-19.2.md), and the request page's link to it.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { dateTicked } from "../app/lib/date-toggle";
import Availability, { action, loader } from "../app/routes/availability";
import RequestPage, { loader as requestLoader } from "../app/routes/request";
import { deviceCookie, ORIGIN, routeArgs, tempDatabase, addressOf, addressFor } from "./routes";

const count = tempDatabase();

// 2026-10-02 (a Friday) in Europe/London.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

type PageData = Awaited<ReturnType<typeof loader>>;

async function member() {
  const store = getStore();
  const { group } = store.createGroup("Autosave Quartet", "Viola", "Europe/London");
  const pianist = store.addMember(group.id, "Pianist", "member");
  return { store, group, pianist, cookie: await deviceCookie(group.id, pianist.deviceToken) };
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

function setDate(groupId: string, cookie: string, fields: Record<string, string>) {
  const request = new Request(new URL(`/g/${addressFor(groupId)}/availability`, ORIGIN), {
    method: "POST",
    headers: { Cookie: cookie },
    body: new URLSearchParams({ intent: "set-date", ...fields }),
  });
  return action({
    request,
    params: { groupAddress: addressFor(groupId) },
    context: {},
  } as never) as Promise<unknown>;
}

function render(data: PageData): string {
  const Stub = createRoutesStub([
    { id: "availability", path: "/g/:groupId/availability", Component: Availability },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/g/x/availability"]}
      hydrationData={{ loaderData: { availability: data } }}
    />,
  ).replaceAll("<!-- -->", "");
}

const EVENING = { startTime: "19:00", endTime: "22:00" };

describe("the calendar view", () => {
  it("puts the time range before the dates, says to pick it first, and posts with Save without JavaScript", async () => {
    const { group, cookie } = await member();

    const html = render(await load(group.id, cookie));

    expect(html).toContain("Pick a time range first, then tick the dates you&#x27;re free.");
    expect(html.indexOf('name="startTime"')).toBeLessThan(html.indexOf("<legend>Dates</legend>"));
    // Before the page is interactive the ticks are a plain form: enabled, posted together.
    expect(html).toContain(
      '<input type="checkbox" aria-label="Tue 6 Oct" name="date" value="2026-10-06"/>',
    );
    expect(html).toMatch(/<button type="submit"[^>]*>Save<\/button>/);
    expect(html).not.toContain("Add times</button>");
  });

  it("links back to the request to send an answer, only when it came from one", async () => {
    const { store, group, cookie } = await member();
    const request = store.createRequest(group.id, {
      name: "Winter gig",
      startDate: "2026-10-05",
      endDate: "2026-10-30",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });

    const withRequest = render(await load(group.id, cookie, `?request=${request.id}&window=0`));
    const without = render(await load(group.id, cookie));

    expect(withRequest).toContain(
      `href="/g/x/requests/${request.id}" data-discover="true">Back to Winter gig to send your answer</a>`,
    );
    expect(without).not.toContain("to send your answer");
  });
});

describe("saving one date", () => {
  it("adds a one-off time at the range once, however often it is ticked", async () => {
    const { store, group, pianist, cookie } = await member();

    expect(await setDate(group.id, cookie, { date: "2026-10-06", on: "1", ...EVENING })).toEqual({
      saved: true,
    });
    await setDate(group.id, cookie, { date: "2026-10-06", on: "1", ...EVENING });

    expect(store.listSlots(pianist.id)).toMatchObject([
      { kind: "once", startDate: "2026-10-06", startMinute: 1140, endMinute: 1320 },
    ]);
    expect((await load(group.id, cookie)).oneOffs).toEqual([
      { date: "2026-10-06", startMinute: 1140, endMinute: 1320 },
    ]);
  });

  it("removes only that date's one-off time at exactly that range when unticked", async () => {
    const { store, group, pianist, cookie } = await member();
    store.addSlot(pianist.id, {
      kind: "weekly",
      startDate: "2026-10-06",
      endDate: null,
      startMinute: 1140,
      endMinute: 1320,
    });
    store.addSlot(pianist.id, {
      kind: "once",
      startDate: "2026-10-06",
      endDate: null,
      startMinute: 600,
      endMinute: 720,
    });
    // Same end, later start: a different range all the same.
    store.addSlot(pianist.id, {
      kind: "once",
      startDate: "2026-10-06",
      endDate: null,
      startMinute: 1200,
      endMinute: 1320,
    });
    await setDate(group.id, cookie, { date: "2026-10-06", on: "1", ...EVENING });
    await setDate(group.id, cookie, { date: "2026-10-07", on: "1", ...EVENING });

    await setDate(group.id, cookie, { date: "2026-10-06", on: "0", ...EVENING });

    expect(
      store
        .listSlots(pianist.id)
        .map((slot) => [slot.kind, slot.startDate, slot.startMinute])
        .sort(),
    ).toEqual([
      ["once", "2026-10-06", 1200],
      ["once", "2026-10-06", 600],
      ["once", "2026-10-07", 1140],
      ["weekly", "2026-10-06", 1140],
    ]);
  });

  it.each([
    [{ date: "2026-10-01", on: "1", ...EVENING }, "isn't on offer any more"],
    [{ date: "2027-01-05", on: "1", ...EVENING }, "isn't on offer any more"],
    [{ date: "not-a-date", on: "1", ...EVENING }, "isn't on offer any more"],
    [{ date: "2026-10-06", on: "1", startTime: "22:00", endTime: "21:00" }, "after the start time"],
    [{ date: "2026-10-06", on: "1", startTime: "", endTime: "21:00" }, "Start time"],
  ])("refuses %j and stores nothing", async (fields, message) => {
    const { group, cookie } = await member();
    const before = count("availability");

    const result = (await setDate(group.id, cookie, fields)) as {
      data: { dateProblem: string };
      init: ResponseInit;
    };

    expect(result.init.status).toBe(400);
    expect(result.data.dateProblem).toContain(message);
    expect(count("availability")).toBe(before);
  });

  it("refuses more than one date at once", async () => {
    const { group, cookie } = await member();
    const before = count("availability");
    const request = new Request(new URL(`${groupPath(group)}/availability`, ORIGIN), {
      method: "POST",
      headers: { Cookie: cookie },
      body: new URLSearchParams([
        ["intent", "set-date"],
        ["date", "2026-10-06"],
        ["date", "2026-10-07"],
        ["on", "1"],
        ["startTime", "19:00"],
        ["endTime", "22:00"],
      ]),
    });

    const result = (await action({
      request,
      params: { groupAddress: addressOf(group) },
      context: {},
    } as never)) as {
      init: ResponseInit;
    };

    expect(result.init.status).toBe(400);
    expect(count("availability")).toBe(before);
  });

  it("refuses a date outside the request it came for", async () => {
    const { store, group, cookie } = await member();
    const request = store.createRequest(group.id, {
      name: "Short gig",
      startDate: "2026-10-05",
      endDate: "2026-10-09",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });

    const result = (await setDate(group.id, cookie, {
      date: "2026-10-12",
      on: "1",
      request: request.id,
      ...EVENING,
    })) as { init: ResponseInit };

    expect(result.init.status).toBe(400);
  });
});

describe("whether a date shows as ticked", () => {
  const evening = { startMinute: 1140, endMinute: 1320 };
  const saved = [{ date: "2026-10-06", ...evening }];

  it("is never ticked before a range is chosen", () => {
    expect(dateTicked("2026-10-06", null, saved, null)).toBe(false);
  });

  it("follows the saved one-off times at exactly the chosen range", () => {
    expect(dateTicked("2026-10-06", evening, saved, null)).toBe(true);
    expect(dateTicked("2026-10-07", evening, saved, null)).toBe(false);
    expect(dateTicked("2026-10-06", { startMinute: 1140, endMinute: 1260 }, saved, null)).toBe(
      false,
    );
  });

  it("shows a save in flight at once, but only for the range it was sent with", () => {
    expect(dateTicked("2026-10-06", evening, saved, { on: false, range: evening })).toBe(false);
    expect(dateTicked("2026-10-07", evening, saved, { on: true, range: evening })).toBe(true);
    expect(
      dateTicked("2026-10-07", evening, saved, {
        on: true,
        range: { startMinute: 600, endMinute: 720 },
      }),
    ).toBe(false);
  });
});

describe("the request page", () => {
  it("offers to check availability for each of the request's times", async () => {
    const { store, group, cookie } = await member();
    const request = store.createRequest(group.id, {
      name: "Wording gig",
      startDate: "2026-10-05",
      endDate: "2026-10-30",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });
    const data = await requestLoader(
      routeArgs(
        `${groupPath(group)}/requests/${request.id}`,
        { groupAddress: addressOf(group), requestId: request.id },
        { cookie },
      ),
    );
    const Stub = createRoutesStub([
      { id: "request", path: "/g/:groupId/requests/:requestId", Component: RequestPage },
    ]);
    const html = renderToString(
      <Stub
        initialEntries={["/g/x/requests/y"]}
        hydrationData={{ loaderData: { request: data } }}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain(
      `href="${groupPath(group)}/availability?request=${request.id}&amp;window=0" data-discover="true">Check availability for 19:00–22:00</a>`,
    );
  });
});
