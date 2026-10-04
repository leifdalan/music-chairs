import { useState } from "react";
import { data, Form, Link, redirect, useLocation } from "react-router";

import { calendarViewer } from "~/.server/calendar-sync";
import { confirmationNeeded } from "~/.server/confirm";
import { redirectWithToast } from "~/.server/flash";
import {
  accessTokenFor,
  CALENDAR_SCOPES,
  GoogleAccessRevoked,
  GoogleApiError,
  queryBusy,
} from "~/.server/google";
import { findViewer, pagePath } from "~/.server/membership";
import { getStore, type Group, type Member, type ScheduleRequest } from "~/.server/store";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { ProblemAlert } from "~/components/problem-alert";
import { SlotFields } from "~/components/slot-fields";
import { SubmitButton } from "~/components/submit-button";
import { TimeRange } from "~/components/time-range";
import {
  addDays,
  describeSlot,
  expandOccurrences,
  formatDate,
  formatMinutes,
  isDate,
  isOccurrence,
  parseSlotInput,
  parseTime,
  parseTimeText,
  timeInputValue,
  todayInZone,
  UPCOMING_WEEKS,
  weekdayName,
  type Slot,
  type SlotErrors,
  type SlotFormValues,
} from "~/lib/availability";
import { busyQueries, busyRanges, clashes, clipRanges } from "~/lib/busy";
import { calendarNotice } from "~/lib/calendar-notices";
import { monthGrid, WEEKDAY_INITIALS, type CalendarMonth } from "~/lib/calendar-grid";
import type { TimeWindow } from "~/lib/requests";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/availability";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `My availability · ${loaderData.groupName}` : "Not found");
}

/**
 * The open, unfinished request a link or form names, looked up in this group
 * only; anything else (unknown, closed, ended, another group's) is no request.
 */
function openRequest(group: Group, id: unknown, today: string): ScheduleRequest | null {
  if (typeof id !== "string") return null;
  const found = getStore().findRequest(group.id, id);
  return found?.open && found.endDate >= today ? found : null;
}

/** The group and the member viewing it; visitors go back to the group page. */
async function groupAndViewer(
  request: Request,
  groupId: string,
): Promise<{ group: Group; viewer: Member }> {
  const group = getStore().findGroup(groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(`/g/${group.id}`);
  return { group, viewer };
}

/** The dates the calendar offers: the rest of the request's span, or the next eight weeks. */
function offeredRange(scheduleRequest: ScheduleRequest | null, today: string) {
  if (!scheduleRequest) return { from: today, to: addDays(today, UPCOMING_WEEKS * 7 - 1) };
  return {
    from: scheduleRequest.startDate > today ? scheduleRequest.startDate : today,
    to: scheduleRequest.endDate,
  };
}

type Clashes =
  | { state: "none" }
  | { state: "connect"; connectUrl: string }
  | { state: "error" }
  | { state: "ready"; busy: Record<string, TimeWindow[]> };

/**
 * The member's own busy times from Google Calendar for the offered dates, read
 * live on every load (plan/phase-10.md). Only for the member signed in with
 * Google on this device; while answering a request, only within its windows,
 * so nothing outside the request reaches the page.
 */
async function googleClashes(
  request: Request,
  group: Group,
  range: { from: string; to: string },
  windows: TimeWindow[] | null,
): Promise<Clashes> {
  const capable = await calendarViewer(request, group);
  if (!capable) return { state: "none" };
  const url = new URL(request.url);
  // Back here after consent, without the notice of an earlier attempt.
  url.searchParams.delete("notice");
  const connectUrl = `/auth/google/calendar?scope=busy&returnTo=${encodeURIComponent(pagePath(url))}`;
  if (!getStore().findGrant(capable.account.id)?.scopes.includes(CALENDAR_SCOPES.busy)) {
    return { state: "connect", connectUrl };
  }
  try {
    // One token refresh for every query that follows, not one each.
    await accessTokenFor(capable.account.id);
    const answers = await Promise.all(
      busyQueries(range.from, range.to, group.timeZone).map((query) =>
        queryBusy(capable.account.id, query.timeMin, query.timeMax),
      ),
    );
    const dates: string[] = [];
    for (let date = range.from; date <= range.to; date = addDays(date, 1)) dates.push(date);
    const busy = busyRanges(answers.flat(), dates, group.timeZone);
    if (windows) {
      for (const date of Object.keys(busy)) {
        const inside = clipRanges(busy[date], windows);
        if (inside.length > 0) busy[date] = inside;
        else delete busy[date];
      }
    }
    return { state: "ready", busy };
  } catch (error) {
    if (error instanceof GoogleAccessRevoked) return { state: "connect", connectUrl };
    if (!(error instanceof GoogleApiError)) throw error;
    console.warn(`music-chairs: free/busy for clashes failed: ${error.message}`);
    return { state: "error" };
  }
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const slots = getStore().listSlots(viewer.id);
  const today = todayInZone(group.timeZone, new Date());
  const until = addDays(today, UPCOMING_WEEKS * 7 - 1);
  const search = new URL(request.url).searchParams;
  const editId = search.get("edit");
  const editing = slots.find((slot) => slot.id === editId) ?? null;
  const view = editing || search.get("view") === "list" ? "list" : "calendar";
  // Arriving from a request (its "Add" links): its dates and times of day.
  const scheduleRequest = editing ? null : openRequest(group, search.get("request"), today);
  // Only a window the link names; Number(null) would quietly pick the first.
  const windowParam = search.get("window");
  const window =
    windowParam !== null && /^\d+$/.test(windowParam)
      ? (scheduleRequest?.windows[Number(windowParam)] ?? null)
      : null;
  const range = offeredRange(scheduleRequest, today);
  return {
    groupName: group.name,
    timeZone: group.timeZone,
    notice: calendarNotice(request),
    view,
    // Editing starts from a pattern in the list, so the list stays in view.
    timesView: editing || search.get("times") === "list" ? "list" : "calendar",
    today,
    until,
    slots,
    occurrences: expandOccurrences(slots, today, until),
    editing,
    fromRequest: scheduleRequest
      ? {
          id: scheduleRequest.id,
          name: scheduleRequest.name,
          startDate: scheduleRequest.startDate,
          endDate: scheduleRequest.endDate,
          windows: scheduleRequest.windows,
          window,
          // The list view's form: weekly over the rest of the span at the chosen window.
          values: window
            ? {
                kind: "weekly",
                startDate: range.from,
                endDate: scheduleRequest.endDate,
                startTime: timeInputValue(window.startMinute),
                endTime: timeInputValue(window.endMinute),
              }
            : null,
        }
      : null,
    offered: range,
    clashes:
      view === "calendar"
        ? await googleClashes(request, group, range, scheduleRequest?.windows ?? null)
        : ({ state: "none" } as Clashes),
  };
}

/** A rejected add/edit form, shown on its fields. */
function invalidForm(errors: SlotErrors, values: SlotFormValues) {
  return data({ errors, values }, { status: 400 });
}

/** A refused button press elsewhere on the page, shown as a page-level alert. */
function problem(message: string) {
  return data({ problem: message }, { status: 400 });
}

type DateErrors = { dates?: string; startTime?: string; endTime?: string };
type DateValues = { dates: string[]; startTime: string; endTime: string };

/** The calendar's "Add times": one one-off time per picked date, all or none. */
function addDates(
  form: FormData,
  group: Group,
  viewer: Member,
):
  | { ok: true; count: number; request: ScheduleRequest | null }
  | { ok: false; errors: DateErrors; values: DateValues } {
  const today = todayInZone(group.timeZone, new Date());
  const scheduleRequest = openRequest(group, form.get("request"), today);
  const range = offeredRange(scheduleRequest, today);
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const dates = [...new Set(form.getAll("date").filter((value) => typeof value === "string"))];
  const values = { dates, startTime: text("startTime"), endTime: text("endTime") };
  const errors: DateErrors = {};
  if (dates.length === 0) errors.dates = "Pick at least one date.";
  else if (dates.some((date) => !isDate(date) || date < range.from || date > range.to)) {
    errors.dates = "One of the dates isn't on offer any more. Reload the page and try again.";
  }
  const start = parseTime(values.startTime, "Start time", false);
  const end = parseTime(values.endTime, "End time", true);
  if (typeof start === "string") errors.startTime = start;
  if (typeof end === "string") errors.endTime = end;
  if (typeof start === "number" && typeof end === "number" && end <= start) {
    errors.endTime = "End time must be after the start time.";
  }
  if (Object.keys(errors).length > 0 || typeof start !== "number" || typeof end !== "number") {
    return { ok: false, errors, values };
  }
  getStore().addSlots(
    viewer.id,
    dates.sort().map((date) => ({
      kind: "once" as const,
      startDate: date,
      endDate: null,
      startMinute: start,
      endMinute: end,
    })),
  );
  return { ok: true, count: dates.length, request: scheduleRequest };
}

export async function action({ request, params }: Route.ActionArgs) {
  // Resolve the viewer before reading the form: every write is scoped to the
  // member this device is in this group, never to an id taken from the form.
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const slotId = String(form.get("slotId") ?? "");
  const back = (message: string) => redirectWithToast(`/g/${group.id}/availability`, message);
  // Back to the request the form came from, by its stored id, never a path from the form.
  const backToRequest = (scheduleRequest: ScheduleRequest | null, message: string) =>
    scheduleRequest
      ? redirectWithToast(`/g/${group.id}/requests/${scheduleRequest.id}`, message)
      : back(message);

  if (intent === "add-dates") {
    const result = addDates(form, group, viewer);
    if (!result.ok) {
      return data({ dateErrors: result.errors, dateValues: result.values }, { status: 400 });
    }
    return backToRequest(
      result.request,
      `Added times for ${result.count} ${result.count === 1 ? "date" : "dates"}`,
    );
  }
  if (intent === "create" || intent === "update") {
    const parsed = parseSlotInput(form);
    if (!parsed.ok) return invalidForm(parsed.errors, parsed.values);
    if (intent === "create") {
      store.addSlot(viewer.id, parsed.value);
    } else if (!store.updateSlot(viewer.id, slotId, parsed.value)) {
      throw data(null, { status: 404 });
    }
    return backToRequest(
      openRequest(group, form.get("request"), todayInZone(group.timeZone, new Date())),
      intent === "create" ? "Availability saved" : "Changes saved",
    );
  }
  if (intent === "delete") {
    const slot = store.findSlot(viewer.id, slotId);
    if (!slot) throw data(null, { status: 404 });
    const prompt = confirmationNeeded(form, deleteTimePrompt(describeSlot(slot)));
    if (prompt) return prompt;
    store.deleteSlot(viewer.id, slotId);
    return back("Time removed");
  }
  if (intent === "skip" || intent === "unskip") {
    if (!store.findSlot(viewer.id, slotId)) throw data(null, { status: 404 });
    const date = form.get("date");
    if (!isDate(date) || !store.setSkip(viewer.id, slotId, date, intent === "skip")) {
      return problem("That date isn't one of this time's weeks. Reload the page and try again.");
    }
    return back(intent === "skip" ? "Marked as can't make it" : "Marked as available again");
  }
  return problem("Something went wrong with that request. Please try again.");
}

function timeRange(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

/** A link to this page with one search parameter changed, keeping the others. */
function useSwitch(): (name: string, value: string | null) => string {
  const location = useLocation();
  return (name, value) => {
    const search = new URLSearchParams(location.search);
    // An edit and a consent notice belong to the visit they came with.
    search.delete("edit");
    search.delete("notice");
    if (value === null) search.delete(name);
    else search.set(name, value);
    const query = search.toString();
    return query ? `?${query}` : ".";
  };
}

function Switch({
  label,
  options,
}: {
  label: string;
  options: { text: string; to: string; current: boolean }[];
}) {
  return (
    <nav className="view-switch" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.text}
          to={option.to}
          replace
          preventScrollReset
          className={option.current ? "current" : undefined}
          aria-current={option.current ? "page" : undefined}
        >
          {option.text}
        </Link>
      ))}
    </nav>
  );
}

export default function Availability({ loaderData, actionData }: Route.ComponentProps) {
  const {
    groupName,
    timeZone,
    notice,
    view,
    timesView,
    today,
    until,
    slots,
    occurrences,
    editing,
    fromRequest,
    offered,
    clashes: clashState,
  } = loaderData;
  const formResult = actionData && "errors" in actionData ? actionData : undefined;
  const dateResult = actionData && "dateErrors" in actionData ? actionData : undefined;
  const pageProblem = actionData && "problem" in actionData ? actionData.problem : null;
  const confirmPrompt = actionData && "confirm" in actionData ? actionData.confirm : null;
  const link = useSwitch();
  return (
    <main>
      <p className="eyebrow">
        <Link to=".." relative="path">
          {groupName}
        </Link>
      </p>
      <h1>My availability</h1>
      <p className="hint">All times are in {timeZone}.</p>
      {confirmPrompt ? <ConfirmPanel prompt={confirmPrompt} /> : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {fromRequest ? (
        <p className="notice request-banner">
          For{" "}
          <Link to={`../requests/${fromRequest.id}`} relative="path">
            {fromRequest.name}
          </Link>
          : {formatDate(fromRequest.startDate)} to {formatDate(fromRequest.endDate)},{" "}
          {fromRequest.windows
            .map((window) => timeRange(window.startMinute, window.endMinute))
            .join(", ")}
        </p>
      ) : null}

      <section aria-labelledby="add-heading">
        <h2 id="add-heading">{editing ? "Change a time" : "Add times"}</h2>
        {editing ? null : (
          <Switch
            label="How to add times"
            options={[
              { text: "Calendar", to: link("view", null), current: view === "calendar" },
              { text: "List", to: link("view", "list"), current: view === "list" },
            ]}
          />
        )}
        {view === "calendar" ? (
          <CalendarEntry
            key={`${fromRequest?.id ?? ""}-${fromRequest?.window?.startMinute ?? ""}-${slots.length}`}
            months={monthGrid(offered.from, offered.to)}
            fromRequest={fromRequest}
            clashes={clashState}
            result={dateResult}
          />
        ) : (
          // The slot count in the key gives the add form fresh, empty fields after each save.
          <SlotForm
            key={editing?.id ?? `new-${fromRequest?.id ?? ""}-${slots.length}`}
            editing={editing}
            fromRequest={
              fromRequest?.values
                ? { id: fromRequest.id, name: fromRequest.name, values: fromRequest.values }
                : null
            }
            presets={fromRequest?.windows ?? []}
            actionData={formResult}
            today={today}
          />
        )}
      </section>

      <section aria-labelledby="slots-heading">
        <h2 id="slots-heading">My times</h2>
        <Switch
          label="How to show my times"
          options={[
            { text: "Calendar", to: link("times", null), current: timesView === "calendar" },
            { text: "List", to: link("times", "list"), current: timesView === "list" },
          ]}
        />
        {pageProblem && actionData ? (
          <ProblemAlert message={pageProblem} response={actionData} />
        ) : null}
        {timesView === "calendar" ? (
          <TimesCalendar months={monthGrid(today, until)} slots={slots} occurrences={occurrences} />
        ) : (
          <>
            {slots.length === 0 ? (
              <p className="hint">Nothing yet. Add the times you can rehearse above.</p>
            ) : (
              <ul className="slots">
                {slots.map((slot) => (
                  <SlotItem key={slot.id} slot={slot} today={today} until={until} />
                ))}
              </ul>
            )}
            <h3 id="upcoming-heading">Next {UPCOMING_WEEKS} weeks</h3>
            {occurrences.length === 0 ? (
              <p className="hint">No upcoming times.</p>
            ) : (
              <ul className="occurrences">
                {occurrences.map((occurrence) => (
                  <li key={`${occurrence.slotId}-${occurrence.date}`}>
                    <span>{formatDate(occurrence.date)}</span>
                    <span>{timeRange(occurrence.startMinute, occurrence.endMinute)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}

type LoaderData = Route.ComponentProps["loaderData"];

/** The chosen times as a range, or null while they can't be read. */
function chosenRange(start: string, end: string): TimeWindow | null {
  const from = parseTimeText(start, { end: false });
  const until = parseTimeText(end, { end: true });
  return from.ok && until.ok && until.minutes > from.minutes
    ? { startMinute: from.minutes, endMinute: until.minutes }
    : null;
}

/**
 * Pick dates, mark one range of times, add one one-off time per date. Dates
 * busy in the member's Google Calendar during the chosen times (or, before
 * any are chosen, during the request's times of day) are greyed but can
 * still be picked.
 */
function CalendarEntry({
  months,
  fromRequest,
  clashes: clashState,
  result,
}: {
  months: CalendarMonth[];
  fromRequest: LoaderData["fromRequest"];
  clashes: Clashes;
  result: { dateErrors: DateErrors; dateValues: DateValues } | undefined;
}) {
  const window = fromRequest?.window ?? null;
  const startValue =
    result?.dateValues.startTime ?? (window ? timeInputValue(window.startMinute) : "");
  const endValue = result?.dateValues.endTime ?? (window ? timeInputValue(window.endMinute) : "");
  const [chosen, setChosen] = useState(() => chosenRange(startValue, endValue));
  const picked = new Set(result?.dateValues.dates ?? []);
  const busy = clashState.state === "ready" ? clashState.busy : {};
  const against = chosen ? [chosen] : (fromRequest?.windows ?? []);
  const outsideWindows =
    fromRequest !== null &&
    chosen !== null &&
    !fromRequest.windows.some(
      (window) => window.startMinute < chosen.endMinute && window.endMinute > chosen.startMinute,
    );
  const errors = result?.dateErrors ?? {};
  return (
    <Form method="post" className="stack calendar-entry" replace>
      <input type="hidden" name="intent" value="add-dates" />
      {fromRequest ? <input type="hidden" name="request" value={fromRequest.id} /> : null}
      {clashState.state === "ready" ? (
        <p className="hint">
          Days busy in your Google Calendar are greyed; you can still pick them.
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
      {outsideWindows ? (
        <p className="hint">Clashes are shown only within the request's times.</p>
      ) : null}
      <fieldset className="dates" aria-describedby={errors.dates ? "dates-error" : undefined}>
        <legend>Dates</legend>
        {months.map((month) => (
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
                const isBusy = clashes(busy[date], against);
                return (
                  <label className={isBusy ? "day busy" : "day"} key={date}>
                    <input
                      type="checkbox"
                      name="date"
                      value={date}
                      defaultChecked={picked.has(date)}
                      aria-label={`${formatDate(date)}${isBusy ? ", busy in your Google Calendar" : ""}`}
                    />
                    <span className="day-number">{Number(date.slice(8))}</span>
                    {isBusy ? <span className="day-busy">busy</span> : null}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {errors.dates ? (
          <p className="field-error" id="dates-error" role="alert">
            {errors.dates}
          </p>
        ) : null}
      </fieldset>
      <TimeRange
        startName="startTime"
        endName="endTime"
        startValue={startValue}
        endValue={endValue}
        presets={fromRequest?.windows ?? []}
        startError={errors.startTime}
        endError={errors.endTime}
        required
        onChange={setChosen}
      />
      <SubmitButton feedbackKey="availability-add-dates">Add times</SubmitButton>
    </Form>
  );
}

/** Upcoming times by date, as month calendars. */
function TimesCalendar({
  months,
  slots,
  occurrences,
}: {
  months: CalendarMonth[];
  slots: Slot[];
  occurrences: LoaderData["occurrences"];
}) {
  if (occurrences.length === 0 && slots.length === 0) {
    return <p className="hint">Nothing yet. Add the times you can rehearse above.</p>;
  }
  const byDate = new Map<string, string[]>();
  for (const occurrence of occurrences) {
    const times = byDate.get(occurrence.date) ?? [];
    times.push(timeRange(occurrence.startMinute, occurrence.endMinute));
    byDate.set(occurrence.date, times);
  }
  const skipped = (date: string) =>
    slots.some((slot) => slot.skips.includes(date) && isOccurrence(slot, date));
  return (
    <div className="times-calendar">
      {months.map((month) => (
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
              const times = byDate.get(date) ?? [];
              return (
                <div
                  role="group"
                  className={times.length > 0 ? "day has-times" : "day"}
                  key={date}
                  aria-label={`${formatDate(date)}: ${times.length > 0 ? times.join(", ") : "no times"}`}
                >
                  <span className="day-number">{Number(date.slice(8))}</span>
                  {times.map((time) => (
                    <span className="day-time" key={time}>
                      {time}
                    </span>
                  ))}
                  {skipped(date) ? <span className="day-skipped">can't make it</span> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type ActionData = { errors: SlotErrors; values: SlotFormValues } | undefined;

function SlotForm({
  editing,
  fromRequest,
  presets,
  actionData,
  today,
}: {
  editing: Slot | null;
  fromRequest: { id: string; name: string; values: SlotFormValues } | null;
  presets: TimeWindow[];
  actionData: ActionData;
  today: string;
}) {
  // Rejected values win over the slot being edited, so a correction keeps
  // what the member typed.
  const values: SlotFormValues = actionData?.values ??
    fromRequest?.values ?? {
      kind: editing?.kind ?? "weekly",
      startDate: editing?.startDate ?? today,
      endDate: editing?.endDate ?? "",
      startTime: editing ? timeInputValue(editing.startMinute) : "",
      endTime: editing ? timeInputValue(editing.endMinute) : "",
    };
  return (
    <>
      {fromRequest ? (
        <p className="hint">
          For <strong>{fromRequest.name}</strong>: change the day, times or dates to suit you.
        </p>
      ) : null}
      <Form method="post" className="stack slot-form" replace>
        <input type="hidden" name="intent" value={editing ? "update" : "create"} />
        {fromRequest ? <input type="hidden" name="request" value={fromRequest.id} /> : null}
        {editing ? <input type="hidden" name="slotId" value={editing.id} /> : null}
        <SlotFields values={values} errors={actionData?.errors ?? {}} presets={presets} />
        <SubmitButton feedbackKey="availability-save">
          {editing ? "Save changes" : "Add time"}
        </SubmitButton>
        {editing ? (
          <Link to="." relative="path" className="cancel">
            Cancel
          </Link>
        ) : null}
      </Form>
    </>
  );
}

function SlotItem({ slot, today, until }: { slot: Slot; today: string; until: string }) {
  // Dates in the horizon this pattern meets, skipped or not, so each can be toggled.
  const weeks =
    slot.kind === "weekly"
      ? expandOccurrences([{ ...slot, skips: [] }], today, until).map((item) => item.date)
      : [];
  const skipped = new Set(slot.skips);
  return (
    <li className="slot">
      <p className="slot-summary">{describeSlot(slot)}</p>
      <div className="slot-actions">
        <Link to={`?edit=${slot.id}`} className="button-link secondary">
          Edit
        </Link>
        <ConfirmForm
          fields={{ intent: "delete", slotId: slot.id }}
          trigger="Delete"
          {...deleteTimePrompt(describeSlot(slot))}
          feedbackKey={`delete-${slot.id}`}
        />
      </div>
      {weeks.length > 0 ? (
        <details>
          <summary>Can't make a {weekdayName(slot.startDate)}?</summary>
          <ul className="weeks">
            {weeks.map((date) => (
              <li key={date}>
                <span className={skipped.has(date) ? "skipped" : undefined}>
                  {formatDate(date)}
                  {skipped.has(date) ? " — can't make it" : ""}
                </span>
                <Form method="post" replace>
                  <input
                    type="hidden"
                    name="intent"
                    value={skipped.has(date) ? "unskip" : "skip"}
                  />
                  <input type="hidden" name="slotId" value={slot.id} />
                  <input type="hidden" name="date" value={date} />
                  <SubmitButton feedbackKey={`skip-${slot.id}-${date}`} className="secondary small">
                    {skipped.has(date) ? "I can make it" : "Can't make it"}
                  </SubmitButton>
                </Form>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/** The "are you sure" text for deleting a time; the dialog and the confirm page share it. */
function deleteTimePrompt(slot: string) {
  return {
    title: "Delete this time?",
    body: `${slot} will no longer count as a time you can rehearse.`,
    label: "Delete time",
  };
}
