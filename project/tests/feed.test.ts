import { describe, expect, it } from "vitest";

import { getStore } from "../app/.server/store";
import { addDays, todayInZone } from "../app/lib/availability";
import { loader } from "../app/routes/calendar-feed";
import { requestIn, routeArgs } from "./routes";

function fetchFeed(feedFile: string) {
  return loader(routeArgs(`/calendar/${feedFile}`, { feedFile })) as Response;
}

/** A UTC group with a confirmed weekly rehearsal; Cellist said No to week 2 and week 3 is cancelled. */
function band() {
  const store = getStore();
  const { group } = store.createGroup("Quartet", "Viola", "UTC");
  const cellist = store.addMember(group.id, "Cellist", "member");
  const first = addDays(todayInZone("UTC", new Date()), 2);
  const rehearsal = store.addRehearsal(
    group.id,
    requestIn(group.id),
    {
      kind: "weekly",
      startDate: first,
      endDate: addDays(first, 21),
      startMinute: 1140,
      endMinute: 1260,
    },
    "Studio B",
  );
  store.confirmRehearsal(group.id, rehearsal.id);
  store.setRsvp(group.id, rehearsal.id, cellist.id, addDays(first, 7), "no");
  store.setCancelled(group.id, rehearsal.id, addDays(first, 14), true);
  return { store, cellist, rehearsal, first };
}

const stamp = (date: string, time: string) => `${date.replace(/-/g, "")}T${time}Z`;

describe("a member's calendar feed", () => {
  it("lists their confirmed dates, without dates they said No to or cancelled dates", async () => {
    const { store, cellist, rehearsal, first } = band();
    const token = store.feedTokenFor(cellist.id);

    const response = fetchFeed(`${token}.ics`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(text).toContain("X-WR-CALNAME:Quartet rehearsals");
    expect(text).toContain(`DTSTART:${stamp(first, "190000")}`);
    expect(text).toContain(`DTSTART:${stamp(addDays(first, 21), "190000")}`);
    expect(text).not.toContain(stamp(addDays(first, 7), "190000"));
    expect(text).not.toContain(stamp(addDays(first, 14), "190000"));
    expect(text).toContain(`UID:${rehearsal.id}-${first}@music-chairs`);
    expect(text).toContain("LOCATION:Studio B");
  });

  it("carries quarter-hour times", async () => {
    const { store, cellist, first } = band();
    const group = store.findGroup(cellist.groupId)!;
    const later = store.addRehearsal(
      group.id,
      requestIn(group.id),
      {
        kind: "once",
        startDate: addDays(first, 1),
        endDate: null,
        startMinute: 1155,
        endMinute: 1305,
      },
      "Hall",
    );
    store.confirmRehearsal(group.id, later.id);

    const text = await fetchFeed(`${store.feedTokenFor(cellist.id)}.ics`).text();

    expect(text).toContain(`DTSTART:${stamp(addDays(first, 1), "191500")}`);
    expect(text).toContain(`DTEND:${stamp(addDays(first, 1), "214500")}`);
  });

  it("keeps the same link for a member", () => {
    const { store, cellist } = band();

    expect(store.feedTokenFor(cellist.id)).toBe(store.feedTokenFor(cellist.id));
    expect(store.findMemberByFeed(store.feedTokenFor(cellist.id))?.id).toBe(cellist.id);
  });

  it("answers 404 for an unknown or malformed link", () => {
    const { store, cellist } = band();
    const token = store.feedTokenFor(cellist.id);

    expect(fetchFeed(`${"A".repeat(22)}.ics`).status).toBe(404);
    expect(fetchFeed(token).status).toBe(404);
  });
});
