// Scheduling requests (plan/phase-9.md): a named date span and the times of day
// it covers. Dates and minutes are wall-clock values in the group's zone, as in
// availability.

import { addDays, daysBetween, isDate, parseTimeText } from "~/lib/availability";
import type { Stretch } from "~/lib/overlap";

/** A time of day, as minutes after midnight (an end of 1440 is midnight). */
export type TimeWindow = { startMinute: number; endMinute: number };

export const REQUEST_NAME_MAX = 80;
/** "Any number" of preset times, bounded far beyond a band's needs. */
export const MAX_WINDOWS = 12;
/** The longest span a request can cover. */
export const MAX_SPAN_WEEKS = 26;

export type WindowValues = { start: string; end: string };

export type RequestFormValues = {
  name: string;
  startDate: string;
  endDate: string;
  windows: WindowValues[];
};

export type RequestErrors = {
  name?: string;
  startDate?: string;
  endDate?: string;
  /** Not about one row: no windows at all. */
  windows?: string;
  /** By row index. */
  rows?: Record<number, string>;
};

export type RequestParse =
  | {
      ok: true;
      value: { name: string; startDate: string; endDate: string; windows: TimeWindow[] };
    }
  | { ok: false; errors: RequestErrors; values: RequestFormValues };

/** The window rows the form sent, in order, blank rows included. */
function readWindowRows(form: FormData): WindowValues[] {
  const rows: WindowValues[] = [];
  for (let index = 0; index < MAX_WINDOWS; index++) {
    const start = form.get(`windowStart-${index}`);
    const end = form.get(`windowEnd-${index}`);
    if (start === null && end === null) continue;
    rows.push({
      start: typeof start === "string" ? start.trim() : "",
      end: typeof end === "string" ? end.trim() : "",
    });
  }
  return rows;
}

/** Overlapping, touching and duplicate windows become one, earliest first. */
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort((a, b) => a.startMinute - b.startMinute);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged.at(-1);
    if (last && window.startMinute <= last.endMinute) {
      last.endMinute = Math.max(last.endMinute, window.endMinute);
    } else merged.push({ ...window });
  }
  return merged;
}

/**
 * Validates the create/edit form. A start date before `today` is refused,
 * unless it is `storedStart` (an edit keeping a start that has passed).
 */
/** Everything the form sent, trimmed, for validation or redisplay. */
export function readRequestFormValues(form: FormData): RequestFormValues {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    name: field("name"),
    startDate: field("startDate"),
    endDate: field("endDate"),
    windows: readWindowRows(form),
  };
}

export function parseRequestForm(
  form: FormData,
  options: { today: string; storedStart?: string },
): RequestParse {
  const values = readRequestFormValues(form);
  const errors: RequestErrors = {};
  if (values.name === "") errors.name = "Give the request a name.";
  else if (Array.from(values.name).length > REQUEST_NAME_MAX) {
    errors.name = `The name must be at most ${REQUEST_NAME_MAX} characters.`;
  }
  const startOk = isDate(values.startDate);
  if (!startOk) {
    errors.startDate = values.startDate ? "Enter a valid date." : "The first date is required.";
  } else if (values.startDate < options.today && values.startDate !== options.storedStart) {
    errors.startDate = "The first date can't be in the past.";
  }
  if (!isDate(values.endDate)) {
    errors.endDate = values.endDate ? "Enter a valid date." : "The last date is required.";
  } else if (startOk && values.endDate < values.startDate) {
    errors.endDate = "The last date can't be before the first date.";
  } else if (startOk && daysBetween(values.startDate, values.endDate) >= MAX_SPAN_WEEKS * 7) {
    errors.endDate = `A request can cover at most ${MAX_SPAN_WEEKS} weeks.`;
  }

  const windows: TimeWindow[] = [];
  const rows: Record<number, string> = {};
  values.windows.forEach((row, index) => {
    if (row.start === "" && row.end === "") return;
    const start = parseTimeText(row.start, { end: false });
    const end = parseTimeText(row.end, { end: true });
    if (!start.ok || !end.ok) {
      rows[index] =
        !start.ok && start.reason === "too-late"
          ? "The start is too late; the latest start is 23:45."
          : "Enter a start and an end time.";
    } else if (end.minutes <= start.minutes) {
      rows[index] = "The end must be after the start.";
    } else windows.push({ startMinute: start.minutes, endMinute: end.minutes });
  });
  if (Object.keys(rows).length > 0) errors.rows = rows;
  else if (windows.length === 0) errors.windows = "Add at least one time of day.";

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return {
    ok: true,
    value: {
      name: values.name,
      startDate: values.startDate,
      endDate: values.endDate,
      windows: mergeWindows(windows),
    },
  };
}

/** Whether members can still answer a request: open, and not over (dates in the group's zone). */
export function answerable(request: { open: boolean; endDate: string }, today: string): boolean {
  return request.open && request.endDate >= today;
}

/** The parts of each free stretch that fall inside the request's windows. */
export function clipToWindows(stretches: Stretch[], windows: TimeWindow[]): Stretch[] {
  const clipped: Stretch[] = [];
  for (const stretch of stretches) {
    for (const window of windows) {
      const startMinute = Math.max(stretch.startMinute, window.startMinute);
      const endMinute = Math.min(stretch.endMinute, window.endMinute);
      if (endMinute > startMinute) clipped.push({ startMinute, endMinute, free: stretch.free });
    }
  }
  return clipped.sort((a, b) => a.startMinute - b.startMinute);
}

/**
 * The span for repeating a request: the same length, starting the day after it
 * ended, or today if that day has already passed.
 */
export function repeatSpan(
  startDate: string,
  endDate: string,
  today: string,
): { startDate: string; endDate: string } {
  const length = daysBetween(startDate, endDate);
  const after = addDays(endDate, 1);
  const start = after < today ? today : after;
  return { startDate: start, endDate: addDays(start, length) };
}

/** The first date from `today` on the same weekday as `date`. */
export function nextWeekday(today: string, date: string): string {
  return addDays(date, Math.ceil(daysBetween(date, today) / 7) * 7);
}
