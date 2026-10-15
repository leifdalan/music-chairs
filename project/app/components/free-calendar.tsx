import { useRef, type ReactNode } from "react";

import { formatDate, timeRange } from "~/lib/availability";
import { monthGrid, WEEKDAY_INITIALS } from "~/lib/calendar-grid";
import { heatLevel } from "~/lib/heat";
import { useDismissOutside } from "~/lib/dismiss";

/**
 * The one name every calendar date's disclosure shares, so one popup is open
 * at a time on a page with two calendars (plan/phase-39.md).
 */
export const DATE_POPUP = "date-popup";

/**
 * A calendar of who is free (plan/phase-20.md): the dates shaded by how many
 * people are free together, each date with free time opening a panel of its
 * free times. The request page's panels tick times to propose; the schedule's
 * only show them (plan/phase-24.md). Every date's disclosure shares one name,
 * so one panel is open at a time, with or without JavaScript. With `tickOne`,
 * a date with only one free time is itself its tick box, with no panel
 * (plan/phase-29.md).
 */
export function FreeCalendar<S extends { startMinute: number; endMinute: number }>({
  from,
  to,
  days,
  total,
  legend,
  renderStretch,
  tickOne,
}: {
  from: string;
  to: string;
  /** Dates with free time: `heat` is the most people free together for an hour (`dayHeat`). */
  days: { date: string; heat: number; stretches: S[] }[];
  total: number;
  /** What tapping a date does, after the shading key. */
  legend: string;
  /** One free stretch in a date's panel, as an `<li>`. */
  renderStretch: (date: string, stretch: S) => ReactNode;
  /** The tick box for a date's only free time; `heat` is how many are free, in words. */
  tickOne?: (date: string, stretch: S, heat: string) => ReactNode;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  return (
    <div className="free-calendar">
      <p className="hint heat-legend">
        <span className="heat-swatch heat-1" aria-hidden="true" /> Fainter: fewer free ·{" "}
        <span className="heat-swatch heat-4" aria-hidden="true" /> Stronger: more free. {legend}
      </p>
      <div className="months">
        {monthGrid(from, to).map((month) => (
          <div className="month" key={month.label}>
            <h3>{month.label}</h3>
            <div className="month-grid">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span className="weekday" key={index} aria-hidden="true">
                  {initial}
                </span>
              ))}
              {month.weeks.flat().map((date, index) => {
                if (!date) return <span className="day blank" key={`blank-${index}`} />;
                const stretches = byDate.get(date)?.stretches ?? [];
                const free = byDate.get(date)?.heat ?? 0;
                const level = heatLevel(free, total);
                const day = Number(date.slice(8));
                if (stretches.length === 0) {
                  return (
                    <span
                      className="day heat-0"
                      key={date}
                      role="img"
                      aria-label={`${formatDate(date)}: nobody free`}
                    >
                      <span className="day-number">{day}</span>
                    </span>
                  );
                }
                if (tickOne && stretches.length === 1) {
                  const [stretch] = stretches;
                  return (
                    <label className={`day free-day one-time heat-${level}`} key={date}>
                      {tickOne(date, stretch, heatWords(free, total))}
                      <span className="day-number" aria-hidden="true">
                        {day}
                      </span>
                      <span className="day-free" aria-hidden="true">
                        {free > 0 ? `${free}/${total}` : "<1h"}
                      </span>
                      <span className="day-time" aria-hidden="true">
                        {timeRange(stretch.startMinute, stretch.endMinute)}
                      </span>
                    </label>
                  );
                }
                return (
                  <DateDetails
                    key={date}
                    date={date}
                    day={day}
                    level={level}
                    free={free}
                    total={total}
                    stretches={stretches}
                    renderStretch={renderStretch}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "up to 3 of 5 free", or that people are free only for less than an hour. */
function heatWords(free: number, total: number): string {
  return free > 0 ? `up to ${free} of ${total} free` : "free only for less than an hour";
}

function DateDetails<S extends { startMinute: number; endMinute: number }>({
  date,
  day,
  level,
  free,
  total,
  stretches,
  renderStretch,
}: {
  date: string;
  day: number;
  level: number;
  free: number;
  total: number;
  stretches: S[];
  renderStretch: (date: string, stretch: S) => ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  // A tap outside closes it, as Escape does (plan/phase-41.md); no Done button.
  useDismissOutside(details);
  const close = () => {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector("summary")?.focus({ preventScroll: true });
  };
  return (
    <details className={`day free-day heat-${level}`} name={DATE_POPUP} ref={details}>
      <summary aria-label={`${formatDate(date)}: ${heatWords(free, total)}`}>
        <span className="day-number">{day}</span>
        <span className="day-free" aria-hidden="true">
          {free > 0 ? `${free}/${total}` : "<1h"}
        </span>
      </summary>
      <div
        className="day-panel"
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <h4>{formatDate(date)}</h4>
        <ul className="stretches">{stretches.map((stretch) => renderStretch(date, stretch))}</ul>
      </div>
    </details>
  );
}
