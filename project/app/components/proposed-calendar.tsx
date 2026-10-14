import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { buttonVariants } from "~/components/ui/button";
import { formatDate } from "~/lib/availability";
import { monthGrid, WEEKDAY_INITIALS } from "~/lib/calendar-grid";
import { useHydrated } from "~/lib/use-hydrated";

import { DATE_POPUP } from "./free-calendar";

type Answer = "yes" | "no" | "maybe";

/** One proposed rehearsal on the calendar: its date and the viewer's answer. */
export type CalendarRehearsal = { id: string; date: string; mine: Answer | null };

const SAID: Record<Answer, string> = { yes: "Yes", no: "No", maybe: "Maybe" };

/** What a date's cell says of the viewer's answers, shown and for screen readers. */
export function dateMark(items: { mine: Answer | null }[]): { shown: string; spoken: string } {
  const open = items.filter((item) => item.mine === null).length;
  const count = `${items.length} proposed ${items.length === 1 ? "rehearsal" : "rehearsals"}`;
  if (open > 0) {
    return {
      shown: "•",
      spoken: items.length === 1 ? `${count}, not answered` : `${count}, ${open} not answered`,
    };
  }
  if (items.length === 1) {
    const answer = SAID[items[0].mine as Answer];
    return { shown: answer, spoken: `${count}, you said ${answer}` };
  }
  return { shown: "✓", spoken: `${count}, all answered` };
}

/**
 * The proposed rehearsals as a calendar (plan/phase-39.md): each date with
 * one opens a popup with its rehearsals' cards, where people answer. `openOn`
 * opens a date's popup on the first render only (a link to a rehearsal, or
 * the page coming back after an answer in it); later renders leave every
 * popup as the person left it.
 */
export function ProposedCalendar<R extends CalendarRehearsal>({
  items,
  openOn,
  renderCard,
}: {
  items: R[];
  openOn: string | null;
  /** One rehearsal's card in its date's popup, as an `<li>`. */
  renderCard: (item: R) => ReactNode;
}) {
  const hydrated = useHydrated();
  const [initial] = useState(openOn);
  const byDate = new Map<string, R[]>();
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return null;
  return (
    <div className="free-calendar proposed-calendar">
      <p className="hint heat-legend">
        Tap a date to answer. <span aria-hidden="true">•</span> marks a date you haven&apos;t
        answered.
      </p>
      <div className="months">
        {monthGrid(dates[0], dates[dates.length - 1]).map((month) => (
          <div className="month" key={month.label}>
            <h3>{month.label}</h3>
            <div className="month-grid">
              {WEEKDAY_INITIALS.map((letter, index) => (
                <span className="weekday" key={index} aria-hidden="true">
                  {letter}
                </span>
              ))}
              {month.weeks.flat().map((date, index) => {
                if (!date) return <span className="day blank" key={`blank-${index}`} />;
                const day = Number(date.slice(8));
                const onDate = byDate.get(date);
                if (!onDate) {
                  return (
                    <span className="day" key={date} aria-hidden="true">
                      <span className="day-number">{day}</span>
                    </span>
                  );
                }
                return (
                  <ProposedDate
                    key={date}
                    date={date}
                    day={day}
                    items={onDate}
                    open={initial === date}
                    hydrated={hydrated}
                    renderCard={renderCard}
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

function ProposedDate<R extends CalendarRehearsal>({
  date,
  day,
  items,
  open,
  hydrated,
  renderCard,
}: {
  date: string;
  day: number;
  items: R[];
  open: boolean;
  hydrated: boolean;
  renderCard: (item: R) => ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const mark = dateMark(items);
  // Closing hides the focused Done button, so focus goes back to the date.
  const close = () => {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector("summary")?.focus();
  };
  // Escape closes the popup, but not from a dialog or a field inside it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    const target = event.target as HTMLElement;
    if (target.closest("dialog") || target.matches("input, textarea, select")) return;
    close();
  };
  return (
    <details
      className={`day free-day proposed-day${mark.shown === "•" ? " needs-answer" : ""}`}
      name={DATE_POPUP}
      ref={details}
      open={open || undefined}
    >
      <summary aria-label={`${formatDate(date)}: ${mark.spoken}`}>
        <span className="day-number">{day}</span>
        <span className="day-free" aria-hidden="true">
          {mark.shown}
        </span>
      </summary>
      <div className="day-panel" onKeyDown={onKeyDown}>
        <h4 tabIndex={-1}>{formatDate(date)}</h4>
        <ul className="rehearsals">{items.map((item) => renderCard(item))}</ul>
        {hydrated ? (
          <button type="button" className={buttonVariants({ variant: "outline" })} onClick={close}>
            Done
          </button>
        ) : null}
      </div>
    </details>
  );
}
