import type { SlotErrors, SlotFormValues } from "~/lib/availability";

import { TimeField } from "./time-field";

/**
 * How often, date, start/end times and an optional last date: the fields of
 * every slot-shaped form (member availability, organizer rehearsals). Values
 * and errors come from `parseSlotInput`, which validates them on the server.
 */
export function SlotFields({ values, errors }: { values: SlotFormValues; errors: SlotErrors }) {
  const error = (name: keyof SlotFormValues) =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;
  const described = (name: keyof SlotFormValues, hint?: string) =>
    errors[name] ? `${name}-error` : hint;
  return (
    <>
      <fieldset className="kind" aria-describedby={described("kind")}>
        <legend>How often</legend>
        <label>
          <input type="radio" name="kind" value="weekly" defaultChecked={values.kind !== "once"} />
          Every week
        </label>
        <label>
          <input type="radio" name="kind" value="once" defaultChecked={values.kind === "once"} />
          One-off
        </label>
        {error("kind")}
      </fieldset>
      <div className="field">
        <label htmlFor="startDate">Date</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          required
          defaultValue={values.startDate}
          aria-invalid={errors.startDate ? true : undefined}
          aria-describedby={described("startDate", "startDate-hint")}
        />
        <p className="hint" id="startDate-hint">
          For every week, the first date; it repeats on that weekday.
        </p>
        {error("startDate")}
      </div>
      <div className="time-pair">
        <div className="field">
          <label htmlFor="startTime">From</label>
          <TimeField
            id="startTime"
            name="startTime"
            required
            defaultValue={values.startTime}
            invalid={Boolean(errors.startTime)}
            describedBy={described("startTime")}
          />
          {error("startTime")}
        </div>
        <div className="field">
          <label htmlFor="endTime">Until</label>
          <TimeField
            id="endTime"
            name="endTime"
            end
            required
            defaultValue={values.endTime}
            invalid={Boolean(errors.endTime)}
            describedBy={described("endTime", "endTime-hint")}
          />
          <p className="hint" id="endTime-hint">
            Any time; rounded to the nearest 15 minutes. Use 00:00 for midnight.
          </p>
          {error("endTime")}
        </div>
      </div>
      <div className="field weekly-only">
        <label htmlFor="endDate">Last date (optional, every week only)</label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={values.endDate}
          aria-invalid={errors.endDate ? true : undefined}
          aria-describedby={described("endDate")}
        />
        {error("endDate")}
      </div>
    </>
  );
}
