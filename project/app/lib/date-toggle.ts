// Whether a date shows as ticked on a request's calendar while times save as
// they are ticked (plan/phase-23.md, Decision 1).

import { timeRange } from "./availability";

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
