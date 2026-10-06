import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { whenSynced } from "../app/.server/calendar-sync";
import { readToast } from "../app/.server/flash";
import { CALENDAR_SCOPES } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { action as requestAction } from "../app/routes/request";
import Schedule, { action, loader } from "../app/routes/schedule";
import { fakeGoogle } from "./google-fake";
import {
  deviceCookie,
  ORIGIN,
  requestIn,
  routeArgs,
  setCookies,
  signedIn,
  tempDatabase,
  thrownBy,
  addressFor,
} from "./routes";

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

/** Viola (organizer) and Cellist are free Thursdays 7–10 PM; Pianist never is. */
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
  const path = `/g/${addressFor(groupId)}/schedule${search}`;
  return loader(
    routeArgs(path, { groupAddress: addressFor(groupId) }, { cookie }),
  ) as Promise<ScheduleData>;
}

function post(groupId: string, cookie: string | undefined, form: Record<string, string>) {
  return action(
    routeArgs(
      `/g/${addressFor(groupId)}/schedule`,
      { groupAddress: addressFor(groupId) },
      { cookie, form },
    ),
  );
}

const requests = new Map<string, string>();

/** Proposes on the group's request page, where every proposal is made (plan/phase-17.md). */
function propose(groupId: string, cookie: string | undefined, form: Record<string, string>) {
  const requestId = requests.get(groupId) ?? requestIn(groupId);
  requests.set(groupId, requestId);
  return requestAction(
    routeArgs(
      `/g/${addressFor(groupId)}/requests/${requestId}`,
      { groupAddress: addressFor(groupId), requestId },
      { cookie, form },
    ),
  );
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

/** The toast message a redirect leaves, read the way the root loader reads it. */
async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

describe("schedule feedback and quarter hours", () => {
  it("proposes on the quarter hour and confirms each step with a toast", async () => {
    const { group, organizerCookie, cellistCookie } = await band();

    const proposed = await propose(group.id, organizerCookie, {
      ...nextThursday,
      startTime: "19:15",
      endTime: "21:44",
    });
    const [rehearsal] = getStore().listRehearsals(group.id);
    const confirmed = await post(group.id, organizerCookie, {
      intent: "confirm",
      rehearsalId: rehearsal.id,
    });
    const answered = await post(group.id, cellistCookie, {
      intent: "rsvp",
      rehearsalId: rehearsal.id,
      date: "2026-10-08",
      answer: "yes",
    });

    expect([rehearsal.startMinute, rehearsal.endMinute]).toEqual([19 * 60 + 15, 21 * 60 + 45]);
    expect(await toastOf(proposed)).toBe("Rehearsal proposed");
    expect(await toastOf(confirmed)).toBe("Rehearsal confirmed");
    expect(await toastOf(answered)).toBe("Answer saved: Yes");
  });
});

describe("schedule route", () => {
  it("sends visitors to the group page and 404s unknown groups", async () => {
    const { group } = await band();

    const visitor = await thrownBy(load(group.id));
    // A well-formed address whose short id names no group.
    const unknown = await thrownBy(
      loader(routeArgs("/g/quartet-zzzzzzzz/schedule", { groupAddress: "quartet-zzzzzzzz" })),
    );

    expect((visitor as Response).headers.get("Location")).toBe(groupPath(group));
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
    expect(render(page)).not.toContain("Propose a different time");
    expect(render(page)).not.toContain('name="time"');
    expect(render(page)).not.toContain("Propose selected");
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
    expect(render(page)).not.toContain('name="time"');
    expect(render(page)).toContain("To propose times, open a request on the");
  });

  it("warns when a non-optional member is missing, and still lets the organizer confirm", async () => {
    const { group, pianist, organizerCookie } = await band();

    const proposed = await propose(group.id, organizerCookie, nextThursday);
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

  it("shows members proposed and confirmed rehearsals without warnings or member ids", async () => {
    const { group, organizer, pianist, organizerCookie, cellistCookie } = await band();
    await propose(group.id, organizerCookie, nextThursday);
    const [rehearsal] = getStore().listRehearsals(group.id);

    const page = await load(group.id, cellistCookie);

    expect(page.rehearsals).toEqual([
      {
        id: rehearsal.id,
        kind: "once",
        status: "proposed",
        location: "Studio B",
        requestId: rehearsal.requestId,
        requestName: "Autumn rehearsals",
        summary: "Thu 8 Oct, 7:30–9:30 PM",
        dates: [
          { date: "2026-10-08", mine: null, counts: { yes: 0, no: 0, maybe: 0 }, names: null },
        ],
        organizer: null,
      },
    ]);
    const visible = JSON.stringify(page);
    for (const hidden of [organizer.id, pianist.id, organizer.deviceToken]) {
      expect(visible).not.toContain(hidden);
    }
  });

  it("checks a one-off rehearsal beyond the overlap window", async () => {
    const { group, organizerCookie } = await band();

    await propose(group.id, organizerCookie, { ...nextThursday, startDate: "2026-12-31" });
    const page = await load(group.id, organizerCookie);

    expect(page.rehearsals[0].organizer?.warnings).toEqual([
      { date: "2026-12-31", missing: ["Pianist"] },
    ]);
  });

  it("cancels a date of a weekly rehearsal, ends it, and labels unchecked later dates", async () => {
    const { group, organizerCookie } = await band();
    await propose(group.id, organizerCookie, {
      ...nextThursday,
      kind: "weekly",
      startDate: "2026-10-08",
    });
    const [rehearsal] = getStore().listRehearsals(group.id);

    const open = await load(group.id, organizerCookie);
    await post(group.id, organizerCookie, {
      intent: "cancel-date",
      confirmed: "1",
      rehearsalId: rehearsal.id,
      date: "2026-10-15",
    });
    const wrongDay = await post(group.id, organizerCookie, {
      intent: "cancel-date",
      confirmed: "1",
      rehearsalId: rehearsal.id,
      date: "2026-10-16",
    });
    const ended = await post(group.id, organizerCookie, {
      intent: "end",
      confirmed: "1",
      rehearsalId: rehearsal.id,
      endDate: "2026-10-29",
    });
    const page = await load(group.id, organizerCookie);

    expect(open.rehearsals[0].organizer?.uncheckedAfter).toBe("2026-11-26");
    expect(statusOf(wrongDay)).toBe(400);
    expect(statusOf(ended)).toBe(302);
    expect(page.rehearsals[0].dates.map((d) => d.date)).toEqual([
      "2026-10-08",
      "2026-10-22",
      "2026-10-29",
    ]);
    expect(page.rehearsals[0].organizer?.uncheckedAfter).toBeNull();
  });

  it("deletes a rehearsal and its cancellations", async () => {
    const { group, organizerCookie } = await band();
    await propose(group.id, organizerCookie, { ...nextThursday, kind: "weekly" });
    const [rehearsal] = getStore().listRehearsals(group.id);
    await post(group.id, organizerCookie, {
      intent: "cancel-date",
      confirmed: "1",
      rehearsalId: rehearsal.id,
      date: "2026-10-15",
    });
    const rows = [count("rehearsals"), count("rehearsal_cancellations")];

    await post(group.id, organizerCookie, {
      intent: "delete",
      confirmed: "1",
      rehearsalId: rehearsal.id,
    });

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

    const result = await propose(group.id, organizerCookie, { ...nextThursday, ...change });

    expect(statusOf(result)).toBe(400);
    expect((result as unknown as { data: { errors: object } }).data.errors).toEqual(errors);
    expect(count("rehearsals")).toBe(before);
  });

  it("lets only organizers propose, confirm, cancel, end or delete", async () => {
    const { group, organizerCookie, cellistCookie } = await band();
    await propose(group.id, organizerCookie, { ...nextThursday, kind: "weekly" });
    const [rehearsal] = getStore().listRehearsals(group.id);
    await post(group.id, organizerCookie, {
      intent: "cancel-date",
      confirmed: "1",
      rehearsalId: rehearsal.id,
      date: "2026-10-15",
    });
    const before = count("rehearsals");

    const forms: Record<string, string>[] = [
      nextThursday,
      { intent: "confirm", rehearsalId: rehearsal.id },
      { intent: "delete", confirmed: "1", rehearsalId: rehearsal.id },
      { intent: "cancel-date", confirmed: "1", rehearsalId: rehearsal.id, date: "2026-10-22" },
      { intent: "restore-date", rehearsalId: rehearsal.id, date: "2026-10-15" },
      { intent: "end", confirmed: "1", rehearsalId: rehearsal.id, endDate: "2026-10-29" },
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
    await propose(group.id, organizerCookie, { ...nextThursday, startDate: "2062-10-05" });

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

    const proposed = await propose(group.id, cellistCookie, nextThursday);
    const page = await load(group.id, cellistCookie);

    expect(statusOf(proposed)).toBe(302);
    expect(page.isOrganizer).toBe(true);
  });

  it("no longer proposes on the schedule page, while its other actions still work", async () => {
    const { group, organizerCookie } = await band();
    await propose(group.id, organizerCookie, nextThursday);
    const [rehearsal] = getStore().listRehearsals(group.id);
    const before = count("rehearsals");

    const custom = await thrownBy(post(group.id, organizerCookie, nextThursday));
    const ticked = await thrownBy(
      post(group.id, organizerCookie, {
        intent: "propose-times",
        time: "2026-10-08 1140 1320",
        length: "120",
        location: "Studio B",
      }),
    );
    const confirmed = await post(group.id, organizerCookie, {
      intent: "confirm",
      rehearsalId: rehearsal.id,
    });
    const page = await load(group.id, organizerCookie, "?date=2026-10-08&start=19:00&end=22:00");

    expect([statusOf(custom), statusOf(ticked)]).toEqual([404, 404]);
    expect(count("rehearsals")).toBe(before);
    expect(statusOf(confirmed)).toBe(302);
    expect(getStore().findRehearsal(group.id, rehearsal.id)?.status).toBe("confirmed");
    const html = render(page);
    for (const gone of [
      "Propose a different time",
      'name="time"',
      "Propose selected",
      "Propose again",
    ]) {
      expect(html).not.toContain(gone);
    }
  });

  describe("times that worked", () => {
    function past(
      groupId: string,
      startDate: string,
      location: string,
      options: { kind?: "once" | "weekly"; confirm?: boolean; start?: number } = {},
    ) {
      const store = getStore();
      const rehearsal = store.addRehearsal(
        groupId,
        requestIn(groupId),
        {
          kind: options.kind ?? "once",
          startDate,
          endDate: null,
          startMinute: options.start ?? 19 * 60 + 30,
          endMinute: 21 * 60 + 30,
        },
        location,
      );
      if (options.confirm !== false) store.confirmRehearsal(groupId, rehearsal.id);
      return rehearsal;
    }

    it("offers past confirmed rehearsals again on their next weekday, once per time and place", async () => {
      const { group, organizerCookie } = await band();
      past(group.id, "2026-09-24", "Studio B"); // a Thursday
      past(group.id, "2026-09-17", "Studio B"); // the same Thursday time and place
      past(group.id, "2026-09-28", "Hall"); // a Monday
      past(group.id, "2026-09-29", "Hall", { confirm: false }); // only proposed
      past(group.id, "2026-10-02", "Today"); // not yet past
      past(group.id, "2026-09-03", "Weekly", { kind: "weekly", start: 18 * 60 }); // last met 1 Oct

      const page = await load(group.id, organizerCookie);

      expect(page.timesThatWorked).toEqual([
        {
          last: "2026-10-01",
          next: "2026-10-08",
          startMinute: 1080,
          endMinute: 1290,
          location: "Weekly",
        },
        {
          last: "2026-09-28",
          next: "2026-10-05",
          startMinute: 1170,
          endMinute: 1290,
          location: "Hall",
        },
        {
          last: "2026-09-24",
          next: "2026-10-08",
          startMinute: 1170,
          endMinute: 1290,
          location: "Studio B",
        },
      ]);
      expect(render(page)).toContain("Times that worked");
      expect(render(page)).not.toContain("Propose again");
    });

    it("is for organizers only", async () => {
      const { group, cellistCookie } = await band();
      past(group.id, "2026-09-24", "Studio B");

      const page = await load(group.id, cellistCookie);

      expect(page.timesThatWorked).toBeNull();
      expect(render(page)).not.toContain("Times that worked");
    });
  });

  describe("RSVP", () => {
    async function weeklyRehearsal() {
      const setup = await band();
      await propose(setup.group.id, setup.organizerCookie, {
        ...nextThursday,
        kind: "weekly",
        startDate: "2026-10-08",
      });
      const [rehearsal] = getStore().listRehearsals(setup.group.id);
      return { ...setup, rehearsal };
    }

    function answer(
      groupId: string,
      cookie: string | undefined,
      rehearsalId: string,
      value: string,
      date?: string,
    ) {
      return post(groupId, cookie, {
        intent: date ? "rsvp" : "rsvp-all",
        rehearsalId,
        answer: value,
        ...(date ? { date } : {}),
      });
    }

    it("lets a member answer, change and clear their answer for one date", async () => {
      const { group, rehearsal, cellistCookie } = await weeklyRehearsal();

      const yes = await answer(group.id, cellistCookie, rehearsal.id, "yes", "2026-10-15");
      const afterYes = await load(group.id, cellistCookie);
      await answer(group.id, cellistCookie, rehearsal.id, "no", "2026-10-15");
      const afterNo = await load(group.id, cellistCookie);
      await answer(group.id, cellistCookie, rehearsal.id, "clear", "2026-10-15");
      const cleared = await load(group.id, cellistCookie);

      const on15 = (data: ScheduleData) =>
        data.rehearsals[0].dates.find((d) => d.date === "2026-10-15");
      expect(statusOf(yes)).toBe(302);
      expect(on15(afterYes)).toMatchObject({ mine: "yes", counts: { yes: 1, no: 0, maybe: 0 } });
      expect(on15(afterNo)).toMatchObject({ mine: "no", counts: { yes: 0, no: 1, maybe: 0 } });
      expect(on15(cleared)).toMatchObject({ mine: null, counts: { yes: 0, no: 0, maybe: 0 } });
    });

    it("answers every offered date of a weekly rehearsal at once", async () => {
      const { group, rehearsal, cellistCookie } = await weeklyRehearsal();

      const result = await answer(group.id, cellistCookie, rehearsal.id, "maybe");
      const page = await load(group.id, cellistCookie);

      expect(statusOf(result)).toBe(302);
      expect(page.rehearsals[0].dates.map((d) => d.mine)).toEqual(Array(8).fill("maybe"));
      expect(page.rehearsals[0].dates.at(-1)?.date).toBe("2026-11-26");
    });

    it("keeps answers given on a proposed rehearsal after it is confirmed", async () => {
      const { group, rehearsal, organizerCookie, cellistCookie } = await weeklyRehearsal();
      await answer(group.id, cellistCookie, rehearsal.id, "yes", "2026-10-08");

      await post(group.id, organizerCookie, { intent: "confirm", rehearsalId: rehearsal.id });
      const page = await load(group.id, cellistCookie);

      expect(page.rehearsals[0]).toMatchObject({ status: "confirmed" });
      expect(page.rehearsals[0].dates[0]).toMatchObject({ date: "2026-10-08", mine: "yes" });
    });

    it("shows members totals only, names when the group shows them, never who hasn't answered", async () => {
      const { group, rehearsal, organizerCookie, cellistCookie } = await weeklyRehearsal();
      await answer(group.id, organizerCookie, rehearsal.id, "yes", "2026-10-08");

      const countsOnly = await load(group.id, cellistCookie);
      getStore().setShowNames(group.id, true);
      const withNames = await load(group.id, cellistCookie);

      expect(countsOnly.rehearsals[0].dates[0]).toMatchObject({
        counts: { yes: 1, no: 0, maybe: 0 },
        names: null,
      });
      expect(JSON.stringify(countsOnly)).not.toContain("Viola");
      expect(withNames.rehearsals[0].dates[0].names).toEqual({
        yes: ["Viola"],
        no: [],
        maybe: [],
        none: null,
      });
    });

    it("shows organizers everyone's answers and who hasn't answered", async () => {
      const { group, rehearsal, organizerCookie, cellistCookie } = await weeklyRehearsal();
      await answer(group.id, cellistCookie, rehearsal.id, "no", "2026-10-08");

      const page = await load(group.id, organizerCookie);

      expect(page.rehearsals[0].dates[0].names).toEqual({
        yes: [],
        no: ["Cellist"],
        maybe: [],
        none: ["Viola", "Pianist"],
      });
      expect(render(page)).toContain("No answer: Viola, Pianist");
    });

    it("records the viewer's answer even if another member's id is posted", async () => {
      const { group, rehearsal, pianist, cellist, cellistCookie } = await weeklyRehearsal();

      await post(group.id, cellistCookie, {
        intent: "rsvp",
        rehearsalId: rehearsal.id,
        date: "2026-10-08",
        answer: "yes",
        memberId: pianist.id,
      });

      expect(
        getStore()
          .listRsvps(group.id)
          .map((r) => r.memberId),
      ).toEqual([cellist.id]);
    });

    it("refuses past, cancelled, beyond-window and one-off answer-all requests and stores nothing", async () => {
      const { group, rehearsal, organizerCookie, cellistCookie } = await weeklyRehearsal();
      await post(group.id, organizerCookie, {
        intent: "cancel-date",
        confirmed: "1",
        rehearsalId: rehearsal.id,
        date: "2026-10-22",
      });
      await propose(group.id, organizerCookie, nextThursday);
      const once = getStore()
        .listRehearsals(group.id)
        .find((item) => item.kind === "once");
      const before = count("rsvps");

      const results = [
        await answer(group.id, cellistCookie, rehearsal.id, "yes", "2026-10-01"),
        await answer(group.id, cellistCookie, rehearsal.id, "yes", "2026-10-22"),
        await answer(group.id, cellistCookie, rehearsal.id, "yes", "2026-12-03"),
        await answer(group.id, cellistCookie, rehearsal.id, "perhaps", "2026-10-08"),
        await answer(group.id, cellistCookie, once!.id, "yes"),
      ];

      expect(results.map(statusOf)).toEqual([400, 400, 400, 400, 400]);
      expect(count("rsvps")).toBe(before);
    });

    it("refuses a real date that has already passed", async () => {
      const { group, cellistCookie } = await band();
      // First date 2026-09-24, before the pinned today: a real, uncancelled occurrence.
      const past = getStore().addRehearsal(
        group.id,
        requestIn(group.id),
        { ...thursdays, startDate: "2026-09-24", startMinute: 1170, endMinute: 1290 },
        "",
      );
      const before = count("rsvps");

      const result = await answer(group.id, cellistCookie, past.id, "yes", "2026-09-24");

      expect(statusOf(result)).toBe(400);
      expect(count("rsvps")).toBe(before);
    });

    it("sends visitors to the group page without storing an answer", async () => {
      const { group, rehearsal } = await weeklyRehearsal();
      const before = count("rsvps");

      const visitor = await thrownBy(
        answer(group.id, undefined, rehearsal.id, "yes", "2026-10-08"),
      );

      expect((visitor as Response).headers.get("Location")).toBe(groupPath(group));
      expect(count("rsvps")).toBe(before);
    });

    it("renders answer buttons with the current answer pressed", async () => {
      const { group, rehearsal, cellistCookie } = await weeklyRehearsal();
      await answer(group.id, cellistCookie, rehearsal.id, "maybe", "2026-10-08");

      const html = render(await load(group.id, cellistCookie));

      expect(html).toMatch(
        /aria-pressed="true"[^>]*aria-label="Maybe for Thu 8 Oct \(Every Thursday from 8 Oct, 7:30–9:30 PM\)"/,
      );
      // Answer-all buttons are actions, not toggles.
      expect(html).toMatch(/aria-label="Yes for every date of [^"]*"/);
      expect(html).not.toMatch(/aria-pressed="false"[^>]*aria-label="Yes for every date/);
      expect(html).toContain("Answer every date until Thu 26 Nov");
      expect(html).toContain("More dates (4)");
    });
  });
});

describe("rehearsals in members' calendars", () => {
  /** The band, with Cellist linked to a Google account signed in on Cellist's device. */
  async function linkedBand(sub: string, scopes: string[] = []) {
    const members = await band();
    const store = getStore();
    const { account, cookie } = await signedIn({ sub, email: `${sub}@example.test`, name: "C" });
    store.linkMember(members.group.id, members.cellist.id, account.id);
    if (scopes.length > 0) store.saveGrant(account.id, "refresh-1", scopes);
    return { ...members, account, cellistSignedIn: `${members.cellistCookie}; ${cookie}` };
  }

  function withGoogle() {
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
    return fakeGoogle();
  }

  function cleanUp() {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }

  it("gives each member only their own private feed link", async () => {
    const { group, organizerCookie, cellistCookie, pianist } = await band();
    const pianistFeed = getStore().feedTokenFor(pianist.id);

    const asCellist = await load(group.id, cellistCookie);
    const asOrganizer = await load(group.id, organizerCookie);

    expect(asCellist.calendar.feedUrl).toMatch(/\/calendar\/[A-Za-z0-9_-]{22}\.ics$/);
    expect(asCellist.calendar.webcalUrl.startsWith("webcal:")).toBe(true);
    expect(asCellist.calendar.feedUrl).not.toBe(asOrganizer.calendar.feedUrl);
    for (const page of [asCellist, asOrganizer]) {
      expect(JSON.stringify(page)).not.toContain(pianistFeed);
      expect(render(page)).not.toContain(pianistFeed);
    }
  });

  it("offers Google Calendar writing only to the signed-in member it belongs to", async () => {
    withGoogle();
    try {
      const { group, cellistCookie, cellistSignedIn, organizerCookie } =
        await linkedBand("panel-sub");
      const stranger = await signedIn({ sub: "panel-other", email: "o@example.test", name: "O" });

      expect((await load(group.id, organizerCookie)).calendar.google).toEqual({
        state: "unlinked",
      });
      expect(
        (await load(group.id, `${cellistCookie}; ${stranger.cookie}`)).calendar.google,
      ).toEqual({ state: "other-account" });
      expect((await load(group.id, cellistSignedIn)).calendar.google).toEqual({ state: "connect" });
    } finally {
      cleanUp();
    }
  });

  it("refuses to turn writing on before Google Calendar is connected", async () => {
    withGoogle();
    try {
      const { group, cellist, cellistSignedIn } = await linkedBand("switch-none");

      const result = await post(group.id, cellistSignedIn, { intent: "set-calendar", value: "on" });

      expect(statusOf(result)).toBe(400);
      expect(getStore().findMember(group.id, cellist.id)?.calendarSync).toBe(false);
    } finally {
      cleanUp();
    }
  });

  it("follows every change that moves a date on or off the member's calendar", async () => {
    const google = withGoogle();
    try {
      const { group, cellist, cellistSignedIn, organizerCookie } = await linkedBand("triggers", [
        CALENDAR_SCOPES.write,
      ]);
      await post(group.id, cellistSignedIn, { intent: "set-calendar", value: "on" });
      await propose(group.id, organizerCookie, {
        ...nextThursday,
        kind: "weekly",
        endDate: "2026-10-29",
      });
      const [weekly] = getStore().listRehearsals(group.id);
      const dates = () =>
        getStore()
          .listCalendarEvents(cellist.id)
          .map((event) => event.date);
      const step = async (cookie: string, form: Record<string, string>) => {
        await post(group.id, cookie, { rehearsalId: weekly.id, ...form });
        await whenSynced();
        return dates();
      };

      expect(await step(organizerCookie, { intent: "confirm" })).toEqual([
        "2026-10-08",
        "2026-10-15",
        "2026-10-22",
        "2026-10-29",
      ]);
      expect(
        await step(organizerCookie, { intent: "cancel-date", confirmed: "1", date: "2026-10-15" }),
      ).toEqual(["2026-10-08", "2026-10-22", "2026-10-29"]);
      expect(await step(organizerCookie, { intent: "restore-date", date: "2026-10-15" })).toEqual([
        "2026-10-08",
        "2026-10-15",
        "2026-10-22",
        "2026-10-29",
      ]);
      expect(
        await step(organizerCookie, { intent: "end", confirmed: "1", endDate: "2026-10-22" }),
      ).toEqual(["2026-10-08", "2026-10-15", "2026-10-22"]);
      expect(
        await step(cellistSignedIn, { intent: "rsvp", date: "2026-10-08", answer: "no" }),
      ).toEqual(["2026-10-15", "2026-10-22"]);
      expect(
        await step(cellistSignedIn, { intent: "rsvp", date: "2026-10-08", answer: "yes" }),
      ).toEqual(["2026-10-08", "2026-10-15", "2026-10-22"]);
      expect(
        await step(cellistSignedIn, { intent: "set-calendar", value: "off", confirmed: "1" }),
      ).toEqual([]);
      expect(await step(cellistSignedIn, { intent: "set-calendar", value: "on" })).toHaveLength(3);
      expect(await step(organizerCookie, { intent: "delete", confirmed: "1" })).toEqual([]);
      expect(google.calendarCalls().filter((call) => call.method === "DELETE")).toHaveLength(9);
    } finally {
      cleanUp();
    }
  });

  it("writes confirmed dates once turned on, and follows the organizer's confirmations", async () => {
    const google = withGoogle();
    try {
      const { group, cellist, cellistSignedIn, organizerCookie } = await linkedBand("switch-on", [
        CALENDAR_SCOPES.write,
      ]);
      await post(group.id, cellistSignedIn, { intent: "set-calendar", value: "on" });
      await whenSynced();
      expect(getStore().findMember(group.id, cellist.id)?.calendarSync).toBe(true);
      expect((await load(group.id, cellistSignedIn)).calendar.google).toEqual({ state: "on" });

      await propose(group.id, organizerCookie, nextThursday);
      const [proposed] = getStore().listRehearsals(group.id);
      await whenSynced();
      expect(google.calendarCalls()).toEqual([]);
      await post(group.id, organizerCookie, { intent: "confirm", rehearsalId: proposed.id });
      await whenSynced();

      const inserts = google.calendarCalls().filter((call) => call.method === "POST");
      expect(inserts).toHaveLength(1);
      expect(inserts[0].body).toMatchObject({ summary: "Thursday Quartet rehearsal" });
      expect(getStore().listCalendarEvents(cellist.id)).toEqual([
        expect.objectContaining({ rehearsalId: proposed.id, date: "2026-10-08" }),
      ]);
    } finally {
      cleanUp();
    }
  });
});
