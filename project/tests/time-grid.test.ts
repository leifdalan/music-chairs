import { describe, expect, it } from "vitest";

import { cellsOf, dragTo, EMPTY_SELECTION, rangeFromCells, tapCell } from "../app/lib/time-grid";

describe("tap grid", () => {
  it("selects one cell, extends from it either way, then starts again", () => {
    const first = tapCell(EMPTY_SELECTION, 76); // 19:00
    expect(first).toEqual({ anchor: 76, range: { first: 76, last: 76 } });
    const extended = tapCell(first, 87); // 21:45
    expect(extended).toEqual({ anchor: null, range: { first: 76, last: 87 } });
    expect(tapCell(first, 70)).toEqual({ anchor: null, range: { first: 70, last: 76 } });
    expect(tapCell(extended, 40)).toEqual({ anchor: 40, range: { first: 40, last: 40 } });
  });

  it("drags from the anchor to the current cell", () => {
    expect(dragTo(80, 74)).toEqual({ anchor: 80, range: { first: 74, last: 80 } });
  });

  it("turns cells into times, a last cell of 23:45 ending at midnight", () => {
    expect(rangeFromCells(76, 87)).toEqual({ startMinute: 1140, endMinute: 1320 });
    expect(rangeFromCells(95, 95)).toEqual({ startMinute: 1425, endMinute: 1440 });
    expect(rangeFromCells(0, 0)).toEqual({ startMinute: 0, endMinute: 15 });
  });

  it("turns quarter-hour times back into cells, and refuses anything else", () => {
    expect(cellsOf(1140, 1320)).toEqual({ first: 76, last: 87 });
    expect(cellsOf(1425, 1440)).toEqual({ first: 95, last: 95 });
    expect(cellsOf(1140, 1140)).toBeNull();
    expect(cellsOf(1141, 1320)).toBeNull();
    expect(cellsOf(1320, 1140)).toBeNull();
    expect(cellsOf(0, 1455)).toBeNull();
  });
});
