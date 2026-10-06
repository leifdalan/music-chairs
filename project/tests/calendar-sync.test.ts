import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  calendarDates,
  eventId,
  scheduleSync,
  sweepOnce,
  syncMember,
  whenSynced,
} from "../app/.server/calendar-sync";
import { CALENDAR_SCOPES, forgetAccessToken } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { addDays, todayInZone } from "../app/lib/availability";
import { groupPath } from "../app/lib/group-address";
import { zonedInstant } from "../app/lib/zoned-time";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import { requestIn } from "./routes";

const ZONE = "Europe/London";
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

let accounts = 0;

/** A group with a linked, syncing member who granted Calendar writing, and a confirmed weekly rehearsal. */
function syncingBand(options: { scopes?: string[]; endMinute?: number } = {}) {
  const store = getStore();
  const { group } = store.createGroup("Quartet", "Viola", ZONE);
  const account = store.upsertAccount({
    sub: `sub-${++accounts}`,
    email: `cellist${accounts}@example.test`,
    name: "Cel",
  });
  forgetAccessToken(account.id);
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  store.saveGrant(account.id, "refresh-1", options.scopes ?? [CALENDAR_SCOPES.write]);
  store.setCalendarSync(group.id, cellist.id, true);
  const today = todayInZone(ZONE, new Date());
  const firstDate = addDays(today, 7);
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id),
    {
      kind: "weekly",
      startDate: firstDate,
      endDate: addDays(firstDate, 14),
      startMinute: 19 * 60,
      endMinute: options.endMinute ?? 21 * 60,
    },
    "Studio B",
  );
  store.confirmRehearsal(group.id, rehearsal.id);
  const target = { memberId: cellist.id, groupId: group.id, accountId: account.id };
  return { store, group, cellist, account, rehearsal, firstDate, today, target };
}

const inserts = () =>
  google.calendarCalls().filter((call) => call.method === "POST" && call.url.endsWith("/events"));
const deletes = () => google.calendarCalls().filter((call) => call.method === "DELETE");

describe("which dates go on a member's calendar", () => {
  it("lists confirmed dates, without cancelled dates or dates the member said No to", () => {
    const { store, group, cellist, rehearsal, firstDate, today } = syncingBand();
    store.setCancelled(group.id, rehearsal.id, addDays(firstDate, 7), true);
    store.setRsvp(group.id, rehearsal.id, cellist.id, addDays(firstDate, 14), "no");
    store.addRehearsal(
      group.id,
      requestIn(group.id),
      { kind: "once", startDate: firstDate, endDate: null, startMinute: 600, endMinute: 660 },
      "Proposed only",
    );

    const dates = calendarDates(group, cellist.id, today, addDays(today, 55));

    expect(dates.map((item) => item.date)).toEqual([firstDate]);
  });

  it("includes a confirmed one-off beyond the eight-week window, as members can answer it", () => {
    const { store, group, cellist, today } = syncingBand();
    const later = store.addRehearsal(
      group.id,
      requestIn(group.id),
      {
        kind: "once",
        startDate: addDays(today, 70),
        endDate: null,
        startMinute: 600,
        endMinute: 660,
      },
      "Hall",
    );
    store.confirmRehearsal(group.id, later.id);

    const dates = calendarDates(group, cellist.id, today, addDays(today, 55));

    expect(dates.map((item) => item.date)).toContain(addDays(today, 70));
  });
});

describe("writing to Google Calendar", () => {
  it("writes quarter-hour rehearsal times exactly", async () => {
    const { store, group, target, firstDate } = syncingBand();
    const later = store.addRehearsal(
      group.id,
      requestIn(group.id),
      {
        kind: "once",
        startDate: addDays(firstDate, 1),
        endDate: null,
        startMinute: 19 * 60 + 15,
        endMinute: 21 * 60 + 45,
      },
      "Hall",
    );
    store.confirmRehearsal(group.id, later.id);

    await syncMember(target);

    const body = inserts().find((call) => (call.body as { location: string }).location === "Hall")
      ?.body as { start: { dateTime: string }; end: { dateTime: string } };
    expect(body.start.dateTime).toBe(
      zonedInstant(addDays(firstDate, 1), 19 * 60 + 15, ZONE)?.toISOString(),
    );
    expect(body.end.dateTime).toBe(
      zonedInstant(addDays(firstDate, 1), 21 * 60 + 45, ZONE)?.toISOString(),
    );
  });

  it("adds one confirmed, non-attendee event per date with a stable id and the group's zone", async () => {
    vi.stubEnv("MUSIC_CHAIRS_PUBLIC_URL", "https://rehearse.example");
    const { store, cellist, rehearsal, firstDate, target } = syncingBand();

    await syncMember(target);

    expect(inserts()).toHaveLength(3);
    const body = inserts()[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      id: eventId(cellist.id, rehearsal.id, firstDate),
      status: "confirmed",
      summary: "Quartet rehearsal",
      location: "Studio B",
      start: { timeZone: ZONE },
      end: { timeZone: ZONE },
    });
    expect(body).not.toHaveProperty("attendees");
    // The schedule link is the group's readable address (plan/phase-19.3.md).
    const group = store.findGroup(target.groupId)!;
    expect(String(body.description)).toContain(
      `Answer or see the schedule: https://rehearse.example${groupPath(group)}/schedule`,
    );
    expect(String(body.description)).not.toContain(group.id);
    expect(String(body.id)).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(store.listCalendarEvents(cellist.id)).toHaveLength(3);

    await syncMember(target);
    expect(inserts()).toHaveLength(3);
  });

  it("ends a rehearsal that ends at midnight at the next day's first moment", async () => {
    const { target, firstDate } = syncingBand({ endMinute: 1440 });

    await syncMember(target);

    const body = inserts()[0].body as { end: { dateTime: string } };
    expect(body.end.dateTime).toBe(zonedInstant(addDays(firstDate, 1), 0, ZONE)?.toISOString());
  });

  it("restores an event whose id already exists by updating it as confirmed", async () => {
    const { target } = syncingBand();
    google.queue.set("POST /calendars/primary/events", [{ status: 409, body: {} }]);

    await syncMember(target);

    const puts = google.calendarCalls().filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ status: "confirmed" });
    const firstId = (inserts()[0].body as { id: string }).id;
    expect(puts[0].url.endsWith(`/calendars/primary/events/${firstId}`)).toBe(true);
  });

  it("removes a date the member then answers No to, and every upcoming date when they turn it off", async () => {
    const { store, group, cellist, rehearsal, firstDate, target } = syncingBand();
    await syncMember(target);

    store.setRsvp(group.id, rehearsal.id, cellist.id, firstDate, "no");
    await syncMember(target);
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0].url).toContain(eventId(cellist.id, rehearsal.id, firstDate));

    store.setCalendarSync(group.id, cellist.id, false);
    await syncMember(target);
    expect(deletes()).toHaveLength(3);
    expect(store.listCalendarEvents(cellist.id)).toEqual([]);
  });

  it("leaves past events alone", async () => {
    const { store, cellist, rehearsal, today, target } = syncingBand();
    store.recordCalendarEvent(cellist.id, {
      rehearsalId: rehearsal.id,
      date: addDays(today, -3),
      eventId: "mcpastevent",
    });

    await syncMember(target);

    expect(deletes()).toHaveLength(0);
    expect(store.listCalendarEvents(cellist.id).map((event) => event.eventId)).toContain(
      "mcpastevent",
    );
  });

  it("writes nothing for a member whose grant lacks the writing scope", async () => {
    const { target } = syncingBand({ scopes: [CALENDAR_SCOPES.busy] });

    await syncMember(target);

    expect(google.calendarCalls()).toEqual([]);
  });

  it("forgets the grant when Google says access was revoked, without failing the queue", async () => {
    const { store, account, target } = syncingBand();
    google.refreshAnswer = { status: 400, body: { error: "invalid_grant" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    scheduleSync([target]);
    await whenSynced();

    expect(store.findGrant(account.id)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still removes a No-answered date when another date's insert fails", async () => {
    const { store, group, cellist, rehearsal, firstDate, target } = syncingBand();
    await syncMember(target);
    store.setRsvp(group.id, rehearsal.id, cellist.id, firstDate, "no");
    // A date dropped from the map must be written again, and that write fails.
    store.forgetCalendarEvent(cellist.id, rehearsal.id, addDays(firstDate, 7));
    google.queue.set("POST /calendars/primary/events", [{ status: 500, body: {} }]);

    await expect(syncMember(target)).rejects.toThrow("1 calendar update(s) failed");

    expect(deletes()).toHaveLength(1);
    expect(store.listCalendarEvents(cellist.id).map((event) => event.date)).toEqual([
      addDays(firstDate, 14),
    ]);
  });

  it("keeps removing events after a member turns writing off, until it succeeds", async () => {
    const { store, group, cellist, target } = syncingBand();
    await syncMember(target);
    store.setCalendarSync(group.id, cellist.id, false);
    google.queue.set("DELETE /calendars/primary/events", [{ status: 500, body: {} }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    scheduleSync([target]);
    await whenSynced();
    expect(store.listCalendarEvents(cellist.id)).toHaveLength(1);

    await sweepOnce();
    expect(store.listCalendarEvents(cellist.id)).toEqual([]);
    warn.mockRestore();
  });

  it("retries a failed removal on the next sweep", async () => {
    const { store, group, cellist, rehearsal, firstDate, target } = syncingBand();
    await syncMember(target);
    store.setRsvp(group.id, rehearsal.id, cellist.id, firstDate, "no");
    google.queue.set("DELETE /calendars/primary/events", [{ status: 500, body: {} }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    scheduleSync([target]);
    await whenSynced();
    expect(store.listCalendarEvents(cellist.id)).toHaveLength(3);

    await sweepOnce();
    expect(store.listCalendarEvents(cellist.id)).toHaveLength(2);
    warn.mockRestore();
  });
});
