import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { readToast } from "../app/.server/flash";
import { getStore } from "../app/.server/store";
import Availability, { action, loader } from "../app/routes/availability";
import { deviceCookie, ORIGIN, routeArgs, setCookies, tempDatabase, thrownBy } from "./routes";

const count = tempDatabase();

// 2026-10-02 (a Friday) in the group's zone; the horizon runs to 2026-11-26.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
  getStore();
});
afterAll(() => {
  vi.useRealTimers();
});

type PageData = Awaited<ReturnType<typeof loader>>;

const weekly = {
  kind: "weekly",
  startDate: "2026-10-01",
  endDate: "",
  startTime: "19:00",
  endTime: "22:00",
};

async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Thursday Quartet", "Viola", "Europe/London");
  const cellist = store.addMember(group.id, "Cellist", "member");
  return {
    group,
    organizer,
    cellist,
    cookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: await deviceCookie(group.id, cellist.deviceToken),
  };
}

function load(groupId: string, cookie?: string, search = "") {
  const path = `/g/${groupId}/availability${search}`;
  return loader(routeArgs(path, { groupId }, { cookie })) as Promise<PageData>;
}

function post(groupId: string, cookie: string | undefined, form: Record<string, string>) {
  return action(routeArgs(`/g/${groupId}/availability`, { groupId }, { cookie, form }));
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

describe("availability route", () => {
  it("rounds typed times to the quarter hour and confirms each change", async () => {
    const { group, organizer, cookie } = await band();

    const added = await post(group.id, cookie, {
      intent: "create",
      ...weekly,
      startTime: "9:02",
      endTime: "9:52pm",
    });
    const [slot] = getStore().listSlots(organizer.id);
    const skipped = await post(group.id, cookie, {
      intent: "skip",
      slotId: slot.id,
      date: "2026-10-08",
    });
    const removed = await post(group.id, cookie, {
      intent: "delete",
      confirmed: "1",
      slotId: slot.id,
    });

    expect([slot.startMinute, slot.endMinute]).toEqual([9 * 60, 21 * 60 + 45]);
    expect(await toastOf(added)).toBe("Availability saved");
    expect(await toastOf(skipped)).toBe("Marked as can't make it");
    expect(await toastOf(removed)).toBe("Time removed");
  });

  it("leaves no toast when a change is refused", async () => {
    const { group, cookie } = await band();

    const refused = await post(group.id, cookie, { intent: "create", ...weekly, endTime: "18:00" });

    expect(statusOf(refused)).toBe(400);
    expect(refused instanceof Response ? setCookies(refused).mc_toast : undefined).toBeUndefined();
  });

  it("sends visitors and unknown groups away", async () => {
    const { group } = await band();

    const visitor = await thrownBy(load(group.id));
    const unknown = await thrownBy(load("A".repeat(22)));

    expect((visitor as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    expect(statusOf(unknown)).toBe(404);
  });

  it("adds a weekly time and lists its next eight weeks in the group's zone", async () => {
    const { group, organizer, cookie } = await band();

    const created = await post(group.id, cookie, { intent: "create", ...weekly });
    const page = await load(group.id, cookie);

    expect(statusOf(created)).toBe(302);
    expect((created as Response).headers.get("Location")).toBe(`/g/${group.id}/availability`);
    expect(page).toMatchObject({
      timeZone: "Europe/London",
      today: "2026-10-02",
      until: "2026-11-26",
    });
    expect(page.occurrences.map((o) => o.date)).toEqual([
      "2026-10-08",
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
      "2026-11-05",
      "2026-11-12",
      "2026-11-19",
      "2026-11-26",
    ]);
    expect(JSON.stringify(page)).not.toContain(organizer.id);
  });

  it("skips and restores one date, and refuses dates the slot doesn't meet", async () => {
    const { group, organizer, cookie } = await band();
    await post(group.id, cookie, { intent: "create", ...weekly });
    const [slot] = getStore().listSlots(organizer.id);

    const skipped = await post(group.id, cookie, {
      intent: "skip",
      slotId: slot.id,
      date: "2026-10-15",
    });
    const afterSkip = await load(group.id, cookie);
    const wrongDay = await post(group.id, cookie, {
      intent: "skip",
      slotId: slot.id,
      date: "2026-10-16",
    });
    await post(group.id, cookie, { intent: "unskip", slotId: slot.id, date: "2026-10-15" });
    const afterUnskip = await load(group.id, cookie);

    expect(statusOf(skipped)).toBe(302);
    expect(afterSkip.occurrences.map((o) => o.date)).not.toContain("2026-10-15");
    expect(afterSkip.occurrences.map((o) => o.date)).toContain("2026-10-22");
    expect(statusOf(wrongDay)).toBe(400);
    expect((wrongDay as { data: { problem: string } }).data.problem).toBe(
      "That date isn't one of this time's weeks. Reload the page and try again.",
    );
    expect(afterUnskip.occurrences.map((o) => o.date)).toContain("2026-10-15");
  });

  it("edits a time and respects a new end date", async () => {
    const { group, organizer, cookie } = await band();
    await post(group.id, cookie, { intent: "create", ...weekly });
    const [slot] = getStore().listSlots(organizer.id);

    const updated = await post(group.id, cookie, {
      intent: "update",
      slotId: slot.id,
      ...weekly,
      startTime: "19:30",
      endDate: "2026-10-22",
    });
    const page = await load(group.id, cookie);

    expect(statusOf(updated)).toBe(302);
    expect(page.occurrences.map((o) => [o.date, o.startMinute])).toEqual([
      ["2026-10-08", 1170],
      ["2026-10-15", 1170],
      ["2026-10-22", 1170],
    ]);
  });

  it("deletes a one-off time and its row", async () => {
    const { group, organizer, cookie } = await band();
    await post(group.id, cookie, {
      intent: "create",
      ...weekly,
      kind: "once",
      startDate: "2026-10-17",
      startTime: "14:00",
      endTime: "17:00",
    });
    const [slot] = getStore().listSlots(organizer.id);
    const before = count("availability");

    const deleted = await post(group.id, cookie, {
      intent: "delete",
      confirmed: "1",
      slotId: slot.id,
    });

    expect(statusOf(deleted)).toBe(302);
    expect(count("availability")).toBe(before - 1);
    expect((await load(group.id, cookie)).occurrences).toEqual([]);
  });

  it("deletes a weekly time together with its skipped dates", async () => {
    const { group, organizer, cookie } = await band();
    await post(group.id, cookie, { intent: "create", ...weekly });
    const [slot] = getStore().listSlots(organizer.id);
    await post(group.id, cookie, { intent: "skip", slotId: slot.id, date: "2026-10-08" });
    await post(group.id, cookie, { intent: "skip", slotId: slot.id, date: "2026-10-15" });
    const skips = count("availability_skips");

    await post(group.id, cookie, { intent: "delete", confirmed: "1", slotId: slot.id });

    expect(count("availability_skips")).toBe(skips - 2);
  });

  it("rejects invalid times with readable errors and stores nothing", async () => {
    const { group, cookie } = await band();
    const before = count("availability");

    const result = await post(group.id, cookie, { intent: "create", ...weekly, endTime: "18:00" });

    expect(statusOf(result)).toBe(400);
    expect((result as { data: { errors: object } }).data.errors).toEqual({
      endTime: "End time must be after the start time.",
    });
    expect(count("availability")).toBe(before);
  });

  it("writes nothing for a visitor or a cookie naming another group's member", async () => {
    const { group, organizer } = await band();
    const other = await band();
    const forged = await deviceCookie(group.id, other.organizer.deviceToken);
    await post(group.id, await deviceCookie(group.id, organizer.deviceToken), {
      intent: "create",
      ...weekly,
    });
    const [slot] = getStore().listSlots(organizer.id);
    const rows = count("availability");

    const visitor = await thrownBy(post(group.id, undefined, { intent: "create", ...weekly }));
    const crossGroup = await thrownBy(
      post(group.id, forged, { intent: "delete", confirmed: "1", slotId: slot.id }),
    );

    expect((visitor as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    expect((crossGroup as Response).headers.get("Location")).toBe(`/g/${group.id}`);
    expect(count("availability")).toBe(rows);
  });

  it("refuses to change another member's slot", async () => {
    const { group, organizer, cookie, cellistCookie } = await band();
    await post(group.id, cookie, { intent: "create", ...weekly });
    const [slot] = getStore().listSlots(organizer.id);

    const forms: Record<string, string>[] = [
      { intent: "update", slotId: slot.id, ...weekly, startTime: "08:00" },
      { intent: "delete", confirmed: "1", slotId: slot.id },
      { intent: "skip", slotId: slot.id, date: "2026-10-08" },
    ];
    for (const form of forms) {
      expect(statusOf(await thrownBy(post(group.id, cellistCookie, form)))).toBe(404);
    }
    expect(getStore().findSlot(organizer.id, slot.id)).toMatchObject({
      startMinute: 1140,
      skips: [],
    });
  });

  it("renders the zone, the slot summary and an edit form for ?edit", async () => {
    const { group, organizer, cookie } = await band();
    await post(group.id, cookie, { intent: "create", ...weekly, endTime: "00:00" });
    const [slot] = getStore().listSlots(organizer.id);
    const page = await load(group.id, cookie, `?edit=${slot.id}`);
    const Stub = createRoutesStub([
      { id: "availability", path: "/g/:groupId/availability", Component: Availability },
    ]);

    // React separates adjacent text nodes with empty comments in server output.
    const html = renderToString(
      <Stub
        initialEntries={["/g/x/availability"]}
        hydrationData={{ loaderData: { availability: page } }}
      />,
    ).replaceAll("<!-- -->", "");

    expect(page.editing?.id).toBe(slot.id);
    expect(html).toContain("All times are in Europe/London.");
    expect(html).toContain("Every Thursday from 1 Oct, 19:00–24:00");
    expect(html).toContain("Change a time");
    expect(html).toMatch(/name="endTime"[^>]*value="00:00"/);
    expect(html).toContain("Thu 8 Oct");
  });
});
