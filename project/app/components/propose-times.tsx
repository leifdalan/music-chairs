import { useCallback, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Form } from "react-router";

import { formatDate, timeRange } from "~/lib/availability";
import { timeValue } from "~/lib/propose";
import { NOTES_MAX } from "~/lib/rehearsal";

import { SubmitButton } from "./submit-button";

/**
 * The organizer's "tick several free times and propose them" form
 * (plan/phase-15.md), wrapped around a page's own list of free times. The
 * location and notes apply to every ticked time, each proposed for its whole
 * free time (plan/phase-29.md); a refusal shows here, next to the button. The
 * controls appear only when there is a time to tick.
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
   * Changes after a successful proposal, so the ticks, location and notes start
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
    <Form ref={setForm} method="post" className="propose-times" replace preventScrollReset>
      <input type="hidden" name="intent" value="propose-times" />
      {children}
      {hasTimes ? (
        <div className="propose-times-controls stack">
          <div className="field">
            <label htmlFor="propose-location">Location (optional)</label>
            <input id="propose-location" name="location" type="text" autoComplete="off" />
          </div>
          <NotesField id="propose-notes" />
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

/** A rehearsal's optional notes (plan/phase-29.md), for everything proposed at once. */
export function NotesField({
  id,
  defaultValue,
  error,
}: {
  id: string;
  defaultValue?: string;
  /** A refusal of these notes, shown and linked to the field. */
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Notes (optional)</label>
      <textarea
        id={id}
        name="notes"
        rows={3}
        maxLength={NOTES_MAX}
        defaultValue={defaultValue}
        placeholder="Bring the Brahms parts"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error ${id}-hint` : `${id}-hint`}
      />
      <p className="hint" id={`${id}-hint`}>
        Members see these on the schedule and in their calendars.
      </p>
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The tick box for a date with only one free time (plan/phase-29.md): the
 * whole calendar cell is its label, so tapping the date ticks it without a
 * panel. `heat` says how many are free, as the cell's panel would.
 */
export function OneTapTime({
  date,
  stretch,
  heat,
}: {
  date: string;
  stretch: { startMinute: number; endMinute: number };
  heat: string;
}) {
  const range = timeRange(stretch.startMinute, stretch.endMinute);
  return (
    <input
      type="checkbox"
      name="time"
      value={timeValue(date, stretch.startMinute, stretch.endMinute)}
      aria-label={`Propose ${formatDate(date)}, ${range}: ${heat}`}
    />
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
