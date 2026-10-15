import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useActionData, useNavigation } from "react-router";

import { formatDate } from "~/lib/availability";
import { monthGrid, WEEKDAY_INITIALS } from "~/lib/calendar-grid";
import { useDismissOutside } from "~/lib/dismiss";

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

/** An answer sent from a date's popup. */
export type SentAnswer = { rehearsalId: string; answer: string };

/**
 * Whether answering closes the date's popup (plan/phase-41.md): a Yes, No or
 * Maybe (not Clear) from this popup, saved (no refusal or failure), showing
 * now as the viewer's answer, with every rehearsal on the date answered.
 */
export function closesAfterAnswer({
  sent,
  result,
  after,
}: {
  sent: SentAnswer | null;
  /** The page's action data: a refusal carries `problem`, a failed save `failure`. */
  result: object | undefined;
  after: { id: string; mine: Answer | null }[];
}): boolean {
  if (!sent || (result && ("problem" in result || "failure" in result))) return false;
  if (after.find((item) => item.id === sent.rehearsalId)?.mine !== sent.answer) return false;
  return after.every((item) => item.mine !== null);
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
  renderCard,
}: {
  date: string;
  day: number;
  items: R[];
  open: boolean;
  renderCard: (item: R) => ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const mark = dateMark(items);
  // A tap outside closes it, as Escape does; no Done button (plan/phase-41.md).
  useDismissOutside(details);
  const close = () => {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector("summary")?.focus({ preventScroll: true });
  };
  // Answering closes it once the date is answered and the save went through.
  const sent = useRef<SentAnswer | null>(null);
  const navigation = useNavigation();
  const result = useActionData() as object | undefined;
  const onSubmit = (event: FormEvent<HTMLDivElement>) => {
    const form = event.target as HTMLFormElement;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(form);
    sent.current =
      data.get("intent") === "rsvp" && submitter?.name === "answer"
        ? { rehearsalId: String(data.get("rehearsalId")), answer: submitter.value }
        : null;
  };
  useEffect(() => {
    if (navigation.state !== "idle" || !sent.current) return;
    const answer = sent.current;
    sent.current = null;
    // Only a popup still open closes, so focus never leaves one opened since.
    if (details.current?.open && closesAfterAnswer({ sent: answer, result, after: items })) close();
  }, [navigation.state, items, result]);
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
      <div className="day-panel" onKeyDown={onKeyDown} onSubmitCapture={onSubmit}>
        <h4 tabIndex={-1}>{formatDate(date)}</h4>
        <ul className="rehearsals">{items.map((item) => renderCard(item))}</ul>
      </div>
    </details>
  );
}
