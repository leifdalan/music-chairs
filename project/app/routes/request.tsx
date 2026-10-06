import { useEffect, useRef, type ReactNode } from "react";
import { data, Form, Link, redirect, useFetcher, useLocation } from "react-router";

import { googleClashes } from "~/.server/clashes";
import { requestRehearsals } from "~/.server/upcoming";
import { groupFromAddress } from "~/.server/group-address";
import { confirmationNeeded } from "~/.server/confirm";
import { redirectWithToast } from "~/.server/flash";
import { findViewer } from "~/.server/membership";
import { getStore, type Group, type Member, type ScheduleRequest } from "~/.server/store";
import { ProposedList } from "~/components/proposed-list";
import { RequestDates, type DateErrors, type DateValues } from "~/components/request-dates";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { ProblemAlert } from "~/components/problem-alert";
import { FreeCalendar } from "~/components/free-calendar";
import { FreeStretch, ProposeTimes } from "~/components/propose-times";
import { SlotFields } from "~/components/slot-fields";
import { SubmitButton } from "~/components/submit-button";
import { TextField } from "~/components/text-field";
import { Switch, useSwitch } from "~/components/view-switch";
import {
  addDays,
  formatDate,
  formatMinutes,
  isDate,
  parseSlotInput,
  parseTime,
  timeInputValue,
  timeRange,
  todayInZone,
  validateLocation,
  type Slot,
  type SlotErrors,
  type SlotFormValues,
} from "~/lib/availability";
import { calendarNotice } from "~/lib/calendar-notices";
import { groupPath } from "~/lib/group-address";
import { dayHeat } from "~/lib/heat";
import { buildCells, freeStretches, type OverlapMember } from "~/lib/overlap";
import { parseProposedTimes } from "~/lib/propose";
import { answerable, clipToWindows, type TimeWindow } from "~/lib/requests";
import { pageMeta } from "~/lib/site";
import { useHydrated } from "~/lib/use-hydrated";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/request";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `${loaderData.name} · ${loaderData.groupName}` : "Not found");
}

/** The most rehearsals a member can name as their limit. */
const LIMIT_MAX = 99;

/** The group, the member viewing it and the request; visitors go back to the group page. */
async function load(
  request: Request,
  address: string,
  requestId: string,
): Promise<{ group: Group; viewer: Member; scheduleRequest: ScheduleRequest }> {
  const store = getStore();
  const group = groupFromAddress(request, address);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  const scheduleRequest = store.findRequest(group.id, requestId);
  if (!scheduleRequest) throw data(null, { status: 404 });
  return { group, viewer, scheduleRequest };
}

const DATE_GONE = "One of the dates isn't on offer any more. Reload the page and try again.";
const NOT_TAKING = "This availability request is no longer taking times.";

/** Whether a stretch overlaps one of the request's windows. */
function overlapsWindows(range: TimeWindow, windows: TimeWindow[]): boolean {
  return windows.some(
    (window) => window.startMinute < range.endMinute && window.endMinute > range.startMinute,
  );
}

/** A one-off time within the request's windows: one of the member's times for it. */
function inWindows(slot: Slot, windows: TimeWindow[]): boolean {
  return slot.kind === "once" && overlapsWindows(slot, windows);
}

/** The dates a member can still give times for: the rest of the request's span. */
function openSpan(scheduleRequest: ScheduleRequest, today: string) {
  return {
    from: scheduleRequest.startDate > today ? scheduleRequest.startDate : today,
    to: scheduleRequest.endDate,
  };
}

/** The member's times on `date` within the request's windows. */
function timesOnDate(memberId: string, date: string, windows: TimeWindow[]): Slot[] {
  return getStore()
    .listSlots(memberId)
    .filter((slot) => slot.startDate === date && inWindows(slot, windows));
}

/** Sets `date` to the stretch (replacing its times in the windows), or clears it with null. */
function setDateTimes(
  memberId: string,
  date: string,
  windows: TimeWindow[],
  stretch: TimeWindow | null,
) {
  const store = getStore();
  for (const slot of timesOnDate(memberId, date, windows)) store.deleteSlot(memberId, slot.id);
  if (stretch) {
    store.addSlot(memberId, {
      kind: "once",
      startDate: date,
      endDate: null,
      startMinute: stretch.startMinute,
      endMinute: stretch.endMinute,
    });
  }
}

/** The posted stretch, or the errors that refuse it. */
function readStretch(form: FormData): TimeWindow | DateErrors {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const start = parseTime(text("startTime"), "Start time", false);
  const end = parseTime(text("endTime"), "End time", true);
  const errors: DateErrors = {};
  if (typeof start === "string") errors.startTime = start;
  if (typeof end === "string") errors.endTime = end;
  if (typeof start === "number" && typeof end === "number" && end <= start) {
    errors.endTime = "End time must be after the start time.";
  }
  return typeof start === "number" && typeof end === "number" && Object.keys(errors).length === 0
    ? { startMinute: start, endMinute: end }
    : errors;
}

function isStretch(value: TimeWindow | DateErrors): value is TimeWindow {
  return "startMinute" in value;
}

const OUTSIDE_WINDOWS = "Pick a time within this availability request's times of day.";

/** The posted stretch if it falls within one of the request's windows, else why not. */
function readRequestStretch(form: FormData, windows: TimeWindow[]): TimeWindow | DateErrors {
  const read = readStretch(form);
  if (!isStretch(read)) return read;
  return overlapsWindows(read, windows) ? read : { startTime: OUTSIDE_WINDOWS };
}

/** "Sat 3 Oct, 2:05 PM" in the group's zone. */
function formatAnsweredAt(instant: string, zone: string): string {
  const at = new Date(instant);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return `${formatDate(todayInZone(zone, at))}, ${formatMinutes(part("hour") * 60 + part("minute"))}`;
}

// A member gets the request, their own times in its span and their own answer
// only; who else answered, their limits and the overlap are for organizers.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer, scheduleRequest } = await load(
    request,
    params.groupAddress,
    params.requestId,
  );
  const store = getStore();
  const isOrganizer = viewer.role === "organizer";
  const today = todayInZone(group.timeZone, new Date());
  const { from, to } = openSpan(scheduleRequest, today);
  const answering = answerable(scheduleRequest, today);
  // A request that stopped taking times shows the whole span read-only.
  const dates = answering ? { from, to } : { from: scheduleRequest.startDate, to };
  const search = new URL(request.url).searchParams;
  const answers = store.listAnswers(group.id, scheduleRequest.id);
  const own = answers.find((answer) => answer.memberId === viewer.id);
  const view = (answer: (typeof answers)[number]) => ({
    answeredAt: formatAnsweredAt(answer.answeredAt, group.timeZone),
    limit: answer.limit,
  });
  const members = isOrganizer ? store.listMembers(group.id) : [];

  let overlap = null;
  if (isOrganizer) {
    const slots = store.listGroupSlots(group.id);
    const overlapMembers: OverlapMember[] = members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      optional: member.optional,
      slots: slots.get(member.id) ?? [],
    }));
    const names = new Map(members.map((member) => [member.id, member.displayName]));
    const cells = from <= to ? buildCells(overlapMembers, from, to) : new Map();
    overlap = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
      const stretches = clipToWindows(freeStretches(cells, date), scheduleRequest.windows);
      if (stretches.length === 0) continue;
      overlap.push({
        date,
        // How the calendar shades the date (plan/phase-20.md).
        heat: dayHeat(cells, date, scheduleRequest.windows),
        stretches: stretches.map((stretch) => ({
          startMinute: stretch.startMinute,
          endMinute: stretch.endMinute,
          freeCount: stretch.free.length,
          freeNames: stretch.free.map((id) => names.get(id) ?? ""),
        })),
      });
    }
  }

  return {
    groupHref: groupPath(group),
    groupName: group.name,
    timeZone: group.timeZone,
    requestId: scheduleRequest.id,
    name: scheduleRequest.name,
    startDate: scheduleRequest.startDate,
    endDate: scheduleRequest.endDate,
    windows: scheduleRequest.windows,
    open: scheduleRequest.open,
    expired: scheduleRequest.endDate < today,
    canAnswer: answering,
    isOrganizer,
    dates,
    // The viewer's times on the request's dates and within its windows (plan/phase-23.md).
    oneOffs: store
      .listSlots(viewer.id)
      .filter(
        (slot) =>
          slot.startDate >= dates.from &&
          slot.startDate <= dates.to &&
          inWindows(slot, scheduleRequest.windows),
      )
      .map((slot) => ({
        date: slot.startDate,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
      })),
    timesView: search.get("times") === "list" ? ("list" as const) : ("calendar" as const),
    clashes: answering
      ? await googleClashes(request, group, { from, to }, scheduleRequest.windows)
      : ({ state: "none" } as const),
    notice: calendarNotice(request),
    mine: own ? view(own) : null,
    answers: isOrganizer
      ? members.map((member) => {
          const answer = answers.find((item) => item.memberId === member.id);
          return { name: member.displayName, answer: answer ? view(answer) : null };
        })
      : null,
    overlap,
    // The calendar of who is free covers the dates the free times do (plan/phase-20.md).
    freeRange: overlap ? { from, to } : null,
    freeView: search.get("free") === "list" ? "list" : "calendar",
    // Its proposed rehearsals and confirmed ones still to come (plan/phase-24.md).
    rehearsals: requestRehearsals(group, today).get(scheduleRequest.id) ?? [],
    // Changes when a rehearsal is proposed, so the picker starts afresh.
    rehearsalCount: isOrganizer ? store.listRehearsals(group.id).length : null,
  };
}

/** A refused button press, shown as a page-level alert. */
function problem(message: string) {
  return data({ problem: message }, { status: 400 });
}

export async function action({ request, params }: Route.ActionArgs) {
  const { group, viewer, scheduleRequest } = await load(
    request,
    params.groupAddress,
    params.requestId,
  );
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const here = `${groupPath(group)}/requests/${scheduleRequest.id}`;

  const today = todayInZone(group.timeZone, new Date());
  // A date ticked or unticked on the request's calendar, saved straight away
  // (plan/phase-23.md): ticking sets the date to the stretch, unticking clears
  // the member's times on it within the request's windows.
  if (intent === "set-date") {
    if (!answerable(scheduleRequest, today)) {
      return data({ dateProblem: NOT_TAKING }, { status: 400 });
    }
    const span = openSpan(scheduleRequest, today);
    const date = form.get("date");
    if (typeof date !== "string" || !isDate(date) || date < span.from || date > span.to) {
      return data({ dateProblem: DATE_GONE }, { status: 400 });
    }
    let stretch: TimeWindow | null = null;
    if (form.get("on") === "1") {
      const read = readRequestStretch(form, scheduleRequest.windows);
      if (!isStretch(read)) {
        return data({ dateProblem: read.startTime ?? read.endTime ?? DATE_GONE }, { status: 400 });
      }
      stretch = read;
    }
    setDateTimes(viewer.id, date, scheduleRequest.windows, stretch);
    store.touchResponse(group.id, scheduleRequest.id, viewer.id);
    return { dateSaved: true };
  }
  // The calendar's Save without JavaScript: newly ticked dates get the stretch,
  // saved dates left unticked are cleared, saved dates still ticked keep their times.
  if (intent === "save-dates") {
    if (!answerable(scheduleRequest, today)) return problem(NOT_TAKING);
    const span = openSpan(scheduleRequest, today);
    const ticked = [
      ...new Set(form.getAll("date").filter((value): value is string => typeof value === "string")),
    ];
    const values: DateValues = {
      dates: ticked,
      startTime: String(form.get("startTime") ?? ""),
      endTime: String(form.get("endTime") ?? ""),
    };
    if (ticked.some((date) => !isDate(date) || date < span.from || date > span.to)) {
      return data({ dateErrors: { dates: DATE_GONE }, dateValues: values }, { status: 400 });
    }
    const saved = new Set(
      store
        .listSlots(viewer.id)
        .filter(
          (slot) =>
            slot.startDate >= span.from &&
            slot.startDate <= span.to &&
            inWindows(slot, scheduleRequest.windows),
        )
        .map((slot) => slot.startDate),
    );
    const added = ticked.filter((date) => !saved.has(date));
    let stretch: TimeWindow | null = null;
    if (added.length > 0) {
      const read = readRequestStretch(form, scheduleRequest.windows);
      if (!isStretch(read)) {
        return data({ dateErrors: read, dateValues: values }, { status: 400 });
      }
      stretch = read;
    }
    for (const date of saved) {
      if (!ticked.includes(date)) setDateTimes(viewer.id, date, scheduleRequest.windows, null);
    }
    for (const date of added) setDateTimes(viewer.id, date, scheduleRequest.windows, stretch);
    store.touchResponse(group.id, scheduleRequest.id, viewer.id);
    return redirectWithToast(here, "Times saved");
  }
  // The rehearsal cap: saved through a fetcher as it changes, or by the Save
  // button without JavaScript.
  if (intent === "answer") {
    const viaFetcher = form.get("via") === "fetcher";
    // Shown beside the cap, whether it came through a fetcher or the Save button.
    const refuse = (message: string) => data({ capProblem: message }, { status: 400 });
    if (!answerable(scheduleRequest, today)) return refuse(NOT_TAKING);
    let limit: number | null = null;
    if (form.get("limit") === "most") {
      // An empty field reads as 0, which is refused like any other out-of-range count.
      const count = Number(form.get("limitCount"));
      if (!Number.isInteger(count) || count < 1 || count > LIMIT_MAX) {
        return refuse(`Choose a number of rehearsals from 1 to ${LIMIT_MAX}.`);
      }
      limit = count;
    }
    if (!store.answerRequest(group.id, scheduleRequest.id, viewer.id, limit)) {
      return refuse(NOT_TAKING);
    }
    return viaFetcher ? { capSaved: true } : redirectWithToast(here, "Saved");
  }
  // Proposing from the request's free times, whether it is open, closed or over.
  // Back to the List view when the proposal came from it (plan/phase-20.md).
  const proposedFrom = form.get("free") === "list" ? `${here}?free=list` : here;
  if (intent === "propose-times") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
    const location = validateLocation(form.get("location"));
    if (!location.ok) return data({ proposeProblem: location.error }, { status: 400 });
    const times = parseProposedTimes(form, todayInZone(group.timeZone, new Date()));
    if (!times.ok) return data({ proposeProblem: times.error }, { status: 400 });
    store.addRehearsals(group.id, scheduleRequest.id, times.inputs, location.value);
    const count = times.inputs.length;
    return redirectWithToast(
      proposedFrom,
      count === 1 ? "Rehearsal proposed" : `${count} rehearsals proposed`,
    );
  }
  // A time the free times don't show, or a weekly rehearsal, still from this request.
  if (intent === "propose") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
    const parsed = parseSlotInput(form);
    const location = validateLocation(form.get("location"));
    const errors: ProposeErrors = parsed.ok ? {} : { ...parsed.errors };
    if (parsed.ok && parsed.value.startDate < todayInZone(group.timeZone, new Date())) {
      errors.startDate = "Pick today or a later date.";
    }
    if (!location.ok) errors.location = location.error;
    if (!parsed.ok || !location.ok || Object.keys(errors).length > 0) {
      const values = parsed.ok
        ? {
            kind: parsed.value.kind,
            startDate: parsed.value.startDate,
            endDate: parsed.value.endDate ?? "",
            startTime: timeInputValue(parsed.value.startMinute),
            endTime: timeInputValue(parsed.value.endMinute),
          }
        : parsed.values;
      return data(
        { errors, values: { ...values, location: String(form.get("location") ?? "") } },
        { status: 400 },
      );
    }
    store.addRehearsal(group.id, scheduleRequest.id, parsed.value, location.value);
    return redirectWithToast(proposedFrom, "Rehearsal proposed");
  }
  if (intent === "close" || intent === "reopen") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
    if (intent === "close") {
      const prompt = confirmationNeeded(form, closePrompt(scheduleRequest.name));
      if (prompt) return prompt;
    }
    if (!store.setRequestOpen(group.id, scheduleRequest.id, intent === "reopen")) {
      throw data(null, { status: 404 });
    }
    return redirectWithToast(
      here,
      intent === "reopen" ? "Availability request reopened" : "Availability request closed",
    );
  }
  return problem("Something went wrong. Please try again.");
}

export default function RequestPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    groupHref,
    groupName,
    timeZone,
    requestId,
    name,
    startDate,
    endDate,
    windows,
    open,
    expired,
    canAnswer,
    isOrganizer,
    dates,
    oneOffs,
    timesView,
    clashes,
    notice,
    mine,
    answers,
    overlap,
    freeRange,
    freeView,
    rehearsalCount,
    rehearsals,
  } = loaderData;
  const status = !open ? "Closed" : expired ? "Ended" : null;
  const pickProblem =
    actionData && "proposeProblem" in actionData ? actionData.proposeProblem : null;
  const formResult = actionData && "errors" in actionData ? actionData : undefined;
  const datesResult = actionData && "dateErrors" in actionData ? actionData : undefined;
  const capProblem = actionData && "capProblem" in actionData ? actionData.capProblem : null;
  const link = useSwitch(["notice"]);
  const datesCount = new Set(oneOffs.map((slot) => slot.date)).size;
  const yourTimes = (
    <RequestDates
      from={dates.from}
      to={dates.to}
      windows={windows}
      oneOffs={oneOffs}
      view={timesView}
      editable={canAnswer}
      clashes={clashes}
      notice={notice}
      result={datesResult}
    />
  );
  const proposedSection = (
    <section aria-labelledby="proposed-heading">
      <h2 id="proposed-heading">Proposed rehearsals</h2>
      <ProposedList
        items={rehearsals}
        scheduleHref={`${groupHref}/schedule`}
        empty="No proposed rehearsals yet."
      />
    </section>
  );
  const capSection = (
    <section aria-labelledby="cap-heading">
      <h2 id="cap-heading">Rehearsals you can make</h2>
      {mine ? (
        <p className="hint">
          Saved {mine.answeredAt}:{" "}
          {mine.limit === null ? "any and all rehearsals" : `no more than ${mine.limit}`}.
        </p>
      ) : null}
      {canAnswer ? <CapForm limit={mine ? mine.limit : null} refused={capProblem} /> : null}
    </section>
  );
  return (
    <main>
      <p className="eyebrow">
        <Link to={groupHref}>{groupName}</Link>
      </p>
      <h1>{name}</h1>
      <div className="request-span">
        <span>
          {formatDate(startDate)} to {formatDate(endDate)}
          {status ? <span className="request-status"> · {status}</span> : null}
        </span>
        {isOrganizer ? (
          <RequestMenu>
            {open ? (
              <Link
                to={`${groupHref}/requests/new?edit=${requestId}`}
                className={buttonVariants({ variant: "outline" })}
                aria-label={`Edit availability request: ${name}`}
              >
                Edit
              </Link>
            ) : null}
            {open ? (
              <ConfirmForm
                fields={{ intent: "close" }}
                trigger="Close"
                triggerLabel={`Close availability request: ${name}`}
                {...closePrompt(name)}
                feedbackKey={`request-open-${requestId}`}
              />
            ) : (
              <Form method="post" replace>
                <input type="hidden" name="intent" value="reopen" />
                <SubmitButton
                  feedbackKey={`request-open-${requestId}`}
                  variant="outline"
                  label={`Reopen availability request: ${name}`}
                >
                  Reopen
                </SubmitButton>
              </Form>
            )}
            <Link
              to={`${groupHref}/requests/new?repeat=${requestId}`}
              className={buttonVariants({ variant: "outline" })}
              aria-label={`Repeat availability request: ${name}`}
            >
              Repeat
            </Link>
          </RequestMenu>
        ) : null}
      </div>
      <p className="hint">
        Times of day:{" "}
        {windows.map((window) => timeRange(window.startMinute, window.endMinute)).join(", ")} (
        {timeZone})
      </p>
      {actionData && "problem" in actionData ? (
        <ProblemAlert message={actionData.problem} response={actionData} />
      ) : null}
      {actionData && "confirm" in actionData ? <ConfirmPanel prompt={actionData.confirm} /> : null}

      {!canAnswer ? <p className="hint">{NOT_TAKING}</p> : null}

      {/* Organizers come here to choose times: the calendar of who is free leads,
          their own times fold below it; members come to give their times
          (plan/phase-21.md, plan/phase-23.md). */}
      {isOrganizer ? (
        <>
          {overlap ? (
            <section aria-labelledby="overlap-heading">
              <h2 id="overlap-heading">When people are free</h2>
              <p className="hint">Within this availability request's dates and times of day.</p>
              <Switch
                label="How to show when people are free"
                options={[
                  { text: "Calendar", to: link("free", null), current: freeView === "calendar" },
                  { text: "List", to: link("free", "list"), current: freeView === "list" },
                ]}
              />
              <p className="hint">Switching views clears ticks you haven't proposed.</p>
              <ProposeTimes
                hasTimes={overlap.length > 0}
                problem={pickProblem}
                resetKey={rehearsalCount ?? 0}
              >
                {freeView === "list" ? <input type="hidden" name="free" value="list" /> : null}
                {overlap.length === 0 ? (
                  <p className="hint">Nobody is free at these times yet.</p>
                ) : freeView === "calendar" && freeRange ? (
                  <FreeCalendar
                    from={freeRange.from}
                    to={freeRange.to}
                    days={overlap}
                    total={answers?.length ?? 0}
                    legend="Tap a date to see who is free and tick times to propose."
                    renderStretch={(date, stretch) => (
                      <li key={stretch.startMinute} className="stretch">
                        <FreeStretch date={date} stretch={stretch} total={answers?.length ?? 0} />
                      </li>
                    )}
                  />
                ) : (
                  <ul className="days">
                    {overlap.map((day) => (
                      <li key={day.date}>
                        <h3>{formatDate(day.date)}</h3>
                        <ul className="stretches">
                          {day.stretches.map((stretch) => (
                            <li key={stretch.startMinute} className="stretch">
                              <FreeStretch
                                date={day.date}
                                stretch={stretch}
                                total={answers?.length ?? 0}
                              />
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </ProposeTimes>
              <details className="custom-proposal" open={formResult !== undefined}>
                <summary>Propose a different time</summary>
                <ProposeForm
                  key={rehearsalCount ?? 0}
                  result={formResult}
                  fromList={freeView === "list"}
                />
              </details>
            </section>
          ) : null}
          {proposedSection}
          <section aria-labelledby="your-times-heading">
            <h2 id="your-times-heading">Your times</h2>
            <details
              className="your-times"
              open={
                timesView === "list" ||
                notice !== null ||
                datesResult !== undefined ||
                capProblem !== null
              }
            >
              <summary>
                {datesCount === 0
                  ? "None yet"
                  : `${datesCount} ${datesCount === 1 ? "date" : "dates"} in this span`}
              </summary>
              {yourTimes}
              {capSection}
            </details>
          </section>
          {answers ? (
            <section aria-labelledby="answers-heading">
              <h2 id="answers-heading">
                Responses ({answers.filter((item) => item.answer).length} of {answers.length})
              </h2>
              <details>
                <summary>Show who has responded</summary>
                <ul className="request-answers">
                  {answers.map((item, index) => (
                    <li key={index}>
                      <span className="member-name">{item.name}</span>
                      {item.answer ? (
                        <span>
                          {item.answer.limit === null
                            ? "Any and all"
                            : `No more than ${item.answer.limit}`}
                          <span className="hint"> · responded {item.answer.answeredAt}</span>
                        </span>
                      ) : (
                        <span className="hint">Not yet</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section aria-labelledby="your-times-heading">
            <h2 id="your-times-heading">Your times</h2>
            {yourTimes}
          </section>
          {capSection}
          {proposedSection}
        </>
      )}
    </main>
  );
}

type ProposeValues = SlotFormValues & { location: string };
type ProposeErrors = SlotErrors & { location?: string };

function ProposeForm({
  result,
  fromList,
}: {
  result: { errors: ProposeErrors; values: ProposeValues } | undefined;
  /** Shown in the List view, so the proposal returns there. */
  fromList: boolean;
}) {
  const values: ProposeValues = result?.values ?? {
    kind: "once",
    startDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    location: "",
  };
  const errors = result?.errors ?? {};
  // Named by the disclosure's summary, "Propose a different time".
  return (
    <Form method="post" className="stack slot-form" replace>
      <input type="hidden" name="intent" value="propose" />
      {fromList ? <input type="hidden" name="free" value="list" /> : null}
      <SlotFields values={values} errors={errors} />
      <TextField
        name="location"
        label="Location (optional)"
        defaultValue={values.location}
        error={errors.location}
        optional
      />
      <SubmitButton feedbackKey="propose">Propose</SubmitButton>
    </Form>
  );
}

/**
 * The rehearsal cap (plan/phase-23.md): saved through a fetcher when a choice
 * changes or the number is committed (on leaving the field or Enter, not on
 * every keystroke); typing a number chooses "No more than". Without
 * JavaScript, a Save button posts it.
 */
function CapForm({
  limit,
  refused,
}: {
  limit: number | null;
  /** A value the Save button sent without JavaScript and the server refused. */
  refused: string | null;
}) {
  const hydrated = useHydrated();
  const fetcher = useFetcher<{ capSaved?: boolean; capProblem?: string }>({
    key: "request-cap",
  });
  const problem = fetcher.data?.capProblem ?? refused;
  const form = useRef<HTMLFormElement>(null);
  const most = useRef<HTMLInputElement>(null);
  const count = useRef<HTMLInputElement>(null);
  const save = useRef<() => void>(() => {});
  useEffect(() => {
    save.current = () => {
      if (!form.current) return;
      const values = new FormData(form.current);
      values.set("via", "fetcher");
      void fetcher.submit(values, { method: "post" });
    };
  });
  // The number's native change event fires when it is committed; React's
  // onChange would fire on every keystroke.
  useEffect(() => {
    const input = count.current;
    if (!input) return;
    const committed = () => save.current();
    input.addEventListener("change", committed);
    return () => input.removeEventListener("change", committed);
  }, []);
  const status =
    fetcher.state !== "idle"
      ? "Saving…"
      : fetcher.data?.capSaved
        ? "Saved"
        : fetcher.data?.capProblem
          ? "Not saved"
          : "";
  return (
    <Form
      method="post"
      className="stack"
      replace
      ref={form}
      // Once interactive, every change saves itself; Enter commits the number.
      onSubmit={hydrated ? (event) => event.preventDefault() : undefined}
    >
      <input type="hidden" name="intent" value="answer" />
      <fieldset className="limit" aria-describedby={problem ? "cap-error" : undefined}>
        <legend>How many rehearsals can you make in this span?</legend>
        <label>
          <input
            type="radio"
            name="limit"
            value="any"
            defaultChecked={limit === null}
            onChange={() => save.current()}
          />
          Any and all
        </label>
        <label className="limit-most">
          <input
            type="radio"
            name="limit"
            value="most"
            ref={most}
            defaultChecked={limit !== null}
            onChange={() => save.current()}
          />
          No more than{" "}
          <input
            type="number"
            name="limitCount"
            ref={count}
            min={1}
            max={LIMIT_MAX}
            defaultValue={limit ?? 2}
            aria-label="Most rehearsals"
            inputMode="numeric"
            onInput={() => {
              if (most.current) most.current.checked = true;
            }}
          />{" "}
          rehearsals
        </label>
        {problem ? (
          <p className="field-error" id="cap-error" role="alert">
            {problem}
          </p>
        ) : null}
      </fieldset>
      {hydrated ? (
        <p className="hint save-status" aria-live="polite">
          {status}
        </p>
      ) : (
        <SubmitButton feedbackKey="request-answer">Save</SubmitButton>
      )}
    </Form>
  );
}

/** The "are you sure" text for closing a request; the dialog and the confirm page share it. */
function closePrompt(name: string) {
  return {
    title: `Close ${name}?`,
    body: "Members can no longer add times to it. You can reopen it later.",
    label: "Close availability request",
  };
}

/**
 * The organizer's request options (plan/phase-21.md): a disclosure that works
 * without JavaScript, like the profile menu. It closes after navigating and
 * gives focus back to its summary if focus was inside it.
 */
function RequestMenu({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  // Whether focus was inside the menu when the page changed: a Close or Reopen
  // replaces the focused button, so it can't be read afterwards.
  const focusInside = useRef(false);
  const location = useLocation();
  useEffect(() => {
    const details = menu.current;
    if (!details?.open) return;
    details.open = false;
    if (focusInside.current) details.querySelector("summary")?.focus();
  }, [location.key]);
  return (
    <details
      className="request-menu"
      ref={menu}
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focusInside.current = false;
      }}
    >
      <summary>Options</summary>
      <div className="request-menu-panel">{children}</div>
    </details>
  );
}
