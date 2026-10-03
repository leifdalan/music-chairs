import { data, Form, Link, redirect } from "react-router";

import { redirectWithToast } from "~/.server/flash";
import { findViewer } from "~/.server/membership";
import { getStore, type Group, type Member, type ScheduleRequest } from "~/.server/store";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
import {
  addDays,
  expandOccurrences,
  formatDate,
  formatMinutes,
  timeInputValue,
  todayInZone,
} from "~/lib/availability";
import { buildCells, freeStretches, type OverlapMember } from "~/lib/overlap";
import { clipToWindows } from "~/lib/requests";
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

/** Whether members can still answer: open, and not over. */
function answerable(scheduleRequest: ScheduleRequest, today: string): boolean {
  return scheduleRequest.open && scheduleRequest.endDate >= today;
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
  if (intent === "close" || intent === "reopen") {
    if (viewer.role !== "organizer") throw data(null, { status: 403 });
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
  } = loaderData;
  const status = !open ? "Closed" : expired ? "Ended" : null;
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
          <Form method="post" replace>
            <input type="hidden" name="intent" value={open ? "close" : "reopen"} />
            <SubmitButton feedbackKey={`request-open-${requestId}`} className="secondary">
              {open ? "Close request" : "Reopen request"}
            </SubmitButton>
          </Form>
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
                        <p className="stretch-time">
                          {timeRange(stretch.startMinute, stretch.endMinute)}
                          <span className="stretch-count">
                            {stretch.freeCount} of {answers?.length ?? 0} free
                          </span>
                        </p>
                        <p className="hint">Free: {stretch.freeNames.join(", ")}</p>
                        <Link
                          className="propose-link"
                          to={`/g/${groupId}/schedule?${new URLSearchParams({
                            date: day.date,
                            start: timeInputValue(stretch.startMinute),
                            end: timeInputValue(stretch.endMinute),
                          })}#propose-heading`}
                          aria-label={`Propose ${formatDate(day.date)}, ${timeRange(stretch.startMinute, stretch.endMinute)}`}
                        >
                          Propose this time
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
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
