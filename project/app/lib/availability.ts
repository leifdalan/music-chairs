// Availability rules: parsing a slot form, expanding weekly patterns into
// dates, and the group-zone calendar helpers. Every date is a YYYY-MM-DD
// calendar date and every time is minutes after midnight, both meaning
// wall-clock time in the group's time zone (plan/phase-2.md, Decisions).

export type SlotKind = "once" | "weekly";

export type SlotInput = {
  kind: SlotKind;
  startDate: string;
  endDate: string | null;
  startMinute: number;
  endMinute: number;
};

export type Slot = SlotInput & { id: string; skips: string[] };

export type Occurrence = { slotId: string; date: string; startMinute: number; endMinute: number };

export type SlotFormValues = {
  kind: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export type SlotErrors = Partial<Record<keyof SlotFormValues, string>>;

export type SlotParse =
  { ok: true; value: SlotInput } | { ok: false; errors: SlotErrors; values: SlotFormValues };

export const LOCATION_MAX = 120;

/** A rehearsal's free-text location: trimmed, may be empty, capped in code points. */
export function validateLocation(
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (Array.from(value).length > LOCATION_MAX) {
    return { ok: false, error: `Location must be at most ${LOCATION_MAX} characters.` };
  }
  return { ok: true, value };
}

/** Occurrences are listed from today for this many weeks. */
export const UPCOMING_WEEKS = 8;

/** Every time is a multiple of this many minutes (plan/phase-8.md). */
export const STEP_MINUTES = 15;
const DAY_MINUTES = 24 * 60;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The calendar date as a UTC midnight, so host zone and DST never shift it. */
function utcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Whether `value` is a real calendar date written as YYYY-MM-DD. */
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  return isoDate(utcDate(value)) === value;
}

export function addDays(date: string, days: number): string {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

function daysBetween(from: string, to: string): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);
}

export function weekdayName(date: string): string {
  return WEEKDAYS[utcDate(date).getUTCDay()];
}

/** "Thu 8 Oct" — fixed English names, identical on server and browser. */
export function formatDate(date: string): string {
  const value = utcDate(date);
  return `${WEEKDAYS[value.getUTCDay()].slice(0, 3)} ${value.getUTCDate()} ${MONTHS[value.getUTCMonth()]}`;
}

/** "19:00"; the end of the day reads "24:00". */
export function formatMinutes(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The value for an `<input type="time">`; the end of the day is "00:00". */
export function timeInputValue(minutes: number): string {
  return formatMinutes(minutes % DAY_MINUTES);
}

/** The calendar date it is now in `zone`. */
export function todayInZone(zone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The canonical IANA name for a zone this runtime knows, or null. */
export function canonicalTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export type TimeParse =
  | { ok: true; minutes: number; meridiem: boolean }
  | { ok: false; reason: "empty" | "unreadable" | "too-late" };

const TYPED_TIME = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/;
const TYPED_DIGITS = /^(\d{3,4})\s*(am|pm|a|p)?$/;

/**
 * A typed time ("9", "9:02", "930", "7pm", "12:45 am", "21:15") rounded to the
 * nearest 15 minutes, half-way rounding up. With am/pm the hour is 1–12 (12am
 * is 0:00, 12pm is noon); without, 0–24, and 24 only as 24:00. A start that
 * rounds to the end of the day is too late; an end of 0:00 or 24:00 means
 * midnight at the end of the day. `meridiem` says whether am/pm was typed, so
 * the field can show the rounded time the way it was written.
 */
export function parseTimeText(text: string, options: { end: boolean }): TimeParse {
  const value = text.trim().toLowerCase().replace(/\./g, "");
  if (value === "") return { ok: false, reason: "empty" };
  let hours: number;
  let minutes: number;
  let suffix: string | undefined;
  const digits = TYPED_DIGITS.exec(value);
  const typed = digits ? null : TYPED_TIME.exec(value);
  if (digits) {
    hours = Math.floor(Number(digits[1]) / 100);
    minutes = Number(digits[1]) % 100;
    suffix = digits[2];
  } else if (typed) {
    hours = Number(typed[1]);
    minutes = typed[2] === undefined ? 0 : Number(typed[2]);
    suffix = typed[3];
  } else {
    return { ok: false, reason: "unreadable" };
  }
  if (minutes > 59) return { ok: false, reason: "unreadable" };
  if (suffix) {
    if (hours < 1 || hours > 12) return { ok: false, reason: "unreadable" };
    hours = (hours % 12) + (suffix.startsWith("p") ? 12 : 0);
  } else if (hours > 24 || (hours === 24 && minutes > 0)) {
    return { ok: false, reason: "unreadable" };
  }
  const exact = hours * 60 + minutes;
  const rounded = Math.floor((exact + STEP_MINUTES / 2) / STEP_MINUTES) * STEP_MINUTES;
  const meridiem = suffix !== undefined;
  if (options.end) {
    return {
      ok: true,
      minutes: rounded === 0 || rounded >= DAY_MINUTES ? DAY_MINUTES : rounded,
      meridiem,
    };
  }
  if (rounded >= DAY_MINUTES) return { ok: false, reason: "too-late" };
  return { ok: true, minutes: rounded, meridiem };
}

/** A time of day as "9:45pm" (12-hour, as typed with am/pm); the end of the day is "12:00am". */
export function formatMeridiem(minutes: number): string {
  const inDay = minutes % DAY_MINUTES;
  const hours = Math.floor(inDay / 60);
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(inDay % 60).padStart(2, "0")}${hours < 12 ? "am" : "pm"}`;
}

function parseTime(value: string, label: string, end: boolean): number | string {
  const parsed = parseTimeText(value, { end });
  if (parsed.ok) return parsed.minutes;
  if (parsed.reason === "empty") return `${label} is required.`;
  if (parsed.reason === "too-late") return `${label} is too late; the latest start is 23:45.`;
  return `${label} is not a valid time.`;
}

/** Validates the add/edit form; one-off slots ignore any end date. */
export function parseSlotInput(form: FormData): SlotParse {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const values: SlotFormValues = {
    kind: field("kind"),
    startDate: field("startDate"),
    endDate: field("endDate"),
    startTime: field("startTime"),
    endTime: field("endTime"),
  };
  const errors: SlotErrors = {};
  const kind = values.kind === "once" || values.kind === "weekly" ? values.kind : null;
  if (!kind) errors.kind = "Choose one-off or every week.";
  if (!isDate(values.startDate)) {
    errors.startDate = values.startDate ? "Enter a valid date." : "Date is required.";
  }
  const start = parseTime(values.startTime, "Start time", false);
  const end = parseTime(values.endTime, "End time", true);
  if (typeof start === "string") errors.startTime = start;
  if (typeof end === "string") errors.endTime = end;
  if (typeof start === "number" && typeof end === "number" && end <= start) {
    errors.endTime = "End time must be after the start time.";
  }
  let endDate: string | null = null;
  if (kind === "weekly" && values.endDate) {
    if (!isDate(values.endDate)) errors.endDate = "Enter a valid end date.";
    else if (isDate(values.startDate) && values.endDate < values.startDate) {
      errors.endDate = "The end date can't be before the first date.";
    } else endDate = values.endDate;
  }
  if (
    Object.keys(errors).length > 0 ||
    !kind ||
    typeof start !== "number" ||
    typeof end !== "number"
  ) {
    return { ok: false, errors, values };
  }
  return {
    ok: true,
    value: { kind, startDate: values.startDate, endDate, startMinute: start, endMinute: end },
  };
}

/** Whether a weekly slot meets on `date`, before skips are applied. */
export function isOccurrence(slot: SlotInput, date: string): boolean {
  if (slot.kind !== "weekly" || !isDate(date)) return false;
  if (date < slot.startDate || (slot.endDate !== null && date > slot.endDate)) return false;
  return daysBetween(slot.startDate, date) % 7 === 0;
}

/** Every unskipped occurrence between `from` and `to`, both inclusive. */
export function expandOccurrences(slots: Slot[], from: string, to: string): Occurrence[] {
  const occurrences: Occurrence[] = [];
  for (const slot of slots) {
    const times = { slotId: slot.id, startMinute: slot.startMinute, endMinute: slot.endMinute };
    if (slot.kind === "once") {
      if (slot.startDate >= from && slot.startDate <= to) {
        occurrences.push({ ...times, date: slot.startDate });
      }
      continue;
    }
    const last = slot.endDate !== null && slot.endDate < to ? slot.endDate : to;
    const offset = Math.max(0, daysBetween(slot.startDate, from));
    let date = addDays(slot.startDate, Math.ceil(offset / 7) * 7);
    const skipped = new Set(slot.skips);
    while (date <= last) {
      if (!skipped.has(date)) occurrences.push({ ...times, date });
      date = addDays(date, 7);
    }
  }
  return occurrences.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startMinute - b.startMinute ||
      a.endMinute - b.endMinute ||
      a.slotId.localeCompare(b.slotId),
  );
}

/** The last date of the overlap and answer window that starts `today`. */
export function windowEnd(today: string): string {
  return addDays(today, UPCOMING_WEEKS * 7 - 1);
}

/**
 * The dates members can answer for (and that go on their calendars): from
 * `today` to `until` (or a one-off's own date beyond it), skipped dates
 * excluded. Answers, Google writes and the feed share this one definition.
 */
export function offeredDates(slot: Slot, today: string, until: string): string[] {
  const last = slot.kind === "once" && slot.startDate > until ? slot.startDate : until;
  return expandOccurrences([slot], today, last).map((occurrence) => occurrence.date);
}

/** "Every Thursday from 1 Oct until 24 Dec" or "Thu 8 Oct". */
export function describeSlot(slot: SlotInput): string {
  const times = `${formatMinutes(slot.startMinute)}–${formatMinutes(slot.endMinute)}`;
  if (slot.kind === "once") return `${formatDate(slot.startDate)}, ${times}`;
  const from = formatDate(slot.startDate).slice(4);
  const until = slot.endDate ? ` until ${formatDate(slot.endDate).slice(4)}` : "";
  return `Every ${weekdayName(slot.startDate)} from ${from}${until}, ${times}`;
}
