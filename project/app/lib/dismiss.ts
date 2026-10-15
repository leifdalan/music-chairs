import { useEffect, type RefObject } from "react";

/** Anything that can say whether a node is inside it. */
export type Container = { contains(node: unknown): boolean } | null | undefined;

/** Whether a press at `target` lies outside every one of `insides`. */
export function pressIsOutside(target: unknown, insides: Container[]): boolean {
  return !insides.some((inside) => inside?.contains(target));
}

/** The parts of an open `<details>` popup a press outside it reads and changes. */
export type Popup = {
  open: boolean;
  contains(node: unknown): boolean;
  querySelector(selector: "summary"): { focus(options?: FocusOptions): void } | null;
};

/** What a pointer event says about a press. */
export type Press = { target: unknown; button: number; isPrimary: boolean };

/** Controls a press can land on that take focus themselves; `tabindex="-1"` wrappers are page area. */
const CONTROLS = "a, button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])";

/**
 * The decision behind `useDismissOutside`, apart from the page so it can be
 * tested: a primary press that starts and ends outside the popup and the
 * floating cards closes it, and focus goes back to its summary only when it was
 * inside when the press began and the press didn't land on another control.
 */
export function outsidePress(page: {
  popup: () => Popup | null;
  stack: () => Container;
  active: () => unknown;
  isControl: (target: unknown) => boolean;
}): { down: (press: Press) => void; up: (press: Press) => void; cancel: () => void } {
  let began = false;
  let focusWasInside = false;
  const primary = (press: Press) => press.isPrimary && press.button === 0;
  const outside = (target: unknown) => pressIsOutside(target, [page.popup(), page.stack()]);
  return {
    down(press) {
      const popup = page.popup();
      began = primary(press) && Boolean(popup?.open) && outside(press.target);
      // Read now: the browser moves focus to what was pressed before the release.
      focusWasInside = began && Boolean(popup?.contains(page.active()));
    },
    up(press) {
      const startedOutside = began;
      began = false;
      const popup = page.popup();
      if (!startedOutside || !primary(press) || !popup?.open || !outside(press.target)) return;
      popup.open = false;
      if (focusWasInside && !page.isControl(press.target)) {
        popup.querySelector("summary")?.focus({ preventScroll: true });
      }
    },
    cancel() {
      began = false;
    },
  };
}

/**
 * Closes an open `<details>` popup on a press outside it (plan/phase-41.md).
 * The press must start and end outside, so dragging out of the popup doesn't
 * close it, and a scroll that the browser cancels doesn't either; pointer
 * events, unlike `click`, fire for taps on blank areas on iOS. The floating
 * toasts and failure cards count as inside, so Retry or Dismiss never closes a
 * popup. Only the primary button counts. See `outsidePress` for focus.
 */
export function useDismissOutside(ref: RefObject<HTMLDetailsElement | null>): void {
  useEffect(() => {
    const press = outsidePress({
      popup: () => ref.current,
      stack: () => document.querySelector(".float-stack"),
      active: () => document.activeElement,
      isControl: (target) => target instanceof Element && target.closest(CONTROLS) !== null,
    });
    const down = (event: PointerEvent) => press.down(event);
    const up = (event: PointerEvent) => press.up(event);
    const cancel = () => press.cancel();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
    };
  }, [ref]);
}
