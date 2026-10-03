// Wall-clock dates and minutes in an IANA zone, turned into instants. Every
// date is YYYY-MM-DD and every time minutes after midnight (1440 is the next
// midnight), as in `~/lib/availability`.

const HOUR_MS = 60 * 60 * 1000;

// Building a formatter is far slower than using one; busy ranges ask for
// thousands of offsets per page.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** How far `zone` is ahead of UTC at `utcMs`, in milliseconds. */
function offsetAt(zone: string, utcMs: number): number {
  const parts = formatterFor(zone).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Every instant at which clocks in `zone` show `date` and `minute`, earliest
 * first: one normally, two in the hour repeated when clocks go back, none in
 * the hour skipped when they go forward.
 */
export function zonedInstants(date: string, minute: number, zone: string): Date[] {
  const wall = wallTime(date, minute);
  // Around a change the zone has two offsets; sampling half a day either side finds both.
  return [...new Set([offsetAt(zone, wall - 12 * HOUR_MS), offsetAt(zone, wall + 12 * HOUR_MS)])]
    .map((offset) => wall - offset)
    .filter((instant) => offsetAt(zone, instant) === wall - instant)
    .sort((a, b) => a - b)
    .map((instant) => new Date(instant));
}

/**
 * The instant at which clocks in `zone` show `date` and `minute`. A time
 * repeated when clocks go back gives the earlier instant. A time skipped when
 * clocks go forward gives null, or with `skipped: "forward"` the instant the
 * same distance past the jump (02:30 on a 02:00→03:00 night becomes 03:30).
 */
export function zonedInstant(
  date: string,
  minute: number,
  zone: string,
  options: { skipped?: "null" | "forward" } = {},
): Date | null {
  const [earliest] = zonedInstants(date, minute, zone);
  if (earliest) return earliest;
  const wall = wallTime(date, minute);
  return options.skipped === "forward"
    ? new Date(wall - offsetAt(zone, wall - 12 * HOUR_MS))
    : null;
}

/** The wall-clock reading as if it were UTC, in milliseconds. */
function wallTime(date: string, minute: number): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) + minute * 60_000;
}
