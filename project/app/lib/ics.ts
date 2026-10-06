// A minimal iCalendar (RFC 5545) feed: published events with UTC times, CRLF
// line endings and lines folded at 75 octets without splitting a character.

export type FeedEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location: string;
  description: string;
};

function utc(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Splits a line into 75-octet pieces; continuation lines start with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = pieces.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      pieces.push(current);
      current = "";
      size = 0;
    }
    current += character;
    size += bytes;
  }
  pieces.push(current);
  return pieces.join("\r\n ");
}

export function renderFeed(calendarName: string, events: FeedEvent[], now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//music-chairs//rehearsals//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${utc(now)}`,
      `DTSTART:${utc(event.start)}`,
      `DTEND:${utc(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
      `DESCRIPTION:${escapeText(event.description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
