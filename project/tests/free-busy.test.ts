import { describe, expect, it } from "vitest";

import type { Slot } from "../app/lib/availability";
import { importRange, proposeFreeSlots, type BusyPeriod } from "../app/lib/free-busy";

const busyAt = (start: string, end: string): BusyPeriod => ({
  start: new Date(start),
  end: new Date(end),
});

const base = {
  zone: "UTC",
  firstDate: "2026-11-02",
  days: 1,
  windowStart: 9 * 60,
  windowEnd: 12 * 60,
  now: new Date("2026-11-01T00:00:00Z"),
  existing: [] as Slot[],
};

describe("free/busy proposals", () => {
  it("counts a half-hour free only when no busy period touches it", () => {
    const proposals = proposeFreeSlots({
      ...base,
      busy: [busyAt("2026-11-02T10:15:00Z", "2026-11-02T10:45:00Z")],
    });

    expect(proposals).toEqual([
      { date: "2026-11-02", startMinute: 9 * 60, endMinute: 10 * 60 },
      { date: "2026-11-02", startMinute: 11 * 60, endMinute: 12 * 60 },
    ]);
  });

  it("drops stretches shorter than an hour", () => {
    const proposals = proposeFreeSlots({
      ...base,
      busy: [
        busyAt("2026-11-02T09:00:00Z", "2026-11-02T10:00:00Z"),
        busyAt("2026-11-02T10:30:00Z", "2026-11-02T12:00:00Z"),
      ],
    });

    expect(proposals).toEqual([]);
  });

  it("leaves out half-hours already over and stretches the member already has", () => {
    const existing: Slot[] = [
      {
        id: "s",
        kind: "weekly",
        startDate: "2026-10-26",
        endDate: null,
        startMinute: 10 * 60 + 30,
        endMinute: 13 * 60,
        skips: [],
      },
    ];
    const proposals = proposeFreeSlots({
      ...base,
      busy: [busyAt("2026-11-02T10:00:00Z", "2026-11-02T10:30:00Z")],
      now: new Date("2026-11-02T09:10:00Z"),
      existing,
    });

    // 09:00–10:00 is still under way at 09:10 and stays; 10:30–12:00 is already covered.
    expect(proposals).toEqual([{ date: "2026-11-02", startMinute: 9 * 60, endMinute: 10 * 60 }]);
  });

  it("covers every day of the range and nothing past it", () => {
    const proposals = proposeFreeSlots({ ...base, days: 28, windowEnd: 10 * 60, busy: [] });

    expect(proposals).toHaveLength(28);
    expect(proposals.at(-1)?.date).toBe("2026-11-29");
  });

  it("skips the half-hours a daylight-saving change removes", () => {
    // London clocks go 01:00 → 02:00 on 29 March 2026.
    const proposals = proposeFreeSlots({
      ...base,
      zone: "Europe/London",
      firstDate: "2026-03-29",
      windowStart: 0,
      windowEnd: 3 * 60,
      now: new Date("2026-03-01T00:00:00Z"),
      busy: [],
    });

    expect(proposals).toEqual([{ date: "2026-03-29", startMinute: 2 * 60, endMinute: 3 * 60 }]);
  });

  it("queries from today's first moment for the number of days", () => {
    const range = importRange("2026-07-01", 28, "Europe/London");

    expect(range.timeMin.toISOString()).toBe("2026-06-30T23:00:00.000Z");
    expect(range.timeMax.toISOString()).toBe("2026-07-28T23:00:00.000Z");
  });
});
