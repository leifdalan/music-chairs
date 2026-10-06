import { useEffect, useRef, useState } from "react";

import { formatMinutes, parseTimeText, timeInputValue, timeRange } from "~/lib/availability";
import type { TimeWindow } from "~/lib/requests";
import {
  BAR_END,
  BAR_START,
  BAR_STEP,
  barEnds,
  barSelectionOf,
  barStarts,
  boundaryAt,
  dragTo,
  EMPTY_BAR,
  fractionOf,
  tapAt,
  type BarSelection,
} from "~/lib/time-bar";
import { useHydrated } from "~/lib/use-hydrated";

const HOURS = Array.from(
  { length: (BAR_END - BAR_START) / 60 + 1 },
  (_, index) => BAR_START + index * 60,
);
const HALF_HOURS = Array.from(
  { length: (BAR_END - BAR_START) / BAR_STEP + 1 },
  (_, index) => BAR_START + index * BAR_STEP,
);

function minutesOf(value: string, end: boolean): number | null {
  const parsed = parseTimeText(value, { end });
  return parsed.ok ? parsed.minutes : null;
}

/** The bar's half hours plus any other time that must stay choosable, in order. */
export function timeOptions(base: number[], extra: (number | null)[]): number[] {
  const all = new Set(base);
  for (const minute of extra) if (minute !== null) all.add(minute);
  return [...all].sort((a, b) => a - b);
}

/** What the line under the bar says about the bar's state and the chosen times. */
export function barReadback(shown: BarSelection, chosen: TimeWindow | null): string {
  if (shown.anchor !== null && !shown.range) {
    return `From ${formatMinutes(shown.anchor)} — now tap the end`;
  }
  if (shown.range) return timeRange(shown.range.startMinute, shown.range.endMinute);
  if (chosen) {
    return `Now ${timeRange(chosen.startMinute, chosen.endMinute)}; pick on the bar to change it`;
  }
  return "Tap a start time, then an end time, or drag across.";
}

/**
 * A start and end time (plan/phase-22.md): a bar of the hours from 9 AM to
 * midnight, where a tap marks the start and the next tap the end, or a drag
 * marks both, plus chips for preset ranges. The From and Until selects below
 * it are the form's inputs and the keyboard, screen-reader and no-JavaScript
 * path; the bar and chips set them, and changing them moves the bar.
 * `onChange` reports the chosen range (null while there is none, or while the
 * bar waits for an end) and whether either select is set.
 */
export function TimeRange({
  startName,
  endName,
  startValue,
  endValue,
  presets = [],
  startError,
  endError,
  rangeError,
  labelPrefix,
  required,
  onChange,
}: {
  startName: string;
  endName: string;
  startValue: string;
  endValue: string;
  presets?: TimeWindow[];
  startError?: string;
  endError?: string;
  /** One error about the range as a whole, marked on both fields. */
  rangeError?: string;
  /** Tells several ranges on one page apart, e.g. "Time 2". */
  labelPrefix?: string;
  required?: boolean;
  onChange?: (range: TimeWindow | null, chosen: boolean) => void;
}) {
  // The bar needs JavaScript; the server render and a page without it show only
  // the selects, which are the form's real inputs either way.
  const hydrated = useHydrated();
  const [initial] = useState(() => ({
    start: minutesOf(startValue, false),
    end: minutesOf(endValue, true),
  }));
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  /** A first tap waiting for its end, or a drag under way; null otherwise. */
  const [gesture, setGesture] = useState<BarSelection | null>(null);
  const prefix = labelPrefix ? `${labelPrefix}: ` : "";
  const rangeErrorId = `${startName}-range-error`;
  const chosen =
    start !== null && end !== null && end > start ? { startMinute: start, endMinute: end } : null;
  const range = gesture ? null : chosen;
  const anySet = start !== null || end !== null;

  useEffect(() => {
    onChange?.(range, anySet);
    // Report changes of the range itself, not of the callback's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.startMinute, range?.endMinute, anySet]);

  const choose = (window: TimeWindow) => {
    setStart(window.startMinute);
    setEnd(window.endMinute);
    setGesture(null);
  };

  const startOptions = timeOptions(barStarts(), [
    initial.start,
    ...presets.map((window) => window.startMinute),
  ]);
  const endOptions = timeOptions(barEnds(), [
    initial.end,
    ...presets.map((window) => window.endMinute),
  ]);
  const shown = gesture ?? barSelectionOf(chosen);

  return (
    <div className="time-range">
      {hydrated && presets.length > 0 ? (
        <div className="time-chips" role="group" aria-label="Times of day">
          {presets.map((window) => {
            const on =
              chosen?.startMinute === window.startMinute && chosen.endMinute === window.endMinute;
            return (
              <button
                type="button"
                key={`${window.startMinute}-${window.endMinute}`}
                className={on ? "chip on" : "chip"}
                aria-pressed={on}
                onClick={() => choose(window)}
              >
                {timeRange(window.startMinute, window.endMinute)}
              </button>
            );
          })}
        </div>
      ) : null}
      {hydrated ? (
        <>
          <TimeBar
            shown={shown}
            onTap={(minute) => {
              const next = tapAt(gesture ?? EMPTY_BAR, minute);
              if (next.range) choose(next.range);
              else setGesture(next.anchor === null ? null : next);
            }}
            onDrag={(anchor, minute) => setGesture(dragTo(anchor, minute))}
            onDragEnd={(anchor, minute) => {
              const next = dragTo(anchor, minute);
              if (next.range) choose(next.range);
              else setGesture(null);
            }}
            onCancel={() => setGesture(null)}
          />
          <p className="time-summary" aria-live="polite">
            {barReadback(shown, chosen)}
          </p>
        </>
      ) : null}
      <div className="time-pair">
        <div className="field">
          <label htmlFor={startName}>
            {prefix}
            {prefix ? "from" : "From"}
          </label>
          <TimeSelect
            name={startName}
            value={start}
            options={startOptions}
            onChange={(minute) => {
              setStart(minute);
              setGesture(null);
            }}
            required={required}
            invalid={Boolean(startError || rangeError)}
            describedBy={startError ? `${startName}-error` : rangeError ? rangeErrorId : undefined}
          />
          {startError ? (
            <p className="field-error" id={`${startName}-error`} role="alert">
              {startError}
            </p>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor={endName}>
            {prefix}
            {prefix ? "until" : "Until"}
          </label>
          <TimeSelect
            name={endName}
            end
            value={end}
            options={endOptions}
            onChange={(minute) => {
              setEnd(minute);
              setGesture(null);
            }}
            required={required}
            invalid={Boolean(endError || rangeError)}
            describedBy={endError ? `${endName}-error` : rangeError ? rangeErrorId : undefined}
          />
          {endError ? (
            <p className="field-error" id={`${endName}-error`} role="alert">
              {endError}
            </p>
          ) : null}
        </div>
      </div>
      {rangeError ? (
        <p className="field-error" id={rangeErrorId} role="alert">
          {rangeError}
        </p>
      ) : null}
    </div>
  );
}

/** One end of the range: "—" while unset, then times in AM/PM; the form posts "19:00". */
function TimeSelect({
  name,
  end = false,
  value,
  options,
  onChange,
  required,
  invalid,
  describedBy,
}: {
  name: string;
  /** Reads "00:00" as midnight at the end of the day. */
  end?: boolean;
  value: number | null;
  options: number[];
  onChange: (minute: number | null) => void;
  required?: boolean;
  invalid: boolean;
  describedBy?: string;
}) {
  return (
    <select
      id={name}
      name={name}
      required={required}
      value={value === null ? "" : timeInputValue(value)}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      onChange={(event) => {
        onChange(minutesOf(event.currentTarget.value, end));
      }}
    >
      <option value="">—</option>
      {options.map((minute) => (
        <option key={minute} value={timeInputValue(minute)}>
          {formatMinutes(minute)}
        </option>
      ))}
    </select>
  );
}

/**
 * The bar itself: hidden from screen readers and out of the tab order (the
 * selects serve them). Mouse, touch and pen all tap or drag; a vertical swipe
 * still scrolls the page (pan-y) and cancels a drag.
 */
export function TimeBar({
  shown,
  onTap,
  onDrag,
  onDragEnd,
  onCancel,
}: {
  shown: BarSelection;
  onTap: (minute: number) => void;
  onDrag: (anchor: number, minute: number) => void;
  onDragEnd: (anchor: number, minute: number) => void;
  onCancel: () => void;
}) {
  /** The press under way: where it began and whether it has moved to another boundary. */
  const press = useRef<{ pointer: number; anchor: number; moved: boolean } | null>(null);
  const range = shown.range;
  const track = useRef<HTMLDivElement>(null);
  /** The boundary under the pointer, measured on the track (the bar has padding around it). */
  const at = (event: { clientX: number }) => {
    const box = track.current?.getBoundingClientRect();
    return box ? boundaryAt((event.clientX - box.left) / box.width) : BAR_START;
  };
  const percent = (minute: number) => `${fractionOf(minute) * 100}%`;

  return (
    <div
      className="time-bar"
      aria-hidden="true"
      onPointerDown={(event) => {
        // One press at a time, by the main button only (not a pen's side button or a context click).
        if (press.current || event.button !== 0 || event.ctrlKey) return;
        press.current = { pointer: event.pointerId, anchor: at(event), moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = press.current;
        if (!current || current.pointer !== event.pointerId) return;
        const minute = at(event);
        if (minute === current.anchor && !current.moved) return;
        current.moved = true;
        onDrag(current.anchor, minute);
      }}
      onPointerUp={(event) => {
        const current = press.current;
        if (!current || current.pointer !== event.pointerId) return;
        press.current = null;
        if (current.moved) onDragEnd(current.anchor, at(event));
        else onTap(current.anchor);
      }}
      onPointerCancel={(event) => {
        if (press.current?.pointer !== event.pointerId) return;
        if (press.current.moved) onCancel();
        press.current = null;
      }}
    >
      <div className="time-bar-track" ref={track}>
        {HALF_HOURS.map((minute) => (
          <span
            key={minute}
            className={minute % 60 === 0 ? "time-bar-tick hour" : "time-bar-tick"}
            style={{ left: percent(minute) }}
          />
        ))}
        {range ? (
          <span
            className="time-bar-fill"
            style={{
              left: percent(range.startMinute),
              width: `${((range.endMinute - range.startMinute) / (BAR_END - BAR_START)) * 100}%`,
            }}
          />
        ) : null}
        {shown.anchor !== null ? (
          <span className="time-bar-anchor" style={{ left: percent(shown.anchor) }} />
        ) : null}
      </div>
      <div className="time-bar-labels">
        {HOURS.map((minute) => (
          <span key={minute} style={{ left: percent(minute) }}>
            {hourLabel(minute)}
          </span>
        ))}
      </div>
      <div className="time-bar-meridiem">
        <span style={{ left: percent(BAR_START) }}>AM</span>
        <span style={{ left: percent(12 * 60) }}>PM</span>
      </div>
    </div>
  );
}

/** "9", "10", "11", "12" for noon, "1" … "11", "12" for midnight. */
function hourLabel(minute: number): string {
  return String(Math.floor(minute / 60) % 12 || 12);
}
