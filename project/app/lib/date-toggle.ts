// Whether a date shows as ticked on My availability's calendar while times
// save as they are ticked (plan/phase-19.2.md).

import type { TimeWindow } from "./requests";

/** A one-off time the member saved, as the calendar compares it. */
export type OneOff = { date: string; startMinute: number; endMinute: number };

/**
 * Ticked when the member has a one-off time on `date` at exactly the chosen
 * range. A save still in flight for that same range shows its outcome at
 * once; one for another range (the range changed meanwhile) or a failed one
 * doesn't, so the saved state shows. Nothing is ticked before a range is chosen.
 */
export function dateTicked(
  date: string,
  chosen: TimeWindow | null,
  oneOffs: OneOff[],
  pending: { on: boolean; range: TimeWindow | null } | null,
): boolean {
  if (!chosen) return false;
  if (pending && sameRange(pending.range, chosen)) return pending.on;
  return oneOffs.some((slot) => slot.date === date && sameRange(slot, chosen));
}

export function sameRange(a: TimeWindow | null, b: TimeWindow): boolean {
  return a !== null && a.startMinute === b.startMinute && a.endMinute === b.endMinute;
}
