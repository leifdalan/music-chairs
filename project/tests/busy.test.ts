import { describe, expect, it } from "vitest";

import { BUSY_QUERY_DAYS, busyQueries, busyRanges, clashes, clipRanges } from "../app/lib/busy";

const at = (iso: string) => new Date(iso);

describe("busyRanges", () => {
  it("marks every quarter hour a busy period touches, merged per date", () => {
    // Europe/London is on BST (UTC+1) in October before the 25th.
    const ranges = busyRanges(
      [
        { start: at("2026-10-06T18:10:00Z"), end: at("2026-10-06T19:00:00Z") }, // 19:10–20:00
        { start: at("2026-10-06T19:00:00Z"), end: at("2026-10-06T19:20:00Z") }, // 20:00–20:20
      ],
      ["2026-10-05", "2026-10-06"],
      "Europe/London",
    );
    expect(ranges).toEqual({ "2026-10-06": [{ startMinute: 1140, endMinute: 1230 }] });
  });

  it("splits a period across midnight between its dates", () => {
    const ranges = busyRanges(
      [{ start: at("2026-10-06T22:30:00Z"), end: at("2026-10-07T00:15:00Z") }], // 23:30–01:15
      ["2026-10-06", "2026-10-07"],
      "Europe/London",
    );
    expect(ranges).toEqual({
      "2026-10-06": [{ startMinute: 1410, endMinute: 1440 }],
      "2026-10-07": [{ startMinute: 0, endMinute: 75 }],
    });
  });

  it("never marks the hour skipped when clocks go forward", () => {
    // 29 March 2026: 01:00 GMT jumps to 02:00 BST. Busy 00:30 GMT to 03:00 BST.
    const ranges = busyRanges(
      [{ start: at("2026-03-29T00:30:00Z"), end: at("2026-03-29T02:00:00Z") }],
      ["2026-03-29"],
      "Europe/London",
    );
    expect(ranges["2026-03-29"]).toEqual([
      { startMinute: 30, endMinute: 60 },
      { startMinute: 120, endMinute: 180 },
    ]);
  });

  it("marks a repeated quarter hour busy when only its second occurrence is", () => {
    // 25 October 2026: 02:00 BST falls back to 01:00 GMT, so 01:00–01:59 happens twice.
    // Busy only during the second 01:15–01:30 (01:15–01:30 UTC).
    const ranges = busyRanges(
      [{ start: at("2026-10-25T01:15:00Z"), end: at("2026-10-25T01:30:00Z") }],
      ["2026-10-25"],
      "Europe/London",
    );
    expect(ranges["2026-10-25"]).toEqual([{ startMinute: 75, endMinute: 90 }]);
  });

  it("finds the repeated last hour in a zone whose clocks go back at midnight", () => {
    // 4 April 2026, America/Santiago: midnight (UTC-3) goes back to 23:00 (UTC-4).
    // Busy only during the second 23:30–23:45, which is 03:30–03:45 UTC on the 5th.
    const ranges = busyRanges(
      [{ start: at("2026-04-05T03:30:00Z"), end: at("2026-04-05T03:45:00Z") }],
      ["2026-04-04"],
      "America/Santiago",
    );
    expect(ranges["2026-04-04"]).toEqual([{ startMinute: 1410, endMinute: 1425 }]);
  });
});

describe("clipRanges and clashes", () => {
  it("keeps only the parts inside the windows", () => {
    expect(
      clipRanges(
        [
          { startMinute: 540, endMinute: 1200 },
          { startMinute: 1290, endMinute: 1440 },
        ],
        [
          { startMinute: 600, endMinute: 780 },
          { startMinute: 1140, endMinute: 1320 },
        ],
      ),
    ).toEqual([
      { startMinute: 600, endMinute: 780 },
      { startMinute: 1140, endMinute: 1200 },
      { startMinute: 1290, endMinute: 1320 },
    ]);
  });

  it("finds overlap with any chosen range, and none when touching or empty", () => {
    const busy = [{ startMinute: 1200, endMinute: 1260 }];
    expect(clashes(busy, [{ startMinute: 1140, endMinute: 1215 }])).toBe(true);
    expect(clashes(busy, [{ startMinute: 1260, endMinute: 1320 }])).toBe(false);
    expect(clashes(busy, [{ startMinute: 1080, endMinute: 1200 }])).toBe(false);
    expect(clashes(undefined, [{ startMinute: 0, endMinute: 1440 }])).toBe(false);
    expect(clashes(busy, [])).toBe(false);
  });
});

describe("busyQueries", () => {
  it("covers a 26-week span in chunks of at most 56 days, back to back", () => {
    const queries = busyQueries("2026-11-02", "2027-05-02", "Europe/London");
    expect(queries).toHaveLength(4);
    expect(queries[0].timeMin.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    for (let index = 1; index < queries.length; index++) {
      expect(queries[index].timeMin).toEqual(queries[index - 1].timeMax);
    }
    for (const query of queries) {
      const days = (query.timeMax.getTime() - query.timeMin.getTime()) / 86_400_000;
      expect(days).toBeLessThanOrEqual(BUSY_QUERY_DAYS + 1 / 24);
    }
    // The last query ends at the start of the day after the last date (BST in May).
    expect(queries.at(-1)?.timeMax.toISOString()).toBe("2027-05-02T23:00:00.000Z");
  });

  it("is one query for a short span", () => {
    expect(busyQueries("2026-10-02", "2026-11-26", "Europe/London")).toHaveLength(1);
  });
});
