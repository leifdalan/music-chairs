import { useState } from "react";
import { data, Form, Link, redirect } from "react-router";

import { groupFromAddress } from "~/.server/group-address";
import { redirectWithToast } from "~/.server/flash";
import { findViewer } from "~/.server/membership";
import { getStore, type Group, type ScheduleRequest } from "~/.server/store";
import { SubmitButton } from "~/components/submit-button";
import { TimeRange } from "~/components/time-range";
import { groupPath } from "~/lib/group-address";
import { addDays, parseTimeText, timeInputValue, timeRange, todayInZone } from "~/lib/availability";
import {
  MAX_WINDOWS,
  parseRequestForm,
  readRequestFormValues,
  repeatSpan,
  type RequestErrors,
  type RequestFormValues,
} from "~/lib/requests";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/requests.new";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return pageMeta("Not found");
  return pageMeta(
    `${loaderData.editing ? "Edit availability request" : "New availability request"} · ${loaderData.groupName}`,
  );
}

/** The group, for its organizers only: visitors go to the group page, members get 403. */
async function organizerGroup(request: Request, address: string): Promise<Group> {
  const group = groupFromAddress(request, address);
  const viewer = await findViewer(request, group);
  if (!viewer) throw redirect(groupPath(group));
  if (viewer.role !== "organizer") throw data(null, { status: 403 });
  return group;
}

/** The request named by `id` in this group, or 404. */
function existing(group: Group, id: string): ScheduleRequest {
  const found = getStore().findRequest(group.id, id);
  if (!found) throw data(null, { status: 404 });
  return found;
}

function formValues(request: ScheduleRequest, span: { startDate: string; endDate: string }) {
  return {
    name: request.name,
    ...span,
    windows: request.windows.map((window) => ({
      start: timeInputValue(window.startMinute),
      end: timeInputValue(window.endMinute),
    })),
  };
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const group = await organizerGroup(request, params.groupAddress);
  const today = todayInZone(group.timeZone, new Date());
  const search = new URL(request.url).searchParams;
  const editId = search.get("edit");
  const repeatId = search.get("repeat");
  let values: RequestFormValues = {
    name: "",
    startDate: today,
    endDate: addDays(today, 27),
    windows: [],
  };
  let editing: { id: string; open: boolean } | null = null;
  if (editId) {
    const stored = existing(group, editId);
    editing = { id: stored.id, open: stored.open };
    values = formValues(stored, stored);
  } else if (repeatId) {
    const stored = existing(group, repeatId);
    values = formValues(stored, repeatSpan(stored.startDate, stored.endDate, today));
  }
  return {
    groupHref: groupPath(group),
    groupName: group.name,
    timeZone: group.timeZone,
    today,
    values,
    editing,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const group = await organizerGroup(request, params.groupAddress);
  const store = getStore();
  const form = await request.formData();
  const requestId = form.get("requestId");
  const stored = typeof requestId === "string" ? existing(group, requestId) : null;
  if (stored && !stored.open) {
    return data(
      { problem: "This availability request is closed. Reopen it to make changes." },
      { status: 400 },
    );
  }
  // "Add another window" keeps everything typed and shows one more row.
  if (form.get("intent") === "add-window") {
    return { values: readRequestFormValues(form), extraRow: true, errors: {} as RequestErrors };
  }
  // Anything else saves: Enter in a field submits the hidden default Save.
  const parsed = parseRequestForm(form, {
    today: todayInZone(group.timeZone, new Date()),
    storedStart: stored?.startDate,
  });
  if (!parsed.ok) {
    return data({ values: parsed.values, extraRow: false, errors: parsed.errors }, { status: 400 });
  }
  if (stored) {
    if (!store.updateRequest(group.id, stored.id, parsed.value)) {
      return data(
        { problem: "This availability request is closed. Reopen it to make changes." },
        { status: 400 },
      );
    }
    return redirectWithToast(
      `${groupPath(group)}/requests/${stored.id}`,
      "Availability request updated",
    );
  }
  const created = store.createRequest(group.id, parsed.value);
  return redirectWithToast(
    `${groupPath(group)}/requests/${created.id}`,
    "Availability request created",
  );
}

export default function RequestForm({ loaderData, actionData }: Route.ComponentProps) {
  const { groupHref, groupName, timeZone, editing } = loaderData;
  const result = actionData && "values" in actionData ? actionData : undefined;
  const problem = actionData && "problem" in actionData ? actionData.problem : null;
  const values = result?.values ?? loaderData.values;
  const errors: RequestErrors = result?.errors ?? {};
  // A stored request shows its windows and one empty row; a form sent back
  // shows every row it sent (blank ones too, so no typed row or its error is
  // lost), plus one after "Add another time". At least two, up to the limit.
  const sent = result ? values.windows.length + (result.extraRow ? 1 : 0) : null;
  const rowCount = Math.min(MAX_WINDOWS, Math.max(2, sent ?? values.windows.length + 1));
  const backTo = editing ? `${groupHref}/requests/${editing.id}` : groupHref;

  return (
    <main>
      <p className="eyebrow">
        <Link to={groupHref}>{groupName}</Link>
      </p>
      <h1>{editing ? "Edit availability request" : "New availability request"}</h1>
      <p className="hint">
        Ask the band when they can rehearse between two dates, at the times of day you choose. All
        times are in {timeZone}.
      </p>
      {problem ? (
        <p className="notice" role="alert">
          {problem}
        </p>
      ) : null}
      {editing && !editing.open ? (
        <p className="notice">
          This availability request is closed. <Link to={backTo}>Reopen it</Link> to make changes.
        </p>
      ) : (
        <RequestFields
          values={values}
          errors={errors}
          rowCount={rowCount}
          editingId={editing?.id ?? null}
          backTo={backTo}
        />
      )}
    </main>
  );
}

function RequestFields({
  values,
  errors,
  rowCount,
  editingId,
  backTo,
}: {
  values: RequestFormValues;
  errors: RequestErrors;
  rowCount: number;
  editingId: string | null;
  backTo: string;
}) {
  const rows = Array.from({ length: rowCount }, (_, index) => values.windows[index] ?? null);
  const firstEmpty = rows.findIndex((row) => !row || (row.start === "" && row.end === ""));
  const error = (name: "name" | "startDate" | "endDate") =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;
  const described = (name: "name" | "startDate" | "endDate") =>
    errors[name] ? `${name}-error` : undefined;
  return (
    <>
      {/* Keyed by the row count so an added row starts empty and values come from the server. */}
      <Form method="post" className="stack request-form" replace key={rowCount}>
        {/* The first submit button is the form's default, so Enter saves. */}
        <button
          type="submit"
          name="intent"
          value="save"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
        >
          Save
        </button>
        {editingId ? <input type="hidden" name="requestId" value={editingId} /> : null}
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="off"
            placeholder="November concert"
            defaultValue={values.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={described("name")}
          />
          {error("name")}
        </div>
        <div className="field-pair">
          <div className="field">
            <label htmlFor="startDate">First date</label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              defaultValue={values.startDate}
              aria-invalid={errors.startDate ? true : undefined}
              aria-describedby={described("startDate")}
            />
            {error("startDate")}
          </div>
          <div className="field">
            <label htmlFor="endDate">Last date</label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              defaultValue={values.endDate}
              aria-invalid={errors.endDate ? true : undefined}
              aria-describedby={described("endDate")}
            />
            {error("endDate")}
          </div>
        </div>
        <fieldset
          className="windows"
          aria-describedby={errors.windows ? "windows-error" : undefined}
        >
          <legend>Times of day</legend>
          <p className="hint">Each time applies to every day between the dates.</p>
          {rows.map((row, index) => {
            const rowError = errors.rows?.[index];
            return (
              <WindowRow
                key={index}
                index={index}
                row={row}
                error={rowError}
                // A row with an error, and the first empty row, start open.
                open={rowError !== undefined || index === firstEmpty}
              />
            );
          })}
          {errors.windows ? (
            <p className="field-error" id="windows-error" role="alert">
              {errors.windows}
            </p>
          ) : null}
          {rowCount < MAX_WINDOWS ? (
            <SubmitButton
              feedbackKey="add-window"
              name="intent"
              value="add-window"
              variant="outline"
              size="sm"
            >
              Add another time
            </SubmitButton>
          ) : null}
        </fieldset>
        <SubmitButton feedbackKey="request-save" name="intent" value="save">
          {editingId ? "Save changes" : "Send availability request"}
        </SubmitButton>
        <Link to={backTo} className="cancel">
          Cancel
        </Link>
      </Form>
    </>
  );
}

/** A row's times as the summary line first shows them. */
function rowSummary(row: { start: string; end: string } | null): string {
  if (!row || (!row.start && !row.end)) return "not set";
  const start = parseTimeText(row.start, { end: false });
  const end = parseTimeText(row.end, { end: true });
  return start.ok && end.ok && end.minutes > start.minutes
    ? timeRange(start.minutes, end.minutes)
    : "check the times";
}

/** One time of day, folded into a summary line that follows what is chosen. */
function WindowRow({
  index,
  row,
  error,
  open,
}: {
  index: number;
  row: { start: string; end: string } | null;
  error: string | undefined;
  open: boolean;
}) {
  const [summary, setSummary] = useState(() => rowSummary(row));
  return (
    <details className="window-row" open={open}>
      <summary>
        Time {index + 1}: {summary}
      </summary>
      <TimeRange
        startName={`windowStart-${index}`}
        endName={`windowEnd-${index}`}
        startValue={row?.start ?? ""}
        endValue={row?.end ?? ""}
        rangeError={error}
        labelPrefix={`Time ${index + 1}`}
        onChange={(range, chosen) => {
          if (range) setSummary(timeRange(range.startMinute, range.endMinute));
          else setSummary(chosen ? "check the times" : "not set");
        }}
      />
    </details>
  );
}
