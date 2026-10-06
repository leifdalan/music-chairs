import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { parseProposedTimes, PROPOSE_MAX } from "../app/lib/propose";
import RequestPage, {
  action as requestAction,
  loader as requestLoader,
} from "../app/routes/request";
import Schedule, { loader as scheduleLoader } from "../app/routes/schedule";
import {
  deviceCookie,
  ORIGIN,
  requestIn,
  routeArgs,
  setCookies,
  tempDatabase,
  thrownBy,
  addressOf,
  addressFor,
  addSlots,
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
        ["time", "2026-10-08 1140 1320"], // 7–10 PM → 7–9 PM
        ["time", "2026-10-09 1140 1200"], // 7–8 PM → cut to 20:00
        ["time", "2026-10-10 1320 1440"], // 10 PM–12 AM → cut at midnight
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

// Viola (organizer) and Cellist are free Thursdays 7–10 PM and Saturdays
// 10 PM–12 AM, and Fridays 7–8 PM; Pianist never is.
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  store.addMember(group.id, "Pianist", "member");
  for (const member of [organizer, cellist]) {
    addSlots(store, member.id, [
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

function requestPost(
  groupId: string,
  requestId: string,
  cookie: string | undefined,
  fields: [string, string][],
) {
  const request = new Request(new URL(`/g/${addressFor(groupId)}/requests/${requestId}`, ORIGIN), {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body: new URLSearchParams(fields),
  });
  return requestAction({
    request,
    params: { groupAddress: addressFor(groupId), requestId },
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

describe("free times on the schedule page", () => {
  it("shows organizers and members the free times without tick boxes or a propose form", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const html = async (cookie: string) =>
      renderSchedule(
        (await scheduleLoader(
          routeArgs(`${groupPath(group)}/schedule`, { groupAddress: addressOf(group) }, { cookie }),
        )) as ScheduleData,
      );

    const organizer = await html(organizerCookie);
    const member = await html(cellistCookie);

    for (const page of [organizer, member]) {
      expect(page).toContain("When people are free");
      expect(page).toContain("7–10 PM");
      expect(page).not.toContain('name="time"');
      expect(page).not.toContain("Propose selected");
      expect(page).not.toContain("custom-proposal");
    }
    expect(organizer).toContain("To propose rehearsals, open an availability request on the");
    expect(member).not.toContain("To propose times");
  });
});

describe("proposing ticked times on a request's page", () => {
  async function withRequest() {
    const setup = await band();
    // Mondays 6–11 PM are free; the request asks for 7–9 PM.
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
        routeArgs(
          `/g/${addressFor(groupId)}/requests/${requestId}`,
          { groupAddress: addressFor(groupId), requestId },
          { cookie },
        ),
      )) as RequestData,
    );
  }

  it("proposes the clipped free times and returns to the request", async () => {
    const { store, group, organizerCookie, requestId } = await withRequest();
    const html = await page(group.id, requestId, organizerCookie);

    const response = await requestPost(group.id, requestId, organizerCookie, [
      ["intent", "propose-times"],
      ["time", tickFor(html, "Propose Mon 5 Oct, 7–9 PM")],
      ["length", "180"],
      ["location", ""],
    ]);

    expect((response as Response).headers.get("Location")).toBe(
      `${groupPath(group)}/requests/${requestId}`,
    );
    expect(await toastOf(response)).toBe("Rehearsal proposed");
    expect(times(store, group.id)).toEqual(["once 2026-10-05 1140-1260  proposed"]);
    expect(store.listRehearsals(group.id).map((r) => r.requestId)).toEqual([requestId]);
  });

  it("keeps a custom proposal folded under the free times until refused, and links it to the request", async () => {
    const { store, group, organizerCookie, cellistCookie, requestId } = await withRequest();
    const data = () =>
      requestLoader(
        routeArgs(
          `${groupPath(group)}/requests/${requestId}`,
          { groupAddress: addressOf(group), requestId },
          { cookie: organizerCookie },
        ),
      ) as Promise<RequestData>;
    const custom = (startTime: string, endTime: string, location: string) =>
      [
        ["intent", "propose"],
        ["kind", "weekly"],
        ["startDate", "2026-10-06"],
        ["endDate", ""],
        ["startTime", startTime],
        ["endTime", endTime],
        ["location", location],
      ] as [string, string][];

    const folded = renderRequest(await data());
    expect(folded.indexOf("Propose a different time")).toBeGreaterThan(
      folded.indexOf("When people are free"),
    );
    expect(folded).toMatch(/<details class="custom-proposal">/);

    const refused = await requestPost(
      group.id,
      requestId,
      organizerCookie,
      custom("12:00", "10:00", ""),
    );
    expect(statusOf(refused)).toBe(400);
    const withErrors = renderRequest(await data(), (refused as { data: unknown }).data);
    expect(withErrors).toMatch(/<details class="custom-proposal" open="">/);
    expect(withErrors.slice(withErrors.indexOf('class="custom-proposal"'))).toContain(
      'class="field-error"',
    );

    const thrown = await thrownBy(
      requestPost(group.id, requestId, cellistCookie, custom("10:00", "12:00", "Hall")),
    );
    expect(statusOf(thrown)).toBe(403);
    expect(store.listRehearsals(group.id)).toEqual([]);

    const response = await requestPost(
      group.id,
      requestId,
      organizerCookie,
      custom("10:00", "12:00", "Hall"),
    );
    expect((response as Response).headers.get("Location")).toBe(
      `${groupPath(group)}/requests/${requestId}`,
    );
    expect(await toastOf(response)).toBe("Rehearsal proposed");
    expect(times(store, group.id)).toEqual(["weekly 2026-10-06 600-720 Hall proposed"]);
    expect(store.listRehearsals(group.id)[0].requestId).toBe(requestId);
  });

  it("shows a refusal inside the picker on the request page, and starts afresh after a proposal", async () => {
    const { group, organizerCookie, cellistCookie, requestId } = await withRequest();
    const data = (cookie: string) =>
      requestLoader(
        routeArgs(
          `${groupPath(group)}/requests/${requestId}`,
          { groupAddress: addressOf(group), requestId },
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
      ["time", tickFor(renderRequest(await data(organizerCookie)), "Propose Mon 5 Oct, 7–9 PM")],
      ["length", "120"],
    ]);
    expect((await data(organizerCookie)).rehearsalCount).toBe((before ?? 0) + 1);
    expect((await data(cellistCookie)).rehearsalCount).toBeNull();
  });

  it("works from a closed request too, and only for organizers", async () => {
    const { store, group, organizerCookie, cellistCookie, requestId } = await withRequest();
    store.setRequestOpen(group.id, requestId, false);
    const html = await page(group.id, requestId, organizerCookie);
    const tick = tickFor(html, "Propose Mon 12 Oct, 7–9 PM");

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
      store.addRehearsals(
        group.id,
        requestIn(group.id),
        [good, { ...good, kind: "never" as never }],
        "X",
      ),
    ).toThrow();
    expect(store.listRehearsals(group.id)).toEqual([]);
    expect(
      store.addRehearsals(
        group.id,
        requestIn(group.id),
        [good, { ...good, startDate: "2026-10-09" }],
        "X",
      ),
    ).toHaveLength(2);
  });
});
