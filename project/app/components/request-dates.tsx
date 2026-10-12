import { useEffect, useRef, useState, type ReactNode } from "react";
import { Form, useFetcher, useFetchers, useNavigation } from "react-router";

import { addDays, formatDate, parseTimeText, timeInputValue } from "~/lib/availability";
import { clashes, type Clashes } from "~/lib/busy";
import { entriesForm, isFailure, type Failure } from "~/lib/client-failure";
import { monthGrid, WEEKDAY_INITIALS } from "~/lib/calendar-grid";
import { dateTicked, startingTicks, timesOn, type OneOff } from "~/lib/date-toggle";
import type { TimeWindow } from "~/lib/requests";
import { useHydrated } from "~/lib/use-hydrated";

import { buttonVariants } from "./ui/button";
import { ConfirmForm } from "./confirm-form";
import { FailureAlert } from "./failure-alert";
import { SubmitButton } from "./submit-button";
import { TimeRange } from "./time-range";
import { Switch, useSwitch } from "./view-switch";

export type DateErrors = { dates?: string; startTime?: string; endTime?: string };
export type DateValues = { dates: string[]; startTime: string; endTime: string };
/** The preferred number as a refused first answer sent it (plan/phase-31.md). */
export type LimitValues = { most: boolean; count: string };

const SET_DATE = "set-date-";

export type DateSaveResult = { dateProblem?: string; dateSaved?: boolean } | { failure: Failure };

/** A date save's outcome, reported to the dates' status line. */
type SaveOutcome = { problem: string | null; failure: Failure | null; retry: () => void };

/** The submitted entry `name`, from a failed save's entries. */
function sent(failure: Failure, name: string): string | null {
  return failure.entries.find(([key]) => key === name)?.[1] ?? null;
}

/** The "are you sure" text for Clear all; the dialog and the server's confirm panel share it. */
export const CLEAR_DATES_PROMPT = {
  title: "Clear all your dates?",
  body: "Your times on every date still on offer, within this request's times of day, are cleared, including any you gave for another request. You can tick them again.",
  label: "Clear all dates",
};

function chosenRange(start: string, end: string): TimeWindow | null {
  const from = parseTimeText(start, { end: false });
  const until = parseTimeText(end, { end: true });
  return from.ok && until.ok && until.minutes > from.minutes
    ? { startMinute: from.minutes, endMinute: until.minutes }
    : null;
}

/**
 * The time of day chosen when the page opens (plan/phase-28.md): a refused
 * Save's own times, kept as typed even when they don't make a range; otherwise
 * the request's first time of day, so the dates can be ticked at once.
 */
export function initialRange(
  windows: TimeWindow[],
  result: { dateValues: DateValues } | undefined,
): { startTime: string; endTime: string; range: TimeWindow | null } {
  if (result) {
    const { startTime, endTime } = result.dateValues;
    return { startTime, endTime, range: chosenRange(startTime, endTime) };
  }
  const first = windows[0];
  if (!first) return { startTime: "", endTime: "", range: null };
  return {
    startTime: timeInputValue(first.startMinute),
    endTime: timeInputValue(first.endMinute),
    range: first,
  };
}

/**
 * A member's times on one request (plan/phase-23.md): pick a stretch on the
 * hour bar, then tick the dates you're free, on a calendar or a list. Each
 * tick saves that date at the stretch straight away and an untick clears it
 * (times within this request's windows only), with Select all and Clear all
 * beside the dates. Without JavaScript the ticks post together with a Save
 * button. Read-only once the request stops taking times.
 *
 * A first answer is a draft (plan/phase-31.md): every date the member looks
 * free is already ticked, Select all and Clear all change the ticks, and one
 * Send posts the dates with the preferred number (`capFields`); nothing is
 * saved before it.
 */
export function RequestDates({
  requestId,
  from,
  to,
  windows,
  oneOffs,
  view,
  editable,
  clashes: clashState,
  notice,
  result,
  draft,
  capFields,
}: {
  /** Fetchers are keyed by request, so a failure never follows to another request's page. */
  requestId: string;
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
  /** A refused Save without JavaScript, or a refused Send. */
  result: { dateErrors: DateErrors; dateValues: DateValues; limitValues?: LimitValues } | undefined;
  /** The member hasn't answered yet: their answer is a draft until Send. */
  draft: boolean;
  /** The preferred-number fields, sent with a draft. */
  capFields: ReactNode;
}) {
  const hydrated = useHydrated();
  const link = useSwitch(["notice"]);
  const [initial] = useState(() => initialRange(windows, result));
  const [chosen, setChosen] = useState(initial.range);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  // The last save's outcome, for the status line; a refusal also shows in the dates' alert.
  const [lastSave, setLastSave] = useState<"saved" | "failed" | null>(null);
  // Saves that failed in the browser (plan/phase-34.md), by fetcher, until saved.
  const [failed, setFailed] = useState<ReadonlyMap<string, SaveOutcome>>(new Map());
  const report = (key: string, outcome: SaveOutcome) => {
    setSaveProblem(outcome.problem);
    setLastSave(outcome.problem || outcome.failure ? "failed" : "saved");
    setFailed((current) => {
      // Select all saved: it supersedes every date's failed change.
      if (key === "all" && !outcome.failure && !outcome.problem) return new Map();
      const next = new Map(current);
      if (outcome.failure) next.set(key, outcome);
      else next.delete(key);
      return next;
    });
  };
  // Clear all saved (the page reloaded its dates after it): it supersedes them too.
  const clearing = useNavigation().formData?.get("intent") === "clear-dates";
  const clearStart = useRef<OneOff[] | null>(null);
  useEffect(() => {
    if (clearing) {
      clearStart.current = oneOffs;
      return;
    }
    if (clearStart.current !== null && clearStart.current !== oneOffs) setFailed(new Map());
    clearStart.current = null;
  }, [clearing, oneOffs]);
  const fetcherKey = (name: string) => `${SET_DATE}${requestId}-${name}`;
  const failure = failed.values().next().value?.failure ?? null;
  const saving = useFetchers().some(
    (fetcher) => fetcher.key.startsWith(SET_DATE) && fetcher.state !== "idle",
  );
  const live = hydrated && editable;
  const drafting = editable && draft;
  const busy = clashState.state === "ready" ? clashState.busy : {};
  const errors = result?.dateErrors ?? {};
  const datesError = errors.dates ?? saveProblem;
  const ticked = new Set(result ? result.dateValues.dates : oneOffs.map((slot) => slot.date));
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  // A draft's ticks, controlled from the first render so the server's and the
  // browser's agree: a refused Send's own, otherwise the starting ticks.
  const [draftTicks, setDraftTicks] = useState(
    () =>
      new Set(
        result ? result.dateValues.dates : startingTicks(dates, busy, initial.range, oneOffs),
      ),
  );
  // Boxes tapped before the page became interactive changed only the page:
  // take them up once, so the count and Select all match what will be sent.
  const datesBox = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (!drafting || !datesBox.current) return;
    const shown = datesBox.current.querySelectorAll<HTMLInputElement>('input[name="date"]');
    setDraftTicks(
      new Set(
        Array.from(shown)
          .filter((input) => input.checked)
          .map((input) => input.value),
      ),
    );
    // Once, on becoming interactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = (date: string, label: string) =>
    drafting ? (
      <input
        type="checkbox"
        name="date"
        value={date}
        checked={draftTicks.has(date)}
        onChange={(event) => {
          const next = new Set(draftTicks);
          if (event.currentTarget.checked) next.add(date);
          else next.delete(date);
          setDraftTicks(next);
        }}
        aria-label={label}
      />
    ) : !editable ? (
      <input type="checkbox" checked={ticked.has(date)} disabled readOnly aria-label={label} />
    ) : live ? (
      <DateToggle
        date={date}
        label={label}
        chosen={chosen}
        oneOffs={oneOffs}
        fetcherKey={fetcherKey(date)}
        failed={failed.has(date)}
        onResult={(outcome) => report(date, outcome)}
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
    <>
      <Form
        method="post"
        preventScrollReset
        className="stack calendar-entry"
        replace
        // Once interactive, each tick saves itself; nothing posts the whole form,
        // except a draft's Send.
        onSubmit={live && !drafting ? (event) => event.preventDefault() : undefined}
      >
        <input type="hidden" name="intent" value="save-dates" />
        {drafting ? <input type="hidden" name="draft" value="1" /> : null}
        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : null}
        {editable ? (
          <>
            <p className="hint">
              {drafting
                ? "We've ticked every date you look free. Untick the ones you can't make, then send them."
                : "Tick the dates you're free; for another time of day, change it below first."}
            </p>
            <TimeRange
              startName="startTime"
              endName="endTime"
              startValue={initial.startTime}
              endValue={initial.endTime}
              presets={windows}
              startError={errors.startTime}
              endError={errors.endTime}
              onChange={(range) => setChosen(range)}
            />
            {clashState.state === "ready" ? (
              <p className="hint">
                Days busy in your Google Calendar are greyed; you can still tick them.
              </p>
            ) : null}
            {clashState.state === "connect" ? (
              <p className={clashState.revoked ? "field-error" : "hint"}>
                {clashState.revoked
                  ? "Google Calendar access was removed, so clashes can't be shown. "
                  : null}
                <a href={clashState.connectUrl} className="back-link">
                  {clashState.revoked
                    ? "Reconnect Google Calendar"
                    : "See clashes from your Google Calendar"}
                </a>
              </p>
            ) : null}
            {clashState.state === "error" ? (
              <p className="field-error" role="alert">
                {drafting && !result
                  ? "Couldn't read your Google Calendar right now, so every date is ticked; check them before sending."
                  : "Couldn't read your Google Calendar right now; nothing is greyed."}
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
          ref={datesBox}
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
        {drafting ? (
          <div className="select-dates">
            {hydrated ? (
              <>
                <button
                  type="button"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  onClick={() => setDraftTicks(new Set(dates))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  onClick={() => setDraftTicks(new Set())}
                >
                  Clear all
                </button>
              </>
            ) : null}
            <p className="hint" aria-live="polite">
              {draftTicks.size} of {dates.length} {dates.length === 1 ? "date" : "dates"} ticked
            </p>
          </div>
        ) : null}
        {drafting ? (
          <>
            {capFields}
            <SubmitButton feedbackKey="request-send-dates">Send these dates</SubmitButton>
          </>
        ) : !editable ? null : live ? (
          <>
            <p className="hint save-status" aria-live="polite">
              {saving
                ? "Saving…"
                : failure
                  ? ""
                  : lastSave === "saved"
                    ? "Saved"
                    : lastSave === "failed"
                      ? "Not saved"
                      : ""}
            </p>
            {failure ? (
              <FailureAlert
                failure={failure}
                busy={saving}
                // Every failed date sends its own last change again.
                onRetry={() => failed.forEach((outcome) => outcome.retry())}
              />
            ) : null}
          </>
        ) : (
          <SubmitButton feedbackKey="request-save-dates">Save</SubmitButton>
        )}
      </Form>
      {live && !drafting ? (
        <AllDates
          chosen={chosen}
          fetcherKey={fetcherKey("all")}
          onResult={(outcome) => report("all", outcome)}
        />
      ) : null}
    </>
  );
}

/**
 * Select all and Clear all once the member has answered (plan/phase-31.md),
 * outside the dates' form: Select all saves the chosen stretch on every date
 * without times, through a fetcher whose status shows with the dates' own;
 * Clear all asks first.
 */
function AllDates({
  chosen,
  fetcherKey,
  onResult,
}: {
  chosen: TimeWindow | null;
  fetcherKey: string;
  onResult: (outcome: SaveOutcome) => void;
}) {
  const fetcher = useFetcher<DateSaveResult>({ key: fetcherKey });
  const result = fetcher.data;
  useEffect(() => {
    if (result === undefined) return;
    onResult(outcomeOf(result, fetcher.submit));
    // Report each save's outcome once, when it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  return (
    <div className="select-dates">
      <button
        type="button"
        className={buttonVariants({ variant: "outline", size: "sm" })}
        disabled={chosen === null || fetcher.state !== "idle"}
        onClick={() => {
          if (!chosen) return;
          const form = new FormData();
          form.set("intent", "fill-dates");
          form.set("startTime", timeInputValue(chosen.startMinute));
          form.set("endTime", timeInputValue(chosen.endMinute));
          void fetcher.submit(form, { method: "post" });
        }}
      >
        Select all
      </button>
      <ConfirmForm
        fields={{ intent: "clear-dates" }}
        trigger="Clear all"
        triggerSize="sm"
        {...CLEAR_DATES_PROMPT}
        feedbackKey="request-clear-dates"
      />
    </div>
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
  fetcherKey,
  failed,
  onResult,
}: {
  date: string;
  label: string;
  chosen: TimeWindow | null;
  oneOffs: OneOff[];
  fetcherKey: string;
  /** Its last change failed and nothing since has superseded it. */
  failed: boolean;
  onResult: (outcome: SaveOutcome) => void;
}) {
  const fetcher = useFetcher<DateSaveResult>({ key: fetcherKey });
  const result = fetcher.data;
  const pending = shownChange(fetcher.formData, result, failed);
  useEffect(() => {
    if (result === undefined) return;
    onResult(outcomeOf(result, fetcher.submit));
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

/**
 * The change a date's box shows instead of what is saved (plan/phase-34.md):
 * the one saving, or the one that failed until it's retried or superseded.
 */
export function shownChange(
  saving: FormData | undefined,
  result: DateSaveResult | undefined,
  failed: boolean,
): { on: boolean } | null {
  if (saving) return { on: saving.get("on") === "1" };
  if (failed && isFailure(result)) return { on: sent(result.failure, "on") === "1" };
  return null;
}

/** What a date save's result means for the status line, and how to send it again. */
export function outcomeOf(
  result: DateSaveResult,
  submit: (form: FormData, options: { method: "post" }) => Promise<void>,
): SaveOutcome {
  if (isFailure(result)) {
    const { failure } = result;
    return {
      problem: null,
      failure,
      retry: () => void submit(entriesForm(failure.entries), { method: "post" }),
    };
  }
  return { problem: result?.dateProblem ?? null, failure: null, retry: () => {} };
}
