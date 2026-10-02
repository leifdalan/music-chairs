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

/** Occurrences are listed from today for this many weeks. */
export const UPCOMING_WEEKS = 8;

const STEP_MINUTES = 30;
const DAY_MINUTES = 24 * 60;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
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

function parseTime(value: string, label: string, end: boolean): number | string {
  if (value === "") return `${label} is required.`;
  const match = TIME_PATTERN.exec(value);
  if (!match) return `${label} is not a valid time.`;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return `${label} is not a valid time.`;
  if (minutes % STEP_MINUTES !== 0)
    return `${label} must be on the hour or half hour (:00 or :30).`;
  const total = hours * 60 + minutes;
  // "00:00" as an end time means midnight at the end of the day.
  return end && total === 0 ? DAY_MINUTES : total;
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

/** "Every Thursday from 1 Oct until 24 Dec" or "Thu 8 Oct". */
export function describeSlot(slot: SlotInput): string {
  const times = `${formatMinutes(slot.startMinute)}–${formatMinutes(slot.endMinute)}`;
  if (slot.kind === "once") return `${formatDate(slot.startDate)}, ${times}`;
  const from = formatDate(slot.startDate).slice(4);
  const until = slot.endDate ? ` until ${formatDate(slot.endDate).slice(4)}` : "";
  return `Every ${weekdayName(slot.startDate)} from ${from}${until}, ${times}`;
}
