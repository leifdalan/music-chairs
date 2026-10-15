import { useEffect, useRef, useState, type ReactNode } from "react";
import { data, Form, Link, redirect, useFetcher, useLocation } from "react-router";

import { googleClashes } from "~/.server/clashes";
import { requestRehearsals } from "~/.server/upcoming";
import { groupFromAddress } from "~/.server/group-address";
import { confirmationNeeded } from "~/.server/confirm";
import { redirectWithToast } from "~/.server/flash";
import { findViewer, keptView, publicOrigin } from "~/.server/membership";
import { landOrJoin, requestFromSlug } from "~/.server/request-address";
import { getStore, type Group, type Member, type ScheduleRequest } from "~/.server/store";
import { ProposedList } from "~/components/proposed-list";
import {
  RequestDates,
  type DateErrors,
  type DateValues,
  type LimitValues,
  CLEAR_DATES_PROMPT,
} from "~/components/request-dates";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { CopyLink } from "~/components/copy-link";
import { FailureAlert, PageFailure } from "~/components/failure-alert";
import { ProblemAlert } from "~/components/problem-alert";
import { FreeCalendar } from "~/components/free-calendar";
import { FreeStretch, NotesField, OneTapTime, ProposeTimes } from "~/components/propose-times";
import { RehearsalFields } from "~/components/rehearsal-fields";
import { SubmitButton } from "~/components/submit-button";
import { TextField } from "~/components/text-field";
import { Switch, useSwitch } from "~/components/view-switch";
import {
  addDays,
  formatDate,
  formatInstant,
  isDate,
  parseTime,
  timeInputValue,
  timeRange,
  todayInZone,
  validateLocation,
  type Slot,
} from "~/lib/availability";
import { CALENDAR_NOTICE_KEYS, noticeText, type NoticeHandle } from "~/lib/notices";
import { isFailure, useActionResult, withFailures, type Failure } from "~/lib/client-failure";
import { groupPath } from "~/lib/group-address";
import { requestPath, withJoin } from "~/lib/request-address";
import { dayHeat } from "~/lib/heat";
import { buildCells, freeStretches, type OverlapMember } from "~/lib/overlap";
import { parseProposedTimes } from "~/lib/propose";
import {
  parseRehearsalInput,
  validateNotes,
  type RehearsalErrors,
  type RehearsalFormValues,
} from "~/lib/rehearsal";
import { answerable, clipToWindows, type TimeWindow } from "~/lib/requests";
import { pageMeta } from "~/lib/site";
import { useHydrated } from "~/lib/use-hydrated";
import { preferenceSummary, preferenceText } from "~/lib/preference";
import { zoneLabel } from "~/lib/time-zones";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/request";
import { Notice } from "~/components/notice";
import { useDismissOutside } from "~/lib/dismiss";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `${loaderData.name} · ${loaderData.groupName}` : "Not found");
}

/** The largest preferred number of rehearsals a member can give. */
const LIMIT_MAX = 99;

/** The preferred number of rehearsals a form sends: null for "as many as possible". */
function readLimit(
  form: FormData,
): { ok: true; limit: number | null } | { ok: false; error: string } {
  if (form.get("limit") !== "most") return { ok: true, limit: null };
  // An empty field reads as 0, which is refused like any other out-of-range count.
  const count = Number(form.get("limitCount"));
  if (!Number.isInteger(count) || count < 1 || count > LIMIT_MAX) {
    return { ok: false, error: `Choose a number of rehearsals from 1 to ${LIMIT_MAX}.` };
  }
  return { ok: true, limit: count };
}

/** The preferred number exactly as sent, to show again when a Send is refused. */
function postedLimit(form: FormData): LimitValues {
  return {
    most: form.get("limit") === "most",
    count: String(form.get("limitCount") ?? ""),
  };
}

/**
 * The group, the member viewing it and the request its address names
 * (plan/phase-30.md). A visitor goes back to the group page, or joins first
 * when the link carries the group's invite code; a member's `?join` is dropped.
 */
async function load(
  request: Request,
  address: string,
  slug: string,
): Promise<{ group: Group; viewer: Member; scheduleRequest: ScheduleRequest }> {
  const group = groupFromAddress(request, address);
  const viewer = await findViewer(request, group);
  // Visitors are sent on before the address is looked up, so it reveals nothing.
  if (request.method === "GET" || request.method === "HEAD") landOrJoin(request, group, !!viewer);
  if (!viewer) throw redirect(groupPath(group));
  return { group, viewer, scheduleRequest: requestFromSlug(group, slug) };
}

const DATE_GONE = "One of the dates isn't on offer any more. Reload the page and try again.";
const NOT_TAKING = "This availability request is no longer taking times.";

/** Whether a stretch overlaps one of the request's windows. */
function overlapsWindows(range: TimeWindow, windows: TimeWindow[]): boolean {
  return windows.some(
    (window) => window.startMinute < range.endMinute && window.endMinute > range.startMinute,
  );
}

/** A time within the request's windows: one of the member's times for it. */
function inWindows(slot: Slot, windows: TimeWindow[]): boolean {
  return overlapsWindows(slot, windows);
}

/** The dates in `span` on which the member has times within the request's windows. */
function savedDates(
  memberId: string,
  span: { from: string; to: string },
  windows: TimeWindow[],
): Set<string> {
  return new Set(
    getStore()
      .listSlots(memberId)
      .filter(
        (slot) =>
          slot.startDate >= span.from && slot.startDate <= span.to && inWindows(slot, windows),
      )
      .map((slot) => slot.startDate),
  );
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

// A member gets the request, their own times in its span and their own answer
// only; who else responded, their preferred numbers and the overlap are for organizers.

/** Google Calendar notices show with "Your times", where clashes are. */
export const handle: NoticeHandle = { notices: CALENDAR_NOTICE_KEYS };

export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer, scheduleRequest } = await load(
    request,
    params.groupAddress,
    params.requestSlug,
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
    answeredAt: formatInstant(answer.answeredAt, group.timeZone),
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
    // Organizers share a request still taking times (plan/phase-30.md).
    shareUrl:
      isOrganizer && answering
        ? new URL(
            withJoin(requestPath(groupPath(group), scheduleRequest.slug), group.inviteCode),
            publicOrigin() ?? request.url,
          ).href
        : null,
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
    notice: noticeText(request, CALENDAR_NOTICE_KEYS),
    mine: own ? view(own) : null,
    // A first answer is a draft (plan/phase-31.md): nothing is saved until Send.
    draft: answering && own === undefined,
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
    params.requestSlug,
  );
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const here = `${requestPath(groupPath(group), scheduleRequest.slug)}${keptView(request)}`;

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
    // A first answer's Send (plan/phase-31.md) carries the preferred number too;
    // once the member has answered, it is an ordinary save and the number is left alone.
    const firstAnswer =
      form.get("draft") === "1" &&
      !store.listAnswers(group.id, scheduleRequest.id).some((item) => item.memberId === viewer.id);
    const span = openSpan(scheduleRequest, today);
    const ticked = [
      ...new Set(form.getAll("date").filter((value): value is string => typeof value === "string")),
    ];
    const values: DateValues = {
      dates: ticked,
      startTime: String(form.get("startTime") ?? ""),
      endTime: String(form.get("endTime") ?? ""),
    };
    // A refused Send keeps everything the member sent, the number included.
    const limitValues = firstAnswer ? postedLimit(form) : undefined;
    if (ticked.some((date) => !isDate(date) || date < span.from || date > span.to)) {
      return data(
        { dateErrors: { dates: DATE_GONE }, dateValues: values, limitValues },
        { status: 400 },
      );
    }
    const saved = savedDates(viewer.id, span, scheduleRequest.windows);
    const added = ticked.filter((date) => !saved.has(date));
    let stretch: TimeWindow | null = null;
    if (added.length > 0) {
      const read = readRequestStretch(form, scheduleRequest.windows);
      if (!isStretch(read)) {
        return data({ dateErrors: read, dateValues: values, limitValues }, { status: 400 });
      }
      stretch = read;
    }
    // Everything is checked before anything is written.
    const limit = firstAnswer ? readLimit(form) : null;
    if (limit && !limit.ok) {
      return data(
        { dateErrors: {}, dateValues: values, limitValues, capProblem: limit.error },
        { status: 400 },
      );
    }
    for (const date of saved) {
      if (!ticked.includes(date)) setDateTimes(viewer.id, date, scheduleRequest.windows, null);
    }
    for (const date of added) setDateTimes(viewer.id, date, scheduleRequest.windows, stretch);
    if (limit?.ok) {
      store.answerRequest(group.id, scheduleRequest.id, viewer.id, limit.limit);
      return redirectWithToast(here, "Dates sent");
    }
    store.touchResponse(group.id, scheduleRequest.id, viewer.id);
    return redirectWithToast(here, "Times saved");
  }
  // Select all once answered (plan/phase-31.md): every date still on offer
  // with no times yet gets the chosen stretch; dates with times keep them.
  if (intent === "fill-dates") {
    if (!answerable(scheduleRequest, today)) {
      return data({ dateProblem: NOT_TAKING }, { status: 400 });
    }
    const read = readRequestStretch(form, scheduleRequest.windows);
    if (!isStretch(read)) {
      return data({ dateProblem: read.startTime ?? read.endTime ?? DATE_GONE }, { status: 400 });
    }
    const span = openSpan(scheduleRequest, today);
    const saved = savedDates(viewer.id, span, scheduleRequest.windows);
    for (let date = span.from; date <= span.to; date = addDays(date, 1)) {
      if (!saved.has(date)) setDateTimes(viewer.id, date, scheduleRequest.windows, read);
    }
    store.touchResponse(group.id, scheduleRequest.id, viewer.id);
    return { dateSaved: true };
  }
  // Clear all once answered, after "are you sure": the member's times on every
  // date still on offer, within the request's times of day.
  if (intent === "clear-dates") {
    if (!answerable(scheduleRequest, today)) return problem(NOT_TAKING);
    const confirm = confirmationNeeded(form, CLEAR_DATES_PROMPT);
    if (confirm) return data(confirm);
    const span = openSpan(scheduleRequest, today);
    for (const date of savedDates(viewer.id, span, scheduleRequest.windows)) {
      setDateTimes(viewer.id, date, scheduleRequest.windows, null);
    }
    store.touchResponse(group.id, scheduleRequest.id, viewer.id);
    return redirectWithToast(here, "Dates cleared");
  }
  // The preferred number of rehearsals: saved through a fetcher as it changes,
  // or by the Save button without JavaScript.
  if (intent === "answer") {
    const viaFetcher = form.get("via") === "fetcher";
    // Shown beside the choice, whether it came through a fetcher or the Save button.
    const refuse = (message: string) => data({ capProblem: message }, { status: 400 });
    if (!answerable(scheduleRequest, today)) return refuse(NOT_TAKING);
    const read = readLimit(form);
    if (!read.ok) return refuse(read.error);
    if (!store.answerRequest(group.id, scheduleRequest.id, viewer.id, read.limit)) {
      return refuse(NOT_TAKING);
    }
    return viaFetcher ? { capSaved: true } : redirectWithToast(here, "Saved");
  }
  // Proposing from the request's free times, whether it is open, closed or over.
  // Back to the view it came from (plan/phase-20.md), as every action here does.
  if (intent === "propose-times") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
    const location = validateLocation(form.get("location"));
    if (!location.ok) return data({ proposeProblem: location.error }, { status: 400 });
    const notes = validateNotes(form.get("notes"));
    if (!notes.ok) return data({ proposeProblem: notes.error }, { status: 400 });
    const times = parseProposedTimes(form, todayInZone(group.timeZone, new Date()));
    if (!times.ok) return data({ proposeProblem: times.error }, { status: 400 });
    store.addRehearsals(group.id, scheduleRequest.id, times.inputs, location.value, notes.value);
    const count = times.inputs.length;
    return redirectWithToast(
      here,
      count === 1 ? "Rehearsal proposed" : `${count} rehearsals proposed`,
    );
  }
  // A time the free times don't show, still from this request.
  if (intent === "propose") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
    const parsed = parseRehearsalInput(form);
    const location = validateLocation(form.get("location"));
    const notes = validateNotes(form.get("notes"));
    const errors: ProposeErrors = parsed.ok ? {} : { ...parsed.errors };
    if (parsed.ok && parsed.value.date < todayInZone(group.timeZone, new Date())) {
      errors.date = "Pick today or a later date.";
    }
    if (!location.ok) errors.location = location.error;
    if (!notes.ok) errors.notes = notes.error;
    if (!parsed.ok || !location.ok || !notes.ok || Object.keys(errors).length > 0) {
      const values = parsed.ok
        ? {
            date: parsed.value.date,
            startTime: timeInputValue(parsed.value.startMinute),
            endTime: timeInputValue(parsed.value.endMinute),
          }
        : parsed.values;
      return data(
        {
          errors,
          values: {
            ...values,
            location: String(form.get("location") ?? ""),
            notes: String(form.get("notes") ?? ""),
          },
        },
        { status: 400 },
      );
    }
    store.addRehearsal(group.id, scheduleRequest.id, parsed.value, location.value, notes.value);
    return redirectWithToast(here, "Rehearsal proposed");
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

// In the browser a failed save stays on the page with Retry (plan/phase-34.md);
// sending these again could make something twice, so they offer Reload instead.
export async function clientAction(args: Route.ClientActionArgs) {
  return withFailures(args, { creates: ["propose", "propose-times"] });
}

export default function RequestPage({ loaderData, actionData }: Route.ComponentProps) {
  // A failed save keeps the last result's errors, values and open sections (plan/phase-34.md).
  const { result, failure } = useActionResult(actionData);
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
    shareUrl,
    dates,
    oneOffs,
    timesView,
    clashes,
    notice,
    mine,
    draft,
    answers,
    overlap,
    freeRange,
    freeView,
    rehearsalCount,
    rehearsals,
  } = loaderData;
  const status = !open ? "Closed" : expired ? "Ended" : null;
  const pickProblem = result && "proposeProblem" in result ? result.proposeProblem : null;
  const formResult = result && "errors" in result ? result : undefined;
  const datesResult = result && "dateErrors" in result ? result : undefined;
  const capProblem = result && "capProblem" in result ? result.capProblem : null;
  const link = useSwitch(["notice"]);
  const hydrated = useHydrated();
  // Open while the organizer's own times aren't given, and still open once they
  // send them, rather than closing under them (plan/phase-37.md).
  const [openWhileDraft] = useState(draft);
  const datesCount = new Set(oneOffs.map((slot) => slot.date)).size;
  const preferred = answers ? preferenceSummary(answers) : null;
  const yourTimes = (
    <RequestDates
      requestId={requestId}
      from={dates.from}
      to={dates.to}
      windows={windows}
      oneOffs={oneOffs}
      view={timesView}
      editable={canAnswer}
      clashes={clashes}
      notice={notice}
      result={datesResult}
      draft={draft}
      capFields={
        draft ? (
          <CapFields
            most={datesResult?.limitValues?.most ?? false}
            count={datesResult?.limitValues?.count ?? 2}
            problem={capProblem}
          />
        ) : null
      }
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
      <h2 id="cap-heading">Preferred number of rehearsals in date span</h2>
      {mine ? (
        <p className="hint">
          Saved {mine.answeredAt}: {preferenceText(mine.limit)}.
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
              <Form method="post" replace preventScrollReset>
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
        {zoneLabel(timeZone)})
      </p>
      {shareUrl ? (
        // A link that lands on this page, joining first if need be (plan/phase-30.md).
        <details className="notes-edit">
          <summary>Share this availability request</summary>
          <div className="share-link">
            <p className="hint">
              It opens this page, where people give their times. Anyone not yet in the group joins
              first.
            </p>
            <CopyLink url={shareUrl} label="Link to this availability request" variant="outline" />
          </div>
        </details>
      ) : null}
      {result && "problem" in result ? (
        <ProblemAlert message={result.problem} response={result} />
      ) : null}
      {result && "confirm" in result ? <ConfirmPanel prompt={result.confirm} /> : null}
      <PageFailure failure={failure} />

      {!canAnswer ? <p className="hint">{NOT_TAKING}</p> : null}

      {/* Organizers come here to choose times: the calendar of who is free leads,
          their own times fold below it; members come to give their times
          (plan/phase-21.md, plan/phase-23.md). */}
      {isOrganizer ? (
        <>
          {/* The organizer's own times count in who is free (plan/phase-37.md). */}
          {draft ? (
            <Notice tone="info" className="your-times-flag">
              Your times: not given. <a href="#your-times-heading">Add your times</a>
            </Notice>
          ) : null}
          {overlap ? (
            <section aria-labelledby="overlap-heading">
              <h2 id="overlap-heading">When people are free</h2>
              <p className="hint">Within this availability request's dates and times of day.</p>
              {preferred ? (
                <div className="preferred">
                  <p className="hint">Preferred number of rehearsals: {preferred}.</p>
                </div>
              ) : null}
              <Switch
                label="How to show when people are free"
                options={[
                  { text: "Calendar", to: link("free", null), current: freeView === "calendar" },
                  { text: "List", to: link("free", "list"), current: freeView === "list" },
                ]}
              />
              {/* Once interactive, the ticks survive the switch (plan/phase-37.md). */}
              {hydrated ? null : (
                <p className="hint">Switching views clears ticks you haven't proposed.</p>
              )}
              <ProposeTimes
                hasTimes={overlap.length > 0}
                problem={pickProblem}
                resetKey={rehearsalCount ?? 0}
              >
                {overlap.length === 0 ? (
                  <p className="hint">Nobody is free at these times yet.</p>
                ) : freeView === "calendar" && freeRange ? (
                  <FreeCalendar
                    from={freeRange.from}
                    to={freeRange.to}
                    days={overlap}
                    total={answers?.length ?? 0}
                    legend="Tap a date to tick its free time; a date with several opens them, with who is free."
                    renderStretch={(date, stretch) => (
                      <li key={stretch.startMinute} className="stretch">
                        <FreeStretch date={date} stretch={stretch} total={answers?.length ?? 0} />
                      </li>
                    )}
                    tickOne={(date, stretch, heat) => (
                      <OneTapTime date={date} stretch={stretch} heat={heat} />
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
                <ProposeForm key={rehearsalCount ?? 0} result={formResult} />
              </details>
            </section>
          ) : null}
          {proposedSection}
          <section aria-labelledby="your-times-heading">
            <h2 id="your-times-heading">Your times</h2>
            <details
              className="your-times"
              open={
                openWhileDraft ||
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
              {/* In a first answer the number is part of the Send (plan/phase-31.md). */}
              {draft ? null : capSection}
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
                          {capitalized(preferenceText(item.answer.limit))}
                          <span className="hint"> · responded {item.answer.answeredAt}</span>
                        </span>
                      ) : (
                        <span className="hint">Not answered</span>
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
          {draft ? null : capSection}
          {proposedSection}
        </>
      )}
    </main>
  );
}

type ProposeValues = RehearsalFormValues & { location: string; notes: string };
type ProposeErrors = RehearsalErrors & { location?: string; notes?: string };

function ProposeForm({
  result,
}: {
  result: { errors: ProposeErrors; values: ProposeValues } | undefined;
}) {
  const values: ProposeValues = result?.values ?? {
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    notes: "",
  };
  const errors = result?.errors ?? {};
  // Named by the disclosure's summary, "Propose a different time".
  return (
    <Form method="post" className="stack slot-form" replace preventScrollReset>
      <input type="hidden" name="intent" value="propose" />
      <RehearsalFields values={values} errors={errors} />
      <TextField
        name="location"
        label="Location (optional)"
        defaultValue={values.location}
        error={errors.location}
        optional
      />
      <NotesField id="propose-other-notes" defaultValue={values.notes} error={errors.notes} />
      <SubmitButton feedbackKey="propose">Propose</SubmitButton>
    </Form>
  );
}

/**
 * The preferred number of rehearsals (plan/phase-23.md, worded as a
 * preference in plan/phase-28.md): saved through a fetcher when a choice
 * changes or the number is committed (on leaving the field or Enter, not on
 * every keystroke); typing a number chooses it. Without JavaScript, a Save
 * button posts it.
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
  const fetcher = useFetcher<{ capSaved?: boolean; capProblem?: string } | { failure: Failure }>({
    key: "request-cap",
  });
  const result = fetcher.data;
  // A save that failed in the browser leaves the fields as the member set them (plan/phase-34.md).
  const failure = isFailure(result) ? result.failure : null;
  const saved = result && !isFailure(result) ? result : undefined;
  const problem = saved?.capProblem ?? refused;
  const form = useRef<HTMLFormElement>(null);
  const save = useRef<() => void>(() => {});
  useEffect(() => {
    save.current = () => {
      if (!form.current) return;
      const values = new FormData(form.current);
      values.set("via", "fetcher");
      void fetcher.submit(values, { method: "post" });
    };
  });
  const status =
    fetcher.state !== "idle"
      ? "Saving…"
      : saved?.capSaved
        ? "Saved"
        : saved?.capProblem
          ? "Not saved"
          : "";
  return (
    <Form
      method="post"
      preventScrollReset
      className="stack"
      replace
      ref={form}
      // Once interactive, every change saves itself; Enter commits the number.
      onSubmit={hydrated ? (event) => event.preventDefault() : undefined}
    >
      <input type="hidden" name="intent" value="answer" />
      <CapFields
        most={limit !== null}
        count={limit ?? 2}
        problem={problem}
        onSave={() => save.current()}
      />
      {hydrated ? (
        <>
          <p className="hint save-status" aria-live="polite">
            {status}
          </p>
          {failure ? (
            <FailureAlert
              failure={failure}
              busy={fetcher.state !== "idle"}
              onRetry={() => save.current()}
            />
          ) : null}
        </>
      ) : (
        <SubmitButton feedbackKey="request-answer">Save</SubmitButton>
      )}
    </Form>
  );
}

/**
 * The preferred number of rehearsals: as many as possible, or a number. In
 * the answer form each committed change calls `onSave`; in a first answer's
 * draft (plan/phase-31.md) the fields go with the Send and save nothing alone.
 */
function CapFields({
  most,
  count,
  problem,
  onSave,
}: {
  most: boolean;
  count: number | string;
  problem: string | null;
  onSave?: () => void;
}) {
  const mostRef = useRef<HTMLInputElement>(null);
  const countRef = useRef<HTMLInputElement>(null);
  const save = useRef(onSave);
  useEffect(() => {
    save.current = onSave;
  });
  // The number's native change event fires when it is committed; React's
  // onChange would fire on every keystroke.
  useEffect(() => {
    const input = countRef.current;
    if (!input) return;
    const committed = () => save.current?.();
    input.addEventListener("change", committed);
    return () => input.removeEventListener("change", committed);
  }, []);
  return (
    <fieldset className="limit" aria-describedby={problem ? "cap-error" : undefined}>
      <legend>How many rehearsals would you like in these dates?</legend>
      <label>
        <input
          type="radio"
          name="limit"
          value="any"
          defaultChecked={!most}
          onChange={() => save.current?.()}
        />
        As many as possible
      </label>
      <label className="limit-most">
        <input
          type="radio"
          name="limit"
          value="most"
          ref={mostRef}
          defaultChecked={most}
          onChange={() => save.current?.()}
        />
        <input
          type="number"
          name="limitCount"
          ref={countRef}
          min={1}
          max={LIMIT_MAX}
          defaultValue={count}
          aria-label="Preferred number of rehearsals"
          inputMode="numeric"
          onInput={() => {
            if (mostRef.current) mostRef.current.checked = true;
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
    if (focusInside.current) details.querySelector("summary")?.focus({ preventScroll: true });
  }, [location.key]);
  // A tap outside closes it too (plan/phase-41.md).
  useDismissOutside(menu);
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

/** "As many as possible" at the start of a list entry. */
function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
