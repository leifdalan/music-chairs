// The organizer's calendar of who is free (plan/phase-20.md): each date shaded
// by how many people are free together.

import { freeDuring, type Cells } from "./overlap";
import { PROPOSE_LENGTHS } from "./propose";
import type { TimeWindow } from "./requests";

/** Shades above "nobody free". */
export const HEAT_LEVELS = 4;

const QUARTER_HOUR = 15;

/** 0 when nobody is free, otherwise 1 to `HEAT_LEVELS` by the share of members free. */
export function heatLevel(free: number, total: number): number {
  if (free <= 0 || total <= 0) return 0;
  return Math.min(HEAT_LEVELS, Math.ceil((HEAT_LEVELS * free) / total));
}

/**
 * The most people free together on `date` for a whole stretch as long as the
 * shortest rehearsal that can be proposed, starting on any quarter hour inside
 * the request's times of day. Someone else's short slot in the middle doesn't
 * split it, and a sliver shorter than that never counts.
 */
export function dayHeat(cells: Cells, date: string, windows: TimeWindow[]): number {
  const length = PROPOSE_LENGTHS[0];
  let best = 0;
  for (const window of windows) {
    for (
      let start = window.startMinute;
      start + length <= window.endMinute;
      start += QUARTER_HOUR
    ) {
      best = Math.max(best, freeDuring(cells, date, start, start + length).size);
    }
  }
  return best;
}
