import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eventId, stopWritingFor, syncMember, whenSynced } from "../app/.server/calendar-sync";
import { readToast } from "../app/.server/flash";
import { CALENDAR_SCOPES, forgetAccessToken } from "../app/.server/google";
import { readAccount } from "../app/.server/membership";
import { getStore } from "../app/.server/store";
import { addDays, todayInZone } from "../app/lib/availability";
import { action, loader } from "../app/routes/auth.google.disconnect";
import { fakeGoogle, type GoogleFake } from "./google-fake";
import { ORIGIN, requestIn, routeArgs, setCookies, signedIn, tempDatabase } from "./routes";

tempDatabase();

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
  vi.restoreAllMocks();
});

let people = 0;

/**
 * A signed-in cellist who lets the app write to their calendar, with three
 * upcoming rehearsal events already written and one event queued for removal
 * from a membership that was removed.
 */
async function writingCellist(options: { grant?: boolean } = {}) {
  const store = getStore();
  people += 1;
  const { account, cookie } = await signedIn({
    sub: `disconnect-sub-${people}`,
    email: `cellist${people}@example.test`,
    name: "Cel",
    emailVerified: true,
  });
  forgetAccessToken(account.id);
  const { group } = store.createGroup("Quartet", "Viola", ZONE);
  const cellist = store.addMember(group.id, "Cellist", "member", account.id);
  if (options.grant !== false) {
    store.saveGrant(account.id, `refresh-${people}`, ["openid", CALENDAR_SCOPES.write]);
  }
  store.setCalendarSync(group.id, cellist.id, true);
  const firstDate = addDays(todayInZone(ZONE, new Date()), 7);
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id),
    {
      kind: "weekly",
      startDate: firstDate,
      endDate: addDays(firstDate, 14),
      startMinute: 19 * 60,
      endMinute: 21 * 60,
    },
    "Studio B",
  );
  store.confirmRehearsal(group.id, rehearsal.id);
  const target = { memberId: cellist.id, groupId: group.id, accountId: account.id };
  if (options.grant !== false) await syncMember(target);
  const queued = eventId(`removed-member-${people}`, "old-rehearsal", firstDate);
  store.addEventRemoval({ accountId: account.id, eventId: queued });
  google.calls.length = 0;
  return { store, account, cookie, group, cellist, queued };
}

function disconnect(cookie: string | undefined, confirmed = true, returnTo = "/g/abc/schedule") {
  return action(
    routeArgs(
      `/auth/google/disconnect?returnTo=${encodeURIComponent(returnTo)}`,
      {},
      { cookie, form: confirmed ? { confirmed: "1" } : {} },
    ),
  ) as Promise<unknown>;
}

async function toastOf(response: unknown): Promise<string | undefined> {
  const cookie = setCookies(response as Response).mc_toast;
  if (!cookie) return undefined;
  return (await readToast(new Request(ORIGIN, { headers: { Cookie: cookie } }))).toast?.message;
}

describe("Disconnect Google", () => {
  it("removes the app's upcoming events, revokes at Google, forgets the grant and keeps the person in", async () => {
    const { store, account, cookie, group, cellist, queued } = await writingCellist();
    const written = store.listCalendarEvents(cellist.id);
    expect(written).toHaveLength(3);
    // A past event stays in the calendar, but the app forgets it too.
    store.recordCalendarEvent(cellist.id, {
      rehearsalId: "old",
      date: "2020-01-02",
      eventId: "mcpast",
    });
    // Someone else's queued removal is theirs to keep.
    const other = await writingCellist();
    const token = store.findGrant(account.id)?.refreshToken;

    const response = (await disconnect(cookie)) as Response;

    expect(response.headers.get("Location")).toBe("/g/abc/schedule");
    expect(await toastOf(response)).toBe("Disconnected from Google");
    const deleted = google.calls
      .filter((call) => call.method === "DELETE")
      .map((call) => call.url.split("/").at(-1));
    expect(new Set(deleted)).toEqual(new Set([...written.map((e) => e.eventId), queued]));
    // Every removal happens while the token still works, before the revoke.
    const revokeAt = google.calls.findIndex((call) => call.url.endsWith("/revoke"));
    const lastDelete = google.calls.findLastIndex((call) => call.method === "DELETE");
    expect(lastDelete).toBeLessThan(revokeAt);
    expect(google.revokeCalls().map((call) => call.body)).toEqual([{ token }]);
    expect(store.findGrant(account.id)).toBeNull();
    expect(store.listCalendarEvents(cellist.id)).toEqual([]);
    expect(store.listEventRemovals().filter((r) => r.accountId === account.id)).toEqual([]);
    expect(deleted).not.toContain(other.queued);
    expect(store.listEventRemovals()).toContainEqual({
      accountId: other.account.id,
      eventId: other.queued,
    });
    expect(store.findMember(group.id, cellist.id)).toMatchObject({
      calendarSync: false,
      googleEmail: account.email,
    });
    const session = await readAccount(new Request(ORIGIN, { headers: { Cookie: cookie } }));
    expect(session?.id).toBe(account.id);
  });

  it("asks first, and changes nothing until confirmed", async () => {
    const { store, account, cookie } = await writingCellist();

    const result = await disconnect(cookie, false);

    expect(result).toMatchObject({ confirm: { title: "Disconnect Google?", label: "Disconnect" } });
    expect(google.calls).toEqual([]);
    expect(store.findGrant(account.id)).not.toBeNull();
  });

  it("does nothing for someone who isn't signed in", async () => {
    const { store, account } = await writingCellist();

    const response = (await disconnect(undefined)) as Response;

    expect(response.headers.get("Location")).toBe("/");
    expect(await toastOf(response)).toBe("You're not signed in");
    expect(google.calls).toEqual([]);
    expect(store.findGrant(account.id)).not.toBeNull();
  });

  it("still forgets everything when Google doesn't answer, and says to remove it at Google", async () => {
    const { store, account, cookie } = await writingCellist();
    google.revokeAnswer = { status: 503, body: { error: "unavailable" } };

    const response = await disconnect(cookie);

    expect(await toastOf(response)).toBe(
      "Disconnected from Google here, but Google didn't answer, so remove music-chairs at myaccount.google.com too.",
    );
    expect(store.findGrant(account.id)).toBeNull();
  });

  it("counts a token Google already treats as invalid as revoked", async () => {
    const { cookie } = await writingCellist();
    google.revokeAnswer = { status: 400, body: { error: "invalid_token" } };

    expect(await toastOf(await disconnect(cookie))).toBe("Disconnected from Google");
  });

  it("says when some events may remain in the calendar", async () => {
    const { store, account, cookie } = await writingCellist();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    google.queue.set("DELETE /calendars/primary/events/", [{ status: 500, body: {} }]);

    const response = await disconnect(cookie);

    expect(await toastOf(response)).toBe(
      "Disconnected from Google here, but some upcoming rehearsals may still be in your Google Calendar.",
    );
    expect(google.revokeCalls()).toHaveLength(1);
    expect(store.findGrant(account.id)).toBeNull();
  });

  it("says so when a removal queued from an earlier membership fails", async () => {
    const { cookie, queued } = await writingCellist();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    google.queue.set(`DELETE /calendars/primary/events/${queued}`, [{ status: 500, body: {} }]);

    expect(await toastOf(await disconnect(cookie))).toBe(
      "Disconnected from Google here, but some upcoming rehearsals may still be in your Google Calendar.",
    );
  });

  it("tells someone without a stored permission where to remove the sign-in", async () => {
    const { store, account, cookie, group, cellist } = await writingCellist({ grant: false });

    const response = await disconnect(cookie);

    expect(await toastOf(response)).toBe(
      "music-chairs holds no Google permissions for you. To remove the sign-in itself, use myaccount.google.com.",
    );
    expect(google.calls).toEqual([]);
    expect(store.findMember(group.id, cellist.id)?.calendarSync).toBe(false);
    expect(store.listEventRemovals().filter((r) => r.accountId === account.id)).toEqual([]);
  });

  it("stops waiting for Google after 20 seconds and reports leftovers", async () => {
    const { account } = await writingCellist();
    const answer = globalThis.fetch;
    const held: (() => void)[] = [];
    let holding = true;
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) =>
      holding && init?.method === "DELETE"
        ? new Promise<Response>((resolve) =>
            held.push(() => resolve(new Response(null, { status: 204 }))),
          )
        : answer(input, init),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let settled = false;
      const stopping = stopWritingFor(account.id).finally(() => (settled = true));
      await vi.advanceTimersByTimeAsync(19_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await stopping).toBe(false);
    } finally {
      vi.useRealTimers();
      // Let Google answer again so no sync or removal chain stays pending.
      holding = false;
      for (const release of held.splice(0)) release();
      await whenSynced();
    }
  });

  it("revokes only after every group's removals have finished, even when one fails", async () => {
    const { store, account, cookie } = await writingCellist();
    // A second group the cellist writes to, whose removals answer more slowly.
    const { group } = store.createGroup("Trio", "Pia", ZONE);
    const second = store.addMember(group.id, "Cellist", "member", account.id);
    store.setCalendarSync(group.id, second.id, true);
    const firstDate = addDays(todayInZone(ZONE, new Date()), 8);
    const rehearsal = store.addRehearsal(
      group.id,
      requestIn(group.id),
      { kind: "once", startDate: firstDate, endDate: null, startMinute: 600, endMinute: 660 },
      "Hall",
    );
    store.confirmRehearsal(group.id, rehearsal.id);
    await syncMember({ memberId: second.id, groupId: group.id, accountId: account.id });
    const slow = new Set(store.listCalendarEvents(second.id).map((event) => event.eventId));
    expect(slow.size).toBe(1);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    google.queue.set("DELETE /calendars/primary/events/", [{ status: 500, body: {} }]);
    const answer = globalThis.fetch;
    const finished: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE" && slow.has(url.split("/").at(-1)!)) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      const response = await answer(input, init);
      finished.push(init?.method === "DELETE" ? `DELETE ${url}` : url);
      return response;
    });

    await disconnect(cookie);

    const revoked = finished.findIndex((entry) => entry.endsWith("/revoke"));
    expect(finished.some((entry) => slow.has(entry.split("/").at(-1)!))).toBe(true);
    expect(finished.findLastIndex((entry) => entry.startsWith("DELETE"))).toBeLessThan(revoked);
  });

  it("goes back to where the person came from when they cancel", () => {
    const back = loader(routeArgs("/auth/google/disconnect?returnTo=%2Fg%2Fabc", {})) as Response;
    const away = loader(
      routeArgs("/auth/google/disconnect?returnTo=https%3A%2F%2Fevil.test", {}),
    ) as Response;

    expect(back.headers.get("Location")).toBe("/g/abc");
    expect(away.headers.get("Location")).toBe("/");
  });
});

describe("forgetting a Google connection in the store", () => {
  it("touches only that account", async () => {
    const mine = await writingCellist();
    const theirs = await writingCellist();

    mine.store.disconnectGoogle(mine.account.id);

    expect(mine.store.findGrant(theirs.account.id)).not.toBeNull();
    expect(mine.store.listCalendarEvents(theirs.cellist.id)).toHaveLength(3);
    expect(mine.store.findMember(theirs.group.id, theirs.cellist.id)?.calendarSync).toBe(true);
    expect(
      mine.store.listEventRemovals().filter((r) => r.accountId === theirs.account.id),
    ).toHaveLength(1);
    expect(mine.store.findMember(mine.group.id, mine.cellist.id)?.calendarSync).toBe(false);
  });
});
