import { data, Form, Link, redirect } from "react-router";

import { redirectWithToast } from "~/.server/flash";
import { googleConfig } from "~/.server/google";
import { findViewer } from "~/.server/membership";
import { getStore, type Group, type Member } from "~/.server/store";
import { SlotFields } from "~/components/slot-fields";
import { ProblemAlert } from "~/components/problem-alert";
import { SubmitButton } from "~/components/submit-button";
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
  weekdayName,
  type Slot,
  type SlotErrors,
  type SlotFormValues,
} from "~/lib/availability";
import { pageMeta } from "~/lib/site";

import type { Route } from "./+types/availability";

export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta(loaderData ? `My availability · ${loaderData.groupName}` : "Not found");
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

export async function loader({ request, params }: Route.LoaderArgs) {
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const slots = getStore().listSlots(viewer.id);
  const today = todayInZone(group.timeZone, new Date());
  const until = addDays(today, UPCOMING_WEEKS * 7 - 1);
  const search = new URL(request.url).searchParams;
  const editId = search.get("edit");
  return {
    // Import needs a Google-linked member; the import page checks the rest.
    canImport: googleConfig() !== null && viewer.googleEmail !== null,

    groupName: group.name,
    timeZone: group.timeZone,
    today,
    until,
    slots,
    occurrences: expandOccurrences(slots, today, until),
    editing: slots.find((slot) => slot.id === editId) ?? null,
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

export async function action({ request, params }: Route.ActionArgs) {
  // Resolve the viewer before reading the form: every write is scoped to the
  // member this device is in this group, never to an id taken from the form.
  const { group, viewer } = await groupAndViewer(request, params.groupId);
  const store = getStore();
  const form = await request.formData();
  const intent = form.get("intent");
  const slotId = String(form.get("slotId") ?? "");
  const back = (message: string) => redirectWithToast(`/g/${group.id}/availability`, message);

  if (intent === "create" || intent === "update") {
    const parsed = parseSlotInput(form);
    if (!parsed.ok) return invalidForm(parsed.errors, parsed.values);
    if (intent === "create") {
      store.addSlot(viewer.id, parsed.value);
    } else if (!store.updateSlot(viewer.id, slotId, parsed.value)) {
      throw data(null, { status: 404 });
    }
    return back(intent === "create" ? "Availability saved" : "Changes saved");
  }
  if (intent === "delete") {
    if (!store.deleteSlot(viewer.id, slotId)) throw data(null, { status: 404 });
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

export default function Availability({ loaderData, actionData }: Route.ComponentProps) {
  const { groupName, timeZone, today, until, slots, occurrences, editing, canImport } = loaderData;
  const formResult = actionData && "errors" in actionData ? actionData : undefined;
  const pageProblem = actionData && "problem" in actionData ? actionData.problem : null;
  return (
    <main>
      <p className="eyebrow">
        <Link to=".." relative="path">
          {groupName}
        </Link>
      </p>
      <h1>My availability</h1>
      <p className="hint">All times are in {timeZone}.</p>
      {canImport ? (
        <p>
          <Link to="import" relative="path" className="button-link secondary">
            Import from Google Calendar
          </Link>
        </p>
      ) : null}

      {/* The slot count in the key gives the add form fresh, empty fields after each save. */}
      <SlotForm
        key={editing?.id ?? `new-${slots.length}`}
        editing={editing}
        actionData={formResult}
        today={today}
      />

      <section aria-labelledby="slots-heading">
        <h2 id="slots-heading">My times</h2>
        {pageProblem && actionData ? (
          <ProblemAlert message={pageProblem} response={actionData} />
        ) : null}
        {slots.length === 0 ? (
          <p className="hint">Nothing yet. Add the times you can rehearse above.</p>
        ) : (
          <ul className="slots">
            {slots.map((slot) => (
              <SlotItem key={slot.id} slot={slot} today={today} until={until} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading">Next {UPCOMING_WEEKS} weeks</h2>
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
      </section>
    </main>
  );
}

type ActionData = { errors: SlotErrors; values: SlotFormValues } | undefined;

function SlotForm({
  editing,
  actionData,
  today,
}: {
  editing: Slot | null;
  actionData: ActionData;
  today: string;
}) {
  // Rejected values win over the slot being edited, so a correction keeps
  // what the member typed.
  const values: SlotFormValues = actionData?.values ?? {
    kind: editing?.kind ?? "weekly",
    startDate: editing?.startDate ?? today,
    endDate: editing?.endDate ?? "",
    startTime: editing ? timeInputValue(editing.startMinute) : "",
    endTime: editing ? timeInputValue(editing.endMinute) : "",
  };
  return (
    <section aria-labelledby="slot-form-heading">
      <h2 id="slot-form-heading">{editing ? "Change a time" : "Add a time"}</h2>
      <Form method="post" className="stack slot-form" replace>
        <input type="hidden" name="intent" value={editing ? "update" : "create"} />
        {editing ? <input type="hidden" name="slotId" value={editing.id} /> : null}
        <SlotFields values={values} errors={actionData?.errors ?? {}} />
        <SubmitButton feedbackKey="availability-save">
          {editing ? "Save changes" : "Add time"}
        </SubmitButton>
        {editing ? (
          <Link to="." relative="path" className="cancel">
            Cancel
          </Link>
        ) : null}
      </Form>
    </section>
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
        <Form method="post" replace>
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="slotId" value={slot.id} />
          <SubmitButton feedbackKey={`delete-${slot.id}`} className="secondary">
            Delete
          </SubmitButton>
        </Form>
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
