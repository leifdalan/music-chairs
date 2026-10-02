import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getStore } from "../app/.server/store";
import Schedule, { action, loader } from "../app/routes/schedule";
import { deviceCookie, routeArgs, tempDatabase, thrownBy } from "./routes";

const count = tempDatabase();

// 2026-10-02 (a Friday) in Europe/London; the overlap window runs to 2026-11-26.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

type ScheduleData = Awaited<ReturnType<typeof loader>>;

const thursdays = {
  kind: "weekly" as const,
  startDate: "2026-10-01",
  endDate: null,
  startMinute: 19 * 60,
  endMinute: 22 * 60,
};

/** Viola (organizer) and Cellist are free Thursdays 19:00–22:00; Pianist never is. */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const pianist = store.addMember(group.id, "Pianist", "member");
  store.addSlot(organizer.id, thursdays);
  store.addSlot(cellist.id, thursdays);
  return {
    group,
    organizer,
    cellist,
    pianist,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

function load(groupId: string, cookie?: string, search = "") {
  const path = `/g/${groupId}/schedule${search}`;
  return loader(routeArgs(path, { groupId }, { cookie })) as Promise<ScheduleData>;
}

function post(groupId: string, cookie: string | undefined, form: Record<string, string>) {
  return action(routeArgs(`/g/${groupId}/schedule`, { groupId }, { cookie, form }));
}

function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as { init?: ResponseInit | null }).init?.status;
}

const nextThursday = {
  intent: "propose",
  kind: "once",
  startDate: "2026-10-08",
  endDate: "",
  startTime: "19:30",
  endTime: "21:30",
  location: "Studio B",
};

function render(data: ScheduleData): string {
  const Stub = createRoutesStub([
    { id: "schedule", path: "/g/:groupId/schedule", Component: Schedule },
  ]);
  return renderToString(
    <Stub initialEntries={["/g/x/schedule"]} hydrationData={{ loaderData: { schedule: data } }} />,
  ).replaceAll("<!-- -->", "");
}

describe("schedule route", () => {
  it("sends visitors to the group page and 404s unknown groups", async () => {
    const { group } = await band();

    const visitor = await thrownBy(load(group.id));
    const unknown = await thrownBy(load("A".repeat(22)));

    expect((visitor as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    expect(statusOf(unknown)).toBe(404);
  });

  it("shows members only counts by default, with no other member's name or id", async () => {
    const { group, organizer, pianist, cellistCookie } = await band();

    const page = await load(group.id, cellistCookie);

    const thursday = page.days.find((day) => day.date === "2026-10-08");
    expect(thursday?.stretches).toEqual([
      {
        startMinute: 1140,
        endMinute: 1320,
        freeCount: 2,
        memberCount: 3,
        everyoneNeeded: false,
        freeNames: null,
        missing: null,
      },
    ]);
    const visible = JSON.stringify(page) + render(page);
    for (const hidden of ["Viola", "Pianist", organizer.id, pianist.id, organizer.deviceToken]) {
      expect(visible).not.toContain(hidden);
    }
    expect(render(page)).not.toContain("Propose a rehearsal");
    expect(render(page)).not.toContain("Propose this time");
  });

  it("shows members names once the organizer turns them on", async () => {
    const { group, cellistCookie } = await band();
    getStore().setShowNames(group.id, true);

    const page = await load(group.id, cellistCookie);

    const names = page.days.find((day) => day.date === "2026-10-08")?.stretches[0].freeNames;
    expect([...(names ?? [])].sort()).toEqual(["Cellist", "Viola"]);
  });

  it("shows organizers who is free and who is missing, marking optional members", async () => {
    const { group, pianist, organizerCookie } = await band();
    getStore().setOptional(group.id, pianist.id, true);

    const page = await load(group.id, organizerCookie);

    const stretch = page.days.find((day) => day.date === "2026-10-08")?.stretches[0];
    expect(stretch).toMatchObject({ everyoneNeeded: true });
    expect([...(stretch?.freeNames ?? [])].sort()).toEqual(["Cellist", "Viola"]);
    expect(stretch?.missing).toEqual([{ name: "Pianist", optional: true }]);
    expect(render(page)).toContain("Propose this time");
    expect(render(page)).toContain('aria-label="Propose Thu 8 Oct, 19:00–22:00"');
  });

  it("warns when a non-optional member is missing, and still lets the organizer confirm", async () => {
    const { group, pianist, organizerCookie } = await band();

    const proposed = await post(group.id, organizerCookie, nextThursday);
    const [rehearsal] = getStore().listRehearsals(group.id);
    const beforeConfirm = await load(group.id, organizerCookie);
    const confirmed = await post(group.id, organizerCookie, {
      intent: "confirm",
      rehearsalId: rehearsal.id,
    });
    const afterConfirm = await load(group.id, organizerCookie);

    expect(statusOf(proposed)).toBe(302);
    expect(beforeConfirm.rehearsals[0]).toMatchObject({
      status: "proposed",
      location: "Studio B",
      organizer: { warnings: [{ date: "2026-10-08", missing: ["Pianist"] }] },
    });
    expect(statusOf(confirmed)).toBe(302);
    expect(afterConfirm.rehearsals[0]).toMatchObject({
      status: "confirmed",
      organizer: { warnings: [{ date: "2026-10-08", missing: ["Pianist"] }] },
    });
    expect(render(afterConfirm)).toContain("Thu 8 Oct: Pianist isn&#x27;t free");

    getStore().setOptional(group.id, pianist.id, true);
    const optional = await load(group.id, organizerCookie);
    expect(optional.rehearsals[0].organizer?.warnings).toEqual([]);
  });

  it("shows members proposed and confirmed rehearsals without warnings or ids", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    await post(group.id, organizerCookie, nextThursday);

    const page = await load(group.id, cellistCookie);

    expect(page.rehearsals).toEqual([
      {
        kind: "once",
        status: "proposed",
        location: "Studio B",
        summary: "Thu 8 Oct, 19:30–21:30",
        upcoming: ["2026-10-08"],
        organizer: null,
      },
    ]);
  });

  it("checks a one-off rehearsal beyond the overlap window", async () => {
    const { group, organizerCookie } = await band();

    await post(group.id, organizerCookie, { ...nextThursday, startDate: "2026-12-31" });
    const page = await load(group.id, organizerCookie);

    expect(page.rehearsals[0].organizer?.warnings).toEqual([
      { date: "2026-12-31", missing: ["Pianist"] },
    ]);
  });

  it("cancels a date of a weekly rehearsal, ends it, and labels unchecked later dates", async () => {
    const { group, organizerCookie } = await band();
    await post(group.id, organizerCookie, {
      ...nextThursday,
      kind: "weekly",
      startDate: "2026-10-08",
    });
    const [rehearsal] = getStore().listRehearsals(group.id);

    const open = await load(group.id, organizerCookie);
    await post(group.id, organizerCookie, {
      intent: "cancel-date",
      rehearsalId: rehearsal.id,
      date: "2026-10-15",
    });
    const wrongDay = await post(group.id, organizerCookie, {
      intent: "cancel-date",
      rehearsalId: rehearsal.id,
      date: "2026-10-16",
    });
    const ended = await post(group.id, organizerCookie, {
      intent: "end",
      rehearsalId: rehearsal.id,
      endDate: "2026-10-29",
    });
    const page = await load(group.id, organizerCookie);

    expect(open.rehearsals[0].organizer?.uncheckedAfter).toBe("2026-11-26");
    expect(statusOf(wrongDay)).toBe(400);
    expect(statusOf(ended)).toBe(302);
    expect(page.rehearsals[0].upcoming).toEqual(["2026-10-08", "2026-10-22", "2026-10-29"]);
    expect(page.rehearsals[0].organizer?.uncheckedAfter).toBeNull();
  });

  it("deletes a rehearsal and its cancellations", async () => {
    const { group, organizerCookie } = await band();
    await post(group.id, organizerCookie, { ...nextThursday, kind: "weekly" });
    const [rehearsal] = getStore().listRehearsals(group.id);
    await post(group.id, organizerCookie, {
      intent: "cancel-date",
      rehearsalId: rehearsal.id,
      date: "2026-10-15",
    });
    const rows = [count("rehearsals"), count("rehearsal_cancellations")];

    await post(group.id, organizerCookie, { intent: "delete", rehearsalId: rehearsal.id });

    expect([count("rehearsals"), count("rehearsal_cancellations")]).toEqual([
      rows[0] - 1,
      rows[1] - 1,
    ]);
  });

  it.each([
    [{ startDate: "2026-10-01" }, { startDate: "Pick today or a later date." }],
    [{ endTime: "19:00" }, { endTime: "End time must be after the start time." }],
    [{ location: "x".repeat(121) }, { location: "Location must be at most 120 characters." }],
  ])("refuses a proposal with %j and stores nothing", async (change, errors) => {
    const { group, organizerCookie } = await band();
    const before = count("rehearsals");

    const result = await post(group.id, organizerCookie, { ...nextThursday, ...change });

    expect(statusOf(result)).toBe(400);
    expect((result as { data: { errors: object } }).data.errors).toEqual(errors);
    expect(count("rehearsals")).toBe(before);
  });

  it("lets only organizers propose, confirm, cancel, end or delete", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    await post(group.id, organizerCookie, { ...nextThursday, kind: "weekly" });
    const [rehearsal] = getStore().listRehearsals(group.id);
    await post(group.id, organizerCookie, {
      intent: "cancel-date",
      rehearsalId: rehearsal.id,
      date: "2026-10-15",
    });
    const before = count("rehearsals");

    const forms: Record<string, string>[] = [
      nextThursday,
      { intent: "confirm", rehearsalId: rehearsal.id },
      { intent: "delete", rehearsalId: rehearsal.id },
      { intent: "cancel-date", rehearsalId: rehearsal.id, date: "2026-10-22" },
      { intent: "restore-date", rehearsalId: rehearsal.id, date: "2026-10-15" },
      { intent: "end", rehearsalId: rehearsal.id, endDate: "2026-10-29" },
    ];
    for (const form of forms) {
      expect(statusOf(await thrownBy(post(group.id, cellistCookie, form)))).toBe(403);
    }
    expect(count("rehearsals")).toBe(before);
    expect(getStore().findRehearsal(group.id, rehearsal.id)).toMatchObject({
      status: "proposed",
      endDate: null,
      skips: ["2026-10-15"],
    });
  });

  it("warns about a far-off one-off date", async () => {
    const { group, organizerCookie } = await band();
    await post(group.id, organizerCookie, { ...nextThursday, startDate: "2062-10-05" });

    const page = await load(group.id, organizerCookie);

    expect(page.rehearsals[0].organizer?.warnings).toEqual([
      { date: "2062-10-05", missing: ["Pianist"] },
    ]);
  });

  it("merges back-to-back stretches with the same count for members who see counts only", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Duo", "Viola", "Europe/London");
    const cellist = store.addMember(group.id, "Cellist", "member");
    store.addSlot(organizer.id, { ...thursdays, endMinute: 20 * 60 });
    store.addSlot(cellist.id, { ...thursdays, startMinute: 20 * 60 });

    const asMember = await load(group.id, await deviceCookie(group.id, cellist.deviceToken));
    const asOrganizer = await load(group.id, await deviceCookie(group.id, organizer.deviceToken));

    const memberDay = asMember.days.find((day) => day.date === "2026-10-08");
    expect(memberDay?.stretches.map((s) => [s.startMinute, s.endMinute, s.freeCount])).toEqual([
      [1140, 1320, 1],
    ]);
    const organizerDay = asOrganizer.days.find((day) => day.date === "2026-10-08");
    expect(organizerDay?.stretches).toHaveLength(2);
  });

  it("works for a second organizer too", async () => {
    const { group, cellist, cellistCookie } = await band();
    getStore().setRole(group.id, cellist.id, "organizer");

    const proposed = await post(group.id, cellistCookie, nextThursday);
    const page = await load(group.id, cellistCookie);

    expect(statusOf(proposed)).toBe(302);
    expect(page.isOrganizer).toBe(true);
  });

  it("pre-fills the propose form from a chosen stretch", async () => {
    const { group, organizerCookie } = await band();

    const page = await load(group.id, organizerCookie, "?date=2026-10-08&start=19:00&end=22:00");

    expect(page.prefill).toEqual({ startDate: "2026-10-08", startTime: "19:00", endTime: "22:00" });
    expect(render(page)).toMatch(/name="startDate"[^>]*value="2026-10-08"/);
  });
});
