import { describe, expect, it } from "vitest";

import type { Slot } from "../app/lib/availability";
import {
  buildCells,
  freeDuring,
  freeStretches,
  missingRequired,
  type OverlapMember,
} from "../app/lib/overlap";

function slot(fields: Partial<Slot>): Slot {
  return {
    id: "s",
    kind: "weekly",
    startDate: "2026-10-01",
    endDate: null,
    startMinute: 19 * 60,
    endMinute: 22 * 60,
    skips: [],
    ...fields,
  };
}

function member(id: string, slots: Slot[], optional = false): OverlapMember {
  return { id, displayName: id.toUpperCase(), optional, slots };
}

// Thursday 2026-10-08: viola 19:00–22:00 weekly, cello 19:30–21:00 one-off,
// piano weekly but skipping that date.
const viola = member("viola", [slot({})]);
const cello = member("cello", [
  slot({ kind: "once", startDate: "2026-10-08", startMinute: 1170, endMinute: 1260 }),
]);
const piano = member("piano", [slot({ skips: ["2026-10-08"] })]);
const band = [viola, cello, piano];

describe("overlap", () => {
  it("compares quarter-hour times exactly", () => {
    const early = member("early", [slot({ startMinute: 19 * 60 + 15, endMinute: 20 * 60 + 45 })]);
    const late = member("late", [slot({ startMinute: 19 * 60 + 45, endMinute: 21 * 60 + 15 })]);

    const stretches = freeStretches(
      buildCells([early, late], "2026-10-08", "2026-10-08"),
      "2026-10-08",
    );

    expect(stretches).toEqual([
      { startMinute: 19 * 60 + 15, endMinute: 19 * 60 + 45, free: ["early"] },
      { startMinute: 19 * 60 + 45, endMinute: 20 * 60 + 45, free: ["early", "late"] },
      { startMinute: 20 * 60 + 45, endMinute: 21 * 60 + 15, free: ["late"] },
    ]);
  });

  it("splits a date into stretches where the set of free members changes", () => {
    const cells = buildCells(band, "2026-10-08", "2026-10-08");

    expect(freeStretches(cells, "2026-10-08")).toEqual([
      { startMinute: 1140, endMinute: 1170, free: ["viola"] },
      { startMinute: 1170, endMinute: 1260, free: ["cello", "viola"] },
      { startMinute: 1260, endMinute: 1320, free: ["viola"] },
    ]);
  });

  it("merges adjacent half hours with the same members and omits empty time", () => {
    const cells = buildCells(band, "2026-10-15", "2026-10-15");

    expect(freeStretches(cells, "2026-10-15")).toEqual([
      { startMinute: 1140, endMinute: 1320, free: ["piano", "viola"] },
    ]);
    expect(freeStretches(cells, "2026-10-16")).toEqual([]);
  });

  it("covers the whole day up to midnight", () => {
    const late = member("late", [slot({ startMinute: 1380, endMinute: 1440 })]);
    const cells = buildCells([late], "2026-10-01", "2026-10-01");

    expect(freeStretches(cells, "2026-10-01")).toEqual([
      { startMinute: 1380, endMinute: 1440, free: ["late"] },
    ]);
  });

  it("counts a member free for an interval only if free in every half hour of it", () => {
    const cells = buildCells(band, "2026-10-08", "2026-10-08");

    expect([...freeDuring(cells, "2026-10-08", 1170, 1260)].sort()).toEqual(["cello", "viola"]);
    expect([...freeDuring(cells, "2026-10-08", 1140, 1260)]).toEqual(["viola"]);
    expect([...freeDuring(cells, "2026-10-09", 1140, 1260)]).toEqual([]);
  });

  it("builds the window and each extra date, not every day in between", () => {
    const cells = buildCells(band, "2026-10-01", "2026-10-07", ["2062-10-05", "2026-10-03"]);

    expect([...cells.keys()].sort()).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2062-10-05",
    ]);
    // 2062-10-05 is a Thursday, so the open-ended weekly slots still meet it.
    expect(freeStretches(cells, "2062-10-05")).toEqual([
      { startMinute: 1140, endMinute: 1320, free: ["piano", "viola"] },
    ]);
  });

  it("names the non-optional members who are missing, and ignores optional ones", () => {
    const cells = buildCells(band, "2026-10-08", "2026-10-08");
    const free = freeDuring(cells, "2026-10-08", 1170, 1260);

    expect(missingRequired(band, free).map((m) => m.id)).toEqual(["piano"]);
    const optionalPiano = [viola, cello, { ...piano, optional: true }];
    expect(missingRequired(optionalPiano, free)).toEqual([]);
  });
});
