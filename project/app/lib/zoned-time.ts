// Wall-clock dates and minutes in an IANA zone, turned into instants. Every
// date is YYYY-MM-DD and every time minutes after midnight (1440 is the next
// midnight), as in `~/lib/availability`.

const HOUR_MS = 60 * 60 * 1000;

/** How far `zone` is ahead of UTC at `utcMs`, in milliseconds. */
function offsetAt(zone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
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
  const [year, month, day] = date.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day) + minute * 60_000;
  // Around a change the zone has two offsets; sampling half a day either side finds both.
  const before = offsetAt(zone, wall - 12 * HOUR_MS);
  const after = offsetAt(zone, wall + 12 * HOUR_MS);
  const matches = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((instant) => offsetAt(zone, instant) === wall - instant)
    .sort((a, b) => a - b);
  if (matches.length > 0) return new Date(matches[0]);
  return options.skipped === "forward" ? new Date(wall - before) : null;
}
