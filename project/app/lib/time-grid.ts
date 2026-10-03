// The tap grid's arithmetic (plan/phase-10.md, Decisions): a day of 96
// quarter-hour cells, cell i covering minutes 15i to 15i + 15. A range covers
// whole cells, so a range ending in the 23:45 cell ends at midnight (1440).

import { STEP_MINUTES } from "~/lib/availability";
import type { TimeWindow } from "~/lib/requests";

export const CELLS_PER_DAY = (24 * 60) / STEP_MINUTES;

/**
 * The anchor is the cell a range is being extended from (after a first tap),
 * or null once a range is complete.
 */
export type GridSelection = {
  anchor: number | null;
  range: { first: number; last: number } | null;
};

export const EMPTY_SELECTION: GridSelection = { anchor: null, range: null };

/**
 * A tap: the first selects one cell and anchors there; the next extends the
 * range from the anchor to the tapped cell, either direction, and completes
 * it; a tap after a completed range starts a new one.
 */
export function tapCell(selection: GridSelection, cell: number): GridSelection {
  if (selection.anchor === null) return { anchor: cell, range: { first: cell, last: cell } };
  return { anchor: null, range: spanOf(selection.anchor, cell) };
}

/** A drag from `anchor` to `cell` (mouse or pen), still anchored while the button is down. */
export function dragTo(anchor: number, cell: number): GridSelection {
  return { anchor, range: spanOf(anchor, cell) };
}

function spanOf(a: number, b: number): { first: number; last: number } {
  return { first: Math.min(a, b), last: Math.max(a, b) };
}

/** The times a run of cells covers. */
export function rangeFromCells(first: number, last: number): TimeWindow {
  return { startMinute: first * STEP_MINUTES, endMinute: (last + 1) * STEP_MINUTES };
}

/** The cells a quarter-hour range covers, or null when it is not one. */
export function cellsOf(
  startMinute: number,
  endMinute: number,
): { first: number; last: number } | null {
  if (
    startMinute % STEP_MINUTES !== 0 ||
    endMinute % STEP_MINUTES !== 0 ||
    startMinute < 0 ||
    endMinute > CELLS_PER_DAY * STEP_MINUTES ||
    endMinute <= startMinute
  ) {
    return null;
  }
  return { first: startMinute / STEP_MINUTES, last: endMinute / STEP_MINUTES - 1 };
}
