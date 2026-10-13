import { useEffect, useReducer } from "react";
import { useFetchers, useNavigation } from "react-router";

import { ELSEWHERE } from "~/lib/client-failure";

/** How long a page change runs before the bar shows (plan/phase-36.md). */
export const PROGRESS_DELAY_MS = 300;
const FADE_MS = 400;

export type ProgressState = {
  phase: "hidden" | "waiting" | "shown" | "finishing";
  /** Counts page moves, so a late timer from an earlier one is ignored. */
  move: number;
};

export type ProgressEvent =
  | { type: "start" }
  | { type: "end" }
  | { type: "threshold"; move: number }
  | { type: "faded"; move: number };

export const HIDDEN: ProgressState = { phase: "hidden", move: 0 };

/**
 * The bar's states: a move begins (waiting); still going after 300 ms, the bar
 * shows; when it ends, the bar finishes and fades; a move that ends sooner
 * shows nothing. A new move while the bar is on screen keeps it showing.
 */
export function nextProgress(state: ProgressState, event: ProgressEvent): ProgressState {
  switch (event.type) {
    case "start": {
      const onScreen = state.phase === "shown" || state.phase === "finishing";
      return { phase: onScreen ? "shown" : "waiting", move: state.move + 1 };
    }
    case "threshold":
      return state.phase === "waiting" && event.move === state.move
        ? { ...state, phase: "shown" }
        : state;
    case "end":
      if (state.phase === "waiting") return { ...state, phase: "hidden" };
      if (state.phase === "shown") return { ...state, phase: "finishing" };
      return state;
    case "faded":
      return state.phase === "finishing" && event.move === state.move
        ? { ...state, phase: "hidden" }
        : state;
  }
}

/**
 * Whether the app is moving to another page: loading with no form (a link,
 * back or forward, a redirect after a page load). A save is not one, whether
 * a form's redirect (it carries the form method) or the redirect of a form
 * posted to another page in the background (its fetcher is busy until the
 * page arrives); neither is revalidation. Other fetchers, such as a date tick
 * still reloading the page's data, don't redirect and don't count.
 */
export function isPageMove(
  navigation: { state: string; formMethod?: string | undefined },
  fetchers: { key: string; state: string }[],
): boolean {
  return (
    navigation.state === "loading" &&
    !navigation.formMethod &&
    !fetchers.some((fetcher) => fetcher.key.startsWith(ELSEWHERE) && fetcher.state !== "idle")
  );
}

/** A thin bar along the top while a page change takes longer than 300 ms. */
export function PageProgress() {
  const moving = isPageMove(useNavigation(), useFetchers());
  const [state, dispatch] = useReducer(nextProgress, HIDDEN);

  useEffect(() => dispatch({ type: moving ? "start" : "end" }), [moving]);
  useEffect(() => {
    if (state.phase !== "waiting") return;
    const timer = setTimeout(
      () => dispatch({ type: "threshold", move: state.move }),
      PROGRESS_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [state.phase, state.move]);
  useEffect(() => {
    if (state.phase !== "finishing") return;
    const timer = setTimeout(() => dispatch({ type: "faded", move: state.move }), FADE_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.move]);

  const shown = state.phase === "shown" || state.phase === "finishing";
  return (
    <div
      // A new move starts the bar from the left again, even one that follows straight on.
      key={state.move}
      className="page-progress"
      data-phase={shown ? state.phase : "hidden"}
      role="progressbar"
      aria-label="Loading the page"
      aria-hidden={state.phase === "shown" ? undefined : true}
    />
  );
}
