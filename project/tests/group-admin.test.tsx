import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sweepOnce, syncMember, whenSynced } from "../app/.server/calendar-sync";
import { readToast } from "../app/.server/flash";
import { CALENDAR_SCOPES, forgetAccessToken } from "../app/.server/google";
import { getStore } from "../app/.server/store";
import { groupPath } from "../app/lib/group-address";
import { addDays, todayInZone } from "../app/lib/availability";
import { zonedInstant } from "../app/lib/zoned-time";
import { action, inviteMailto, loader } from "../app/routes/group";
import { loader as homeLoader } from "../app/routes/home";
import { fakeGoogle, type GoogleFake } from "./google-fake";
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
  addressOf,
} from "./routes";

const count = tempDatabase();
const ZONE = "Europe/London";

let google: GoogleFake;
beforeEach(() => {
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET", "secret");
  google = fakeGoogle();
});
afterEach(async () => {
  await whenSynced();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

let people = 0;

/**
 * Viola (organizer), Pianist (name-only) and Cellist, signed in with Google,
 * who writes a confirmed weekly rehearsal to Google Calendar (already synced).
 */
async function band() {
  const store = getStore();
  const { group, organizer } = store.createGroup("Quartet", "Viola", ZONE);
  people += 1;
  const { account, cookie: session } = await signedIn({
    sub: `admin-sub-${people}`,
    email: `admin${people}@example.test`,
    name: "Cel",
  });
  forgetAccessToken(account.id);
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  const pianist = store.addMember(group.id, "Pianist", "member");
  store.saveGrant(account.id, "refresh-1", [CALENDAR_SCOPES.busy, CALENDAR_SCOPES.write]);
  store.setCalendarSync(group.id, cellist.id, true);
  const today = todayInZone(ZONE, new Date());
  const firstDate = addDays(today, 7);
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id),
    {
      kind: "weekly",
      startDate: firstDate,
      endDate: addDays(firstDate, 7),
      startMinute: 19 * 60,
      endMinute: 21 * 60,
    },
    "Studio",
  );
  store.confirmRehearsal(group.id, rehearsal.id);
  store.addSlot(cellist.id, {
    kind: "once",
    startDate: firstDate,
    endDate: null,
    startMinute: 1140,
    endMinute: 1260,
  });
  store.setRsvp(group.id, rehearsal.id, cellist.id, firstDate, "yes");
  const target = { memberId: cellist.id, groupId: group.id, accountId: account.id };
  await syncMember(target);
  return {
    store,
    group,
    organizer,
    cellist,
    pianist,
    account,
    rehearsal,
    firstDate,
    target,
    organizerCookie: await deviceCookie(group.id, organizer.deviceToken),
    cellistCookie: `${await deviceCookie(group.id, cellist.deviceToken)}; ${session}`,
    session,
  };
}

function post(groupId: string, cookie: string, form: Record<string, string>) {
  return action(
    routeArgs(`/g/${addressFor(groupId)}`, { groupAddress: addressFor(groupId) }, { cookie, form }),
  ) as Promise<unknown>;
}

function load(groupId: string, cookie?: string) {
  return loader(
    routeArgs(`/g/${addressFor(groupId)}`, { groupAddress: addressFor(groupId) }, { cookie }),
  ) as Promise<Awaited<ReturnType<typeof loader>>>;
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

const inserts = () =>
  google.calendarCalls().filter((call) => call.method === "POST" && call.url.endsWith("/events"));
const deletes = () => google.calendarCalls().filter((call) => call.method === "DELETE");

describe("group settings", () => {
  it("renames the group and changes its zone, keeping clock times and re-writing events", async () => {
    const { group, organizerCookie, firstDate } = await band();
    expect(inserts()).toHaveLength(2);
    google.calls.length = 0;

    const response = await post(group.id, organizerCookie, {
      intent: "update-group",
      name: "Quartet in G",
      timeZone: "America/New_York",
    });
    await whenSynced();

    expect(await toastOf(response)).toBe("Group updated");
    expect(getStore().findGroup(group.id)).toMatchObject({
      name: "Quartet in G",
      timeZone: "America/New_York",
    });
    // The same two events, written again at 19:00 New York time with the new name.
    const rewritten = inserts().map(
      (call) => call.body as { summary: string; start: { dateTime: string } },
    );
    expect(rewritten).toHaveLength(2);
    expect(rewritten[0].summary).toBe("Quartet in G rehearsal");
    expect(rewritten[0].start.dateTime).toBe(
      (zonedInstant(firstDate, 1140, "America/New_York") as Date).toISOString(),
    );
  });

  it("keeps a pending removal through a rename, so the next sync still removes it", async () => {
    const { store, group, organizerCookie, rehearsal, firstDate, target } = await band();
    store.setCancelled(group.id, rehearsal.id, firstDate, true);
    // The removal fails once and stays recorded.
    google.queue.set("DELETE /calendars/primary/events/", [{ status: 500 }]);
    await syncMember(target).catch(() => {});
    expect(store.listCalendarEvents(target.memberId)).toHaveLength(2);

    await post(group.id, organizerCookie, {
      intent: "update-group",
      name: "Quartet 2",
      timeZone: ZONE,
    });
    await whenSynced();

    expect(store.listCalendarEvents(target.memberId).map((event) => event.date)).toEqual([
      addDays(firstDate, 7),
    ]);
    expect(deletes().length).toBeGreaterThanOrEqual(2);
  });

  it("refuses an empty name or an unknown zone, and changes nothing", async () => {
    const { group, organizerCookie } = await band();

    const result = await post(group.id, organizerCookie, {
      intent: "update-group",
      name: " ",
      timeZone: "Mars/Olympus",
    });

    expect(statusOf(result)).toBe(400);
    expect((result as { data: { settingsErrors: unknown } }).data.settingsErrors).toEqual({
      name: "Group name is required.",
      timeZone: "Choose the group's time zone.",
    });
    expect(getStore().findGroup(group.id)?.name).toBe("Quartet");
  });

  it("is for organizers only, with or without a confirmation", async () => {
    const { group, cellistCookie, pianist } = await band();

    const forms: Record<string, string>[] = [
      { intent: "update-group", name: "X", timeZone: ZONE },
      { intent: "rename-member", memberId: pianist.id, displayName: "X" },
      { intent: "remove-member", memberId: pianist.id },
      { intent: "remove-member", memberId: pianist.id, confirmed: "1" },
      { intent: "delete-group" },
      { intent: "delete-group", confirmed: "1" },
    ];
    for (const form of forms) {
      expect(statusOf(await thrownBy(post(group.id, cellistCookie, form)))).toBe(403);
    }
    expect(getStore().findGroup(group.id)?.name).toBe("Quartet");
    expect(getStore().listMembers(group.id)).toHaveLength(3);
    expect((await load(group.id, cellistCookie)).settings).toBeNull();
  });
});

describe("members", () => {
  it("renames a member", async () => {
    const { group, organizerCookie, pianist } = await band();

    const response = await post(group.id, organizerCookie, {
      intent: "rename-member",
      memberId: pianist.id,
      displayName: "  Spare tuba ",
    });

    expect(await toastOf(response)).toBe("Name changed");
    expect(getStore().findMember(group.id, pianist.id)?.displayName).toBe("Spare tuba");
    const empty = await post(group.id, organizerCookie, {
      intent: "rename-member",
      memberId: pianist.id,
      displayName: "",
    });
    expect(statusOf(empty)).toBe(400);
  });

  it("removes a member with their data and their Google events, past ones too", async () => {
    const { store, group, organizerCookie, cellist, account, session } = await band();
    // An event from an earlier date is still recorded.
    store.recordCalendarEvent(cellist.id, {
      rehearsalId: "old",
      date: "2020-01-02",
      eventId: "mcpastevent",
    });
    const before = { availability: count("availability"), rsvps: count("rsvps") };

    const response = await post(group.id, organizerCookie, {
      intent: "remove-member",
      memberId: cellist.id,
      confirmed: "1",
    });
    await whenSynced();

    expect(await toastOf(response)).toBe("Cellist removed");
    expect(store.findMember(group.id, cellist.id)).toBeNull();
    expect(count("availability")).toBe(before.availability - 1);
    expect(count("rsvps")).toBe(before.rsvps - 1);
    // Both upcoming dates and the past one.
    const removed = deletes().map((call) => call.url.split("/").pop());
    expect(removed).toHaveLength(3);
    expect(removed).toContain("mcpastevent");
    expect(store.listEventRemovals()).toEqual([]);
    // The account, its session and its Google grant stay.
    expect(store.findGrant(account.id)).not.toBeNull();
    expect(
      (await homeLoader(routeArgs("/", {}, { cookie: session }))) as { groups: unknown[] },
    ).toMatchObject({ groups: [] });
  });

  it("refuses to remove or demote the only organizer, and says so on the page", async () => {
    const { group, organizer, organizerCookie } = await band();

    const removal = await post(group.id, organizerCookie, {
      intent: "remove-member",
      memberId: organizer.id,
    });
    const demotion = await post(group.id, organizerCookie, {
      intent: "set-role",
      memberId: organizer.id,
      value: "off",
    });

    expect(statusOf(removal)).toBe(400);
    expect(statusOf(demotion)).toBe(400);
    expect((removal as { data: unknown }).data).toEqual({
      problem: "A group needs at least one organizer. Make someone else an organizer first.",
    });
    const page = await load(group.id, organizerCookie);
    expect(page.members[0].manage?.lastOrganizer).toBe(true);
    expect(page.members[1].manage?.lastOrganizer).toBe(false);
  });

  it("lets an organizer leave when another organizer remains", async () => {
    const { store, group, organizer, organizerCookie, pianist } = await band();
    store.setRole(group.id, pianist.id, "organizer");

    const response = await post(group.id, organizerCookie, {
      intent: "remove-member",
      memberId: organizer.id,
      confirmed: "1",
    });

    expect((response as Response).headers.get("Location")).toBe(groupPath(group));
    expect(await toastOf(response)).toBe("You left the group");
    expect((await load(group.id, organizerCookie)).viewer).toBeNull();
  });
});

describe("deleting a group", () => {
  it("deletes everything in it, removes its Google events and goes home with a message", async () => {
    const { store, group, organizerCookie, cellistCookie, session, account } = await band();
    const address = addressOf(group);
    const other = store.createGroup("Other band", "Oboe", ZONE).group;
    store.createRequest(group.id, {
      name: "Concert",
      startDate: addDays(todayInZone(ZONE, new Date()), 1),
      endDate: addDays(todayInZone(ZONE, new Date()), 20),
      windows: [{ startMinute: 1140, endMinute: 1320 }],
    });
    const before = count("groups");

    const response = await post(group.id, organizerCookie, {
      intent: "delete-group",
      confirmed: "1",
    });
    await whenSynced();

    expect((response as Response).headers.get("Location")).toBe("/");
    expect(await toastOf(response)).toBe("Group Quartet deleted");
    expect(count("groups")).toBe(before - 1);
    expect(store.findGroup(other.id)).not.toBeNull();
    expect(store.listMembers(group.id)).toEqual([]);
    expect(store.listRehearsals(group.id)).toEqual([]);
    expect(store.listRequests(group.id)).toEqual([]);
    expect(deletes()).toHaveLength(2);
    expect(store.listEventRemovals()).toEqual([]);
    // The deleted group's address no longer resolves.
    const gone = loader(
      routeArgs(`/g/${address}`, { groupAddress: address }, { cookie: cellistCookie }),
    );
    expect(statusOf(await thrownBy(gone))).toBe(404);
    expect(store.findGrant(account.id)).not.toBeNull();
    const home = (await homeLoader(routeArgs("/", {}, { cookie: session }))) as {
      groups: { name: string }[];
    };
    expect(home.groups.map((item) => item.name)).not.toContain("Quartet");
  });

  it("retries a Google removal that failed, and drops removals once access is gone", async () => {
    const { store, group, organizerCookie, account } = await band();
    google.queue.set("DELETE /calendars/primary/events/", [{ status: 500 }, { status: 500 }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await post(group.id, organizerCookie, { intent: "delete-group", confirmed: "1" });
    await whenSynced();
    expect(store.listEventRemovals()).toHaveLength(2);

    await sweepOnce();
    expect(store.listEventRemovals()).toEqual([]);

    // A removal for an account whose grant is gone cannot be done and is dropped.
    store.addEventRemoval({ accountId: account.id, eventId: "mcleftover" });
    store.deleteGrant(account.id);
    await sweepOnce();
    expect(store.listEventRemovals()).toEqual([]);
    warn.mockRestore();
  });

  it("queues an event written while the group was being deleted", async () => {
    const { store, group, organizerCookie, rehearsal, firstDate, target } = await band();
    // A new date to write, and the group deleted while Google takes the insert.
    store.forgetCalendarEvent(target.memberId, rehearsal.id, firstDate);
    const fake = globalThis.fetch;
    let deleted = false;
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      if (!deleted && init?.method === "POST" && String(input).endsWith("/events")) {
        deleted = true;
        await post(group.id, organizerCookie, { intent: "delete-group", confirmed: "1" });
      }
      return fake(input, init);
    });

    await syncMember(target);

    expect(deleted).toBe(true);
    expect(store.listEventRemovals().map((removal) => removal.accountId)).toContain(
      target.accountId,
    );
  });
});

describe("Google clean-up edge cases", () => {
  it("still removes every written event after a rename whose rewrite failed", async () => {
    const { store, group, organizerCookie, target } = await band();
    const written = store.listCalendarEvents(target.memberId).map((event) => event.eventId);
    expect(written).toHaveLength(2);
    google.queue.set("POST /calendars/primary/events", [{ status: 500 }, { status: 500 }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await post(group.id, organizerCookie, {
      intent: "update-group",
      name: "Renamed",
      timeZone: ZONE,
    });
    await whenSynced();
    expect(store.listCalendarEvents(target.memberId).map((event) => event.eventId)).toEqual(
      written,
    );
    await post(group.id, organizerCookie, { intent: "delete-group", confirmed: "1" });
    await whenSynced();

    // Every event written before the rename is removed (other tests may leave removals queued too).
    const removed = deletes().map((call) => call.url.split("/").pop());
    expect(written.every((id) => removed.includes(id))).toBe(true);
    warn.mockRestore();
  });

  it("keeps a removal when Google refuses the access token but the grant is still saved", async () => {
    const { store, account } = await band();
    store.addEventRemoval({ accountId: account.id, eventId: "mckeep" });
    google.queue.set("DELETE /calendars/primary/events/", [{ status: 401 }, { status: 401 }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sweepOnce();

    expect(store.findGrant(account.id)).not.toBeNull();
    expect(store.listEventRemovals()).toContainEqual({ accountId: account.id, eventId: "mckeep" });
    await sweepOnce();
    expect(store.listEventRemovals()).not.toContainEqual({
      accountId: account.id,
      eventId: "mckeep",
    });
    warn.mockRestore();
  });

  it("waits for writing access before removing, then removes", async () => {
    const { store, account } = await band();
    store.saveGrant(account.id, null, []);
    store.deleteGrant(account.id);
    store.saveGrant(account.id, "refresh-2", [CALENDAR_SCOPES.busy]);
    store.addEventRemoval({ accountId: account.id, eventId: "mcwait" });

    await sweepOnce();
    expect(deletes().filter((call) => call.url.endsWith("/mcwait"))).toEqual([]);
    expect(store.listEventRemovals()).toContainEqual({ accountId: account.id, eventId: "mcwait" });

    store.saveGrant(account.id, "refresh-2", [CALENDAR_SCOPES.write]);
    forgetAccessToken(account.id);
    await sweepOnce();
    expect(deletes().filter((call) => call.url.endsWith("/mcwait"))).toHaveLength(1);
    expect(store.listEventRemovals()).not.toContainEqual({
      accountId: account.id,
      eventId: "mcwait",
    });
  });

  it("offers the group's own zone in settings even when the runtime does not list it", async () => {
    const store = getStore();
    const { group, organizer } = store.createGroup("Zoned", "Viola", "Etc/GMT+5");
    const cookie = await deviceCookie(group.id, organizer.deviceToken);
    expect(Intl.supportedValuesOf("timeZone")).not.toContain("Etc/GMT+5");

    const page = await load(group.id, cookie);

    expect(page.settings?.timeZones[0]).toBe("Etc/GMT+5");
  });
});

describe("sending the invite link by email", () => {
  it("encodes the subject and body so any group name survives", () => {
    const link = inviteMailto("Bach & Co #1", "https://rehearse.example/join/abc");

    expect(link.startsWith("mailto:?subject=")).toBe(true);
    const url = new URL(link);
    const subject = decodeURIComponent(link.split("subject=")[1].split("&body=")[0]);
    const body = decodeURIComponent(link.split("&body=")[1]);
    expect(url.protocol).toBe("mailto:");
    expect(subject).toBe("Join Bach & Co #1 on music-chairs");
    expect(body).toContain("\r\n\r\nJoin here: https://rehearse.example/join/abc");
    expect(link).not.toContain("+");
    expect(link.split("&")).toHaveLength(2);
  });
});
