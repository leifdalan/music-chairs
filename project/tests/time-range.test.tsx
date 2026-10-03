import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TimeGrid, TimeRange } from "../app/components/time-range";

describe("time range", () => {
  it("sends only the typed fields from the server, which work without JavaScript", () => {
    const html = renderToString(
      <TimeRange
        startName="startTime"
        endName="endTime"
        startValue="19:00"
        endValue="22:00"
        presets={[{ startMinute: 1140, endMinute: 1320 }]}
        required
      />,
    );

    expect(html).not.toContain("<button");
    expect(html).toMatch(/name="startTime"[^>]*value="19:00"/);
    expect(html).toMatch(/name="endTime"[^>]*value="22:00"/);
    expect(html).toContain(">From<");
  });

  it("draws the chosen range on 96 untabbable cells, with chips and an announced summary", () => {
    const noop = () => {};
    const html = renderToString(
      <TimeGrid
        selection={{ anchor: null, range: { first: 76, last: 87 } }}
        presets={[
          { startMinute: 600, endMinute: 780 },
          { startMinute: 1140, endMinute: 1320 },
        ]}
        onTap={noop}
        onDrag={noop}
        onPreset={noop}
      />,
    );

    const cells = html.match(/<button[^>]*class="time-cell[^"]*"[^>]*>/g) ?? [];
    expect(cells).toHaveLength(96);
    expect(
      cells.every((cell) => cell.includes('tabindex="-1"') && cell.includes('type="button"')),
    ).toBe(true);
    expect(cells.filter((cell) => cell.includes('aria-pressed="true"'))).toHaveLength(12);
    expect(html).toContain('class="time-grid" aria-hidden="true"');
    expect(html).toContain(
      '<button type="button" class="chip" aria-pressed="false">10:00–13:00</button>',
    );
    expect(html).toContain(
      '<button type="button" class="chip on" aria-pressed="true">19:00–22:00</button>',
    );
    expect(html).toContain('aria-live="polite">19:00–22:00</p>');
  });

  it("asks for the end after a first tap, and for a start when nothing is chosen", () => {
    const noop = () => {};
    const anchored = renderToString(
      <TimeGrid
        selection={{ anchor: 76, range: { first: 76, last: 76 } }}
        presets={[]}
        onTap={noop}
        onDrag={noop}
        onPreset={noop}
      />,
    );
    const empty = renderToString(
      <TimeGrid
        selection={{ anchor: null, range: null }}
        presets={[]}
        onTap={noop}
        onDrag={noop}
        onPreset={noop}
      />,
    );

    expect(anchored).toContain("19:00–19:15 — now tap the end");
    expect(anchored).toContain("time-cell on anchor");
    expect(empty).toContain("Tap a start time, then an end time.");
    expect(empty).not.toContain("time-chips");
  });
});
