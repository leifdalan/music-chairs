import { useCallback, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Form } from "react-router";

import { formatDate, timeRange } from "~/lib/availability";
import { DEFAULT_PROPOSE_LENGTH, lengthLabel, PROPOSE_LENGTHS, timeValue } from "~/lib/propose";

import { SubmitButton } from "./submit-button";

/**
 * The organizer's "tick several free times and propose them" form
 * (plan/phase-15.md), wrapped around a page's own list of free times. The
 * length and location apply to every ticked time; a refusal shows here, next
 * to the button. The controls appear only when there is a time to tick.
 */
export function ProposeTimes({
  hasTimes,
  problem,
  resetKey,
  children,
}: {
  hasTimes: boolean;
  problem: string | null;
  /**
   * Changes after a successful proposal, so the ticks and location start
   * empty again instead of inviting the same times twice; a refusal keeps them.
   */
  resetKey: number;
  children: ReactNode;
}) {
  // A fresh form, with its own ticked count, after each successful proposal.
  return (
    <ProposeTimesForm key={resetKey} hasTimes={hasTimes} problem={problem}>
      {children}
    </ProposeTimesForm>
  );
}

function ProposeTimesForm({
  hasTimes,
  problem,
  children,
}: {
  hasTimes: boolean;
  problem: string | null;
  children: ReactNode;
}) {
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  return (
    <Form ref={setForm} method="post" className="propose-times" replace>
      <input type="hidden" name="intent" value="propose-times" />
      {children}
      {hasTimes ? (
        <div className="propose-times-controls stack">
          <div className="field">
            <label htmlFor="propose-length">Rehearsal length</label>
            <select id="propose-length" name="length" defaultValue={DEFAULT_PROPOSE_LENGTH}>
              {PROPOSE_LENGTHS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {lengthLabel(minutes)}
                </option>
              ))}
            </select>
            <p className="hint">
              Each starts when its free time starts, shorter if that ends sooner.
            </p>
          </div>
          <div className="field">
            <label htmlFor="propose-location">Location (optional)</label>
            <input id="propose-location" name="location" type="text" autoComplete="off" />
          </div>
          {problem ? (
            <p className="field-error" role="alert">
              {problem}
            </p>
          ) : null}
          <TickedCount form={form} />
          <SubmitButton feedbackKey="propose-times">Propose selected</SubmitButton>
        </div>
      ) : null}
    </Form>
  );
}

/**
 * One free time: for an organizer the whole row is the label of its tick box;
 * for anyone else, just the row.
 */
export function FreeTime({
  value,
  label,
  tickable,
  children,
}: {
  value: string;
  /** What the tick box proposes, for screen readers. */
  label: string;
  tickable: boolean;
  children: ReactNode;
}) {
  const detailsId = useId();
  if (!tickable) return <div className="free-time">{children}</div>;
  // The short name says what ticking proposes; the row's details (how many
  // and who are free) are read as its description.
  return (
    <label className="free-time tickable">
      <input
        type="checkbox"
        name="time"
        value={value}
        aria-label={label}
        aria-describedby={detailsId}
      />
      <span className="free-time-body" id={detailsId}>
        {children}
      </span>
    </label>
  );
}

/** A free time on a request's page (plan/phase-15.md): how many and who are free. */
export type FreeStretchData = {
  startMinute: number;
  endMinute: number;
  freeCount: number;
  freeNames: string[];
};

/**
 * One free time as an organizer's tickable row, the same in the request
 * page's list and in its calendar's date panels (plan/phase-20.md).
 */
export function FreeStretch({
  date,
  stretch,
  total,
}: {
  date: string;
  stretch: FreeStretchData;
  total: number;
}) {
  const range = timeRange(stretch.startMinute, stretch.endMinute);
  return (
    <FreeTime
      tickable
      value={timeValue(date, stretch.startMinute, stretch.endMinute)}
      label={`Propose ${formatDate(date)}, ${range}`}
    >
      <span className="stretch-time">
        {range}
        <span className="stretch-count">
          {stretch.freeCount} of {total} free
        </span>
      </span>
      <span className="hint stretch-line">Free: {stretch.freeNames.join(", ")}</span>
    </FreeTime>
  );
}

/** "No times ticked", "1 time ticked", "3 times ticked". */
export function tickedLabel(count: number): string {
  if (count === 0) return "No times ticked";
  return `${count} ${count === 1 ? "time" : "times"} ticked`;
}

/**
 * How many times are ticked, beside "Propose selected" (plan/phase-21.md),
 * once the page is interactive. Always read from the form itself, never
 * accumulated: at hydration (ticks the browser restored after a reload count),
 * on every change, and whenever the view switches and swaps the tick boxes
 * (a mutation observer sees the new boxes).
 */
function TickedCount({ form }: { form: HTMLFormElement | null }) {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!form) return () => {};
      const observer = new MutationObserver(notify);
      observer.observe(form, { childList: true, subtree: true });
      form.addEventListener("change", notify);
      return () => {
        observer.disconnect();
        form.removeEventListener("change", notify);
      };
    },
    [form],
  );
  const count = useSyncExternalStore(
    subscribe,
    () => (form ? form.querySelectorAll('input[name="time"]:checked').length : null),
    () => null,
  );
  if (count === null) return null;
  return (
    <p className="hint ticked-count" aria-live="polite">
      {tickedLabel(count)}
    </p>
  );
}
