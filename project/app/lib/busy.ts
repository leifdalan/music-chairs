// Clashes with a member's Google Calendar (plan/phase-10.md, Decisions): busy
// periods read live from free/busy become busy quarter-hour ranges per date in
// the group's zone, which grey a date when they overlap the chosen times.

import { addDays, STEP_MINUTES } from "~/lib/availability";
import type { TimeWindow } from "~/lib/requests";
import { zonedInstant, zonedInstants } from "~/lib/zoned-time";

export type BusyPeriod = { start: Date; end: Date };

/** The longest span one free/busy query covers; Google refuses ranges of about three months. */
export const BUSY_QUERY_DAYS = 56;

const DAY_MINUTES = 24 * 60;

/** Queries covering every date from `first` to `last` in `zone`, each at most BUSY_QUERY_DAYS. */
export function busyQueries(
  first: string,
  last: string,
  zone: string,
): { timeMin: Date; timeMax: Date }[] {
  const queries = [];
  for (let start = first; start <= last; start = addDays(start, BUSY_QUERY_DAYS)) {
    const end =
      addDays(start, BUSY_QUERY_DAYS - 1) < last ? addDays(start, BUSY_QUERY_DAYS - 1) : last;
    queries.push({
      timeMin: zonedInstant(start, 0, zone, { skipped: "forward" }) as Date,
      timeMax: zonedInstant(addDays(end, 1), 0, zone, { skipped: "forward" }) as Date,
    });
  }
  return queries;
}

/**
 * Each occurrence of a quarter hour of wall-clock time as instants: none when
 * clocks skip it, two when clocks go back and repeat it.
 */
function quarterSpans(
  date: string,
  minute: number,
  zone: string,
): { start: number; end: number }[] {
  return zonedInstants(date, minute, zone).map((start) => ({
    start: start.getTime(),
    end: start.getTime() + STEP_MINUTES * 60_000,
  }));
}

/**
 * For each date, the quarter-hour ranges in which any busy period overlaps
 * any part of the quarter hour, merged and earliest first; dates with none
 * are left out. A quarter hour skipped when clocks go forward is never busy;
 * one repeated when they go back is busy when either occurrence is.
 */
export function busyRanges(
  periods: BusyPeriod[],
  dates: string[],
  zone: string,
): Record<string, TimeWindow[]> {
  const result: Record<string, TimeWindow[]> = {};
  for (const date of dates) {
    // Most dates have no busy period at all; skip them before checking 96 quarter
    // hours. A date's repeated last hour (clocks going back at midnight) still
    // ends before the next date's first midnight, so these bounds cover it.
    const dayStart = (zonedInstant(date, 0, zone, { skipped: "forward" }) as Date).getTime();
    const dayEnd = (
      zonedInstant(addDays(date, 1), 0, zone, { skipped: "forward" }) as Date
    ).getTime();
    if (
      !periods.some((period) => period.start.getTime() < dayEnd && period.end.getTime() > dayStart)
    ) {
      continue;
    }
    const ranges: TimeWindow[] = [];
    for (let minute = 0; minute < DAY_MINUTES; minute += STEP_MINUTES) {
      const busy = quarterSpans(date, minute, zone).some((span) =>
        periods.some(
          (period) => period.start.getTime() < span.end && period.end.getTime() > span.start,
        ),
      );
      if (!busy) continue;
      const previous = ranges.at(-1);
      if (previous && previous.endMinute === minute) previous.endMinute = minute + STEP_MINUTES;
      else ranges.push({ startMinute: minute, endMinute: minute + STEP_MINUTES });
    }
    if (ranges.length > 0) result[date] = ranges;
  }
  return result;
}

/** The parts of `ranges` inside `windows`, earliest first. */
export function clipRanges(ranges: TimeWindow[], windows: TimeWindow[]): TimeWindow[] {
  const clipped: TimeWindow[] = [];
  for (const range of ranges) {
    for (const window of windows) {
      const startMinute = Math.max(range.startMinute, window.startMinute);
      const endMinute = Math.min(range.endMinute, window.endMinute);
      if (endMinute > startMinute) clipped.push({ startMinute, endMinute });
    }
  }
  return clipped.sort((a, b) => a.startMinute - b.startMinute);
}

/** Whether any busy range overlaps any of `chosen`. */
export function clashes(ranges: TimeWindow[] | undefined, chosen: TimeWindow[]): boolean {
  return (ranges ?? []).some((range) =>
    chosen.some(
      (window) => range.startMinute < window.endMinute && range.endMinute > window.startMinute,
    ),
  );
}

/** The member's Google Calendar clashes as a page offers them (`~/.server/clashes`). */
export type Clashes =
  | { state: "none" }
  | { state: "connect"; connectUrl: string }
  | { state: "error" }
  | { state: "ready"; busy: Record<string, TimeWindow[]> };
