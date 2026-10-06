import { describe, expect, it } from "vitest";

import { renderFeed } from "../app/lib/ics";

const now = new Date("2026-10-02T12:00:00Z");
const event = {
  uid: "r1-2026-10-08@music-chairs",
  start: new Date("2026-10-08T18:30:00Z"),
  end: new Date("2026-10-08T20:30:00Z"),
  summary: "Quartet, strings; rehearsal",
  location: "Studio B\nback door",
  description: 'Rehearsal for Quartet, from the availability request "Winter concert".',
};

describe("calendar feed", () => {
  it("is a published calendar with CRLF lines and UTC times", () => {
    const feed = renderFeed("Quartet rehearsals", [event], now);

    expect(feed.endsWith("\r\n")).toBe(true);
    expect(feed.split("\r\n").slice(0, 6)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//music-chairs//rehearsals//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Quartet rehearsals",
    ]);
    expect(feed).toContain("\r\nUID:r1-2026-10-08@music-chairs\r\n");
    expect(feed).toContain("\r\nDTSTART:20261008T183000Z\r\n");
    expect(feed).toContain("\r\nDTEND:20261008T203000Z\r\n");
    expect(feed).toContain("\r\nDTSTAMP:20261002T120000Z\r\n");
    expect(feed.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("escapes text values", () => {
    const feed = renderFeed("Q", [event], now);

    expect(feed).toContain("SUMMARY:Quartet\\, strings\\; rehearsal");
    expect(feed).toContain("LOCATION:Studio B\\nback door");
    expect(feed.replace(/\r\n /g, "")).toContain(
      'DESCRIPTION:Rehearsal for Quartet\\, from the availability request "Winter concert".',
    );
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const location =
      "Gemeindesaal Müller-Lüdenscheidt, Hinterhof über die Brücke, 2. Stock ÄÖÜ ünd mehr";
    const feed = renderFeed("Q", [{ ...event, location }], now);
    const lines = feed.split("\r\n");
    const encoder = new TextEncoder();

    for (const line of lines) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = feed.replace(/\r\n /g, "");
    expect(unfolded).toContain(`LOCATION:${location.replace(/,/g, "\\,")}`);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
  });
});
