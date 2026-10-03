import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { useNavigation, useRouteLoaderData } from "react-router";

/**
 * Feedback for the button that was pressed (plan/phase-8.md, Decisions):
 * "Saving…" while its submission is in flight, then "Saved ✓" for two seconds
 * when it succeeded. Success means the root loader brought a new toast: every
 * successful change leaves one, and a refused submission never does.
 *
 * The state lives above the pages, keyed by each button's `feedbackKey`, so a
 * form rebuilt after a save still shows "Saved ✓".
 */
export type FeedbackState = {
  key: string | null;
  phase: "idle" | "pressed" | "saving" | "saved";
  toastAtPress: string | null;
  since: number;
};

export type FeedbackEvent =
  | { type: "press"; key: string; toastId: string | null; now: number }
  | { type: "navigating" }
  | { type: "idle"; toastId: string | null; now: number }
  | { type: "tick"; now: number };

export const SAVED_MS = 2000;
// A press the browser never submitted (for example a required field left empty).
const UNSUBMITTED_MS = 1000;

export const IDLE: FeedbackState = { key: null, phase: "idle", toastAtPress: null, since: 0 };

export function nextFeedback(state: FeedbackState, event: FeedbackEvent): FeedbackState {
  switch (event.type) {
    case "press":
      return { key: event.key, phase: "pressed", toastAtPress: event.toastId, since: event.now };
    case "navigating":
      return state.phase === "pressed" ? { ...state, phase: "saving" } : state;
    case "idle":
      if (state.phase === "saving") {
        const succeeded = event.toastId !== null && event.toastId !== state.toastAtPress;
        return succeeded ? { ...state, phase: "saved", since: event.now } : IDLE;
      }
      if (state.phase === "pressed" && event.now - state.since > UNSUBMITTED_MS) return IDLE;
      return state;
    case "tick":
      if (state.phase === "saved" && event.now - state.since >= SAVED_MS) return IDLE;
      if (state.phase === "pressed" && event.now - state.since > UNSUBMITTED_MS) return IDLE;
      return state;
  }
}

type FeedbackContext = { state: FeedbackState; press: (key: string) => void };

const Feedback = createContext<FeedbackContext>({ state: IDLE, press: () => {} });

function useToastId(): string | null {
  const root = useRouteLoaderData("root") as { toast?: { id: string } | null } | undefined;
  return root?.toast?.id ?? null;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(nextFeedback, IDLE);
  const navigation = useNavigation();
  const toastId = useToastId();
  const busy = navigation.state !== "idle";

  useEffect(() => {
    if (busy) dispatch({ type: "navigating" });
    else dispatch({ type: "idle", toastId, now: Date.now() });
  }, [busy, toastId]);

  useEffect(() => {
    if (state.phase !== "saved" && state.phase !== "pressed") return;
    const timer = setTimeout(
      () => dispatch({ type: "tick", now: Date.now() }),
      state.phase === "saved" ? SAVED_MS : UNSUBMITTED_MS + 50,
    );
    return () => clearTimeout(timer);
  }, [state.phase, state.since]);

  const press = useCallback(
    (key: string) => dispatch({ type: "press", key, toastId, now: Date.now() }),
    [toastId],
  );
  const value = useMemo(() => ({ state, press }), [state, press]);
  return <Feedback.Provider value={value}>{children}</Feedback.Provider>;
}

/**
 * A submit button with saving and saved states for its own submission. While
 * any submission is in flight every other button is disabled, as before; the
 * pressed one keeps focus (`aria-disabled`) and announces its state.
 */
export function SubmitButton({
  feedbackKey,
  children,
  className,
  name,
  value,
  label,
  pressed,
}: {
  feedbackKey: string;
  children: ReactNode;
  className?: string;
  name?: string;
  value?: string;
  /** Accessible name when the visible text alone doesn't say what it affects. */
  label?: string;
  /** For toggle-like buttons, whether this choice is the current one. */
  pressed?: boolean;
}) {
  const { state, press } = useContext(Feedback);
  const busy = useNavigation().state !== "idle";
  const mine = state.key === feedbackKey ? state.phase : "idle";
  const saving = mine === "pressed" || mine === "saving";
  const saved = mine === "saved";
  const status = saving ? "Saving…" : saved ? "Saved ✓" : null;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={
        [className, saving ? "is-saving" : null, saved ? "is-saved" : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
      disabled={busy && !saving}
      aria-disabled={saving || undefined}
      aria-pressed={pressed}
      aria-label={label ? (status ? `${label}: ${status}` : label) : undefined}
      onClick={(event) => {
        if (saving) {
          event.preventDefault();
          return;
        }
        // A form the browser refuses (a required field left empty) is not saving.
        if (event.currentTarget.form?.checkValidity() === false) return;
        press(feedbackKey);
      }}
    >
      {saving ? <span className="spinner" aria-hidden="true" /> : null}
      {status ?? children}
    </button>
  );
}
