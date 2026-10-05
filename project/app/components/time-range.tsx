import { useCallback, useEffect, useRef, useState } from "react";

import { formatMinutes, parseTimeText, timeInputValue } from "~/lib/availability";
import type { TimeWindow } from "~/lib/requests";
import {
  cellsOf,
  dragTo,
  EMPTY_SELECTION,
  rangeFromCells,
  tapCell,
  type GridSelection,
} from "~/lib/time-grid";
import { useHydrated } from "~/lib/use-hydrated";

import { TimeField } from "./time-field";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** With nothing chosen yet, the grid opens at the evening. */
const DEFAULT_SCROLL_HOUR = 17;

function selectionOf(start: string, end: string): GridSelection {
  const from = parseTimeText(start, { end: false });
  const until = parseTimeText(end, { end: true });
  if (!from.ok || !until.ok) return EMPTY_SELECTION;
  const cells = cellsOf(from.minutes, until.minutes);
  return cells ? { anchor: null, range: cells } : EMPTY_SELECTION;
}

function label(window: TimeWindow): string {
  return `${formatMinutes(window.startMinute)}–${formatMinutes(window.endMinute)}`;
}

/**
 * A start and end time (plan/phase-10.md, Decisions): a grid of hour rows and
 * quarter-hour cells, where a tap marks the start and the next tap the end (a
 * mouse or pen can also drag), plus chips for preset ranges. The typed From
 * and Until fields below it are the form's inputs and the keyboard and
 * screen-reader path; the grid and chips fill them in. `onChange` reports the
 * chosen range whenever it changes, or null while there is none.
 */
export function TimeRange({
  startName,
  endName,
  startValue,
  endValue,
  presets = [],
  startError,
  endError,
  endHint,
  rangeError,
  labelPrefix,
  listId,
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
  /** Shown under the Until field. */
  endHint?: string;
  /** One error about the range as a whole, marked on both fields. */
  rangeError?: string;
  /** Tells several ranges on one page apart, e.g. "Time 2". */
  labelPrefix?: string;
  /** A shared `QuarterHours` list for the typed fields. */
  listId?: string;
  required?: boolean;
  /** The chosen range (null while there is none) and whether anything is typed. */
  onChange?: (range: TimeWindow | null, typed: boolean) => void;
}) {
  // The grid needs JavaScript; the server render and a page without it show only
  // the typed fields, which are the form's real inputs either way.
  const hydrated = useHydrated();
  const wrapper = useRef<HTMLDivElement>(null);
  const prefix = labelPrefix ? `${labelPrefix}: ` : "";
  const rangeErrorId = `${startName}-range-error`;
  const [selection, setSelection] = useState(() => selectionOf(startValue, endValue));
  const [typed, setTyped] = useState(startValue !== "" || endValue !== "");
  const range = selection.range
    ? rangeFromCells(selection.range.first, selection.range.last)
    : null;

  useEffect(() => {
    onChange?.(range, typed);
    // Report changes of the range itself, not of the callback's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.startMinute, range?.endMinute, typed]);

  const field = (name: string) =>
    wrapper.current?.querySelector<HTMLInputElement>(`input[name="${name}"]`) ?? null;

  /** Shows a selection on the grid and writes its times into the typed fields. */
  const choose = useCallback(
    (next: GridSelection) => {
      setSelection(next);
      if (!next.range) return;
      setTyped(true);
      const times = rangeFromCells(next.range.first, next.range.last);
      const start = field(startName);
      const end = field(endName);
      if (start) start.value = timeInputValue(times.startMinute);
      if (end) end.value = timeInputValue(times.endMinute);
    },
    [startName, endName],
  );

  /** Typing (or the field's own rounding) moves the grid to match. */
  const readFields = () => {
    const start = field(startName)?.value ?? "";
    const end = field(endName)?.value ?? "";
    setTyped(start.trim() !== "" || end.trim() !== "");
    const next = selectionOf(start, end);
    if (
      next.range?.first !== selection.range?.first ||
      next.range?.last !== selection.range?.last
    ) {
      setSelection(next);
    }
  };

  return (
    <div className="time-range" ref={wrapper} onChange={readFields} onBlur={readFields}>
      {hydrated ? (
        <TimeGrid
          selection={selection}
          presets={presets}
          onTap={(cell) => choose(tapCell(selection, cell))}
          onDrag={choose}
          onPreset={(window) => {
            const cells = cellsOf(window.startMinute, window.endMinute);
            if (cells) choose({ anchor: null, range: cells });
          }}
        />
      ) : null}
      <div className="time-pair">
        <div className="field">
          <label htmlFor={startName}>
            {prefix}
            {hydrated ? "or type: from" : "From"}
          </label>
          <TimeField
            id={startName}
            name={startName}
            required={required}
            defaultValue={startValue}
            invalid={Boolean(startError || rangeError)}
            describedBy={startError ? `${startName}-error` : rangeError ? rangeErrorId : undefined}
            listId={listId}
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
          <TimeField
            id={endName}
            name={endName}
            end
            required={required}
            defaultValue={endValue}
            invalid={Boolean(endError || rangeError)}
            describedBy={
              endError
                ? `${endName}-error`
                : rangeError
                  ? rangeErrorId
                  : endHint
                    ? `${endName}-hint`
                    : undefined
            }
            listId={listId}
          />
          {endHint ? (
            <p className="hint" id={`${endName}-hint`}>
              {endHint}
            </p>
          ) : null}
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

/**
 * The chips, the grid and a summary of the chosen range. Cells are out of the
 * tab order and hidden from screen readers (the typed fields serve them); the
 * summary is announced. Touch and pen respond to taps only, so a swipe still
 * scrolls the grid; a mouse can also drag across cells.
 */
export function TimeGrid({
  selection,
  presets,
  onTap,
  onDrag,
  onPreset,
}: {
  selection: GridSelection;
  presets: TimeWindow[];
  onTap: (cell: number) => void;
  onDrag: (selection: GridSelection) => void;
  onPreset: (window: TimeWindow) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  /** A mouse drag in progress, with the latest range it has reached. */
  const drag = useRef<{ anchor: number; last: GridSelection | null } | null>(null);
  /** The kind of the last pointer pressed: a mouse works through pointer events, touch and pen through taps. */
  const pointer = useRef("mouse");
  const range = selection.range;
  const chosen = range ? rangeFromCells(range.first, range.last) : null;
  const firstHour = range ? Math.floor(range.first / 4) : DEFAULT_SCROLL_HOUR;
  const currentHour = useRef(firstHour);
  useEffect(() => {
    currentHour.current = firstHour;
  }, [firstHour]);

  const scrollToHour = (hour: number) => {
    const grid = scroller.current;
    const row = grid?.querySelector<HTMLElement>(`[data-hour="${hour}"]`);
    if (!grid || !row) return;
    grid.scrollTop += row.getBoundingClientRect().top - grid.getBoundingClientRect().top;
  };

  // Open the grid at the chosen range, or at the evening: when it first
  // appears, and again whenever a closed <details> around it is opened.
  useEffect(() => {
    const scroll = () => scrollToHour(currentHour.current);
    scroll();
    const details = scroller.current?.closest("details");
    details?.addEventListener("toggle", scroll);
    return () => details?.removeEventListener("toggle", scroll);
    // Only when the grid first appears; the listener reads the current hour.
  }, []);

  const cellAt = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element ? Number(element.dataset.cell) : null;
  };

  const summary = chosen
    ? `${label(chosen)}${selection.anchor !== null ? " — now tap the end" : ""}`
    : "Tap a start time, then an end time.";

  return (
    <div className="time-grid-wrap">
      {presets.length > 0 ? (
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
                onClick={() => {
                  onPreset(window);
                  // A chip is chosen outside the grid; bring its hours into view.
                  scrollToHour(Math.floor(window.startMinute / 60));
                }}
              >
                {label(window)}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        className="time-grid"
        ref={scroller}
        aria-hidden="true"
        // A mouse or pen is captured by the grid from press to release, so a
        // release anywhere ends the drag; a press without moving is a tap.
        onPointerDown={(event) => {
          pointer.current = event.pointerType;
          // Only the main mouse button drags; touch and pen tap (a pen drag would scroll).
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          const cell = cellAt(event.clientX, event.clientY);
          if (cell === null) return;
          drag.current = { anchor: cell, last: null };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const cell = cellAt(event.clientX, event.clientY);
          if (cell === null || (cell === drag.current.anchor && !drag.current.last)) return;
          drag.current.last = dragTo(drag.current.anchor, cell);
          onDrag(drag.current.last);
        }}
        onPointerUp={() => {
          const ended = drag.current;
          drag.current = null;
          if (!ended) return;
          // Finish from the last range reached, not from a render that may lag behind it.
          if (ended.last) onDrag({ anchor: null, range: ended.last.range });
          else onTap(ended.anchor);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {HOURS.map((hour) => (
          <div className="time-row" key={hour} data-hour={hour}>
            <span className="time-hour">{formatMinutes(hour * 60)}</span>
            {[0, 1, 2, 3].map((quarter) => {
              const cell = hour * 4 + quarter;
              const on = range !== null && cell >= range.first && cell <= range.last;
              return (
                <button
                  type="button"
                  tabIndex={-1}
                  key={cell}
                  data-cell={cell}
                  className={[
                    "time-cell",
                    on ? "on" : null,
                    selection.anchor === cell ? "anchor" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={on}
                  onClick={() => {
                    if (pointer.current !== "mouse") onTap(cell);
                  }}
                >
                  {quarter === 0 ? "" : `:${quarter * 15}`}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="time-summary" aria-live="polite">
        {summary}
      </p>
    </div>
  );
}
