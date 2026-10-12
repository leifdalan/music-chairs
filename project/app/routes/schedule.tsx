import { data, Form, Link, redirect } from "react-router";

import { groupFromAddress } from "~/.server/group-address";
import {
  calendarViewer,
  googleWriteState,
  rewriteGroupEvents,
  scheduleSync,
} from "~/.server/calendar-sync";
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
import { CopyLink } from "~/components/copy-link";
import { ConfirmForm, ConfirmPanel } from "~/components/confirm-form";
import { FreeCalendar } from "~/components/free-calendar";
import { PayoffBody } from "~/components/payoff-card";
import { NotesField } from "~/components/propose-times";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
import {
  addDays,
  expandOccurrences,
  formatDate,
  timeRange,
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
import { groupPath } from "~/lib/group-address";
import { rehearsalPath, rehearsalSlugs, requestPath, withJoin } from "~/lib/request-address";
import { calendarNotice } from "~/lib/calendar-notices";
import { pageMeta } from "~/lib/site";
import { buttonVariants } from "~/components/ui/button";
import { Switch, useSwitch } from "~/components/view-switch";
import { dayHeat } from "~/lib/heat";
import { answerable, nextWeekday } from "~/lib/requests";
import { describeRehearsal, isUpcoming, validateNotes } from "~/lib/rehearsal";
import { missingSentence, missingSummaries } from "~/lib/warnings";
import { zoneLabel } from "~/lib/time-zones";

import type { Route } from "./+types/schedule";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `Schedule · ${loaderData.groupName}` : "Not found");
}

/** The group and the member viewing it; visitors go back to the group page. */
async function groupAndViewer(
  request: Request,
  address: string,
): Promise<{ group: Group; viewer: Member }> {
  const group = groupFromAddress(request, address);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  return { group, viewer };
}

const ANSWERS: RsvpAnswer[] = ["yes", "no", "maybe"];

export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer } = await groupAndViewer(request, params.groupAddress);
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
  // Warnings reach past the overlap window for rehearsals further out.
  const laterDates = rehearsals
    .filter((rehearsal) => rehearsal.date > until)
    .map((rehearsal) => rehearsal.date);
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
    // The calendar shades a date by the most people free together for an
    // hour, any time of day (plan/phase-24.md).
    if (shown.length > 0)
      days.push({ date, heat: dayHeat(cells, date, WHOLE_DAY), stretches: shown });
  }
  // Who has given any times for the coming weeks, and who has responded to
  // each availability request still taking times (plan/phase-24.md).
  const summary = {
    given: members.filter((member) => expandOccurrences(member.slots, today, until).length > 0)
      .length,
    memberCount: members.length,
    requests: store
      .listRequests(group.id)
      .filter((item) => answerable(item, today))
      .map((item) => ({
        id: item.id,
        href: requestPath(groupPath(group), item.slug),
        name: item.name,
        responded: store.listAnswers(group.id, item.id).length,
      })),
  };

  const requestsById = new Map(store.listRequests(group.id).map((item) => [item.id, item]));
  // Each proposed rehearsal's link, copied by organizers (plan/phase-30.md).
  const slugs = rehearsalSlugs(rehearsals);
  const origin = publicOrigin() ?? new URL(request.url).origin;
  const calendar = await calendarPanel(request, group, viewer);
  return {
    timesThatWorked: isOrganizer ? timesThatWorked(rehearsals, today) : null,
    calendar,
    groupHref: groupPath(group),
    progress: requestProgress(group, today),
    groupName: group.name,
    timeZone: group.timeZone,
    showNames: group.showNames,
    isOrganizer,
    today,
    until,
    days,
    summary,
    freeView: new URL(request.url).searchParams.get("free") === "list" ? "list" : "calendar",
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
    const upcoming = isUpcoming(rehearsal, today);
    const from = rehearsal.requestId ? requestsById.get(rehearsal.requestId) : undefined;
    const view = {
      id: rehearsal.id,
      status: rehearsal.status,
      location: rehearsal.location,
      notes: rehearsal.notes,
      startMinute: rehearsal.startMinute,
      endMinute: rehearsal.endMinute,
      requestId: rehearsal.requestId,
      requestName: from?.name ?? null,
      requestHref: from ? requestPath(groupPath(group), from.slug) : null,
      summary: describeRehearsal(rehearsal),
      // Members who answered it (plan/phase-24.md).
      answered: (answers.get(`${rehearsal.id}|${rehearsal.date}`) ?? new Map()).size,
      memberCount: members.length,
      // Its one date while it can still be answered (plan/phase-29.md).
      date: upcoming ? dateView(rehearsal, rehearsal.date) : null,
    };
    if (!isOrganizer) return { ...view, organizer: null };
    // Who required isn't free, said once (plan/phase-25.md).
    const missingNames = upcoming
      ? missingRequired(
          members,
          freeDuring(cells, rehearsal.date, rehearsal.startMinute, rehearsal.endMinute),
        ).map((member) => member.displayName)
      : [];
    const missing = missingSummaries(
      missingNames.length > 0 ? [{ date: rehearsal.date, missing: missingNames }] : [],
    );
    const slug = slugs.get(rehearsal.id);
    const shareUrl =
      from && slug && rehearsal.status === "proposed"
        ? new URL(
            withJoin(rehearsalPath(groupPath(group), from.slug, slug), group.inviteCode),
            origin,
          ).href
        : null;
    return { ...view, organizer: { missing, shareUrl } };
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

/** Any time of day, for the schedule's calendar of who is free. */
const WHOLE_DAY = [{ startMinute: 0, endMinute: 24 * 60 }];

/** How many past rehearsal times "Times that worked" offers again. */
const TIMES_THAT_WORKED = 6;

/**
 * Confirmed rehearsals that have already met, one per weekday, time and place,
 * most recent first, each with the next date on its weekday from today.
 */
function timesThatWorked(rehearsals: Rehearsal[], today: string) {
  const met = rehearsals
    .filter((rehearsal) => rehearsal.status === "confirmed" && rehearsal.date < today)
    .map((rehearsal) => ({ rehearsal, last: rehearsal.date }))
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
    connectUrl: `/auth/google/calendar?scope=write&returnTo=${encodeURIComponent(`${groupPath(group)}/schedule`)}`,
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
  const { group, viewer } = await groupAndViewer(request, params.groupAddress);
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const rehearsalId = String(form.get("rehearsalId") ?? "");
  const today = todayInZone(group.timeZone, new Date());
  const back = (message: string) => redirectWithToast(`${groupPath(group)}/schedule`, message);
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

  if (intent === "rsvp") {
    const rehearsal = store.findRehearsal(group.id, rehearsalId);
    if (!rehearsal) throw data(null, { status: 404 });
    const raw = form.get("answer");
    const answer = ANSWERS.find((value) => value === raw) ?? null;
    if (answer === null && raw !== "clear") return problem("Choose yes, no or maybe.");
    // The answering member is always the viewer, never a form field.
    if (
      !isUpcoming(rehearsal, today) ||
      !store.setRsvp(group.id, rehearsal.id, viewer.id, answer)
    ) {
      return problem("That rehearsal can't be answered any more. Reload the page.");
    }
    syncViewer();
    return back(answer ? `Answer saved: ${ANSWER_LABELS[answer]}` : "Answer cleared");
  }

  if (viewer.role !== "organizer") throw data(null, { status: 403 });

  const rehearsal = store.findRehearsal(group.id, rehearsalId);
  if (!rehearsal) throw data(null, { status: 404 });
  if (intent === "confirm") {
    store.confirmRehearsal(group.id, rehearsalId);
    syncGroup(group.id);
    return back("Rehearsal confirmed");
  }
  if (intent === "delete") {
    const prompt = confirmationNeeded(form, deleteRehearsalPrompt(describeRehearsal(rehearsal)));
    if (prompt) return prompt;
    store.deleteRehearsal(group.id, rehearsalId);
    syncGroup(group.id);
    return back("Rehearsal deleted");
  }
  // Notes (plan/phase-29.md): a confirmed rehearsal's written events are put
  // again so members' calendars carry the new notes.
  if (intent === "notes") {
    const notes = validateNotes(form.get("notes"));
    if (!notes.ok) return problem(notes.error);
    if (notes.value !== rehearsal.notes) {
      store.setNotes(group.id, rehearsalId, notes.value);
      if (rehearsal.status === "confirmed") rewriteGroupEvents(group.id);
    }
    return back(notes.value ? "Notes saved" : "Notes removed");
  }
  return problem("Something went wrong. Please try again.");
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
    groupHref,
    today,
    summary,
    freeView,
  } = loaderData;
  const link = useSwitch(["notice"]);
  const pageProblem = actionData && "problem" in actionData ? actionData.problem : null;
  const stretchRow = (stretch: (typeof days)[number]["stretches"][number]) => (
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
          <span className="hint stretch-line">Free: {stretch.freeNames.join(", ")}</span>
        ) : null}
        {stretch.missing && stretch.missing.length > 0 ? (
          <span className="hint stretch-line">
            Not free:{" "}
            {stretch.missing.map((m) => (m.optional ? `${m.name} (optional)` : m.name)).join(", ")}
          </span>
        ) : null}
      </div>
    </li>
  );
  const freeTimes =
    days.length === 0 ? (
      <p className="hint">Nobody has given times for the coming weeks yet.</p>
    ) : freeView === "calendar" ? (
      <FreeCalendar
        from={today}
        to={until}
        days={days}
        total={summary.memberCount}
        legend={
          showNames || isOrganizer
            ? "Tap a date to see who is free."
            : "Tap a date to see how many are free."
        }
        renderStretch={(_date, stretch) => stretchRow(stretch)}
      />
    ) : (
      <ul className="days">
        {days.map((day) => (
          <li key={day.date}>
            <h3>{formatDate(day.date)}</h3>
            <ul className="stretches">{day.stretches.map(stretchRow)}</ul>
          </li>
        ))}
      </ul>
    );
  const linked = rehearsals.filter((item) => item.requestId !== null);
  const earlier = rehearsals.filter((item) => item.requestId === null);
  const confirmed = linked.filter((item) => item.status === "confirmed");
  const proposed = linked.filter((item) => item.status === "proposed");
  // Proposed rehearsals under their request, in the order they first appear.
  const byRequest = new Map<string, { name: string; href: string; items: RehearsalItem[] }>();
  for (const item of proposed) {
    const id = item.requestId as string;
    const group = byRequest.get(id) ?? {
      name: item.requestName ?? "",
      href: item.requestHref ?? "",
      items: [],
    };
    group.items.push(item);
    byRequest.set(id, group);
  }
  const visibilityNote = isOrganizer
    ? showNames
      ? "Members also see names."
      : "Members see only how many people are free."
    : showNames
      ? null
      : "Showing how many people are free.";
  return (
    <main>
      <p className="eyebrow">
        <Link to=".." relative="path">
          {groupName}
        </Link>
      </p>
      <h1>Schedule</h1>
      <p className="hint">All times are in {zoneLabel(timeZone)}.</p>
      {pageProblem && actionData ? (
        <ProblemAlert message={pageProblem} response={actionData} />
      ) : null}
      {actionData && "confirm" in actionData ? <ConfirmPanel prompt={actionData.confirm} /> : null}

      <RehearsalList
        title="Confirmed rehearsals"
        id="confirmed-heading"
        items={confirmed}
        empty="Nothing confirmed yet."
      />
      <section aria-labelledby="proposed-heading">
        <h2 id="proposed-heading">Proposed rehearsals</h2>
        {byRequest.size === 0 ? (
          <p className="hint">No proposed rehearsals.</p>
        ) : (
          [...byRequest].map(([requestId, group]) => (
            <div key={requestId} className="request-group">
              <h3>
                From <Link to={group.href}>{group.name}</Link>
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
        groupHref={groupHref}
        google={calendar.google?.state ?? null}
        until={until}
      />

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
        {/* How far along the group is (plan/phase-24.md). */}
        <div className="free-summary">
          <p>
            {summary.given} of {summary.memberCount}{" "}
            {summary.memberCount === 1 ? "member has" : "members have"} given times between{" "}
            {formatDate(today)} and {formatDate(until)}.
          </p>
          {summary.requests.length > 0 ? (
            <ul className="free-summary-requests">
              {summary.requests.map((item) => (
                <li key={item.id}>
                  <Link to={item.href}>{item.name}</Link>: {item.responded} of {summary.memberCount}{" "}
                  responded
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {visibilityNote ? <p className="hint">{visibilityNote}</p> : null}
        {isOrganizer ? (
          <p className="hint">
            To propose rehearsals, open an availability request on the{" "}
            <Link to=".." relative="path">
              group page
            </Link>
            .
          </p>
        ) : null}
        <Switch
          label="How to show when people are free"
          options={[
            { text: "Calendar", to: link("free", null), current: freeView === "calendar" },
            { text: "List", to: link("free", "list"), current: freeView === "list" },
          ]}
        />
        {freeTimes}
      </section>
      {/* Last: the rehearsals in your own calendar (plan/phase-24.md). */}
      <CalendarPanel calendar={calendar} />
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
  id: string;
  items: RehearsalItem[];
  empty: string;
}) {
  const headingId = id;
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
  const next = item.date;
  return (
    <li className={`rehearsal ${item.status}`} id={`rehearsal-${item.id}`}>
      {/* The payoff leads a confirmed rehearsal's card (plan/phase-26.md). */}
      {item.status === "confirmed" && next ? (
        <PayoffBody
          payoff={{
            date: next.date,
            startMinute: item.startMinute,
            endMinute: item.endMinute,
            location: item.location,
            mine: next.mine,
            comingNames: next.names ? next.names.yes : null,
            yes: next.counts.yes,
            answered: next.counts.yes + next.counts.no + next.counts.maybe,
          }}
        />
      ) : null}
      <p className="slot-summary">{item.summary}</p>
      {/* The payoff already says where; other cards say it here. */}
      {item.location && !(item.status === "confirmed" && next) ? (
        <p className="hint">At {item.location}</p>
      ) : null}
      {item.notes ? <p className="notes">{item.notes}</p> : null}
      {item.requestName ? <p className="hint">From {item.requestName}</p> : null}
      {item.status === "proposed" ? (
        <p className="hint">
          {item.answered} of {item.memberCount} answered
        </p>
      ) : null}
      {/* The viewer's own answer, which saves on each tap (plan/phase-20.md). */}
      <div className="your-answer" role="group" aria-labelledby={`answer-${item.id}`}>
        <p className="area-label" id={`answer-${item.id}`}>
          Your answer
        </p>
        {next ? (
          <RsvpRow rehearsalId={item.id} summary={item.summary} date={next} />
        ) : (
          <p className="hint">This date has passed.</p>
        )}
      </div>
      {/* Changes for the whole group, apart from the viewer's own answer. */}
      {organizer ? (
        <div className="organizer-controls" role="group" aria-labelledby={`organize-${item.id}`}>
          <p className="area-label" id={`organize-${item.id}`}>
            For organizers
          </p>
          {organizer.missing.length > 0 ? (
            // One calm region for the whole card.
            <div className="warnings" role="status" aria-label="Who isn't free">
              <ul>
                {organizer.missing.map((summary) => (
                  <li key={summary.dates[0]}>{missingSentence(summary)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.status === "proposed" ? (
            <p className="hint">Confirming makes it a rehearsal on everyone's schedule.</p>
          ) : null}
          <div className="slot-actions">
            {item.status === "proposed" ? (
              <Form method="post" replace>
                <input type="hidden" name="intent" value="confirm" />
                <input type="hidden" name="rehearsalId" value={item.id} />
                <SubmitButton
                  feedbackKey={`confirm-${item.id}`}
                  label={`Confirm ${item.summary} for everyone`}
                >
                  Confirm for everyone
                </SubmitButton>
              </Form>
            ) : null}
            <ConfirmForm
              fields={{ intent: "delete", rehearsalId: item.id }}
              trigger="Delete"
              triggerLabel={`Delete ${item.summary}`}
              triggerVariant="outline-destructive"
              {...deleteRehearsalPrompt(item.summary)}
              feedbackKey={`delete-${item.id}`}
            />
          </div>
          <details className="notes-edit">
            <summary>{item.notes ? "Edit notes" : "Add notes"}</summary>
            <Form method="post" replace className="stack">
              <input type="hidden" name="intent" value="notes" />
              <input type="hidden" name="rehearsalId" value={item.id} />
              <NotesField id={`notes-${item.id}`} defaultValue={item.notes} />
              <SubmitButton
                feedbackKey={`notes-${item.id}`}
                variant="outline"
                label={`Save notes for ${item.summary}`}
              >
                Save notes
              </SubmitButton>
            </Form>
          </details>
          {organizer.shareUrl ? (
            // A link that lands on this card, joining first if need be (plan/phase-30.md).
            <details className="notes-edit">
              <summary>Share a link to this rehearsal</summary>
              <div className="share-link">
                <p className="hint">
                  It opens this rehearsal, where people answer. Anyone not yet in the group joins
                  first.
                </p>
                <CopyLink
                  url={organizer.shareUrl}
                  label={`Link to ${item.summary}`}
                  variant="outline"
                />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

type DateItem = NonNullable<RehearsalItem["date"]>;

const ANSWER_LABELS: Record<RsvpAnswer, string> = { yes: "Yes", no: "No", maybe: "Maybe" };

/** Yes / No / Maybe as value-bearing submit buttons of the enclosing form. */
function AnswerButtons({
  label,
  current,
  feedbackPrefix,
}: {
  label: string;
  current: RsvpAnswer | null;
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
          pressed={current === answer}
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
  // The rehearsal's date and time, so two rehearsals on one date stay distinguishable.
  const subject = summary;
  const lines = names
    ? ANSWERS.filter((answer) => names[answer].length > 0)
        .map((answer) => `${ANSWER_LABELS[answer]}: ${names[answer].join(", ")}`)
        .concat(names.none && names.none.length > 0 ? [`No answer: ${names.none.join(", ")}`] : [])
    : [];
  return (
    <div className="rsvp">
      <p className="rsvp-heading hint">
        {counts.yes} yes · {counts.no} no · {counts.maybe} maybe
      </p>
      <Form method="post" replace className="rsvp-form">
        <input type="hidden" name="intent" value="rsvp" />
        <input type="hidden" name="rehearsalId" value={rehearsalId} />
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
    </div>
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
  groupHref,
  google,
  until,
}: {
  progress: ProgressItem[];
  groupHref: string;
  google: GoogleWriteState | null;
  until: string;
}) {
  return (
    <section aria-labelledby="progress-heading">
      <h2 id="progress-heading">Availability requests</h2>
      {progress.length === 0 ? (
        <p className="hint">No availability request has rehearsals coming up.</p>
      ) : (
        <ul className="request-progress">
          {progress.map((item) => (
            <li key={item.requestId}>
              <Link to={item.requestHref} className="request-name">
                {item.name}
              </Link>
              <ProgressFigures item={item} />
              {item.complete ? (
                <CalendarActions
                  groupHref={groupHref}
                  requestHref={item.requestHref}
                  requestName={item.name}
                  google={google}
                  until={until}
                  returnTo={`${groupHref}/schedule`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
