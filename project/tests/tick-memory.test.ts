// Ticks not yet proposed survive the request page's Calendar/List switch (plan/phase-37.md).
import { describe, expect, it } from "vitest";

import { rememberTick, restoreTicks, type TickBox } from "../app/lib/tick-memory";

const boxes = (...values: string[]): TickBox[] =>
  values.map((value) => ({ value, checked: false }));
const ticked = (list: TickBox[]) => list.filter((box) => box.checked).map((box) => box.value);

describe("remembering ticks across the view switch", () => {
  it("ticks the same times in the new view's boxes", () => {
    const memory = new Set<string>();
    const calendar = boxes("2026-10-05T19:00-22:00", "2026-10-06T19:00-21:00");
    calendar[1].checked = true;
    rememberTick(memory, calendar[1]);

    const list = boxes(
      "2026-10-05T19:00-22:00",
      "2026-10-06T19:00-21:00",
      "2026-10-07T19:00-20:00",
    );
    restoreTicks(memory, list);

    expect(ticked(list)).toEqual(["2026-10-06T19:00-21:00"]);
  });

  it("forgets a time once it is unticked", () => {
    const memory = new Set<string>();
    const [box] = boxes("2026-10-05T19:00-22:00");
    box.checked = true;
    rememberTick(memory, box);
    box.checked = false;
    rememberTick(memory, box);

    const fresh = boxes("2026-10-05T19:00-22:00");
    restoreTicks(memory, fresh);
    expect(ticked(fresh)).toEqual([]);
  });

  it("remembers ticks that came without a change, like the browser's after a reload", () => {
    const memory = new Set<string>();
    const reloaded = boxes("2026-10-05T19:00-22:00", "2026-10-06T19:00-21:00");
    reloaded[0].checked = true;
    restoreTicks(memory, reloaded);

    const list = boxes("2026-10-06T19:00-21:00", "2026-10-05T19:00-22:00");
    restoreTicks(memory, list);
    expect(ticked(list)).toEqual(["2026-10-05T19:00-22:00"]);
  });
});
