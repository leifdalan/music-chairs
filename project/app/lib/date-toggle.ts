// Whether a date shows as ticked on a request's calendar while times save as
// they are ticked (plan/phase-23.md, Decision 1).

import { timeRange } from "./availability";
import { clashes } from "./busy";
import type { TimeWindow } from "./requests";

/** A one-off time the member saved, as the calendar compares it. */
export type OneOff = { date: string; startMinute: number; endMinute: number };

/**
 * Ticked when the member has a time on `date` within the request's windows
 * (the loader sends only those). A save still in flight shows its outcome at
 * once; a failed one doesn't, so the saved state shows.
 */
export function dateTicked(
  date: string,
  oneOffs: OneOff[],
  pending: { on: boolean } | null,
): boolean {
  if (pending) return pending.on;
  return oneOffs.some((slot) => slot.date === date);
}

/** The times saved on `date`, as "7–10 PM" (several joined), or null. */
export function timesOn(date: string, oneOffs: OneOff[]): string | null {
  const times = oneOffs
    .filter((slot) => slot.date === date)
    .map((slot) => timeRange(slot.startMinute, slot.endMinute));
  return times.length > 0 ? times.join(", ") : null;
}

/**
 * The dates ticked when a member first opens a request (plan/phase-31.md):
 * every date whose Google Calendar busy times don't clash with `range` (the
 * request's first time of day), plus every date they already gave times for,
 * even a busy one. With no busy times known, or no range, every date.
 */
export function startingTicks(
  dates: string[],
  busy: Record<string, TimeWindow[]>,
  range: TimeWindow | null,
  given: OneOff[],
): string[] {
  const kept = new Set(given.map((slot) => slot.date));
  return dates.filter((date) => kept.has(date) || range === null || !clashes(busy[date], [range]));
}
