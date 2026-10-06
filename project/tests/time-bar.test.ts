import { describe, expect, it } from "vitest";

import {
  barEnds,
  barSelectionOf,
  barStarts,
  boundaryAt,
  dragTo,
  EMPTY_BAR,
  fractionOf,
  tapAt,
} from "../app/lib/time-bar";

describe("the hour bar's arithmetic", () => {
  it("snaps a point on the bar to the nearest half hour from 9 AM to midnight", () => {
    expect(boundaryAt(0)).toBe(540);
    expect(boundaryAt(1)).toBe(1440);
    expect(boundaryAt(-0.2)).toBe(540);
    expect(boundaryAt(1.3)).toBe(1440);
    // 7 PM sits two thirds of the way along; a little either side still snaps to it.
    expect(boundaryAt(2 / 3)).toBe(1140);
    expect(boundaryAt(2 / 3 + 0.01)).toBe(1140);
    expect(boundaryAt(2 / 3 + 0.02)).toBe(1170);
    expect(fractionOf(540)).toBe(0);
    expect(fractionOf(1440)).toBe(1);
  });

  it("anchors a first tap, then completes the range on a second, either way round", () => {
    const first = tapAt(EMPTY_BAR, 1140);
    expect(first).toEqual({ anchor: 1140, range: null });
    expect(tapAt(first, 1320)).toEqual({
      anchor: null,
      range: { startMinute: 1140, endMinute: 1320 },
    });
    expect(tapAt({ anchor: 1320, range: null }, 1140)).toEqual({
      anchor: null,
      range: { startMinute: 1140, endMinute: 1320 },
    });
  });

  it("clears the anchor when it is tapped again, and starts afresh after a complete range", () => {
    expect(tapAt({ anchor: 1140, range: null }, 1140)).toEqual(EMPTY_BAR);
    const done = { anchor: null, range: { startMinute: 1140, endMinute: 1320 } };
    expect(tapAt(done, 600)).toEqual({ anchor: 600, range: null });
  });

  it("drags from the press to the pointer, with no range until it moves", () => {
    expect(dragTo(1110, 1260)).toEqual({
      anchor: 1110,
      range: { startMinute: 1110, endMinute: 1260 },
    });
    expect(dragTo(1260, 1110).range).toEqual({ startMinute: 1110, endMinute: 1260 });
    expect(dragTo(1110, 1110)).toEqual({ anchor: 1110, range: null });
  });

  it("draws only stored ranges that fit the bar's half hours", () => {
    const evening = { startMinute: 1140, endMinute: 1440 };
    expect(barSelectionOf(evening)).toEqual({ anchor: null, range: evening });
    expect(barSelectionOf(null)).toEqual(EMPTY_BAR);
    expect(barSelectionOf({ startMinute: 480, endMinute: 600 })).toEqual(EMPTY_BAR);
    expect(barSelectionOf({ startMinute: 1140, endMinute: 1335 })).toEqual(EMPTY_BAR);
    expect(barSelectionOf({ startMinute: 1155, endMinute: 1320 })).toEqual(EMPTY_BAR);
    expect(barSelectionOf({ startMinute: 1320, endMinute: 1140 })).toEqual(EMPTY_BAR);
  });

  it("lists 30 starts from 9 AM and 30 ends to midnight", () => {
    expect(barStarts()).toHaveLength(30);
    expect(barStarts()[0]).toBe(540);
    expect(barStarts().at(-1)).toBe(1410);
    expect(barEnds()[0]).toBe(570);
    expect(barEnds().at(-1)).toBe(1440);
  });
});
