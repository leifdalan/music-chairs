import { data, Form, Link, redirect } from "react-router";

import { calendarViewer } from "~/.server/calendar-sync";
import { CALENDAR_SCOPES, GoogleAccessRevoked, GoogleApiError, queryBusy } from "~/.server/google";
import { redirectWithToast } from "~/.server/flash";
import { findViewer } from "~/.server/membership";
import { getStore, type Group, type Member } from "~/.server/store";
import {
  addDays,
  formatDate,
  isDate,
  parseTimeText,
  timeInputValue,
  todayInZone,
} from "~/lib/availability";
import { IMPORT_DAYS, importRange, proposeFreeSlots } from "~/lib/free-busy";
import { calendarNotice } from "~/lib/calendar-notices";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
import { QuarterHours, TimeField } from "~/components/time-field";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/availability.import";

const DEFAULT_WINDOW = { start: 9 * 60, end: 22 * 60 };

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(
    loaderData ? `Import from Google Calendar · ${loaderData.groupName}` : "Not found",
  );
}

/** A submitted time rounded to the 15-minute grid, or null when unreadable. */
function parseTime(value: unknown, end = false): number | null {
  const parsed = typeof value === "string" ? parseTimeText(value, { end }) : null;
  return parsed?.ok ? parsed.minutes : null;
}

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
 * Proposals for the next four weeks from the member's primary Google Calendar.
 * The page states are: sign in as this member, connect Google Calendar, a
 * failure to read it, or the proposals to review.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const store = getStore();
  const search = new URL(request.url).searchParams;
  const windowStart = parseTime(search.get("from")) ?? DEFAULT_WINDOW.start;
  const parsedEnd = parseTime(search.get("to"), true) ?? DEFAULT_WINDOW.end;
  const windowEnd = parsedEnd > windowStart ? parsedEnd : DEFAULT_WINDOW.end;
  const base = {
    notice: calendarNotice(request),
    groupName: group.name,
    timeZone: group.timeZone,
    window: { from: timeInputValue(windowStart), to: timeInputValue(windowEnd) },
    connectUrl: `/auth/google/calendar?scope=import&returnTo=${encodeURIComponent(`/g/${group.id}/availability/import`)}`,
  };
  const capable = await calendarViewer(request, group);
  if (!capable) return { ...base, state: "sign-in" as const, proposals: [] };
  if (!store.findGrant(capable.account.id)?.scopes.includes(CALENDAR_SCOPES.import)) {
    return { ...base, state: "connect" as const, proposals: [] };
  }
  const now = new Date();
  const today = todayInZone(group.timeZone, now);
  const range = importRange(today, IMPORT_DAYS, group.timeZone);
  try {
    const busy = await queryBusy(capable.account.id, range.timeMin, range.timeMax);
    const proposals = proposeFreeSlots({
      busy,
      zone: group.timeZone,
      firstDate: today,
      days: IMPORT_DAYS,
      windowStart,
      windowEnd,
      now,
      existing: store.listSlots(viewer.id),
    }).map((proposal) => ({
      date: proposal.date,
      label: formatDate(proposal.date),
      start: timeInputValue(proposal.startMinute),
      end: timeInputValue(proposal.endMinute),
    }));
    return { ...base, state: "ready" as const, proposals };
  } catch (error) {
    if (error instanceof GoogleAccessRevoked) {
      return { ...base, state: "connect" as const, proposals: [] };
    }
    if (!(error instanceof GoogleApiError)) throw error;
    console.warn(`music-chairs: free/busy import failed: ${error.message}`);
    return { ...base, state: "error" as const, proposals: [] };
  }
}

/** Saves the kept (and possibly edited) proposals as one-off availability. */
export async function action({ request, params }: Route.ActionArgs) {
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  if (!(await calendarViewer(request, group))) throw data(null, { status: 403 });
  const form = await request.formData();
  const today = todayInZone(group.timeZone, new Date());
  const last = addDays(today, IMPORT_DAYS - 1);
  const slots = [];
  for (const index of form.getAll("keep")) {
    const date = form.get(`date-${String(index)}`);
    const startMinute = parseTime(form.get(`start-${String(index)}`));
    const endMinute = parseTime(form.get(`end-${String(index)}`), true);
    if (
      !isDate(date) ||
      date < today ||
      date > last ||
      startMinute === null ||
      endMinute === null ||
      endMinute <= startMinute
    ) {
      return data(
        { problem: "One of the times isn't valid. Check the start and end times and try again." },
        { status: 400 },
      );
    }
    slots.push({ kind: "once" as const, startDate: date, endDate: null, startMinute, endMinute });
  }
  const store = getStore();
  for (const slot of slots) store.addSlot(viewer.id, slot);
  return redirectWithToast(
    `/g/${group.id}/availability`,
    `Added ${slots.length} ${slots.length === 1 ? "time" : "times"} from Google Calendar`,
  );
}

export default function ImportAvailability({ loaderData, actionData }: Route.ComponentProps) {
  const { groupName, timeZone, window, state, proposals, connectUrl, notice } = loaderData;
  const byDate = new Map<
    string,
    { label: string; rows: { index: number; start: string; end: string }[] }
  >();
  proposals.forEach((proposal, index) => {
    const day = byDate.get(proposal.date) ?? { label: proposal.label, rows: [] };
    day.rows.push({ index, start: proposal.start, end: proposal.end });
    byDate.set(proposal.date, day);
  });
  return (
    <main>
      <p className="eyebrow">
        <Link to=".." relative="path">
          My availability
        </Link>
      </p>
      <h1>Import from Google Calendar</h1>
      <p className="hint">
        {groupName} · times in {timeZone}. Free time in your primary Google Calendar over the next
        four weeks, as one-off slots. Untick or adjust any before saving.
      </p>
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
      {state === "sign-in" ? (
        <p className="notice">Sign in with Google as this member to import from Google Calendar.</p>
      ) : null}
      {state === "connect" ? (
        <p>
          <a className="button-link" href={connectUrl}>
            Connect Google Calendar
          </a>
        </p>
      ) : null}
      {state === "error" ? (
        <p className="field-error" role="alert">
          Couldn't read your Google Calendar right now. Please try again in a moment.
        </p>
      ) : null}
      {state === "ready" ? (
        <>
          <Form method="get" className="import-window">
            <QuarterHours id="import-times" />
            <label htmlFor="window-from">From</label>
            <TimeField
              id="window-from"
              name="from"
              defaultValue={window.from}
              listId="import-times"
            />
            <label htmlFor="window-to">to</label>
            <TimeField
              id="window-to"
              name="to"
              end
              defaultValue={window.to}
              listId="import-times"
            />
            <button type="submit" className="secondary small">
              Show
            </button>
          </Form>
          {actionData?.problem ? (
            <ProblemAlert message={actionData.problem} response={actionData} />
          ) : null}
          {proposals.length === 0 ? (
            <p className="hint">No free time of an hour or more in that window.</p>
          ) : (
            <Form method="post" className="import-list">
              {[...byDate.entries()].map(([date, day]) => (
                <fieldset key={date}>
                  <legend>{day.label}</legend>
                  {day.rows.map((row) => (
                    <div className="import-row" key={row.index}>
                      <input type="hidden" name={`date-${row.index}`} value={date} />
                      <input
                        type="checkbox"
                        name="keep"
                        value={row.index}
                        defaultChecked
                        aria-label={`Keep ${day.label} ${row.start}–${row.end}`}
                      />
                      <TimeField
                        id={`start-${row.index}`}
                        name={`start-${row.index}`}
                        defaultValue={row.start}
                        label={`Start, ${day.label}`}
                        listId="import-times"
                      />
                      <span aria-hidden="true">–</span>
                      <TimeField
                        id={`end-${row.index}`}
                        name={`end-${row.index}`}
                        end
                        defaultValue={row.end}
                        label={`End, ${day.label}`}
                        listId="import-times"
                      />
                    </div>
                  ))}
                </fieldset>
              ))}
              <SubmitButton feedbackKey="import-save">Save kept times</SubmitButton>
            </Form>
          )}
        </>
      ) : null}
    </main>
  );
}
