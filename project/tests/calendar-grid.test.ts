import { describe, expect, it } from "vitest";

import { monthGrid } from "../app/lib/calendar-grid";

describe("monthGrid", () => {
  it("lays dates out in Sunday-first weeks with blanks outside the range", () => {
    // 2026-10-02 is a Friday; 2026-10-31 a Saturday; 2026-11-03 a Tuesday.
    const months = monthGrid("2026-10-02", "2026-11-03");
    expect(months.map((month) => month.label)).toEqual(["October 2026", "November 2026"]);
    const october = months[0].weeks;
    expect(october[0]).toEqual([null, null, null, null, null, "2026-10-02", "2026-10-03"]);
    expect(october.at(-1)).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    expect(months[1].weeks).toEqual([
      ["2026-11-01", "2026-11-02", "2026-11-03", null, null, null, null],
    ]);
    for (const month of months) for (const week of month.weeks) expect(week).toHaveLength(7);
  });

  it("is empty for an empty range and crosses a year end", () => {
    expect(monthGrid("2026-10-05", "2026-10-04")).toEqual([]);
    expect(monthGrid("2026-12-31", "2027-01-01").map((month) => month.label)).toEqual([
      "December 2026",
      "January 2027",
    ]);
  });
});
