import { useSyncExternalStore } from "react";

import { formatMeridiem, parseTimeText, STEP_MINUTES, timeInputValue } from "~/lib/availability";

// Touch screens get the native picker; the server render and hydration use the
// text field, then the browser's answer takes over.
const noSubscription = () => () => {};
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

const QUARTER_HOURS = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, index) =>
  timeInputValue(index * STEP_MINUTES),
);

/**
 * A time of day (plan/phase-8.md, Decisions): on desktop a text field that
 * accepts "9", "9:02" or "7pm", suggests quarter hours, and rounds what was
 * typed to the nearest 15 minutes when you leave it (showing it the way it was
 * written, 24-hour or am/pm); on touch screens the native time picker. The
 * server applies the same rounding, so what you see is what is saved.
 */
export function TimeField({
  id,
  name,
  defaultValue,
  end = false,
  required,
  invalid,
  describedBy,
  label,
  listId,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  /** An end time: 00:00 means midnight at the end of the day. */
  end?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Accessible name when there is no visible label. */
  label?: string;
  /** A shared `QuarterHours` list to use instead of this field's own. */
  listId?: string;
}) {
  const native = useCoarsePointer();

  const round = (input: HTMLInputElement, keepStyle: boolean) => {
    const parsed = parseTimeText(input.value, { end });
    if (!parsed.ok) return;
    input.value =
      keepStyle && parsed.meridiem
        ? formatMeridiem(parsed.minutes)
        : timeInputValue(parsed.minutes);
  };

  if (native) {
    const parsed = defaultValue ? parseTimeText(defaultValue, { end }) : null;
    return (
      <input
        id={id}
        name={name}
        type="time"
        step={STEP_MINUTES * 60}
        required={required}
        defaultValue={parsed?.ok ? timeInputValue(parsed.minutes) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={label}
        // Not on every change: iOS reports each step of its minute wheel.
        onBlur={(event) => round(event.currentTarget, false)}
      />
    );
  }
  return (
    <>
      <input
        id={id}
        name={name}
        type="text"
        autoComplete="off"
        placeholder="e.g. 19:30 or 7:30pm"
        list={listId ?? `${id}-times`}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={label}
        onBlur={(event) => round(event.currentTarget, true)}
      />
      {listId ? null : <QuarterHours id={`${id}-times`} />}
    </>
  );
}

/** The quarter-hour suggestions a time field offers; one list can serve many fields. */
export function QuarterHours({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {QUARTER_HOURS.map((time) => (
        <option key={time} value={time} />
      ))}
    </datalist>
  );
}
