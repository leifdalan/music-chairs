import { useEffect, useState } from "react";
import { Form, useFetcher, useFetchers } from "react-router";

import { addDays, formatDate, parseTimeText, timeInputValue } from "~/lib/availability";
import { clashes, type Clashes } from "~/lib/busy";
import { monthGrid, WEEKDAY_INITIALS } from "~/lib/calendar-grid";
import { dateTicked, timesOn, type OneOff } from "~/lib/date-toggle";
import type { TimeWindow } from "~/lib/requests";
import { useHydrated } from "~/lib/use-hydrated";

import { SubmitButton } from "./submit-button";
import { TimeRange } from "./time-range";
import { Switch, useSwitch } from "./view-switch";

export type DateErrors = { dates?: string; startTime?: string; endTime?: string };
export type DateValues = { dates: string[]; startTime: string; endTime: string };

const SET_DATE = "set-date-";

function chosenRange(start: string, end: string): TimeWindow | null {
  const from = parseTimeText(start, { end: false });
  const until = parseTimeText(end, { end: true });
  return from.ok && until.ok && until.minutes > from.minutes
    ? { startMinute: from.minutes, endMinute: until.minutes }
    : null;
}

/**
 * A member's times on one request (plan/phase-23.md): pick a stretch on the
 * hour bar, then tick the dates you're free, on a calendar or a list. Each
 * tick saves that date at the stretch straight away and an untick clears it
 * (times within this request's windows only). Without JavaScript the ticks
 * post together with a Save button. Read-only once the request stops taking
 * times.
 */
export function RequestDates({
  from,
  to,
  windows,
  oneOffs,
  view,
  editable,
  clashes: clashState,
  notice,
  result,
}: {
  from: string;
  to: string;
  windows: TimeWindow[];
  /** The member's saved times on these dates within the request's windows. */
  oneOffs: OneOff[];
  view: "calendar" | "list";
  editable: boolean;
  clashes: Clashes;
  /** What happened on the way back from Google's consent screen. */
  notice: string | null;
  /** A refused Save without JavaScript. */
  result: { dateErrors: DateErrors; dateValues: DateValues } | undefined;
}) {
  const hydrated = useHydrated();
  const link = useSwitch(["notice"]);
  const [chosen, setChosen] = useState(() =>
    result ? chosenRange(result.dateValues.startTime, result.dateValues.endTime) : null,
  );
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  // The last save's outcome, for the status line; a failure also shows in the dates' alert.
  const [lastSave, setLastSave] = useState<"saved" | "failed" | null>(null);
  const saving = useFetchers().some(
    (fetcher) => fetcher.key.startsWith(SET_DATE) && fetcher.state !== "idle",
  );
  const live = hydrated && editable;
  const busy = clashState.state === "ready" ? clashState.busy : {};
  const errors = result?.dateErrors ?? {};
  const datesError = errors.dates ?? saveProblem;
  const ticked = new Set(result ? result.dateValues.dates : oneOffs.map((slot) => slot.date));
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);

  const box = (date: string, label: string) =>
    !editable ? (
      <input type="checkbox" checked={ticked.has(date)} disabled readOnly aria-label={label} />
    ) : live ? (
      <DateToggle
        date={date}
        label={label}
        chosen={chosen}
        oneOffs={oneOffs}
        onResult={(problem) => {
          setSaveProblem(problem);
          setLastSave(problem ? "failed" : "saved");
        }}
      />
    ) : (
      <input
        type="checkbox"
        name="date"
        value={date}
        defaultChecked={ticked.has(date)}
        aria-label={label}
      />
    );
  const labelOf = (date: string, isBusy: boolean) => {
    const times = timesOn(date, oneOffs);
    return `${formatDate(date)}${times ? `, ${times}` : ""}${isBusy ? ", busy in your Google Calendar" : ""}`;
  };

  return (
    <Form
      method="post"
      className="stack calendar-entry"
      replace
      // Once interactive, each tick saves itself; nothing posts the whole form.
      onSubmit={live ? (event) => event.preventDefault() : undefined}
    >
      <input type="hidden" name="intent" value="save-dates" />
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {editable ? (
        <>
          <p className="hint">Pick a stretch of the day, then tick the dates you're free.</p>
          <TimeRange
            startName="startTime"
            endName="endTime"
            startValue={result?.dateValues.startTime ?? ""}
            endValue={result?.dateValues.endTime ?? ""}
            presets={windows}
            startError={errors.startTime}
            endError={errors.endTime}
            onChange={(range) => setChosen(range)}
          />
          {clashState.state === "ready" ? (
            <p className="hint">
              Once you pick a stretch, days busy in your Google Calendar are greyed; you can still
              tick them.
            </p>
          ) : null}
          {clashState.state === "connect" ? (
            <p className="hint">
              <a href={clashState.connectUrl}>See clashes from your Google Calendar</a>
            </p>
          ) : null}
          {clashState.state === "error" ? (
            <p className="field-error" role="alert">
              Couldn't read your Google Calendar right now; nothing is greyed.
            </p>
          ) : null}
        </>
      ) : null}
      <Switch
        label="How to show your dates"
        options={[
          { text: "Calendar", to: link("times", null), current: view === "calendar" },
          { text: "List", to: link("times", "list"), current: view === "list" },
        ]}
      />
      <fieldset
        className={live && chosen === null ? "dates no-range" : "dates"}
        aria-describedby={datesError ? "dates-error" : undefined}
      >
        <legend>Dates</legend>
        {view === "list" ? (
          <ul className="date-list">
            {dates.map((date) => {
              const isBusy = chosen !== null && clashes(busy[date], [chosen]);
              const times = timesOn(date, oneOffs);
              return (
                <li key={date}>
                  <label className={isBusy ? "day busy" : "day"}>
                    {box(date, labelOf(date, isBusy))}
                    <span>{formatDate(date)}</span>
                    {times ? <span className="day-time">{times}</span> : null}
                    {isBusy ? <span className="day-busy">busy</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          monthGrid(from, to).map((month) => (
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
                  const isBusy = chosen !== null && clashes(busy[date], [chosen]);
                  const times = timesOn(date, oneOffs);
                  return (
                    <label className={isBusy ? "day busy" : "day"} key={date}>
                      {box(date, labelOf(date, isBusy))}
                      <span className="day-number">{Number(date.slice(8))}</span>
                      {times ? (
                        <span className="day-time" aria-hidden="true">
                          {times}
                        </span>
                      ) : null}
                      {isBusy ? <span className="day-busy">busy</span> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {datesError ? (
          <p className="field-error" id="dates-error" role="alert">
            {datesError}
          </p>
        ) : null}
      </fieldset>
      {!editable ? null : live ? (
        <p className="hint save-status" aria-live="polite">
          {saving
            ? "Saving…"
            : lastSave === "saved"
              ? "Saved"
              : lastSave === "failed"
                ? "Not saved"
                : ""}
        </p>
      ) : (
        <SubmitButton feedbackKey="request-save-dates">Save</SubmitButton>
      )}
    </Form>
  );
}

/**
 * One date's checkbox once the page is interactive: ticking or unticking it
 * saves through its own fetcher, so dates save independently and each date's
 * saves run one at a time.
 */
function DateToggle({
  date,
  label,
  chosen,
  oneOffs,
  onResult,
}: {
  date: string;
  label: string;
  chosen: TimeWindow | null;
  oneOffs: OneOff[];
  onResult: (problem: string | null) => void;
}) {
  const fetcher = useFetcher<{ dateProblem?: string; dateSaved?: boolean }>({
    key: `${SET_DATE}${date}`,
  });
  const pending = fetcher.formData ? { on: fetcher.formData.get("on") === "1" } : null;
  const result = fetcher.data;
  useEffect(() => {
    if (result === undefined) return;
    onResult(result?.dateProblem ?? null);
    // Report each save's outcome once, when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  const on = dateTicked(date, oneOffs, pending);
  return (
    <input
      type="checkbox"
      checked={on}
      // Each date's saves run one at a time. A saving date stays focusable and
      // ticked; without a stretch only a ticked date can be cleared.
      disabled={chosen === null && !on}
      aria-busy={fetcher.state !== "idle"}
      aria-label={label}
      onChange={(event) => {
        if (fetcher.state !== "idle") return;
        const checked = event.currentTarget.checked;
        if (checked && !chosen) return;
        const form = new FormData();
        form.set("intent", "set-date");
        form.set("date", date);
        form.set("on", checked ? "1" : "0");
        if (chosen) {
          form.set("startTime", timeInputValue(chosen.startMinute));
          form.set("endTime", timeInputValue(chosen.endMinute));
        }
        void fetcher.submit(form, { method: "post" });
      }}
    />
  );
}
