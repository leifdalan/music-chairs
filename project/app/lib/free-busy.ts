// Turning Google Calendar busy periods into proposed one-off availability
// (plan/phase-7.md, Decisions, on Phase 8's 15-minute grid): a quarter hour
// counts as free only when no busy period touches any part of it.

import { addDays, expandOccurrences, STEP_MINUTES, type Slot } from "./availability";
import { zonedInstant } from "./zoned-time";

/** How many days ahead an import looks, starting today. */
export const IMPORT_DAYS = 28;

const STEP = STEP_MINUTES;
/** Shorter free stretches are not worth proposing as rehearsal time. */
const MIN_PROPOSAL = 60;

export type Proposal = { date: string; startMinute: number; endMinute: number };

export type BusyPeriod = { start: Date; end: Date };

/** The instants a free/busy query covers: from today's first moment for `days` days. */
export function importRange(firstDate: string, days: number, zone: string) {
  return {
    timeMin: zonedInstant(firstDate, 0, zone, { skipped: "forward" }) as Date,
    timeMax: zonedInstant(addDays(firstDate, days), 0, zone, { skipped: "forward" }) as Date,
  };
}

/**
 * Free stretches of at least an hour inside the daily window, for `days` days
 * from `firstDate` in `zone`. Quarter hours already over at `now`, quarter hours a
 * daylight-saving change skips, and stretches the member's existing
 * availability already covers that day are left out.
 */
export function proposeFreeSlots(input: {
  busy: BusyPeriod[];
  zone: string;
  firstDate: string;
  days: number;
  windowStart: number;
  windowEnd: number;
  now: Date;
  existing: Slot[];
}): Proposal[] {
  const proposals: Proposal[] = [];
  for (let offset = 0; offset < input.days; offset++) {
    const date = addDays(input.firstDate, offset);
    const covering = expandOccurrences(input.existing, date, date);
    let runStart: number | null = null;
    const close = (end: number) => {
      if (runStart !== null && end - runStart >= MIN_PROPOSAL) {
        const start = runStart;
        const covered = covering.some((o) => o.startMinute <= start && o.endMinute >= end);
        if (!covered) proposals.push({ date, startMinute: start, endMinute: end });
      }
      runStart = null;
    };
    for (let minute = input.windowStart; minute < input.windowEnd; minute += STEP) {
      if (isFree(date, minute, input)) {
        runStart ??= minute;
      } else {
        close(minute);
      }
    }
    close(input.windowEnd);
  }
  return proposals;
}

function isFree(
  date: string,
  minute: number,
  input: { busy: BusyPeriod[]; zone: string; now: Date },
): boolean {
  const start = zonedInstant(date, minute, input.zone);
  const end = zonedInstant(date, minute + STEP, input.zone);
  if (!start || !end || end.getTime() <= input.now.getTime()) return false;
  return !input.busy.some(
    (period) => period.start.getTime() < end.getTime() && period.end.getTime() > start.getTime(),
  );
}
