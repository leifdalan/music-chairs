import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import { parseProposedTimes, PROPOSE_MAX } from "../app/lib/propose";
import RequestPage, {
  action as requestAction,
  loader as requestLoader,
} from "../app/routes/request";
import Schedule, {
  action as scheduleAction,
  loader as scheduleLoader,
} from "../app/routes/schedule";
import { deviceCookie, ORIGIN, routeArgs, setCookies, tempDatabase, thrownBy } from "./routes";

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

type ScheduleData = Awaited<ReturnType<typeof scheduleLoader>>;
type RequestData = Awaited<ReturnType<typeof requestLoader>>;

function formOf(fields: [string, string][]): FormData {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  return form;
}

describe("reading ticked free times", () => {
  const today = "2026-10-02";

  it("starts each at its free time, lasting the chosen length or cut to the free time", () => {
    const parsed = parseProposedTimes(
      formOf([
        ["time", "2026-10-08 1140 1320"], // 19:00–22:00 → 19:00–21:00
        ["time", "2026-10-09 1140 1200"], // 19:00–20:00 → cut to 20:00
        ["time", "2026-10-10 1320 1440"], // 22:00–24:00 → cut at midnight
        ["time", "2026-10-08 1140 1320"], // the same tick again
        ["length", "120"],
      ]),
      today,
    );

    expect(parsed).toEqual({
      ok: true,
      inputs: [
        {
          kind: "once",
          startDate: "2026-10-08",
          endDate: null,
          startMinute: 1140,
          endMinute: 1260,
        },
        {
          kind: "once",
          startDate: "2026-10-09",
          endDate: null,
          startMinute: 1140,
          endMinute: 1200,
        },
        {
          kind: "once",
          startDate: "2026-10-10",
          endDate: null,
          startMinute: 1320,
          endMinute: 1440,
        },
      ],
    });
  });

  it("refuses no ticks, too many, an unknown length, and malformed, past or impossible times", () => {
    const refused = (fields: [string, string][]) => parseProposedTimes(formOf(fields), today).ok;
    const length: [string, string] = ["length", "120"];

    expect(parseProposedTimes(formOf([length]), today)).toEqual({
      ok: false,
      error: "Tick at least one free time.",
    });
    const many = Array.from({ length: PROPOSE_MAX + 1 }, (_, index): [string, string] => [
      "time",
      `2026-10-${String(10 + (index % 18)).padStart(2, "0")} ${index * 15} ${index * 15 + 60}`,
    ]);
    expect(refused([...many, length])).toBe(false);
    for (const value of ["whole", "0", "45", ""]) {
      expect(
        refused([
          ["time", "2026-10-08 1140 1320"],
          ["length", value],
        ]),
      ).toBe(false);
    }
    for (const tick of [
      "2026-10-08",
      "2026-10-08 19:00 22:00",
      "2026-11-31 1140 1320",
      "2026-13-01 1140 1320",
      "2026-10-01 1140 1320",
      "2026-10-08 1141 1320",
      "2026-10-08 1320 1140",
      "2026-10-08 1140 1455",
      "2026-10-08 1140 1320 extra",
    ]) {
      expect(refused([["time", tick], length])).toBe(false);
    }
    expect(refused([["time", "2026-10-02 1140 1320"], length])).toBe(true);
  });
});

// Viola (organizer) and Cellist are free Thursdays 19:00–22:00 and Saturdays
// 22:00–24:00, and Fridays 19:00–20:00; Pianist never is.
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  store.addMember(group.id, "Pianist", "member");
  for (const member of [organizer, cellist]) {
    store.addSlots(member.id, [
      {
        kind: "weekly",
        startDate: "2026-10-01",
        endDate: null,
        startMinute: 1140,
        endMinute: 1320,
      },
      {
        kind: "weekly",
        startDate: "2026-10-02",
        endDate: null,
        startMinute: 1140,
        endMinute: 1200,
      },
      {
        kind: "weekly",
        startDate: "2026-10-03",
        endDate: null,
        startMinute: 1320,
        endMinute: 1440,
      },
      {
        kind: "weekly",
        startDate: "2026-10-05",
        endDate: null,
        startMinute: 1080,
        endMinute: 1380,
      },
    ]);
  }
  return {
    store,
    group,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

function renderSchedule(data: ScheduleData, actionData?: unknown): string {
  const Stub = createRoutesStub([
    { id: "schedule", path: "/g/:groupId/schedule", Component: Schedule },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/g/x/schedule"]}
      hydrationData={{
        loaderData: { schedule: data },
        actionData: actionData ? { schedule: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

function renderRequest(data: RequestData, actionData?: unknown): string {
  const Stub = createRoutesStub([
    { id: "request", path: "/g/:groupId/requests/:requestId", Component: RequestPage },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/g/x/requests/y"]}
      hydrationData={{
        loaderData: { request: data },
        actionData: actionData ? { request: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

/** The picker form's markup, from its opening tag to its closing one. */
function pickerOf(html: string): string {
  const start = html.indexOf('class="propose-times"');
  return start < 0 ? "" : html.slice(start, html.indexOf("</form>", start));
}

/** The value of the tick box whose label names `label`, read from the page. */
function tickFor(html: string, label: string): string {
  for (const input of html.match(/<input type="checkbox"[^>]*>/g) ?? []) {
    if (!input.includes(`aria-label="${label}"`)) continue;
    const value = /value="([^"]+)"/.exec(input)?.[1];
    if (value && input.includes('name="time"')) return value;
  }
  throw new Error(`no tick box for ${label}`);
}

function schedulePost(groupId: string, cookie: string | undefined, fields: [string, string][]) {
  const request = new Request(new URL(`/g/${groupId}/schedule`, ORIGIN), {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: new URLSearchParams(fields),
  });
  return scheduleAction({ request, params: { groupId }, context: {} } as never) as Promise<unknown>;
}

function requestPost(
  groupId: string,
  requestId: string,
  cookie: string | undefined,
  fields: [string, string][],
) {
  const request = new Request(new URL(`/g/${groupId}/requests/${requestId}`, ORIGIN), {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: new URLSearchParams(fields),
  });
  return requestAction({
    request,
    params: { groupId, requestId },
    context: {},
  } as never) as Promise<unknown>;
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

const times = (store: ReturnType<typeof getStore>, groupId: string) =>
  store
    .listRehearsals(groupId)
    .map(
      (r) => `${r.kind} ${r.startDate} ${r.startMinute}-${r.endMinute} ${r.location} ${r.status}`,
    )
    .sort();

describe("proposing ticked times on the schedule page", () => {
  it("proposes every ticked time as shown on the page, with one length and location", async () => {
    const { store, group, organizerCookie } = await band();
    const html = renderSchedule(
      (await scheduleLoader(
        routeArgs(`/g/${group.id}/schedule`, { groupId: group.id }, { cookie: organizerCookie }),
      )) as ScheduleData,
    );

    const response = await schedulePost(group.id, organizerCookie, [
      ["intent", "propose-times"],
      ["time", tickFor(html, "Propose Thu 8 Oct, 19:00–22:00")],
      ["time", tickFor(html, "Propose Fri 9 Oct, 19:00–20:00")],
      ["time", tickFor(html, "Propose Sat 10 Oct, 22:00–24:00")],
      ["length", "120"],
      ["location", " Studio B "],
    ]);

    expect(statusOf(response)).toBe(302);
    expect((response as Response).headers.get("Location")).toBe(`/g/${group.id}/schedule`);
    expect(await toastOf(response)).toBe("3 rehearsals proposed");
    expect(times(store, group.id)).toEqual([
      "once 2026-10-08 1140-1260 Studio B proposed",
      "once 2026-10-09 1140-1200 Studio B proposed",
      "once 2026-10-10 1320-1440 Studio B proposed",
    ]);
  });

  it("refuses inside the picker and proposes nothing", async () => {
    const { store, group, organizerCookie } = await band();

    const refused = await schedulePost(group.id, organizerCookie, [
      ["intent", "propose-times"],
      ["length", "120"],
    ]);

    expect(statusOf(refused)).toBe(400);
    expect(store.listRehearsals(group.id)).toEqual([]);
    const data = (await scheduleLoader(
      routeArgs(`/g/${group.id}/schedule`, { groupId: group.id }, { cookie: organizerCookie }),
    )) as ScheduleData;
    const html = renderSchedule(data, (refused as { data: unknown }).data);
    expect(pickerOf(html)).toContain("Tick at least one free time.");
    expect(html.indexOf("Tick at least one free time.")).toBeGreaterThan(
      html.indexOf("When people are free"),
    );
  });

  it("is for organizers only; members see the free times without tick boxes", async () => {
    const { store, group, cellistCookie } = await band();

    const thrown = await thrownBy(
      schedulePost(group.id, cellistCookie, [
        ["intent", "propose-times"],
        ["time", "2026-10-08 1140 1320"],
        ["length", "120"],
      ]),
    );

    expect(statusOf(thrown)).toBe(403);
    expect(store.listRehearsals(group.id)).toEqual([]);
    const html = renderSchedule(
      (await scheduleLoader(
        routeArgs(`/g/${group.id}/schedule`, { groupId: group.id }, { cookie: cellistCookie }),
      )) as ScheduleData,
    );
    expect(html).toContain("When people are free");
    expect(html).not.toContain('name="time"');
    expect(html).not.toContain("Propose selected");
  });

  it("keeps the custom proposal at the end, folded away until pre-filled, and working", async () => {
    const { store, group, organizerCookie } = await band();
    const load = (search = "") =>
      scheduleLoader(
        routeArgs(
          `/g/${group.id}/schedule${search}`,
          { groupId: group.id },
          { cookie: organizerCookie },
        ),
      ) as Promise<ScheduleData>;

    const folded = renderSchedule(await load());
    expect(folded.indexOf("Override with a custom proposal")).toBeGreaterThan(
      folded.indexOf("When people are free"),
    );
    expect(folded).toMatch(/<details class="custom-proposal">/);
    const opened = renderSchedule(await load("?date=2026-10-15&start=19:30&end=21:00"));
    expect(opened).toMatch(/<details class="custom-proposal" open="">/);

    // A refused custom proposal keeps the disclosure open with its errors showing.
    const refused = await schedulePost(group.id, organizerCookie, [
      ["intent", "propose"],
      ["kind", "weekly"],
      ["startDate", "2026-10-06"],
      ["endDate", ""],
      ["startTime", "12:00"],
      ["endTime", "10:00"],
      ["location", ""],
    ]);
    const withErrors = renderSchedule(await load(), (refused as { data: unknown }).data);
    expect(withErrors).toMatch(/<details class="custom-proposal" open="">/);
    expect(withErrors.slice(withErrors.indexOf('class="custom-proposal"'))).toContain(
      'class="field-error"',
    );

    const response = await schedulePost(group.id, organizerCookie, [
      ["intent", "propose"],
      ["kind", "weekly"],
      ["startDate", "2026-10-06"],
      ["endDate", ""],
      ["startTime", "10:00"],
      ["endTime", "12:00"],
      ["location", "Hall"],
    ]);
    expect(await toastOf(response)).toBe("Rehearsal proposed");
    expect(times(store, group.id)).toEqual(["weekly 2026-10-06 600-720 Hall proposed"]);
  });
});

describe("proposing ticked times on a request's page", () => {
  async function withRequest() {
    const setup = await band();
    // Mondays 18:00–23:00 are free; the request asks for 19:00–21:00.
    const scheduleRequest = setup.store.createRequest(setup.group.id, {
      name: "November concert",
      startDate: "2026-10-05",
      endDate: "2026-10-12",
      windows: [{ startMinute: 1140, endMinute: 1260 }],
    });
    return { ...setup, requestId: scheduleRequest.id };
  }

  async function page(groupId: string, requestId: string, cookie: string) {
    return renderRequest(
      (await requestLoader(
        routeArgs(`/g/${groupId}/requests/${requestId}`, { groupId, requestId }, { cookie }),
      )) as RequestData,
    );
  }

  it("proposes the clipped free times and returns to the request", async () => {
    const { store, group, organizerCookie, requestId } = await withRequest();
    const html = await page(group.id, requestId, organizerCookie);

    const response = await requestPost(group.id, requestId, organizerCookie, [
      ["intent", "propose-times"],
      ["time", tickFor(html, "Propose Mon 5 Oct, 19:00–21:00")],
      ["length", "180"],
      ["location", ""],
    ]);

    expect((response as Response).headers.get("Location")).toBe(
      `/g/${group.id}/requests/${requestId}`,
    );
    expect(await toastOf(response)).toBe("Rehearsal proposed");
    expect(times(store, group.id)).toEqual(["once 2026-10-05 1140-1260  proposed"]);
  });

  it("shows a refusal inside the picker on the request page, and starts afresh after a proposal", async () => {
    const { group, organizerCookie, cellistCookie, requestId } = await withRequest();
    const data = (cookie: string) =>
      requestLoader(
        routeArgs(
          `/g/${group.id}/requests/${requestId}`,
          { groupId: group.id, requestId },
          { cookie },
        ),
      ) as Promise<RequestData>;

    const refused = await requestPost(group.id, requestId, organizerCookie, [
      ["intent", "propose-times"],
      ["length", "120"],
      ["location", "x".repeat(121)],
    ]);
    expect(statusOf(refused)).toBe(400);
    const html = renderRequest(await data(organizerCookie), (refused as { data: unknown }).data);
    expect(pickerOf(html)).toContain("Location must be at most 120 characters.");

    // The picker's reset key moves with each proposal, and members get none.
    const before = (await data(organizerCookie)).rehearsalCount;
    await requestPost(group.id, requestId, organizerCookie, [
      ["intent", "propose-times"],
      [
        "time",
        tickFor(renderRequest(await data(organizerCookie)), "Propose Mon 5 Oct, 19:00–21:00"),
      ],
      ["length", "120"],
    ]);
    expect((await data(organizerCookie)).rehearsalCount).toBe((before ?? 0) + 1);
    expect((await data(cellistCookie)).rehearsalCount).toBeNull();
  });

  it("works from a closed request too, and only for organizers", async () => {
    const { store, group, organizerCookie, cellistCookie, requestId } = await withRequest();
    store.setRequestOpen(group.id, requestId, false);
    const html = await page(group.id, requestId, organizerCookie);
    const tick = tickFor(html, "Propose Mon 12 Oct, 19:00–21:00");

    const thrown = await thrownBy(
      requestPost(group.id, requestId, cellistCookie, [
        ["intent", "propose-times"],
        ["time", tick],
        ["length", "120"],
      ]),
    );
    expect(statusOf(thrown)).toBe(403);
    expect(store.listRehearsals(group.id)).toEqual([]);

    await requestPost(group.id, requestId, organizerCookie, [
      ["intent", "propose-times"],
      ["time", tick],
      ["length", "120"],
    ]);
    expect(times(store, group.id)).toEqual(["once 2026-10-12 1140-1260  proposed"]);
  });
});

describe("adding several rehearsals in the store", () => {
  it("adds all or none", () => {
    const store = getStore();
    const { group } = store.createGroup("Duo", "A", "Europe/London");
    const good = {
      kind: "once" as const,
      startDate: "2026-10-08",
      endDate: null,
      startMinute: 600,
      endMinute: 660,
    };

    expect(() =>
      store.addRehearsals(group.id, [good, { ...good, kind: "never" as never }], "X"),
    ).toThrow();
    expect(store.listRehearsals(group.id)).toEqual([]);
    expect(
      store.addRehearsals(group.id, [good, { ...good, startDate: "2026-10-09" }], "X"),
    ).toHaveLength(2);
  });
});
