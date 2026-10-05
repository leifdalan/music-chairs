import { data, Form, Link, redirect } from "react-router";

import { calendarViewer, googleWriteState, scheduleSync } from "~/.server/calendar-sync";
import { confirmationNeeded } from "~/.server/confirm";
import { redirectWithToast } from "~/.server/flash";
import { CALENDAR_SCOPES } from "~/.server/google";
import { findViewer, publicOrigin } from "~/.server/membership";
import { requestProgress } from "~/.server/progress";
import {
  getStore,
  type Group,
  type Member,
  type Rehearsal,
  type RsvpAnswer,
} from "~/.server/store";
import {
  CalendarActions,
  ProgressFigures,
  type GoogleWriteState,
} from "~/components/calendar-actions";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
import {
  addDays,
  describeSlot,
  expandOccurrences,
  formatDate,
  formatMinutes,
  isDate,
  isOccurrence,
  offeredDates,
  todayInZone,
  weekdayName,
  windowEnd,
} from "~/lib/availability";
import {
  buildCells,
  freeDuring,
  freeStretches,
  missingRequired,
  type OverlapMember,
} from "~/lib/overlap";
import { calendarNotice } from "~/lib/calendar-notices";
import { nextWeekday } from "~/lib/requests";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";

import type { Route } from "./+types/schedule";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `Schedule · ${loaderData.groupName}` : "Not found");
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

const ANSWERS: RsvpAnswer[] = ["yes", "no", "maybe"];

function timeRange(start: number, end: number): string {
  return `${formatMinutes(start)}–${formatMinutes(end)}`;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const store = getStore();
  const isOrganizer = viewer.role === "organizer";
  const showNames = isOrganizer || group.showNames;
  const slots = store.listGroupSlots(group.id);
  const members: OverlapMember[] = store.listMembers(group.id).map((member) => ({
    id: member.id,
    displayName: member.displayName,
    optional: member.optional,
    slots: slots.get(member.id) ?? [],
  }));
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  const answers = new Map<string, Map<string, RsvpAnswer>>();
  for (const rsvp of store.listRsvps(group.id)) {
    const key = `${rsvp.rehearsalId}|${rsvp.date}`;
    answers.set(key, (answers.get(key) ?? new Map()).set(rsvp.memberId, rsvp.answer));
  }
  const today = todayInZone(group.timeZone, new Date());
  const until = windowEnd(today);
  const rehearsals = store.listRehearsals(group.id);
  // Warnings reach past the overlap window for one-off rehearsals further out.
  const laterDates = rehearsals
    .filter((rehearsal) => rehearsal.kind === "once" && rehearsal.startDate > until)
    .map((rehearsal) => rehearsal.startDate);
  const cells = buildCells(members, today, until, laterDates);

  const days = [];
  for (let date = today; date <= until; date = addDays(date, 1)) {
    const stretches = freeStretches(cells, date).map((stretch): StretchView => {
      const free = new Set(stretch.free);
      const missing = missingRequired(members, free);
      // Members get counts unless the organizer shows names; ids never leave the server.
      return {
        startMinute: stretch.startMinute,
        endMinute: stretch.endMinute,
        freeCount: stretch.free.length,
        memberCount: members.length,
        everyoneNeeded: missing.length === 0,
        freeNames: showNames ? stretch.free.map((id) => names.get(id) ?? "") : null,
        missing: isOrganizer
          ? members
              .filter((member) => !free.has(member.id))
              .map((member) => ({ name: member.displayName, optional: member.optional }))
          : null,
      };
    });
    // With counts only, back-to-back stretches with the same count would still
    // reveal that someone else took over; members get them merged.
    const shown = showNames ? stretches : mergeEqualCounts(stretches);
    if (shown.length > 0) days.push({ date, stretches: shown });
  }

  const requestNames = new Map(store.listRequests(group.id).map((item) => [item.id, item.name]));
  const calendar = await calendarPanel(request, group, viewer);
  return {
    timesThatWorked: isOrganizer ? timesThatWorked(rehearsals, today) : null,
    calendar,
    groupId: group.id,
    progress: requestProgress(group, today),
    groupName: group.name,
    timeZone: group.timeZone,
    showNames: group.showNames,
    isOrganizer,
    today,
    until,
    days,
    rehearsals: rehearsals.map(rehearsalView),
  };

  function dateView(rehearsal: Rehearsal, date: string) {
    const byMember = answers.get(`${rehearsal.id}|${date}`) ?? new Map<string, RsvpAnswer>();
    const counts = { yes: 0, no: 0, maybe: 0 };
    for (const answer of byMember.values()) counts[answer] += 1;
    const answeredBy = (answer: RsvpAnswer) =>
      members.filter((member) => byMember.get(member.id) === answer).map((m) => m.displayName);
    return {
      date,
      mine: byMember.get(viewer.id) ?? null,
      counts,
      // Names follow the group's setting for members; "not answered" is for organizers only.
      names: showNames
        ? {
            yes: answeredBy("yes"),
            no: answeredBy("no"),
            maybe: answeredBy("maybe"),
            none: isOrganizer
              ? members.filter((member) => !byMember.has(member.id)).map((m) => m.displayName)
              : null,
          }
        : null,
    };
  }

  function rehearsalView(rehearsal: Rehearsal) {
    const dates = offeredDates(rehearsal, today, until);
    const view = {
      id: rehearsal.id,
      kind: rehearsal.kind,
      status: rehearsal.status,
      location: rehearsal.location,
      requestId: rehearsal.requestId,
      requestName: rehearsal.requestId ? (requestNames.get(rehearsal.requestId) ?? null) : null,
      summary: describeSlot(rehearsal),
      dates: dates.map((date) => dateView(rehearsal, date)),
    };
    if (!isOrganizer) return { ...view, organizer: null };
    const warnings = dates
      .map((date) => ({
        date,
        missing: missingRequired(
          members,
          freeDuring(cells, date, rehearsal.startMinute, rehearsal.endMinute),
        ).map((member) => member.displayName),
      }))
      .filter((warning) => warning.missing.length > 0);
    const runsPastWindow =
      rehearsal.kind === "weekly" && (rehearsal.endDate === null || rehearsal.endDate > until);
    return {
      ...view,
      organizer: {
        warnings,
        uncheckedAfter: runsPastWindow ? until : null,
        // Every date in the window the pattern meets, cancelled or not, for the toggles.
        weeks:
          rehearsal.kind === "weekly"
            ? expandOccurrences([{ ...rehearsal, skips: [] }], today, until).map((o) => o.date)
            : [],
        cancelled: rehearsal.skips,
        endDate: rehearsal.endDate,
      },
    };
  }
}

type StretchView = {
  startMinute: number;
  endMinute: number;
  freeCount: number;
  memberCount: number;
  everyoneNeeded: boolean;
  freeNames: string[] | null;
  missing: { name: string; optional: boolean }[] | null;
};

/** How many past rehearsal times "Times that worked" offers again. */
const TIMES_THAT_WORKED = 6;

/**
 * Confirmed rehearsals that have already met, one per weekday, time and place,
 * most recent first, each with the next date on its weekday from today.
 */
function timesThatWorked(rehearsals: Rehearsal[], today: string) {
  const yesterday = addDays(today, -1);
  const met = rehearsals
    .filter((rehearsal) => rehearsal.status === "confirmed" && rehearsal.startDate <= yesterday)
    .map((rehearsal) => ({
      rehearsal,
      last: expandOccurrences([rehearsal], rehearsal.startDate, yesterday).at(-1)?.date,
    }))
    .filter((item): item is { rehearsal: Rehearsal; last: string } => item.last !== undefined)
    .sort((a, b) => b.last.localeCompare(a.last));
  const seen = new Set<string>();
  const times = [];
  for (const { rehearsal, last } of met) {
    const next = nextWeekday(today, last);
    const key = [next, rehearsal.startMinute, rehearsal.endMinute, rehearsal.location].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    times.push({
      last,
      next,
      startMinute: rehearsal.startMinute,
      endMinute: rehearsal.endMinute,
      location: rehearsal.location,
    });
    if (times.length === TIMES_THAT_WORKED) break;
  }
  return times;
}

function mergeEqualCounts(stretches: StretchView[]): StretchView[] {
  const merged: StretchView[] = [];
  for (const stretch of stretches) {
    const last = merged.at(-1);
    if (
      last &&
      last.endMinute === stretch.startMinute &&
      last.freeCount === stretch.freeCount &&
      last.everyoneNeeded === stretch.everyoneNeeded
    ) {
      merged[merged.length - 1] = { ...last, endMinute: stretch.endMinute };
    } else {
      merged.push(stretch);
    }
  }
  return merged;
}

function problem(message: string) {
  return data({ problem: message }, { status: 400 });
}

/**
 * The viewer's own calendar options: their private feed link, and Google
 * Calendar writing when this visitor may use it. Only the viewer's own feed
 * token is ever included.
 */
async function calendarPanel(request: Request, group: Group, viewer: Member) {
  const store = getStore();
  const origin = publicOrigin() ?? new URL(request.url).origin;
  const feedUrl = new URL(`/calendar/${store.feedTokenFor(viewer.id)}.ics`, origin).href;
  const state = await googleWriteState(request, group, viewer);
  return {
    feedUrl,
    webcalUrl: feedUrl.replace(/^https?:/, "webcal:"),
    google: state ? { state } : null,
    connectUrl: `/auth/google/calendar?scope=write&returnTo=${encodeURIComponent(`/g/${group.id}/schedule`)}`,
    notice: calendarNotice(request),
  };
}

/** Queues Google Calendar updates for every member of the group who writes to it. */
function syncGroup(groupId: string): void {
  scheduleSync(getStore().listSyncingMembers(groupId));
}

export async function action({ request, params }: Route.ActionArgs) {
  // The viewer is resolved before the form is read. Any member may answer for
  // themselves; every other intent is organizer-only.
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const rehearsalId = String(form.get("rehearsalId") ?? "");
  const today = todayInZone(group.timeZone, new Date());
  const back = (message: string) => redirectWithToast(`/g/${group.id}/schedule`, message);
  const syncViewer = () =>
    scheduleSync(store.listSyncingMembers(group.id).filter((m) => m.memberId === viewer.id));

  if (intent === "set-calendar") {
    const capable = await calendarViewer(request, group);
    const grant = capable ? store.findGrant(capable.account.id) : null;
    if (!capable || !grant?.scopes.includes(CALENDAR_SCOPES.write)) {
      return problem("Connect Google Calendar first.");
    }
    const on = form.get("value") === "on";
    if (!on) {
      const prompt = confirmationNeeded(form, stopCalendarPrompt());
      if (prompt) return prompt;
    }
    store.setCalendarSync(group.id, viewer.id, on);
    // Turning it off removes the upcoming events the app wrote.
    scheduleSync([{ memberId: viewer.id, groupId: group.id, accountId: capable.account.id }]);
    const message = on
      ? "Rehearsals will be added to your Google Calendar"
      : "Stopped adding rehearsals to your Google Calendar";
    // The home screen's "Add to Google Calendar" comes back home; nowhere else.
    return form.get("returnTo") === "/" ? redirectWithToast("/", message) : back(message);
  }

  if (intent === "rsvp" || intent === "rsvp-all") {
    const rehearsal = store.findRehearsal(group.id, rehearsalId);
    if (!rehearsal) throw data(null, { status: 404 });
    const raw = form.get("answer");
    const answer = ANSWERS.find((value) => value === raw) ?? null;
    if (answer === null && raw !== "clear") return problem("Choose yes, no or maybe.");
    const offered = offeredDates(rehearsal, today, windowEnd(today));
    // The answering member is always the viewer, never a form field.
    if (intent === "rsvp-all") {
      if (
        rehearsal.kind !== "weekly" ||
        !store.setRsvps(group.id, rehearsal.id, viewer.id, offered, answer)
      ) {
        return problem("There are no dates to answer for this rehearsal.");
      }
      syncViewer();
      return back(answer ? `Answered ${ANSWER_LABELS[answer]} for every date` : "Answers cleared");
    }
    const date = form.get("date");
    if (
      !isDate(date) ||
      !offered.includes(date) ||
      !store.setRsvp(group.id, rehearsal.id, viewer.id, date, answer)
    ) {
      return problem("That date can't be answered. Reload the page and try again.");
    }
    syncViewer();
    return back(answer ? `Answer saved: ${ANSWER_LABELS[answer]}` : "Answer cleared");
  }

  if (viewer.role !== "organizer") throw data(null, { status: 403 });

  const rehearsal = store.findRehearsal(group.id, rehearsalId);
  if (!rehearsal) throw data(null, { status: 404 });
  const what = describeSlot(rehearsal);
  if (intent === "confirm") {
    store.confirmRehearsal(group.id, rehearsalId);
    syncGroup(group.id);
    return back("Rehearsal confirmed");
  }
  if (intent === "delete") {
    const prompt = confirmationNeeded(form, deleteRehearsalPrompt(what));
    if (prompt) return prompt;
    store.deleteRehearsal(group.id, rehearsalId);
    syncGroup(group.id);
    return back("Rehearsal deleted");
  }
  if (intent === "end") {
    const endDate = form.get("endDate");
    if (!isDate(endDate) || endDate < today) {
      return problem("Choose a last date from today onwards.");
    }
    if (endDate < rehearsal.startDate) {
      return problem("The last date can't be before the rehearsal's first date.");
    }
    const prompt = confirmationNeeded(form, endPrompt(what));
    if (prompt) return prompt;
    if (!store.endRehearsal(group.id, rehearsalId, endDate)) {
      return problem("The last date can't be before the rehearsal's first date.");
    }
    syncGroup(group.id);
    return back("Last date set");
  }
  if (intent === "cancel-date" || intent === "restore-date") {
    const date = form.get("date");
    if (intent === "cancel-date" && isDate(date) && isOccurrence(rehearsal, date)) {
      const prompt = confirmationNeeded(form, cancelDatePrompt(what, date));
      if (prompt) return prompt;
    }
    if (
      !isDate(date) ||
      !store.setCancelled(group.id, rehearsalId, date, intent === "cancel-date")
    ) {
      return problem(
        "That date isn't one of this rehearsal's weeks. Reload the page and try again.",
      );
    }
    syncGroup(group.id);
    return back(intent === "cancel-date" ? "Date cancelled" : "Date restored");
  }
  return problem("Something went wrong with that request. Please try again.");
}

export default function Schedule({ loaderData, actionData }: Route.ComponentProps) {
  const {
    groupName,
    timeZone,
    showNames,
    isOrganizer,
    until,
    days,
    rehearsals,
    calendar,
    timesThatWorked,
    progress,
    groupId,
  } = loaderData;
  const pageProblem = actionData && "problem" in actionData ? actionData.problem : null;
  const freeTimes =
    days.length === 0 ? (
      <p className="hint">Nobody has entered availability for the coming weeks yet.</p>
    ) : (
      <ul className="days">
        {days.map((day) => (
          <li key={day.date}>
            <h3>{formatDate(day.date)}</h3>
            <ul className="stretches">
              {day.stretches.map((stretch) => (
                <li
                  key={stretch.startMinute}
                  className={stretch.everyoneNeeded ? "stretch everyone" : "stretch"}
                >
                  <div className="free-time">
                    <span className="stretch-time">
                      {timeRange(stretch.startMinute, stretch.endMinute)}
                      <span className="stretch-count">
                        {stretch.freeCount} of {stretch.memberCount} free
                      </span>
                    </span>
                    {stretch.everyoneNeeded ? (
                      <span className="hint stretch-line">Everyone needed is free.</span>
                    ) : null}
                    {stretch.freeNames ? (
                      <span className="hint stretch-line">
                        Free: {stretch.freeNames.join(", ")}
                      </span>
                    ) : null}
                    {stretch.missing && stretch.missing.length > 0 ? (
                      <span className="hint stretch-line">
                        Not free:{" "}
                        {stretch.missing
                          .map((m) => (m.optional ? `${m.name} (optional)` : m.name))
                          .join(", ")}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    );
  const linked = rehearsals.filter((item) => item.requestId !== null);
  const earlier = rehearsals.filter((item) => item.requestId === null);
  const confirmed = linked.filter((item) => item.status === "confirmed");
  const proposed = linked.filter((item) => item.status === "proposed");
  // Proposed rehearsals under their request, in the order they first appear.
  const byRequest = new Map<string, { name: string; items: RehearsalItem[] }>();
  for (const item of proposed) {
    const id = item.requestId as string;
    const group = byRequest.get(id) ?? { name: item.requestName ?? "", items: [] };
    group.items.push(item);
    byRequest.set(id, group);
  }
  return (
    <main>
      <p className="eyebrow">
        <Link to=".." relative="path">
          {groupName}
        </Link>
      </p>
      <h1>Schedule</h1>
      <p className="hint">All times are in {timeZone}.</p>
      {pageProblem && actionData ? (
        <ProblemAlert message={pageProblem} response={actionData} />
      ) : null}
      {actionData && "confirm" in actionData ? <ConfirmPanel prompt={actionData.confirm} /> : null}

      <RehearsalList title="Confirmed" items={confirmed} empty="Nothing confirmed yet." />
      <section aria-labelledby="proposed-heading">
        <h2 id="proposed-heading">Proposed</h2>
        {byRequest.size === 0 ? (
          <p className="hint">No proposed times.</p>
        ) : (
          [...byRequest].map(([requestId, group]) => (
            <div key={requestId} className="request-group">
              <h3>
                <Link to={`../requests/${requestId}`} relative="path">
                  {group.name}
                </Link>
              </h3>
              <ul className="rehearsals">
                {group.items.map((item) => (
                  <RehearsalCard key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      {earlier.length > 0 ? (
        <RehearsalList title="Earlier rehearsals" id="earlier-heading" items={earlier} empty="" />
      ) : null}
      <ProgressSection
        progress={progress}
        groupId={groupId}
        google={calendar.google?.state ?? null}
        until={until}
      />
      <CalendarPanel calendar={calendar} />

      {timesThatWorked && timesThatWorked.length > 0 ? (
        <section aria-labelledby="worked-heading">
          <h2 id="worked-heading">Times that worked</h2>
          <ul className="times-worked">
            {timesThatWorked.map((time) => {
              const when = `${weekdayName(time.last)} ${timeRange(time.startMinute, time.endMinute)}`;
              return (
                <li key={`${time.next}-${time.startMinute}-${time.endMinute}-${time.location}`}>
                  <span>
                    {when}
                    {time.location ? `, ${time.location}` : ""}
                    <span className="hint"> · last {formatDate(time.last)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="overlap-heading">
        <h2 id="overlap-heading">When people are free</h2>
        <p className="hint">
          Until {formatDate(until)}.{" "}
          {isOrganizer
            ? showNames
              ? "Members also see names."
              : "Members see only how many people are free."
            : showNames
              ? null
              : "Showing how many people are free."}
        </p>
        {isOrganizer ? (
          <p className="hint">
            To propose times, open a request on the{" "}
            <Link to=".." relative="path">
              group page
            </Link>
            .
          </p>
        ) : null}
        {freeTimes}
      </section>
    </main>
  );
}

type RehearsalItem = Route.ComponentProps["loaderData"]["rehearsals"][number];

function RehearsalList({
  title,
  id,
  items,
  empty,
}: {
  title: string;
  id?: string;
  items: RehearsalItem[];
  empty: string;
}) {
  const headingId = id ?? `${title.toLowerCase()}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {items.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="rehearsals">
          {items.map((item) => (
            <RehearsalCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RehearsalCard({ item }: { item: RehearsalItem }) {
  const organizer = item.organizer;
  const shown = item.dates.slice(0, 4);
  const more = item.dates.slice(4);
  return (
    <li className={`rehearsal ${item.status}`}>
      <p className="slot-summary">{item.summary}</p>
      {item.location ? <p className="hint">At {item.location}</p> : null}
      {item.status === "confirmed" && item.requestName ? (
        <p className="hint">From {item.requestName}</p>
      ) : null}
      {item.dates.length === 0 ? (
        <p className="hint">No dates in the coming weeks.</p>
      ) : (
        <ul className="rsvp-dates">
          {shown.map((date) => (
            <RsvpRow key={date.date} rehearsalId={item.id} summary={item.summary} date={date} />
          ))}
        </ul>
      )}
      {more.length > 0 ? (
        <details>
          <summary>More dates ({more.length})</summary>
          <ul className="rsvp-dates">
            {more.map((date) => (
              <RsvpRow key={date.date} rehearsalId={item.id} summary={item.summary} date={date} />
            ))}
          </ul>
        </details>
      ) : null}
      {item.kind === "weekly" && item.dates.length > 1 ? (
        <Form method="post" replace className="rsvp-all">
          <input type="hidden" name="intent" value="rsvp-all" />
          <input type="hidden" name="rehearsalId" value={item.id} />
          <span>Answer every date until {formatDate(item.dates[item.dates.length - 1].date)}:</span>
          <AnswerButtons
            label={`every date of ${item.summary}`}
            current={undefined}
            feedbackPrefix={`rsvp-all-${item.id}`}
          />
        </Form>
      ) : null}
      {organizer && organizer.warnings.length > 0 ? (
        <ul className="warnings" aria-label="Warnings">
          {organizer.warnings.map((warning) => (
            <li key={warning.date} role="status">
              {formatDate(warning.date)}: {warning.missing.join(", ")}{" "}
              {warning.missing.length === 1 ? "isn't" : "aren't"} free
            </li>
          ))}
        </ul>
      ) : null}
      {organizer?.uncheckedAfter ? (
        <p className="hint">
          Dates after {formatDate(organizer.uncheckedAfter)} aren't checked yet.
        </p>
      ) : null}
      {organizer ? (
        <div className="slot-actions">
          {item.status === "proposed" ? (
            <Form method="post" replace>
              <input type="hidden" name="intent" value="confirm" />
              <input type="hidden" name="rehearsalId" value={item.id} />
              <SubmitButton feedbackKey={`confirm-${item.id}`} label={`Confirm ${item.summary}`}>
                Confirm
              </SubmitButton>
            </Form>
          ) : null}
          <ConfirmForm
            fields={{ intent: "delete", rehearsalId: item.id }}
            trigger="Delete"
            triggerLabel={`Delete ${item.summary}`}
            triggerVariant="destructive"
            {...deleteRehearsalPrompt(item.summary)}
            feedbackKey={`delete-${item.id}`}
          />
        </div>
      ) : null}
      {organizer && item.kind === "weekly" ? (
        <details>
          <summary>Cancel a date or set a last date</summary>
          <ul className="weeks">
            {organizer.weeks.map((date) => {
              const cancelled = organizer.cancelled.includes(date);
              return (
                <li key={date}>
                  <span className={cancelled ? "skipped" : undefined}>
                    {formatDate(date)}
                    {cancelled ? " — cancelled" : ""}
                  </span>
                  {cancelled ? (
                    <Form method="post" replace>
                      <input type="hidden" name="intent" value="restore-date" />
                      <input type="hidden" name="rehearsalId" value={item.id} />
                      <input type="hidden" name="date" value={date} />
                      <SubmitButton
                        feedbackKey={`date-${item.id}-${date}`}
                        variant="outline"
                        size="sm"
                        label={`Restore ${formatDate(date)}`}
                      >
                        Restore
                      </SubmitButton>
                    </Form>
                  ) : (
                    <ConfirmForm
                      fields={{ intent: "cancel-date", rehearsalId: item.id, date }}
                      trigger="Cancel this date"
                      triggerLabel={`Cancel ${formatDate(date)}`}
                      triggerSize="sm"
                      {...cancelDatePrompt(item.summary, date)}
                      feedbackKey={`date-${item.id}-${date}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <ConfirmForm
            className="end-form"
            fields={{ intent: "end", rehearsalId: item.id }}
            trigger="Set last date"
            {...endPrompt(item.summary)}
            feedbackKey={`end-${item.id}`}
          >
            <label htmlFor={`end-${item.id}`}>Last date</label>
            <input
              id={`end-${item.id}`}
              name="endDate"
              type="date"
              required
              defaultValue={organizer.endDate ?? ""}
            />
          </ConfirmForm>
        </details>
      ) : null}
    </li>
  );
}

type DateItem = RehearsalItem["dates"][number];

const ANSWER_LABELS: Record<RsvpAnswer, string> = { yes: "Yes", no: "No", maybe: "Maybe" };

/** Yes / No / Maybe as value-bearing submit buttons of the enclosing form. */
function AnswerButtons({
  label,
  current,
  feedbackPrefix,
}: {
  label: string;
  current: RsvpAnswer | null | undefined;
  feedbackPrefix: string;
}) {
  return (
    <span className="answers">
      {ANSWERS.map((answer) => (
        <SubmitButton
          key={answer}
          feedbackKey={`${feedbackPrefix}-${answer}`}
          name="answer"
          value={answer}
          variant={current === answer ? "default" : "outline"}
          className={current === answer ? "answer chosen" : "answer"}
          // Per-date buttons toggle a current answer; answer-all buttons are plain actions.
          pressed={current === undefined ? undefined : current === answer}
          label={`${ANSWER_LABELS[answer]} for ${label}`}
        >
          {ANSWER_LABELS[answer]}
        </SubmitButton>
      ))}
    </span>
  );
}

function RsvpRow({
  rehearsalId,
  summary,
  date,
}: {
  rehearsalId: string;
  summary: string;
  date: DateItem;
}) {
  const { counts, names } = date;
  // Names the rehearsal too, so two rehearsals on one date stay distinguishable.
  const subject = `${formatDate(date.date)} (${summary})`;
  const lines = names
    ? ANSWERS.filter((answer) => names[answer].length > 0)
        .map((answer) => `${ANSWER_LABELS[answer]}: ${names[answer].join(", ")}`)
        .concat(names.none && names.none.length > 0 ? [`No answer: ${names.none.join(", ")}`] : [])
    : [];
  return (
    <li className="rsvp-date">
      <p className="rsvp-heading">
        <strong>{formatDate(date.date)}</strong>
        <span className="hint">
          {counts.yes} yes · {counts.no} no · {counts.maybe} maybe
        </span>
      </p>
      <Form method="post" replace className="rsvp-form">
        <input type="hidden" name="intent" value="rsvp" />
        <input type="hidden" name="rehearsalId" value={rehearsalId} />
        <input type="hidden" name="date" value={date.date} />
        <AnswerButtons
          label={subject}
          current={date.mine}
          feedbackPrefix={`rsvp-${rehearsalId}-${date.date}`}
        />
        {date.mine ? (
          <SubmitButton
            feedbackKey={`rsvp-${rehearsalId}-${date.date}-clear`}
            name="answer"
            value="clear"
            variant="outline"
            size="sm"
            label={`Clear my answer for ${subject}`}
          >
            Clear
          </SubmitButton>
        ) : null}
      </Form>
      {lines.map((line) => (
        <p key={line} className="hint rsvp-names">
          {line}
        </p>
      ))}
    </li>
  );
}

function CalendarPanel({
  calendar,
}: {
  calendar: {
    feedUrl: string;
    webcalUrl: string;
    google: { state: GoogleWriteState } | null;
    connectUrl: string;
    notice: string | null;
  };
}) {
  const google = calendar.google;
  return (
    <section className="calendar-panel" aria-labelledby="calendar-heading">
      <h2 id="calendar-heading">Rehearsals in your calendar</h2>
      {calendar.notice ? (
        <p className="notice" role="status">
          {calendar.notice}
        </p>
      ) : null}
      {google?.state === "on" ? (
        <>
          <p className="hint">
            Confirmed rehearsals are added to your Google Calendar, except dates you said No to.
          </p>
          <ConfirmForm
            fields={{ intent: "set-calendar", value: "off" }}
            trigger="Stop adding rehearsals to my Google Calendar"
            {...stopCalendarPrompt()}
            feedbackKey="set-calendar"
          />
        </>
      ) : null}
      {google?.state === "off" ? (
        <Form method="post" replace>
          <input type="hidden" name="intent" value="set-calendar" />
          <input type="hidden" name="value" value="on" />
          <p className="hint">
            Add confirmed rehearsals to your primary Google Calendar and keep them up to date.
          </p>
          <SubmitButton feedbackKey="set-calendar">
            Add rehearsals to my Google Calendar
          </SubmitButton>
        </Form>
      ) : null}
      {google?.state === "connect" ? (
        <p>
          <a className={buttonVariants()} href={calendar.connectUrl}>
            Connect Google Calendar to add rehearsals
          </a>
        </p>
      ) : null}
      {google?.state === "other-account" ? (
        <p className="hint">
          To add rehearsals to your Google Calendar, sign in with Google as this member.
        </p>
      ) : null}
      {google?.state === "unlinked" ? (
        <p className="hint">
          Sign in with Google from the group page to add rehearsals to your Google Calendar.
        </p>
      ) : null}
      <h3>Calendar feed</h3>
      <p className="hint">
        A private link any calendar app can subscribe to. It shows your confirmed rehearsals and
        follows changes. Keep it to yourself: anyone with it can see the dates and places.
      </p>
      <input
        aria-label="Calendar feed link"
        type="text"
        readOnly
        value={calendar.feedUrl}
        onFocus={(event) => event.currentTarget.select()}
      />
      <p>
        <a className={buttonVariants({ variant: "outline" })} href={calendar.webcalUrl}>
          Subscribe in your calendar app
        </a>
      </p>
    </section>
  );
}

// The "are you sure" texts; the dialogs and the server's confirm page share them.
function deleteRehearsalPrompt(summary: string) {
  return {
    title: "Delete this rehearsal?",
    body: `${summary} and everyone's answers to it will be deleted, and it comes off members' calendars.`,
    label: "Delete rehearsal",
  };
}

function endPrompt(summary: string) {
  return {
    title: "End this rehearsal?",
    body: `${summary} won't happen after the last date you chose; later dates and their answers go, and they come off members' calendars.`,
    label: "Set last date",
  };
}

function cancelDatePrompt(summary: string, date: string) {
  return {
    title: `Cancel ${formatDate(date)}?`,
    body: `${summary} won't happen on ${formatDate(date)}, and that date comes off members' calendars. You can restore it later.`,
    label: "Cancel this date",
  };
}

function stopCalendarPrompt() {
  return {
    title: "Stop adding rehearsals to your Google Calendar?",
    body: "The upcoming rehearsal events this app added to your Google Calendar will be removed.",
    label: "Stop adding rehearsals",
  };
}

type ProgressItem = Route.ComponentProps["loaderData"]["progress"][number];

/** How each request is going (plan/phase-17.md), for members and organizers alike. */
function ProgressSection({
  progress,
  groupId,
  google,
  until,
}: {
  progress: ProgressItem[];
  groupId: string;
  google: GoogleWriteState | null;
  until: string;
}) {
  return (
    <section aria-labelledby="progress-heading">
      <h2 id="progress-heading">Requests</h2>
      {progress.length === 0 ? (
        <p className="hint">No request has rehearsals coming up.</p>
      ) : (
        <ul className="request-progress">
          {progress.map((item) => (
            <li key={item.requestId}>
              <Link to={`../requests/${item.requestId}`} relative="path" className="request-name">
                {item.name}
              </Link>
              <ProgressFigures item={item} />
              {item.complete ? (
                <CalendarActions
                  groupId={groupId}
                  requestId={item.requestId}
                  requestName={item.name}
                  google={google}
                  until={until}
                  returnTo={`/g/${groupId}/schedule`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
