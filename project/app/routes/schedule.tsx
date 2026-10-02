import { data, Form, Link, redirect, useNavigation } from "react-router";

import { findViewer } from "~/.server/membership";
import {
  getStore,
  type Group,
  type Member,
  type Rehearsal,
  type RsvpAnswer,
} from "~/.server/store";
import { SlotFields } from "~/components/slot-fields";
import { TextField } from "~/components/text-field";
import {
  addDays,
  describeSlot,
  expandOccurrences,
  formatDate,
  formatMinutes,
  isDate,
  parseSlotInput,
  timeInputValue,
  todayInZone,
  UPCOMING_WEEKS,
  validateLocation,
  type SlotErrors,
  type SlotFormValues,
} from "~/lib/availability";
import {
  buildCells,
  freeDuring,
  freeStretches,
  missingRequired,
  type OverlapMember,
} from "~/lib/overlap";
import { pageMeta } from "~/lib/site";

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

/**
 * The dates members can answer for: from today to the end of the window (or a
 * one-off rehearsal's own date beyond it), cancelled dates excluded. The loader
 * and both answer intents use this one definition.
 */
/** The last date of the overlap and answer window that starts `today`. */
function windowEnd(today: string): string {
  return addDays(today, UPCOMING_WEEKS * 7 - 1);
}

function offeredDates(rehearsal: Rehearsal, today: string, until: string): string[] {
  const last =
    rehearsal.kind === "once" && rehearsal.startDate > until ? rehearsal.startDate : until;
  return expandOccurrences([rehearsal], today, last).map((occurrence) => occurrence.date);
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

  const search = new URL(request.url).searchParams;
  return {
    groupName: group.name,
    timeZone: group.timeZone,
    showNames: group.showNames,
    isOrganizer,
    today,
    until,
    days,
    rehearsals: rehearsals.map(rehearsalView),
    prefill: isOrganizer
      ? {
          startDate: isDate(search.get("date")) ? String(search.get("date")) : "",
          startTime: search.get("start") ?? "",
          endTime: search.get("end") ?? "",
        }
      : null,
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

type ProposeValues = SlotFormValues & { location: string };
type ProposeErrors = SlotErrors & { location?: string };

function invalidForm(errors: ProposeErrors, values: ProposeValues) {
  return data({ errors, values }, { status: 400 });
}

function problem(message: string) {
  return data({ problem: message }, { status: 400 });
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
  const back = redirect(`/g/${group.id}/schedule`);

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
      return back;
    }
    const date = form.get("date");
    if (
      !isDate(date) ||
      !offered.includes(date) ||
      !store.setRsvp(group.id, rehearsal.id, viewer.id, date, answer)
    ) {
      return problem("That date can't be answered. Reload the page and try again.");
    }
    return back;
  }

  if (viewer.role !== "organizer") throw data(null, { status: 403 });

  if (intent === "propose") {
    const parsed = parseSlotInput(form);
    const location = validateLocation(form.get("location"));
    const errors: ProposeErrors = parsed.ok ? {} : { ...parsed.errors };
    if (parsed.ok && parsed.value.startDate < today) {
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
      return invalidForm(errors, { ...values, location: String(form.get("location") ?? "") });
    }
    store.addRehearsal(group.id, parsed.value, location.value);
    return back;
  }

  if (!store.findRehearsal(group.id, rehearsalId)) throw data(null, { status: 404 });
  if (intent === "confirm") {
    store.confirmRehearsal(group.id, rehearsalId);
    return back;
  }
  if (intent === "delete") {
    store.deleteRehearsal(group.id, rehearsalId);
    return back;
  }
  if (intent === "end") {
    const endDate = form.get("endDate");
    if (!isDate(endDate) || endDate < today) {
      return problem("Choose a last date from today onwards.");
    }
    if (!store.endRehearsal(group.id, rehearsalId, endDate)) {
      return problem("The last date can't be before the rehearsal's first date.");
    }
    return back;
  }
  if (intent === "cancel-date" || intent === "restore-date") {
    const date = form.get("date");
    if (
      !isDate(date) ||
      !store.setCancelled(group.id, rehearsalId, date, intent === "cancel-date")
    ) {
      return problem(
        "That date isn't one of this rehearsal's weeks. Reload the page and try again.",
      );
    }
    return back;
  }
  return problem("Something went wrong with that request. Please try again.");
}

export default function Schedule({ loaderData, actionData }: Route.ComponentProps) {
  const { groupName, timeZone, showNames, isOrganizer, until, days, rehearsals, prefill } =
    loaderData;
  const busy = useNavigation().state !== "idle";
  const formResult = actionData && "errors" in actionData ? actionData : undefined;
  const pageProblem = actionData && "problem" in actionData ? actionData.problem : null;
  const proposed = rehearsals.filter((item) => item.status === "proposed");
  const confirmed = rehearsals.filter((item) => item.status === "confirmed");
  return (
    <main>
      <p className="eyebrow">
        <Link to=".." relative="path">
          {groupName}
        </Link>
      </p>
      <h1>Schedule</h1>
      <p className="hint">All times are in {timeZone}.</p>
      {pageProblem ? (
        <p className="field-error" role="alert">
          {pageProblem}
        </p>
      ) : null}

      <RehearsalList
        title="Confirmed"
        items={confirmed}
        busy={busy}
        empty="Nothing confirmed yet."
      />
      <RehearsalList title="Proposed" items={proposed} busy={busy} empty="No proposed times." />

      {prefill ? (
        <ProposeForm
          key={`${prefill.startDate}-${prefill.startTime}-${rehearsals.length}`}
          prefill={prefill}
          result={formResult}
          busy={busy}
        />
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
        {days.length === 0 ? (
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
                      <p className="stretch-time">
                        {timeRange(stretch.startMinute, stretch.endMinute)}
                        <span className="stretch-count">
                          {stretch.freeCount} of {stretch.memberCount} free
                        </span>
                      </p>
                      {stretch.everyoneNeeded ? (
                        <p className="hint">Everyone needed is free.</p>
                      ) : null}
                      {stretch.freeNames ? (
                        <p className="hint">Free: {stretch.freeNames.join(", ")}</p>
                      ) : null}
                      {stretch.missing && stretch.missing.length > 0 ? (
                        <p className="hint">
                          Not free:{" "}
                          {stretch.missing
                            .map((m) => (m.optional ? `${m.name} (optional)` : m.name))
                            .join(", ")}
                        </p>
                      ) : null}
                      {isOrganizer ? (
                        <Link
                          className="propose-link"
                          to={`?date=${day.date}&start=${timeInputValue(stretch.startMinute)}&end=${timeInputValue(stretch.endMinute)}#propose-heading`}
                          aria-label={`Propose ${formatDate(day.date)}, ${timeRange(stretch.startMinute, stretch.endMinute)}`}
                        >
                          Propose this time
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

type RehearsalItem = Route.ComponentProps["loaderData"]["rehearsals"][number];

function RehearsalList({
  title,
  items,
  busy,
  empty,
}: {
  title: string;
  items: RehearsalItem[];
  busy: boolean;
  empty: string;
}) {
  const headingId = `${title.toLowerCase()}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {items.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="rehearsals">
          {items.map((item) => (
            <RehearsalCard key={item.id} item={item} busy={busy} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RehearsalCard({ item, busy }: { item: RehearsalItem; busy: boolean }) {
  const organizer = item.organizer;
  const shown = item.dates.slice(0, 4);
  const more = item.dates.slice(4);
  return (
    <li className={`rehearsal ${item.status}`}>
      <p className="slot-summary">{item.summary}</p>
      {item.location ? <p className="hint">At {item.location}</p> : null}
      {item.dates.length === 0 ? (
        <p className="hint">No dates in the coming weeks.</p>
      ) : (
        <ul className="rsvp-dates">
          {shown.map((date) => (
            <RsvpRow
              key={date.date}
              rehearsalId={item.id}
              summary={item.summary}
              date={date}
              busy={busy}
            />
          ))}
        </ul>
      )}
      {more.length > 0 ? (
        <details>
          <summary>More dates ({more.length})</summary>
          <ul className="rsvp-dates">
            {more.map((date) => (
              <RsvpRow
                key={date.date}
                rehearsalId={item.id}
                summary={item.summary}
                date={date}
                busy={busy}
              />
            ))}
          </ul>
        </details>
      ) : null}
      {item.kind === "weekly" && item.dates.length > 1 ? (
        <Form method="post" replace className="rsvp-all">
          <input type="hidden" name="intent" value="rsvp-all" />
          <input type="hidden" name="rehearsalId" value={item.id} />
          <span>Answer every date until {formatDate(item.dates[item.dates.length - 1].date)}:</span>
          <AnswerButtons label={`every date of ${item.summary}`} current={undefined} busy={busy} />
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
              <button type="submit" disabled={busy} aria-label={`Confirm ${item.summary}`}>
                Confirm
              </button>
            </Form>
          ) : null}
          <Form method="post" replace>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="rehearsalId" value={item.id} />
            <button
              type="submit"
              className="secondary"
              disabled={busy}
              aria-label={`Delete ${item.summary}`}
            >
              Delete
            </button>
          </Form>
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
                  <Form method="post" replace>
                    <input
                      type="hidden"
                      name="intent"
                      value={cancelled ? "restore-date" : "cancel-date"}
                    />
                    <input type="hidden" name="rehearsalId" value={item.id} />
                    <input type="hidden" name="date" value={date} />
                    <button
                      type="submit"
                      className="secondary small"
                      disabled={busy}
                      aria-label={`${cancelled ? "Restore" : "Cancel"} ${formatDate(date)}`}
                    >
                      {cancelled ? "Restore" : "Cancel this date"}
                    </button>
                  </Form>
                </li>
              );
            })}
          </ul>
          <Form method="post" replace className="end-form">
            <input type="hidden" name="intent" value="end" />
            <input type="hidden" name="rehearsalId" value={item.id} />
            <label htmlFor={`end-${item.id}`}>Last date</label>
            <input
              id={`end-${item.id}`}
              name="endDate"
              type="date"
              required
              defaultValue={organizer.endDate ?? ""}
            />
            <button type="submit" className="secondary" disabled={busy}>
              Set last date
            </button>
          </Form>
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
  busy,
}: {
  label: string;
  current: RsvpAnswer | null | undefined;
  busy: boolean;
}) {
  return (
    <span className="answers">
      {ANSWERS.map((answer) => (
        <button
          key={answer}
          type="submit"
          name="answer"
          value={answer}
          className={current === answer ? "answer chosen" : "answer secondary"}
          // Per-date buttons toggle a current answer; answer-all buttons are plain actions.
          aria-pressed={current === undefined ? undefined : current === answer}
          aria-label={`${ANSWER_LABELS[answer]} for ${label}`}
          disabled={busy}
        >
          {ANSWER_LABELS[answer]}
        </button>
      ))}
    </span>
  );
}

function RsvpRow({
  rehearsalId,
  summary,
  date,
  busy,
}: {
  rehearsalId: string;
  summary: string;
  date: DateItem;
  busy: boolean;
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
        <AnswerButtons label={subject} current={date.mine} busy={busy} />
        {date.mine ? (
          <button
            type="submit"
            name="answer"
            value="clear"
            className="secondary small"
            aria-label={`Clear my answer for ${subject}`}
            disabled={busy}
          >
            Clear
          </button>
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

function ProposeForm({
  prefill,
  result,
  busy,
}: {
  prefill: { startDate: string; startTime: string; endTime: string };
  result: { errors: ProposeErrors; values: ProposeValues } | undefined;
  busy: boolean;
}) {
  const values: ProposeValues = result?.values ?? {
    kind: prefill.startDate ? "once" : "weekly",
    startDate: prefill.startDate,
    endDate: "",
    startTime: prefill.startTime,
    endTime: prefill.endTime,
    location: "",
  };
  const errors = result?.errors ?? {};
  return (
    <section aria-labelledby="propose-heading">
      <h2 id="propose-heading">Propose a rehearsal</h2>
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
        <button type="submit" disabled={busy}>
          Propose
        </button>
      </Form>
    </section>
  );
}
