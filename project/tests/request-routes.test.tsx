import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import Availability, {
  action as availabilityAction,
  loader as availabilityLoader,
} from "../app/routes/availability";
import GroupPage, { loader as groupLoader } from "../app/routes/group";
import RequestPage, { action, loader } from "../app/routes/request";
import RequestForm, {
  action as formAction,
  loader as formLoader,
} from "../app/routes/requests.new";
import {
  deviceCookie,
  ORIGIN,
  routeArgs,
  setCookies,
  tempDatabase,
  thrownBy,
  addressOf,
  addressFor,
  selectedOption,
} from "./routes";

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

type RequestData = Awaited<ReturnType<typeof loader>>;
type FormData_ = Awaited<ReturnType<typeof formLoader>>;
type GroupData = Awaited<ReturnType<typeof groupLoader>>;
type AvailabilityData = Awaited<ReturnType<typeof availabilityLoader>>;

/** Viola (organizer), Cellist and Pianist; Viola and Cellist are free Mondays 6–11 PM. */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  const mondays = {
    kind: "weekly" as const,
    startDate: "2026-10-05",
    endDate: null,
    startMinute: 18 * 60,
    endMinute: 23 * 60,
  };
  store.addSlot(organizer.id, mondays);
  store.addSlot(cellist.id, mondays);
  return {
    group,
    organizer,
    cellist,
    pianist,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
    pianistCookie: await deviceCookie(group.id, pianist.deviceToken),
  };
}

const november = {
  name: "November concert",
  startDate: "2026-11-02",
  endDate: "2026-11-29",
  "windowStart-0": "19:00",
  "windowEnd-0": "22:00",
  "windowStart-1": "10:00",
  "windowEnd-1": "13:00",
};

function newForm(groupId: string, cookie: string | undefined, form: Record<string, string>) {
  return formAction(
    routeArgs(
      `/g/${addressFor(groupId)}/requests/new`,
      { groupAddress: addressFor(groupId) },
      { cookie, form },
    ),
  ) as Promise<unknown>;
}

function loadForm(groupId: string, cookie: string | undefined, search = "") {
  return formLoader(
    routeArgs(
      `/g/${addressFor(groupId)}/requests/new${search}`,
      { groupAddress: addressFor(groupId) },
      { cookie },
    ),
  ) as Promise<FormData_>;
}

function load(groupId: string, requestId: string, cookie?: string) {
  return loader(
    routeArgs(
      `/g/${addressFor(groupId)}/requests/${requestId}`,
      { groupAddress: addressFor(groupId), requestId },
      { cookie },
    ),
  ) as Promise<RequestData>;
}

function post(
  groupId: string,
  requestId: string,
  cookie: string | undefined,
  form: Record<string, string>,
) {
  return action(
    routeArgs(
      `/g/${addressFor(groupId)}/requests/${requestId}`,
      { groupAddress: addressFor(groupId), requestId },
      { cookie, form },
    ),
  ) as Promise<unknown>;
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

/** The toast message a redirect leaves, read the way the root loader reads it. */
async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

function render(data: RequestData): string {
  const Stub = createRoutesStub([
    { id: "request", path: "/g/:groupId/requests/:requestId", Component: RequestPage },
  ]);
  return renderToString(
    <Stub initialEntries={["/g/x/requests/y"]} hydrationData={{ loaderData: { request: data } }} />,
  ).replaceAll("<!-- -->", "");
}

function renderForm(data: FormData_, actionData?: unknown): string {
  const Stub = createRoutesStub([
    { id: "form", path: "/g/:groupId/requests/new", Component: RequestForm },
  ]);
  return renderToString(
    <Stub
      initialEntries={["/g/x/requests/new"]}
      hydrationData={{
        loaderData: { form: data },
        actionData: actionData ? { form: actionData } : undefined,
      }}
    />,
  ).replaceAll("<!-- -->", "");
}

function renderGroup(data: GroupData): string {
  const Stub = createRoutesStub([{ id: "group", path: "/g/:groupId", Component: GroupPage }]);
  return renderToString(
    <Stub initialEntries={["/g/x"]} hydrationData={{ loaderData: { group: data } }} />,
  ).replaceAll("<!-- -->", "");
}

function renderAvailability(data: AvailabilityData): string {
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

/** Creates `november` as the organizer and returns its id. */
async function created(groupId: string, cookie: string, form = november): Promise<string> {
  const response = (await newForm(groupId, cookie, form)) as Response;
  const location = response.headers.get("Location") ?? "";
  const id = location.split("/").at(-1) ?? "";
  expect(location).toBe(`/g/${addressFor(groupId)}/requests/${id}`);
  return id;
}

describe("creating and editing requests", () => {
  it("creates two open requests, each confirmed with a toast", async () => {
    const { group, organizerCookie } = await band();
    const before = count("requests");

    const first = await newForm(group.id, organizerCookie, november);
    await newForm(group.id, organizerCookie, {
      name: "Weekly rehearsals",
      startDate: "2026-10-05",
      endDate: "2026-11-29",
      "windowStart-0": "18:00",
      "windowEnd-0": "21:00",
    });

    expect(await toastOf(first)).toBe("Request created");
    expect(count("requests")).toBe(before + 2);
    expect(getStore().listRequests(group.id)).toEqual([
      expect.objectContaining({ name: "Weekly rehearsals", open: true }),
      expect.objectContaining({
        name: "November concert",
        windows: [
          { startMinute: 600, endMinute: 780 },
          { startMinute: 1140, endMinute: 1320 },
        ],
      }),
    ]);
  });

  it("saves when Enter is pressed: a post with no intent saves", async () => {
    const { group, organizerCookie } = await band();
    const id = await created(group.id, organizerCookie, november);

    expect(getStore().findRequest(group.id, id)?.name).toBe("November concert");
    const html = renderForm(await loadForm(group.id, organizerCookie));
    // The first submit button in the form is the hidden Save.
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('value="save"');
  });

  it("adds a window row on request, keeping everything typed, and saves nothing", async () => {
    const { group, organizerCookie } = await band();
    const before = count("requests");

    const result = (await newForm(group.id, organizerCookie, {
      ...november,
      intent: "add-window",
    })) as { values: { name: string; windows: unknown[] }; extraRow: boolean };

    expect(count("requests")).toBe(before);
    expect(result.extraRow).toBe(true);
    expect(result.values.name).toBe("November concert");
    const html = renderForm(await loadForm(group.id, organizerCookie), result);
    expect(html).toContain('name="windowStart-2"');
    expect(html).not.toContain('name="windowStart-3"');
    expect(selectedOption(html, "windowStart-1")).toBe("10:00");
    expect(html).toMatch(/name="name"[^>]*value="November concert"/);
  });

  it("keeps every row sent back with errors, including one after blank rows", async () => {
    const { group, organizerCookie } = await band();

    const result = (await newForm(group.id, organizerCookie, {
      name: "",
      startDate: "2026-11-02",
      endDate: "2026-11-29",
      "windowStart-0": "19:00",
      "windowEnd-0": "22:00",
      "windowStart-1": "",
      "windowEnd-1": "",
      "windowStart-2": "",
      "windowEnd-2": "",
      "windowStart-3": "22:00",
      "windowEnd-3": "21:00",
    })) as { data: unknown };

    const html = renderForm(await loadForm(group.id, organizerCookie), result.data);
    expect(selectedOption(html, "windowStart-3")).toBe("22:00");
    expect(html).toContain("The end must be after the start.");
    expect(html).not.toContain('name="windowStart-4"');
    // Rows open: the first empty one (row 1) and the one with an error (row 3).
    const rows = [...html.matchAll(/<details class="window-row"( open="")?>/g)].map((match) =>
      Boolean(match[1]),
    );
    expect(rows).toEqual([false, true, false, true]);
    // The error marks both of row 3's fields and names the row in their labels.
    expect(html).toMatch(
      /name="windowStart-3"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*name="windowStart-3"/,
    );
    expect(html).toContain("Time 4: from");
    expect(html).toContain("Time 4: until");
  });

  it("shows the organizer's mistakes and creates nothing", async () => {
    const { group, organizerCookie } = await band();
    const before = count("requests");

    const result = await newForm(group.id, organizerCookie, {
      ...november,
      startDate: "2026-10-01",
      "windowStart-0": "",
      "windowEnd-0": "",
      "windowStart-1": "",
      "windowEnd-1": "",
    });

    expect(statusOf(result)).toBe(400);
    expect(count("requests")).toBe(before);
    expect((result as { data: { errors: unknown } }).data.errors).toEqual({
      startDate: "The first date can't be in the past.",
      windows: "Add at least one time of day.",
    });
  });

  it("edits a request, keeping a start that has passed but refusing a new past start", async () => {
    const { group, organizerCookie } = await band();
    const id = await created(group.id, organizerCookie, november);
    // The request started yesterday.
    getStore().updateRequest(group.id, id, {
      ...getStore().findRequest(group.id, id)!,
      startDate: "2026-10-01",
    });

    const editPage = await loadForm(group.id, organizerCookie, `?edit=${id}`);
    expect(editPage.values).toMatchObject({ name: "November concert", startDate: "2026-10-01" });

    const kept = await newForm(group.id, organizerCookie, {
      ...november,
      requestId: id,
      name: "Concert",
      startDate: "2026-10-01",
      "windowStart-1": "",
      "windowEnd-1": "",
    });
    expect(await toastOf(kept)).toBe("Request updated");
    expect(getStore().findRequest(group.id, id)).toMatchObject({
      name: "Concert",
      startDate: "2026-10-01",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });

    const moved = await newForm(group.id, organizerCookie, {
      ...november,
      requestId: id,
      startDate: "2026-09-30",
    });
    expect(statusOf(moved)).toBe(400);
    expect(getStore().findRequest(group.id, id)?.startDate).toBe("2026-10-01");
  });

  it("refuses to edit a closed request until it is reopened", async () => {
    const { group, organizerCookie } = await band();
    const id = await created(group.id, organizerCookie, november);
    expect(
      await toastOf(await post(group.id, id, organizerCookie, { intent: "close", confirmed: "1" })),
    ).toBe("Request closed");

    const refused = await newForm(group.id, organizerCookie, {
      ...november,
      requestId: id,
      name: "X",
    });
    expect(statusOf(refused)).toBe(400);
    expect(getStore().findRequest(group.id, id)?.name).toBe("November concert");
    expect(renderForm(await loadForm(group.id, organizerCookie, `?edit=${id}`))).toContain(
      "This request is closed.",
    );

    expect(await toastOf(await post(group.id, id, organizerCookie, { intent: "reopen" }))).toBe(
      "Request reopened",
    );
    await newForm(group.id, organizerCookie, { ...november, requestId: id, name: "X" });
    expect(getStore().findRequest(group.id, id)?.name).toBe("X");
  });

  it("pre-fills a repeat with the name, windows and the following span, creating nothing", async () => {
    const { group, organizerCookie } = await band();
    const id = await created(group.id, organizerCookie, november);
    const before = count("requests");

    const page = await loadForm(group.id, organizerCookie, `?repeat=${id}`);

    expect(count("requests")).toBe(before);
    expect(page.editing).toBeNull();
    expect(page.values).toEqual({
      name: "November concert",
      startDate: "2026-11-30",
      endDate: "2026-12-27",
      windows: [
        { start: "10:00", end: "13:00" },
        { start: "19:00", end: "22:00" },
      ],
    });
    expect(renderForm(page)).not.toContain('name="requestId"');
  });

  it("keeps the form and its actions to organizers of this group", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const other = await band();
    const id = await created(group.id, organizerCookie, november);
    const before = count("requests");

    expect(statusOf(await thrownBy(loadForm(group.id, cellistCookie)))).toBe(403);
    expect(statusOf(await thrownBy(newForm(group.id, cellistCookie, november)))).toBe(403);
    expect(
      statusOf(
        await thrownBy(post(group.id, id, cellistCookie, { intent: "close", confirmed: "1" })),
      ),
    ).toBe(403);
    expect((await thrownBy(loadForm(group.id, undefined))) as Response).toHaveProperty(
      "status",
      302,
    );
    // Another group's request id is unknown here.
    expect(
      statusOf(await thrownBy(loadForm(other.group.id, other.organizerCookie, `?edit=${id}`))),
    ).toBe(404);
    expect(
      statusOf(
        await thrownBy(
          newForm(other.group.id, other.organizerCookie, { ...november, requestId: id }),
        ),
      ),
    ).toBe(404);
    expect(statusOf(await thrownBy(load(other.group.id, id, other.organizerCookie)))).toBe(404);
    expect(count("requests")).toBe(before);
    expect(getStore().findRequest(group.id, id)?.open).toBe(true);
  });
});

describe("answering a request", () => {
  it("lets a member answer with a limit and update it; the organizer sees it", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const concert = await created(group.id, organizerCookie, november);
    const weekly = await created(group.id, organizerCookie, {
      ...november,
      name: "Weekly rehearsals",
    });

    const sent = await post(group.id, concert, cellistCookie, {
      intent: "answer",
      limit: "most",
      limitCount: "2",
    });
    expect(await toastOf(sent)).toBe("Answer sent");

    const asCellist = await load(group.id, concert, cellistCookie);
    expect(asCellist.mine).toEqual({ answeredAt: "Fri 2 Oct, 1 PM", limit: 2 });
    expect(render(asCellist)).toContain("Update my answer");

    const asOrganizer = await load(group.id, concert, organizerCookie);
    expect(asOrganizer.answers).toEqual([
      { name: "Viola", answer: null },
      { name: "Cellist", answer: { answeredAt: "Fri 2 Oct, 1 PM", limit: 2 } },
      { name: "Pianist", answer: null },
    ]);
    const html = render(asOrganizer);
    expect(html).toContain("No more than 2");
    expect(html).toContain("Answers (1 of 3)");
    expect((await load(group.id, weekly, organizerCookie)).answers?.[1].answer).toBeNull();

    const updated = await post(group.id, concert, cellistCookie, {
      intent: "answer",
      limit: "any",
    });
    expect(await toastOf(updated)).toBe("Answer updated");
    expect((await load(group.id, concert, organizerCookie)).answers?.[1].answer?.limit).toBeNull();
  });

  it("refuses a limit outside 1 to 99", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const id = await created(group.id, organizerCookie, november);
    const before = count("request_answers");

    for (const limitCount of ["0", "100", "2.5", ""]) {
      const result = await post(group.id, id, cellistCookie, {
        intent: "answer",
        limit: "most",
        limitCount,
      });
      expect(statusOf(result)).toBe(400);
    }
    expect(count("request_answers")).toBe(before);
    await post(group.id, id, cellistCookie, { intent: "answer", limit: "most", limitCount: "99" });
    expect((await load(group.id, id, cellistCookie)).mine?.limit).toBe(99);
  });

  it("gives a member only their own answer, never anyone else's name, time or limit", async () => {
    const { group, organizerCookie, cellistCookie, pianistCookie } = await band();
    const id = await created(group.id, organizerCookie, november);
    await post(group.id, id, cellistCookie, { intent: "answer", limit: "most", limitCount: "37" });

    const asPianist = await load(group.id, id, pianistCookie);

    expect(asPianist.mine).toBeNull();
    expect(asPianist.answers).toBeNull();
    expect(asPianist.overlap).toBeNull();
    for (const text of [JSON.stringify(asPianist), render(asPianist)]) {
      expect(text).not.toContain("Cellist");
      expect(text).not.toContain("Viola");
      expect(text).not.toContain("Fri 2 Oct, 1 PM");
      expect(text).not.toMatch(/\b37\b/);
    }
  });

  it("shows the organizer the overlap clipped to the request's windows, ready to tick", async () => {
    const { group, organizerCookie } = await band();
    const id = await created(group.id, organizerCookie, november);

    const page = await load(group.id, id, organizerCookie);

    // Mondays 6–11 PM, clipped to 7–10 PM; nobody is free 10 AM–1 PM.
    expect(page.overlap?.map((day) => day.date)).toEqual([
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
    ]);
    expect(page.overlap?.[0].stretches).toEqual([
      {
        startMinute: 1140,
        endMinute: 1320,
        freeCount: 2,
        freeNames: expect.arrayContaining(["Viola", "Cellist"]),
      },
    ]);
    expect(render(page)).toContain('name="time" value="2026-11-02 1140 1320"');
    expect(render(page)).not.toContain("#propose-heading");
  });

  it("refuses answers to a closed or ended request and hides its Add links", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const closed = await created(group.id, organizerCookie, november);
    await post(group.id, closed, organizerCookie, { intent: "close", confirmed: "1" });
    const ended = getStore().createRequest(group.id, {
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    }).id;
    const before = count("request_answers");

    for (const id of [closed, ended]) {
      const result = await post(group.id, id, cellistCookie, { intent: "answer", limit: "any" });
      expect(statusOf(result)).toBe(400);
      const page = await load(group.id, id, cellistCookie);
      expect(page.canAnswer).toBe(false);
      expect(render(page)).not.toContain("availability?request=");
      expect(render(page)).toContain("no longer taking answers");
    }
    expect(count("request_answers")).toBe(before);
    expect(render(await load(group.id, ended, organizerCookie))).toContain("Repeat request");
  });
});

describe("requests on the group page", () => {
  it("lists open requests for members with their own answered state", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const concert = await created(group.id, organizerCookie, november);
    await created(group.id, organizerCookie, { ...november, name: "Weekly rehearsals" });
    await post(group.id, concert, cellistCookie, { intent: "answer", limit: "any" });

    const asCellist = (await groupLoader(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie: cellistCookie }),
    )) as GroupData;

    expect(asCellist.requests?.map((item) => [item.name, item.answered, item.answerCount])).toEqual(
      [
        ["Weekly rehearsals", false, null],
        ["November concert", true, null],
      ],
    );
    expect(asCellist.memberCount).toBeNull();
    const html = renderGroup(asCellist);
    expect(html).toContain("Not answered yet");
    expect(html).not.toContain("New request");

    const asOrganizer = (await groupLoader(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie: organizerCookie }),
    )) as GroupData;
    expect(renderGroup(asOrganizer)).toContain("1 of 3 answered");
    expect(renderGroup(asOrganizer)).toContain("New request");
  });

  it("gives visitors no requests at all", async () => {
    const { group, organizerCookie } = await band();
    await created(group.id, organizerCookie, november);

    const asVisitor = (await groupLoader(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }),
    )) as GroupData;

    expect(asVisitor.requests).toBeNull();
    expect(JSON.stringify(asVisitor)).not.toContain("November concert");
    expect(renderGroup(asVisitor)).not.toContain("November concert");
  });

  it("lists past and closed requests for organizers, with Repeat", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    const closed = await created(group.id, organizerCookie, november);
    await post(group.id, closed, organizerCookie, { intent: "close", confirmed: "1" });

    const asOrganizer = (await groupLoader(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie: organizerCookie }),
    )) as GroupData;
    const asCellist = (await groupLoader(
      routeArgs(groupPath(group), { groupAddress: addressOf(group) }, { cookie: cellistCookie }),
    )) as GroupData;

    expect(renderGroup(asOrganizer)).toContain(`requests/new?repeat=${closed}`);
    expect(asCellist.requests).toEqual([]);
    expect(renderGroup(asCellist)).not.toContain("November concert");
  });
});

describe("adding availability from a request", () => {
  function loadAvailability(groupId: string, cookie: string, search: string) {
    return availabilityLoader(
      routeArgs(
        `/g/${addressFor(groupId)}/availability${search}`,
        { groupAddress: addressFor(groupId) },
        { cookie },
      ),
    ) as Promise<AvailabilityData>;
  }

  function save(groupId: string, cookie: string, form: Record<string, string>) {
    return availabilityAction(
      routeArgs(
        `/g/${addressFor(groupId)}/availability`,
        { groupAddress: addressFor(groupId) },
        { cookie, form },
      ),
    ) as Promise<unknown>;
  }

  it("pre-fills a weekly time over the span at the window, then returns to the request", async () => {
    const { group, organizerCookie, pianistCookie } = await band();
    const id = await created(group.id, organizerCookie, november);

    const page = await loadAvailability(group.id, pianistCookie, `?request=${id}&window=1`);

    expect(page.fromRequest?.values).toEqual({
      kind: "weekly",
      startDate: "2026-11-02",
      endDate: "2026-11-29",
      startTime: "19:00",
      endTime: "22:00",
    });
    const html = renderAvailability(page);
    expect(html).toContain(`name="request" value="${id}"`);
    expect(html).toContain("November concert");

    const saved = (await save(group.id, pianistCookie, {
      intent: "create",
      request: id,
      ...page.fromRequest!.values,
    })) as Response;
    expect(saved.headers.get("Location")).toBe(`${groupPath(group)}/requests/${id}`);
    expect(await toastOf(saved)).toBe("Availability saved");
    expect((await load(group.id, id, pianistCookie)).myTimes).toHaveLength(4);
  });

  it("ignores another group's, an unknown or a closed request, returning to availability", async () => {
    const { group, organizerCookie, pianistCookie } = await band();
    const other = await band();
    const foreign = await created(other.group.id, other.organizerCookie, november);
    const closed = await created(group.id, organizerCookie, november);
    await post(group.id, closed, organizerCookie, { intent: "close", confirmed: "1" });
    const ended = getStore().createRequest(group.id, {
      name: "September",
      startDate: "2026-09-01",
      endDate: "2026-10-01",
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    }).id;

    for (const id of [foreign, closed, ended, "unknown"]) {
      const page = await loadAvailability(group.id, pianistCookie, `?request=${id}&window=0`);
      expect(page.fromRequest).toBeNull();
      const saved = (await save(group.id, pianistCookie, {
        intent: "create",
        request: id,
        kind: "once",
        startDate: "2026-11-03",
        endDate: "",
        startTime: "19:00",
        endTime: "20:00",
      })) as Response;
      expect(saved.headers.get("Location")).toBe(`${groupPath(group)}/availability`);
    }
    const open = await created(group.id, organizerCookie, november);
    // A window the request doesn't have: the request's calendar, with no window chosen.
    const noWindow = (await loadAvailability(group.id, pianistCookie, `?request=${open}&window=5`))
      .fromRequest;
    expect(noWindow).toMatchObject({ id: open, window: null, values: null });
  });

  it("sends delete and skip back to availability even with a request named", async () => {
    const { group, organizerCookie, cellist, cellistCookie } = await band();
    const id = await created(group.id, organizerCookie, november);
    const [slot] = getStore().listSlots(cellist.id);

    const skipped = (await save(group.id, cellistCookie, {
      intent: "skip",
      slotId: slot.id,
      date: "2026-10-05",
      request: id,
    })) as Response;
    const unskipped = (await save(group.id, cellistCookie, {
      intent: "unskip",
      slotId: slot.id,
      date: "2026-10-05",
      request: id,
    })) as Response;
    const deleted = (await save(group.id, cellistCookie, {
      intent: "delete",
      confirmed: "1",
      slotId: slot.id,
      request: id,
    })) as Response;

    expect(skipped.headers.get("Location")).toBe(`${groupPath(group)}/availability`);
    expect(unskipped.headers.get("Location")).toBe(`${groupPath(group)}/availability`);
    expect(deleted.headers.get("Location")).toBe(`${groupPath(group)}/availability`);
  });
});
