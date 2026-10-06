// The hour bar's arithmetic (plan/phase-22.md): a day from 9 AM to midnight
// in half-hour steps. A range runs between two of the bar's boundaries.

import type { TimeWindow } from "~/lib/requests";

export const BAR_START = 9 * 60;
export const BAR_END = 24 * 60;
export const BAR_STEP = 30;

/**
 * The anchor is the boundary a range is being drawn from (after a first tap,
 * or while a drag is under way), or null once a range is complete.
 */
export type BarSelection = {
  anchor: number | null;
  range: TimeWindow | null;
};

export const EMPTY_BAR: BarSelection = { anchor: null, range: null };

/** The boundary nearest a point `fraction` (0–1) of the way along the bar. */
export function boundaryAt(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  const steps = Math.round((clamped * (BAR_END - BAR_START)) / BAR_STEP);
  return BAR_START + steps * BAR_STEP;
}

/** How far along the bar `minute` sits, 0–1. */
export function fractionOf(minute: number): number {
  return (minute - BAR_START) / (BAR_END - BAR_START);
}

function between(a: number, b: number): TimeWindow {
  return { startMinute: Math.min(a, b), endMinute: Math.max(a, b) };
}

/**
 * A tap: the first anchors a start; the next, at another boundary, completes
 * the range between them in either order; tapping the anchor again clears it;
 * a tap after a completed range starts again.
 */
export function tapAt(selection: BarSelection, minute: number): BarSelection {
  if (selection.anchor === null) return { anchor: minute, range: null };
  if (selection.anchor === minute) return EMPTY_BAR;
  return { anchor: null, range: between(selection.anchor, minute) };
}

/** A drag from `anchor` to `minute`, still anchored while the pointer is down. */
export function dragTo(anchor: number, minute: number): BarSelection {
  return { anchor, range: anchor === minute ? null : between(anchor, minute) };
}

/** A stored range drawn on the bar, or nothing when it doesn't fit the bar's boundaries. */
export function barSelectionOf(range: TimeWindow | null): BarSelection {
  if (
    !range ||
    range.startMinute < BAR_START ||
    range.endMinute > BAR_END ||
    range.startMinute % BAR_STEP !== 0 ||
    range.endMinute % BAR_STEP !== 0 ||
    range.endMinute <= range.startMinute
  ) {
    return EMPTY_BAR;
  }
  return { anchor: null, range };
}

/** The half hours a range may start at and end at, as minutes. */
export function barStarts(): number[] {
  const starts: number[] = [];
  for (let minute = BAR_START; minute < BAR_END; minute += BAR_STEP) starts.push(minute);
  return starts;
}

export function barEnds(): number[] {
  return barStarts().map((minute) => minute + BAR_STEP);
}
