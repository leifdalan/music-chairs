// A rehearsal is one date and time (plan/phase-29.md): no weekly rehearsals,
// no per-date cancelling. Its notes are plain text an organizer writes.

import { formatDate, isDate, parseTime, timeRange } from "./availability";

/** A rehearsal's date and time, in the group's zone. */
export type RehearsalInput = { date: string; startMinute: number; endMinute: number };

/** "Tue 13 Oct, 7–9 PM". */
export function describeRehearsal(rehearsal: RehearsalInput): string {
  return `${formatDate(rehearsal.date)}, ${timeRange(rehearsal.startMinute, rehearsal.endMinute)}`;
}

/**
 * Whether members can still answer a rehearsal and it still goes on their
 * calendars: its date is today or later in the group's zone. The one rule the
 * schedule, calendars, home page and progress share.
 */
export function isUpcoming(rehearsal: { date: string }, today: string): boolean {
  return rehearsal.date >= today;
}

/** The longest note, in characters (a line break counts as one). */
export const NOTES_MAX = 1000;

/** Notes as plain text: line breaks made "\n", trimmed, may be empty, capped. */
export function validateNotes(
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = (typeof raw === "string" ? raw : "").replace(/\r\n?/g, "\n").trim();
  if (Array.from(value).length > NOTES_MAX) {
    return {
      ok: false,
      error: `Notes can be at most ${NOTES_MAX.toLocaleString("en")} characters.`,
    };
  }
  return { ok: true, value };
}

export type RehearsalFormValues = { date: string; startTime: string; endTime: string };
export type RehearsalErrors = Partial<Record<keyof RehearsalFormValues, string>>;

/** The "Propose a different time" form: a date, a start and an end. */
export function parseRehearsalInput(
  form: FormData,
):
  | { ok: true; value: RehearsalInput }
  | { ok: false; errors: RehearsalErrors; values: RehearsalFormValues } {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const values: RehearsalFormValues = {
    date: field("date"),
    startTime: field("startTime"),
    endTime: field("endTime"),
  };
  const errors: RehearsalErrors = {};
  if (!isDate(values.date)) errors.date = values.date ? "Enter a valid date." : "Date is required.";
  const start = parseTime(values.startTime, "Start time", false);
  const end = parseTime(values.endTime, "End time", true);
  if (typeof start === "string") errors.startTime = start;
  if (typeof end === "string") errors.endTime = end;
  if (typeof start === "number" && typeof end === "number" && end <= start) {
    errors.endTime = "End time must be after the start time.";
  }
  if (Object.keys(errors).length > 0 || typeof start !== "number" || typeof end !== "number") {
    return { ok: false, errors, values };
  }
  return { ok: true, value: { date: values.date, startMinute: start, endMinute: end } };
}
