import { data, Form, Link, redirect } from "react-router";

import { confirmationNeeded } from "~/.server/confirm";
import { redirectWithToast } from "~/.server/flash";
import { findViewer } from "~/.server/membership";
import { getStore, type Group, type Member, type ScheduleRequest } from "~/.server/store";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { ProblemAlert } from "~/components/problem-alert";
import { FreeTime, ProposeTimes } from "~/components/propose-times";
import { SlotFields } from "~/components/slot-fields";
import { SubmitButton } from "~/components/submit-button";
import { TextField } from "~/components/text-field";
import {
  addDays,
  expandOccurrences,
  formatDate,
  formatMinutes,
  parseSlotInput,
  timeInputValue,
  todayInZone,
  validateLocation,
  type SlotErrors,
  type SlotFormValues,
} from "~/lib/availability";
import { buildCells, freeStretches, type OverlapMember } from "~/lib/overlap";
import { parseProposedTimes, timeValue } from "~/lib/propose";
import { answerable, clipToWindows } from "~/lib/requests";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/request";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `${loaderData.name} · ${loaderData.groupName}` : "Not found");
}

/** The most rehearsals a member can name as their limit. */
const LIMIT_MAX = 99;

/** The group, the member viewing it and the request; visitors go back to the group page. */
async function load(
  request: Request,
  groupId: string,
  requestId: string,
): Promise<{ group: Group; viewer: Member; scheduleRequest: ScheduleRequest }> {
  const store = getStore();
  const group = store.findGroup(groupId);
  if (!group) throw data(null, { status: 404 });
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(`/g/${group.id}`);
  const scheduleRequest = store.findRequest(group.id, requestId);
  if (!scheduleRequest) throw data(null, { status: 404 });
  return { group, viewer, scheduleRequest };
}

function timeRange(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

/** "Sat 3 Oct, 14:05" in the group's zone. */
function formatAnsweredAt(instant: string, zone: string): string {
  const at = new Date(instant);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return `${formatDate(todayInZone(zone, at))}, ${time}`;
}

// A member gets the request, their own times in its span and their own answer
// only; who else answered, their limits and the overlap are for organizers.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer, scheduleRequest } = await load(request, params.groupId, params.requestId);
  const store = getStore();
  const isOrganizer = viewer.role === "organizer";
  const today = todayInZone(group.timeZone, new Date());
  const from = scheduleRequest.startDate > today ? scheduleRequest.startDate : today;
  const to = scheduleRequest.endDate;
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
    groupId: group.id,
    groupName: group.name,
    timeZone: group.timeZone,
    requestId: scheduleRequest.id,
    name: scheduleRequest.name,
    startDate: scheduleRequest.startDate,
    endDate: scheduleRequest.endDate,
    windows: scheduleRequest.windows,
    open: scheduleRequest.open,
    expired: scheduleRequest.endDate < today,
    canAnswer: answerable(scheduleRequest, today),
    isOrganizer,
    myTimes: expandOccurrences(store.listSlots(viewer.id), from, to),
    mine: own ? view(own) : null,
    answers: isOrganizer
      ? members.map((member) => {
          const answer = answers.find((item) => item.memberId === member.id);
          return { name: member.displayName, answer: answer ? view(answer) : null };
        })
      : null,
    overlap,
    // Changes when a proposal is made, so the picker starts afresh.
    rehearsalCount: isOrganizer ? store.listRehearsals(group.id).length : null,
  };
}

/** A refused button press, shown as a page-level alert. */
function problem(message: string) {
  return data({ problem: message }, { status: 400 });
}

export async function action({ request, params }: Route.ActionArgs) {
  const { group, viewer, scheduleRequest } = await load(request, params.groupId, params.requestId);
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const here = `/g/${group.id}/requests/${scheduleRequest.id}`;

  if (intent === "answer") {
    if (!answerable(scheduleRequest, todayInZone(group.timeZone, new Date()))) {
      return problem("This request is no longer taking answers.");
    }
    let limit: number | null = null;
    if (form.get("limit") === "most") {
      const count = Number(form.get("limitCount"));
      if (!Number.isInteger(count) || count < 1 || count > LIMIT_MAX) {
        return problem(`Choose a number of rehearsals from 1 to ${LIMIT_MAX}.`);
      }
      limit = count;
    }
    const before = store
      .listAnswers(group.id, scheduleRequest.id)
      .some((answer) => answer.memberId === viewer.id);
    if (!store.answerRequest(group.id, scheduleRequest.id, viewer.id, limit)) {
      return problem("This request is no longer taking answers.");
    }
    return redirectWithToast(here, before ? "Answer updated" : "Answer sent");
  }
  // Proposing from the request's free times, whether it is open, closed or over.
  if (intent === "propose-times") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
    const location = validateLocation(form.get("location"));
    if (!location.ok) return data({ proposeProblem: location.error }, { status: 400 });
    const times = parseProposedTimes(form, todayInZone(group.timeZone, new Date()));
    if (!times.ok) return data({ proposeProblem: times.error }, { status: 400 });
    store.addRehearsals(group.id, scheduleRequest.id, times.inputs, location.value);
    const count = times.inputs.length;
    return redirectWithToast(
      here,
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
    return redirectWithToast(here, intent === "reopen" ? "Request reopened" : "Request closed");
  }
  return problem("Something went wrong with that request. Please try again.");
}

export default function RequestPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    groupId,
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
    myTimes,
    mine,
    answers,
    overlap,
    rehearsalCount,
  } = loaderData;
  const status = !open ? "Closed" : expired ? "Ended" : null;
  const pickProblem =
    actionData && "proposeProblem" in actionData ? actionData.proposeProblem : null;
  const formResult = actionData && "errors" in actionData ? actionData : undefined;
  return (
    <main>
      <p className="eyebrow">
        <Link to={`/g/${groupId}`}>{groupName}</Link>
      </p>
      <h1>{name}</h1>
      <p className="request-span">
        {formatDate(startDate)} to {formatDate(endDate)}
        {status ? <span className="request-status"> · {status}</span> : null}
      </p>
      <p className="hint">
        Times of day:{" "}
        {windows.map((window) => timeRange(window.startMinute, window.endMinute)).join(", ")} (
        {timeZone})
      </p>
      {actionData && "problem" in actionData ? (
        <ProblemAlert message={actionData.problem} response={actionData} />
      ) : null}
      {actionData && "confirm" in actionData ? <ConfirmPanel prompt={actionData.confirm} /> : null}

      {isOrganizer ? (
        <div className="request-actions">
          {open ? (
            <Link
              to={`/g/${groupId}/requests/new?edit=${requestId}`}
              className="button-link secondary"
            >
              Edit
            </Link>
          ) : null}
          {open ? (
            <ConfirmForm
              fields={{ intent: "close" }}
              trigger="Close request"
              {...closePrompt(name)}
              feedbackKey={`request-open-${requestId}`}
            />
          ) : (
            <Form method="post" replace>
              <input type="hidden" name="intent" value="reopen" />
              <SubmitButton feedbackKey={`request-open-${requestId}`} className="secondary">
                Reopen request
              </SubmitButton>
            </Form>
          )}
          <Link
            to={`/g/${groupId}/requests/new?repeat=${requestId}`}
            className="button-link secondary"
          >
            Repeat request
          </Link>
        </div>
      ) : null}

      <section aria-labelledby="my-times-heading">
        <h2 id="my-times-heading">Your times in this span</h2>
        {myTimes.length === 0 ? (
          <p className="hint">You have no availability between these dates yet.</p>
        ) : (
          <ul className="occurrences">
            {myTimes.map((occurrence) => (
              <li key={`${occurrence.slotId}-${occurrence.date}`}>
                <span>{formatDate(occurrence.date)}</span>
                <span>{timeRange(occurrence.startMinute, occurrence.endMinute)}</span>
              </li>
            ))}
          </ul>
        )}
        {canAnswer ? (
          <ul className="add-windows">
            {windows.map((window, index) => (
              <li key={index}>
                <Link
                  className="button-link secondary small"
                  to={`/g/${groupId}/availability?request=${requestId}&window=${index}`}
                >
                  Add {timeRange(window.startMinute, window.endMinute)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="answer-heading">
        <h2 id="answer-heading">Your answer</h2>
        {mine ? (
          <p className="hint">
            Answered {mine.answeredAt}:{" "}
            {mine.limit === null ? "any and all rehearsals" : `no more than ${mine.limit}`}.
          </p>
        ) : null}
        {canAnswer ? (
          <AnswerForm limit={mine ? mine.limit : null} answered={mine !== null} />
        ) : (
          <p className="hint">This request is no longer taking answers.</p>
        )}
      </section>

      {answers ? (
        <section aria-labelledby="answers-heading">
          <h2 id="answers-heading">
            Answers ({answers.filter((item) => item.answer).length} of {answers.length})
          </h2>
          <ul className="request-answers">
            {answers.map((item, index) => (
              <li key={index}>
                <span className="member-name">{item.name}</span>
                {item.answer ? (
                  <span>
                    {item.answer.limit === null
                      ? "Any and all"
                      : `No more than ${item.answer.limit}`}
                    <span className="hint"> · {item.answer.answeredAt}</span>
                  </span>
                ) : (
                  <span className="hint">Not yet</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overlap ? (
        <section aria-labelledby="overlap-heading">
          <h2 id="overlap-heading">When people are free</h2>
          <p className="hint">Within this request's dates and times of day.</p>
          <ProposeTimes
            hasTimes={overlap.length > 0}
            problem={pickProblem}
            resetKey={rehearsalCount ?? 0}
          >
            {overlap.length === 0 ? (
              <p className="hint">Nobody is free at these times yet.</p>
            ) : (
              <ul className="days">
                {overlap.map((day) => (
                  <li key={day.date}>
                    <h3>{formatDate(day.date)}</h3>
                    <ul className="stretches">
                      {day.stretches.map((stretch) => (
                        <li key={stretch.startMinute} className="stretch">
                          <FreeTime
                            tickable
                            value={timeValue(day.date, stretch.startMinute, stretch.endMinute)}
                            label={`Propose ${formatDate(day.date)}, ${timeRange(stretch.startMinute, stretch.endMinute)}`}
                          >
                            <span className="stretch-time">
                              {timeRange(stretch.startMinute, stretch.endMinute)}
                              <span className="stretch-count">
                                {stretch.freeCount} of {answers?.length ?? 0} free
                              </span>
                            </span>
                            <span className="hint stretch-line">
                              Free: {stretch.freeNames.join(", ")}
                            </span>
                          </FreeTime>
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
    </main>
  );
}

type ProposeValues = SlotFormValues & { location: string };
type ProposeErrors = SlotErrors & { location?: string };

function ProposeForm({
  result,
}: {
  result: { errors: ProposeErrors; values: ProposeValues } | undefined;
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

function AnswerForm({ limit, answered }: { limit: number | null; answered: boolean }) {
  return (
    <Form method="post" className="stack" replace>
      <input type="hidden" name="intent" value="answer" />
      <fieldset className="limit">
        <legend>How many rehearsals can you make in this span?</legend>
        <label>
          <input type="radio" name="limit" value="any" defaultChecked={limit === null} />
          Any and all
        </label>
        <label className="limit-most">
          <input type="radio" name="limit" value="most" defaultChecked={limit !== null} />
          No more than{" "}
          <input
            type="number"
            name="limitCount"
            min={1}
            max={LIMIT_MAX}
            defaultValue={limit ?? 2}
            aria-label="Most rehearsals"
            inputMode="numeric"
          />{" "}
          rehearsals
        </label>
      </fieldset>
      <SubmitButton feedbackKey="request-answer">
        {answered ? "Update my answer" : "Send my answer"}
      </SubmitButton>
    </Form>
  );
}

/** The "are you sure" text for closing a request; the dialog and the confirm page share it. */
function closePrompt(name: string) {
  return {
    title: `Close ${name}?`,
    body: "Members can no longer answer it. You can reopen it later.",
    label: "Close request",
  };
}
