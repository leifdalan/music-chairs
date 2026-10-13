// The page-change progress bar (plan/phase-36.md): shown only for a page move
// still going after 300 ms, never for a save.
import { describe, expect, it } from "vitest";

import {
  HIDDEN,
  isPageMove,
  nextProgress,
  type ProgressEvent,
  type ProgressState,
} from "../app/components/page-progress";

const run = (events: ProgressEvent[], from: ProgressState = HIDDEN) =>
  events.reduce(nextProgress, from);

describe("the progress bar's states", () => {
  it("stays hidden for a move that ends within 300 ms", () => {
    const quick = run([{ type: "start" }, { type: "end" }]);
    expect(quick.phase).toBe("hidden");
    // Its threshold, arriving late, shows nothing.
    expect(nextProgress(quick, { type: "threshold", move: quick.move }).phase).toBe("hidden");
  });

  it("shows for a move still going after 300 ms, then finishes and hides", () => {
    const shown = run([{ type: "start" }, { type: "threshold", move: 1 }]);
    expect(shown.phase).toBe("shown");
    const finishing = nextProgress(shown, { type: "end" });
    expect(finishing.phase).toBe("finishing");
    expect(nextProgress(finishing, { type: "faded", move: 1 }).phase).toBe("hidden");
  });

  it("ignores a late threshold from an earlier move", () => {
    const second = run([{ type: "start" }, { type: "end" }, { type: "start" }]);
    expect(second).toEqual({ phase: "waiting", move: 2 });
    expect(nextProgress(second, { type: "threshold", move: 1 }).phase).toBe("waiting");
    expect(nextProgress(second, { type: "threshold", move: 2 }).phase).toBe("shown");
  });

  it("keeps showing when a new move starts while the bar finishes", () => {
    const finishing = run([{ type: "start" }, { type: "threshold", move: 1 }, { type: "end" }]);
    const again = nextProgress(finishing, { type: "start" });
    expect(again).toEqual({ phase: "shown", move: 2 });
    // The first move's fade, arriving late, doesn't hide the second.
    expect(nextProgress(again, { type: "faded", move: 1 }).phase).toBe("shown");
  });
});

describe("what counts as a page move", () => {
  const idle = [{ key: "elsewhere:profile-save", state: "idle" }];

  it("is a link, back or forward, or a redirect after a page load", () => {
    expect(isPageMove({ state: "loading" }, idle)).toBe(true);
    expect(isPageMove({ state: "loading", formMethod: undefined }, [])).toBe(true);
  });

  it("is never a save, its redirect, a background save's redirect, or nothing at all", () => {
    expect(isPageMove({ state: "submitting", formMethod: "POST" }, idle)).toBe(false);
    // A form's redirect still carries its method.
    expect(isPageMove({ state: "loading", formMethod: "POST" }, idle)).toBe(false);
    // A background save's redirect has no method, but its fetcher is busy.
    expect(
      isPageMove({ state: "loading" }, [{ key: "elsewhere:profile-save", state: "loading" }]),
    ).toBe(false);
    // Revalidation leaves the navigation idle.
    expect(isPageMove({ state: "idle" }, idle)).toBe(false);
  });

  it("still counts a link followed while a date tick reloads the page's data", () => {
    // A date tick's fetcher stays busy while it reloads; it never redirects.
    const ticking = [{ key: "set-date-r1-2026-10-20", state: "loading" }];
    expect(isPageMove({ state: "loading" }, ticking)).toBe(true);
  });
});
