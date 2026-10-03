import { describe, expect, it } from "vitest";

import { zonedInstant } from "../app/lib/zoned-time";

const iso = (value: Date | null) => value?.toISOString() ?? null;

describe("wall-clock time to instant", () => {
  it("converts ordinary summer and winter times", () => {
    expect(iso(zonedInstant("2026-07-01", 19 * 60 + 30, "Europe/London"))).toBe(
      "2026-07-01T18:30:00.000Z",
    );
    expect(iso(zonedInstant("2026-01-15", 19 * 60 + 30, "Europe/London"))).toBe(
      "2026-01-15T19:30:00.000Z",
    );
    expect(iso(zonedInstant("2026-07-01", 19 * 60, "America/New_York"))).toBe(
      "2026-07-01T23:00:00.000Z",
    );
  });

  it("treats minute 1440 as the next midnight", () => {
    expect(iso(zonedInstant("2026-07-01", 1440, "Europe/London"))).toBe("2026-07-01T23:00:00.000Z");
  });

  it("gives null, or the time past the jump, for a time clocks skip", () => {
    // London clocks go 01:00 → 02:00 on 29 March 2026; New York 02:00 → 03:00 on 8 March.
    expect(zonedInstant("2026-03-29", 90, "Europe/London")).toBeNull();
    expect(iso(zonedInstant("2026-03-29", 90, "Europe/London", { skipped: "forward" }))).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(zonedInstant("2026-03-08", 150, "America/New_York")).toBeNull();
    expect(iso(zonedInstant("2026-03-08", 150, "America/New_York", { skipped: "forward" }))).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("gives the earlier instant for a time clocks repeat", () => {
    // London 02:00 BST → 01:00 GMT on 25 October 2026; New York 02:00 → 01:00 on 1 November.
    expect(iso(zonedInstant("2026-10-25", 90, "Europe/London"))).toBe("2026-10-25T00:30:00.000Z");
    expect(iso(zonedInstant("2026-11-01", 90, "America/New_York"))).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });
});
