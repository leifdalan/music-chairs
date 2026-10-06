import { useRef, type ReactNode } from "react";

import { buttonVariants } from "~/components/ui/button";
import { formatDate } from "~/lib/availability";
import { monthGrid, WEEKDAY_INITIALS } from "~/lib/calendar-grid";
import { heatLevel } from "~/lib/heat";
import { useHydrated } from "~/lib/use-hydrated";

/**
 * A calendar of who is free (plan/phase-20.md): the dates shaded by how many
 * people are free together, each date with free time opening a panel of its
 * free times. The request page's panels tick times to propose; the schedule's
 * only show them (plan/phase-24.md). Every date's disclosure shares one name,
 * so one panel is open at a time, with or without JavaScript.
 */
export function FreeCalendar<S extends { startMinute: number }>({
  from,
  to,
  days,
  total,
  legend,
  renderStretch,
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
}) {
  const hydrated = useHydrated();
  const byDate = new Map(days.map((day) => [day.date, day]));
  return (
    <div className="free-calendar">
      <p className="hint heat-legend">
        <span className="heat-swatch heat-1" aria-hidden="true" /> Fainter green: fewer free ·{" "}
        <span className="heat-swatch heat-4" aria-hidden="true" /> Stronger green: more free.{" "}
        {legend}
      </p>
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
              return (
                <DateDetails
                  key={date}
                  date={date}
                  day={day}
                  level={level}
                  free={free}
                  total={total}
                  stretches={stretches}
                  hydrated={hydrated}
                  renderStretch={renderStretch}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DateDetails<S extends { startMinute: number }>({
  date,
  day,
  level,
  free,
  total,
  stretches,
  hydrated,
  renderStretch,
}: {
  date: string;
  day: number;
  level: number;
  free: number;
  total: number;
  stretches: S[];
  hydrated: boolean;
  renderStretch: (date: string, stretch: S) => ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  // Closing hides the focused Done button, so focus goes back to the date.
  const close = () => {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector("summary")?.focus();
  };
  return (
    <details className={`day free-day heat-${level}`} name="free-date" ref={details}>
      <summary
        aria-label={
          free > 0
            ? `${formatDate(date)}: up to ${free} of ${total} free`
            : `${formatDate(date)}: free only for less than an hour`
        }
      >
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
        {hydrated ? (
          <button type="button" className={buttonVariants({ variant: "outline" })} onClick={close}>
            Done
          </button>
        ) : null}
      </div>
    </details>
  );
}
